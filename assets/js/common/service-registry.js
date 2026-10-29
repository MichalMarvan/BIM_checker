/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */

// Incremental bridge away from implicit window.* dependencies. Existing
// globals remain compatible, while new bootstraps can request explicit,
// inspectable services and derive feature availability from this registry.
(function () {
    'use strict';
    const services = new Map();
    const metadata = new Map();

    const registry = {
        register(name, service, options = {}) {
            if (!name || !service) {
                throw new TypeError('Service name and implementation are required');
            }
            if (services.has(name) && !options.replace) {
                return services.get(name);
            }
            services.set(name, service);
            metadata.set(name, Object.freeze({
                local: options.local !== false,
                optional: Boolean(options.optional),
                version: options.version || null,
            }));
            window.dispatchEvent(new CustomEvent('bim:service-registered', { detail: { name } }));
            return service;
        },
        get(name) {
            return services.get(name) || null;
        },
        require(name) {
            const service = services.get(name);
            if (!service) {
                throw new Error(`Required BIM service is unavailable: ${name}`);
            }
            return service;
        },
        has(name) {
            return services.has(name);
        },
        describe() {
            return [...services.keys()].sort().map(name => ({ name, ...metadata.get(name) }));
        },
    };
    window.BIMServices = Object.freeze(registry);

    registry.register('networkCapabilities', Object.freeze({
        get online() {
            return navigator.onLine !== false;
        },
        get fileSystemAccess() {
            return typeof window.showDirectoryPicker === 'function';
        },
        get serviceWorker() {
            return 'serviceWorker' in navigator;
        },
        get indexedDB() {
            return 'indexedDB' in window;
        },
        get webWorkers() {
            return typeof Worker !== 'undefined';
        },
        get webGL2() {
            try {
                return Boolean(document.createElement('canvas').getContext('webgl2'));
            } catch {
                return false;
            }
        },
    }), { local: true });
})();
