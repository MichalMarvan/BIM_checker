const CACHE_VERSION = 'bim-checker-v13';
const ASSETS_TO_CACHE = [
    './index.html',
    './favicon.svg',
    './favicon.ico',
    './manifest.json',
    './pages/ids-parser-visualizer.html',
    './pages/ids-ifc-validator.html',
    './pages/ifc-viewer-multi-file.html',
    './assets/css/common.css',
    './assets/css/index.css',
    './assets/css/wizard.css',
    './assets/css/ids-parser.css',
    './assets/css/ids-validator.css',
    './assets/css/ifc-viewer.css',
    './assets/css/ids-editor-styles.css',
    './assets/css/progress-panel.css',
    './assets/js/common/translations.js',
    './assets/js/common/i18n.js',
    './assets/js/common/error-handler.js',
    './assets/js/common/storage.js',
    './assets/js/common/theme.js',
    './assets/js/common/utils.js',
    './assets/js/common/components.js',
    './assets/js/common/drag-drop.js',
    './assets/js/common/virtual-tree.js',
    './assets/js/common/ifc-stream-parser.js',
    './assets/js/common/performance-monitor.js',
    './assets/js/common/regex-cache.js',
    './assets/js/common/property-set-index.js',
    './assets/js/common/validation-engine.js',
    './assets/js/common/validation-orchestrator.js',
    './assets/js/common/progress-panel.js',
    './assets/js/common/wizard.js',
    './assets/js/common/wizard-steps.js',
    './assets/js/common/update-checker.js',
    './assets/js/common/bug-report.js',
    './assets/js/common/compression.js',
    './assets/js/common/ifc-parser-core.js',
    './assets/js/common/validation-presets.js',
    './assets/js/common/pwa.js',
    './assets/js/index.js',
    './assets/js/parser.js',
    './assets/js/validator.js',
    './assets/js/ids/ifc-data.js',
    './assets/js/ids/ids-xml-generator.js',
    './assets/js/ids/ids-excel-generator.js',
    './assets/js/ids/ids-excel-parser.js',
    './assets/js/ids/ids-excel-template.js',
    './assets/js/ids/ids-editor-core.js',
    './assets/js/ids/ids-editor-modals.js',
    './assets/js/ifc/ifc-pset-utils.js',
    './assets/js/ifc/viewer-core.js',
    './assets/js/ifc/viewer-parser.js',
    './assets/js/ifc/viewer-init.js',
    './assets/js/ifc/viewer-ui.js',
    './assets/js/workers/ifc-parser.worker.js',
    './assets/js/workers/worker-pool.js',
    './assets/js/workers/validation.worker.js',
    './assets/js/vendor/xlsx.full.min.js',
    './assets/js/vendor/xmllint-wasm.js',
    './assets/js/vendor/xmllint-browser.js',
    './assets/js/vendor/xmllint.wasm',
    './assets/data/ids-1.0.xsd',
    './assets/data/ifc-hierarchy-IFC2X3.json',
    './assets/data/ifc-hierarchy-IFC4.json',
    './assets/data/ifc-hierarchy-IFC4X3_ADD2.json',
    './assets/js/common/ids-parser.js',
    './assets/js/common/ifc-hierarchy.js',
    './assets/js/common/ifc-params.js',
    './assets/js/common/ids-xsd-validator.js',
    './assets/icons/pwa/icon-128x128.png',
    './assets/icons/pwa/icon-256x256.png',
    './assets/icons/pwa/icon-512x512.png'
];

// Install - cache assets individually (don't fail on single missing file)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            return Promise.allSettled(
                ASSETS_TO_CACHE.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('Failed to cache:', url, err);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_VERSION)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch - network-first for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // HTML pages: network-first (always get latest, fall back to cache)
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
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
                    caches.open(CACHE_VERSION).then((cache) => {
                        cache.put(event.request, clone);
                    });
                    return response;
                });
            })
    );
});
