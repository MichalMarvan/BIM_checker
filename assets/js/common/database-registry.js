/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */

// Single inventory of persistent browser databases. Keeping names, schema
// versions and data classification here makes migrations and support reports
// reviewable without searching every feature module.
(function () {
    'use strict';

    const definitions = Object.freeze({
        projectStorage: Object.freeze({ name: 'bim_checker_storage', version: 1, kind: 'user-data', owner: 'storage' }),
        legacyIfcCache: Object.freeze({ name: 'bim_checker_ifc_cache', version: 2, kind: 'cache', owner: 'ifc-table' }),
        modelCache: Object.freeze({ name: 'bim-model-cache', version: 1, kind: 'cache', owner: '3d-viewer' }),
        viewerState: Object.freeze({ name: 'bim-viewer-state', version: 1, kind: 'user-data', owner: '3d-viewer' }),
        schedules: Object.freeze({ name: 'bim_ai_viewer_schedules', version: 1, kind: 'user-data', owner: '3d-viewer' }),
        ragIndex: Object.freeze({ name: 'bim_ai_viewer_rag', version: 1, kind: 'cache', owner: '3d-ai' }),
        fileHandles: Object.freeze({ name: 'bim-checker-fs-handles', version: 2, kind: 'permission-handle', owner: 'local-folder' }),
    });

    window.BIMDatabaseRegistry = Object.freeze({
        schemaVersion: 1,
        definitions,
        get(key) {
            return definitions[key] || null;
        },
        list(kind) {
            return Object.entries(definitions)
                .filter(([, item]) => !kind || item.kind === kind)
                .map(([key, item]) => ({ key, ...item }));
        },
        async estimate() {
            if (!navigator.storage?.estimate) {
                return { usage: null, quota: null, persisted: false };
            }
            const estimate = await navigator.storage.estimate();
            const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
            return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted };
        },
    });
})();
