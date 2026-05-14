/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
const CACHE_VERSION = 'bim-checker-v55';
const ASSETS_TO_CACHE = [
    './index.html',
    './assets/og-image-v2.png',
    './favicon.svg',
    './favicon.ico',
    './manifest.json',
    './pages/ids-parser-visualizer.html',
    './pages/ids-ifc-validator.html',
    './pages/ifc-viewer-multi-file.html',
    './assets/css/common.css',
    './assets/css/mobile-nav.css',
    './assets/css/index.css',
    './assets/css/wizard.css',
    './assets/css/ids-parser.css',
    './assets/css/ids-validator.css',
    './assets/css/ifc-viewer.css',
    './assets/css/ids-editor-styles.css',
    './assets/css/progress-panel.css',
    './assets/js/common/translations.js',
    './assets/js/common/mobile-nav.js',
    './assets/js/common/i18n.js',
    './assets/js/common/error-handler.js',
    './assets/js/common/storage.js',
    './assets/js/common/fs-handle-store.js',
    './assets/js/common/local-folder-storage.js',
    './assets/js/common/first-launch-popup.js',
    './assets/js/common/storage-card-folder-states.js',
    './assets/js/common/storage-backend-restore.js',
    './assets/js/common/folder-file-autoload.js',
    './assets/js/common/save-to-folder-dialog.js',
    './assets/js/common/bim-save-file.js',
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
    './assets/icons/pwa/icon-512x512.png',
    './assets/js/ai/providers.js',
    './assets/js/ai/ai-client.js',
    './assets/js/ai/agent-manager.js',
    './assets/js/ai/tool-defs.js',
    './assets/js/ai/tool-executor.js',
    './assets/js/ai/tool-catalog.js',
    './assets/js/ai/agent-presets.js',
    './assets/js/ai/tools/_helpers.js',
    './assets/js/ai/tools/tool-storage.js',
    './assets/js/ai/tools/tool-validator.js',
    './assets/js/ai/tools/tool-ids.js',
    './assets/js/ai/tools/tool-ifc.js',
    './assets/js/ai/tools/tool-ui.js',
    './assets/js/ai/tools/tool-settings.js',
    './assets/js/ai/tools/tool-agents.js',
    './assets/js/ai/tools/tool-presets.js',
    './assets/js/ai/tools/tool-bsdd.js',
    './assets/js/ai/chat-storage.js',
    './assets/js/ai-ui/init.js',
    './assets/js/ai-ui/chat-panel-mobile.js',
    './assets/js/ai-ui/chat-launcher.js',
    './assets/js/ai-ui/settings-modal.js',
    './assets/js/ai-ui/chat-panel.js',
    './assets/js/ai-ui/chat-heads.js',
    './assets/js/ai-ui/chat-i18n-helpers.js',
    './assets/js/ai-ui/ollama-setup-modal.js',
    './assets/css/ai-chat.css'
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
