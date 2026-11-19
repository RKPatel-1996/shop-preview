/*
 * Registration is loaded only by the fictional preview build.
 * It does not access or change application storage.
 */
(() => {
  'use strict';

  const scope = '/shop-preview/';
  const workerUrl = '/shop-preview/service-worker.js';
  const protocolVersion = 1;
  const activateMessage = 'AMUL_PREVIEW_ACTIVATE_UPDATE';
  const rejectedMessage = 'AMUL_PREVIEW_ACTIVATION_REJECTED';
  const stateEvent = 'amul-preview-pwa-update-state';
  const queryEvent = 'amul-preview-pwa-update-query';
  const activateEvent = 'amul-preview-pwa-update-activate';
  const checkThrottleMilliseconds = 60 * 1000;
  const activationTimeoutMilliseconds = 20 * 1000;

  if (
    !location.pathname.startsWith(scope) ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  let registration = null;
  let lastUpdateCheck = 0;
  let activationRequested = false;
  let reloadStarted = false;
  let activationTimer = null;

  const emitState = (state, reason) => {
    window.dispatchEvent(new CustomEvent(stateEvent, {
      detail: reason ? { state, reason } : { state }
    }));
  };

  const announceWaitingWorker = () => {
    if (
      registration?.waiting &&
      navigator.serviceWorker.controller
    ) {
      emitState('available');
    }
  };

  const watchInstallingWorker = worker => {
    if (!worker) return;

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        window.setTimeout(announceWaitingWorker, 0);
      }
    });
  };

  const checkForUpdate = async force => {
    if (!registration || !navigator.onLine) return;

    const now = Date.now();

    if (!force && now - lastUpdateCheck < checkThrottleMilliseconds) {
      announceWaitingWorker();
      return;
    }

    lastUpdateCheck = now;

    try {
      await registration.update();
      announceWaitingWorker();
    } catch {
      // Offline and transient update-check failures do not interrupt the app.
    }
  };

  window.addEventListener(queryEvent, announceWaitingWorker);

  window.addEventListener(activateEvent, () => {
    if (activationRequested) return;

    const waiting = registration?.waiting;

    if (!waiting) {
      emitState('failed', 'NO_WAITING_WORKER');
      return;
    }

    activationRequested = true;
    emitState('activating');

    try {
      waiting.postMessage({
        type: activateMessage,
        protocolVersion
      });
    } catch {
      activationRequested = false;
      emitState('failed', 'POST_MESSAGE_FAILED');
      return;
    }

    activationTimer = window.setTimeout(() => {
      if (reloadStarted) return;
      activationRequested = false;
      emitState('failed', 'ACTIVATION_TIMEOUT');
    }, activationTimeoutMilliseconds);
  });

  navigator.serviceWorker.addEventListener('message', event => {
    const message = event.data;

    if (
      !message ||
      message.type !== rejectedMessage ||
      message.protocolVersion !== protocolVersion
    ) {
      return;
    }

    if (activationTimer !== null) {
      window.clearTimeout(activationTimer);
      activationTimer = null;
    }

    activationRequested = false;
    emitState('failed', message.reason || 'ACTIVATION_REJECTED');
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!activationRequested || reloadStarted) return;

    reloadStarted = true;

    if (activationTimer !== null) {
      window.clearTimeout(activationTimer);
      activationTimer = null;
    }

    location.reload();
  });

  window.addEventListener('online', () => {
    void checkForUpdate(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkForUpdate(false);
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(workerUrl, {
      scope,
      updateViaCache: 'none'
    }).then(nextRegistration => {
      registration = nextRegistration;
      const actualScope = new URL(registration.scope).pathname;

      if (actualScope !== scope) {
        console.error('Amul preview: unexpected worker scope');
        registration = null;
        return;
      }

      registration.addEventListener('updatefound', () => {
        watchInstallingWorker(registration?.installing);
      });

      watchInstallingWorker(registration.installing);
      announceWaitingWorker();
      void checkForUpdate(true);
    }).catch(() => {
      console.warn('Amul preview: offline registration unavailable');
    });
  }, { once: true });
})();
