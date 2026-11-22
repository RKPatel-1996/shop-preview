/*
 * Amul Shop fictional preview service worker.
 *
 * The preview build injects one cache name and one approved path list
 * into the executable declarations below.
 *
 * No application data-storage access is permitted.
 * No runtime caching of unknown requests is permitted.
 */

'use strict';

const APP_ROOT = '/shop-preview/';
const CACHE_PREFIX = 'amul-shop-preview-';
const UPDATE_PROTOCOL_VERSION = 1;
const ACTIVATE_UPDATE_MESSAGE = 'AMUL_PREVIEW_ACTIVATE_UPDATE';
const ACTIVATION_REJECTED_MESSAGE = 'AMUL_PREVIEW_ACTIVATION_REJECTED';

const CACHE_NAME = "amul-shop-preview-v0.5-ef9d9e7b0933d1c4a939";
const PRECACHE_PATHS = ["/shop-preview/","/shop-preview/index.html","/shop-preview/assets/index-CoxH9g1e.js","/shop-preview/assets/index-uhEBXGmN.css","/shop-preview/register-pwa.js","/shop-preview/preview-fonts.css","/shop-preview/manifest.webmanifest","/shop-preview/icons/icon-192.png","/shop-preview/icons/icon-512.png","/shop-preview/fonts/plus-jakarta-sans-variable.woff2","/shop-preview/fonts/noto-sans-devanagari-variable.woff2","/shop-preview/fonts/noto-sans-gujarati-variable.woff2","/shop-preview/fonts/FONT_LICENSES.txt"];

function validateConfiguration() {
  if (
    typeof CACHE_NAME !== 'string' ||
    !CACHE_NAME.startsWith(CACHE_PREFIX) ||
    !Array.isArray(PRECACHE_PATHS) ||
    PRECACHE_PATHS.length === 0
  ) {
    throw new Error('INVALID_PREVIEW_CACHE_CONFIGURATION');
  }

  const unique = new Set(PRECACHE_PATHS);

  if (
    unique.size !== PRECACHE_PATHS.length ||
    !unique.has(APP_ROOT)
  ) {
    throw new Error('INVALID_PREVIEW_ASSET_LIST');
  }

  for (const path of PRECACHE_PATHS) {
    if (
      typeof path !== 'string' ||
      !path.startsWith(APP_ROOT) ||
      path.startsWith(APP_ROOT + 'api/') ||
      path.includes('?') ||
      path.includes('#') ||
      path.includes('\\') ||
      path.split('/').includes('..')
    ) {
      throw new Error('UNSAFE_PREVIEW_ASSET_PATH');
    }
  }

  const scope = new URL(self.registration.scope);

  if (
    scope.origin !== self.location.origin ||
    scope.pathname !== APP_ROOT ||
    self.location.pathname !==
      APP_ROOT + 'service-worker.js'
  ) {
    throw new Error('UNEXPECTED_SERVICE_WORKER_SCOPE');
  }
}

validateConfiguration();

const approvedPaths = new Set(PRECACHE_PATHS);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      /*
       * addAll rejects if an essential response cannot be
       * fetched successfully. Verify every required entry
       * before allowing installation to finish.
       */
      await cache.addAll(PRECACHE_PATHS);

      for (const path of PRECACHE_PATHS) {
        const response = await cache.match(path);

        if (!response || !response.ok) {
          throw new Error(
            'INCOMPLETE_OFFLINE_SHELL: ' + path
          );
        }
      }
    } catch (error) {
      /*
       * Delete only this attempted version's cache.
       * Existing active-version caches remain intact.
       */
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());

  /*
   * Intentionally no automatic activation. An updated worker waits until
   * one verified in-scope client explicitly requests the update below.
   */
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const current = await caches.open(CACHE_NAME);

    /*
     * Never discard the old shell unless the replacement
     * contains its complete approved asset inventory.
     */
    for (const path of PRECACHE_PATHS) {
      const response = await current.match(path);

      if (!response || !response.ok) {
        throw new Error(
          'ACTIVATION_CACHE_INCOMPLETE: ' + path
        );
      }
    }

    const names = await caches.keys();

    await Promise.all(
      names
        .filter(name =>
          name.startsWith(CACHE_PREFIX) &&
          name !== CACHE_NAME
        )
        .map(name => caches.delete(name))
    );

    /*
     * This also permits first-install clients to become
     * controlled without a second online navigation.
     */
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const message = event.data;

  if (
    !message ||
    typeof message !== 'object' ||
    Object.keys(message).sort().join(',') !== 'protocolVersion,type' ||
    message.type !== ACTIVATE_UPDATE_MESSAGE ||
    message.protocolVersion !== UPDATE_PROTOCOL_VERSION
  ) {
    return;
  }

  const source = event.source;

  if (
    !source ||
    typeof source.id !== 'string' ||
    typeof source.url !== 'string' ||
    typeof source.postMessage !== 'function'
  ) {
    return;
  }

  let sourceUrl;

  try {
    sourceUrl = new URL(source.url);
  } catch {
    return;
  }

  if (
    sourceUrl.origin !== self.location.origin ||
    !sourceUrl.pathname.startsWith(APP_ROOT)
  ) {
    return;
  }

  event.waitUntil((async () => {
    try {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      const scopedWindows = windows.filter(client => {
        try {
          const url = new URL(client.url);
          return (
            url.origin === self.location.origin &&
            url.pathname.startsWith(APP_ROOT)
          );
        } catch {
          return false;
        }
      });

      if (
        scopedWindows.length !== 1 ||
        scopedWindows[0].id !== source.id
      ) {
        source.postMessage({
          type: ACTIVATION_REJECTED_MESSAGE,
          protocolVersion: UPDATE_PROTOCOL_VERSION,
          reason: 'MULTIPLE_CLIENTS'
        });
        return;
      }

      await self.skipWaiting();
    } catch {
      source.postMessage({
        type: ACTIVATION_REJECTED_MESSAGE,
        protocolVersion: UPDATE_PROTOCOL_VERSION,
        reason: 'ACTIVATION_FAILED'
      });
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(APP_ROOT) ||
    url.search !== '' ||
    !approvedPaths.has(url.pathname)
  ) {
    return;
  }

  /*
   * Never substitute the app shell for an unrelated
   * navigation or future backend endpoint.
   */
  if (
    request.mode === 'navigate' &&
    url.pathname !== APP_ROOT
  ) {
    return;
  }

  /*
   * Range requests should not receive incomplete
   * or incorrectly transformed cached responses.
   */
  if (request.headers.has('range')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);

    if (cached) return cached;

    /*
     * Missing assets may be fetched online, but are never
     * dynamically cached. Only the verified build manifest
     * determines the offline inventory.
     */
    return fetch(request);
  })());
});
