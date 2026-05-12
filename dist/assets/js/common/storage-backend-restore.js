/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Restores the previously-selected storage backend on every page load.
 * Loaded on all HTML pages (homepage + validator + parser + viewer) so that
 * folder mode persists across page navigation.
 *
 * - If active backend is localFolder and handle exists in IndexedDB with granted
 *   permission, restore folder backend silently + scan.
 * - If permission is "prompt", set backend with _pendingPermission flag so the
 *   storage-card-folder-states UI shows the reconnect banner (homepage only).
 * - If denied or no handle, fall back to IndexedDB.
 */

(function () {
    'use strict';

    async function restore() {
        if (!window.BIMStorage || !window.LocalFolderStorageBackend) return;
        if (!window.LocalFolderStorageBackend.isSupported()) return;

        const preferred = localStorage.getItem('activeBackend');
        if (preferred !== 'localFolder') return;

        const lf = new window.LocalFolderStorageBackend();
        try {
            const result = await lf.restoreFromIndexedDB();
            if (result.state === 'connected') {
                await lf.scan();
                window.BIMStorage.setBackend(lf);
            } else if (result.state === 'needs_permission') {
                lf._pendingPermission = true;
                lf._pendingFolderName = result.name;
                window.BIMStorage.setBackend(lf);
            } else if (result.state === 'denied') {
                // Keep IndexedDB default, but emit event so UI shows banner D
                window.BIMStorage.setBackend(window.BIMStorage.indexedDBBackend);
            }
            // 'no_handle' → silent IndexedDB default
        } catch (e) {
            console.warn('[storage-backend-restore] failed:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restore);
    } else {
        restore();
    }

    window.BIMStorageBackendRestore = { restore };
})();
