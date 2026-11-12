/*
 * Registration is loaded only by the fictional preview build.
 * It does not access or change application storage.
 */
(() => {
  'use strict';

  const scope = '/shop-preview/';
  const workerUrl = '/shop-preview/service-worker.js';

  if (
    !location.pathname.startsWith(scope) ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(workerUrl, {
      scope,
      updateViaCache: 'none'
    }).then(registration => {
      const actualScope = new URL(registration.scope).pathname;

      if (actualScope !== scope) {
        console.error('Amul preview: unexpected worker scope');
      }
    }).catch(() => {
      console.warn('Amul preview: offline registration unavailable');
    });
  }, { once: true });
})();
