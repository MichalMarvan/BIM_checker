/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
importScripts('./assets/data/precache-manifest.js');

const PRECACHE = self.BIM_CHECKER_PRECACHE;
const CACHE_PREFIX = 'bim-checker-';
const CORE_CACHE = `${CACHE_PREFIX}core-${PRECACHE.version}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${PRECACHE.version}`;
const RUNTIME_MAX_ENTRIES = 160;

async function putRuntime(request, response) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response);
    const keys = await cache.keys();
    const excess = keys.length - RUNTIME_MAX_ENTRIES;
    if (excess > 0) await Promise.all(keys.slice(0, excess).map(key => cache.delete(key)));
}

// Installation fails atomically if a required core asset is missing. This
// prevents activating a release that only appears to work offline.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CORE_CACHE).then(cache => cache.addAll(PRECACHE.assets))
    );
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith(CACHE_PREFIX))
                        .filter(name => name !== CORE_CACHE && name !== RUNTIME_CACHE)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Aktualizace již ovládající aplikace se aktivuje až po potvrzení uživatelem.
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch - version-coherent cache-first for local pages and assets. The browser
// still checks sw.js for updates; the waiting worker is activated by the UI.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;

    // HTML pages: keep the page shell and its assets on the same release.
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            caches.match(event.request).then(async cached => {
                if (cached) return cached;
                if (requestUrl.pathname.endsWith('/')) {
                    const index = await caches.match(new URL(`${requestUrl.pathname}index.html`, self.location.origin));
                    if (index) return index;
                }
                const response = await fetch(event.request);
                if (response?.status === 200) {
                    await putRuntime(event.request, response.clone());
                }
                return response;
            })
        );
        return;
    }

    // Static assets (JS, CSS, images): cache-first
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200) {
                        return response;
                    }
                    const clone = response.clone();
                    putRuntime(event.request, clone).catch(() => {});
                    return response;
                });
            })
    );
});
