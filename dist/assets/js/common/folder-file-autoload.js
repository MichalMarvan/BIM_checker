/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Auto-loads a file from local folder storage on viewer / parser pages.
 *
 * When user clicks a file in the homepage folder tree, sessionStorage gets
 * `openFromFolder` set with { type, path, name }. The destination page (viewer
 * for IFC, parser for IDS) reads it on load, fetches content from the active
 * backend, constructs a File object, and feeds it into the existing handler.
 */

(function () {
    'use strict';

    const KEY = 'openFromFolder';

    async function autoLoad() {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return;
        sessionStorage.removeItem(KEY); // consume once

        let req;
        try { req = JSON.parse(raw); } catch { return; }
        if (!req || !req.type || !req.path) return;

        // Stale check: ignore requests older than 60s
        if (req.at && Date.now() - req.at > 60000) return;

        if (!window.BIMStorage) return;
        const backend = window.BIMStorage.backend;
        if (!backend || backend.kind !== 'localFolder') {
            // Backend not yet restored — wait briefly and retry
            await new Promise(r => setTimeout(r, 300));
        }

        // Restore-backend script may still be running; give it a moment
        let attempts = 0;
        while ((!window.BIMStorage.backend || window.BIMStorage.backend.kind !== 'localFolder') && attempts < 10) {
            await new Promise(r => setTimeout(r, 200));
            attempts++;
        }

        const b = window.BIMStorage.backend;
        if (!b || b.kind !== 'localFolder') {
            console.warn('[folder-file-autoload] backend not localFolder, skipping autoload');
            return;
        }

        let content;
        try {
            content = await b.getFileContent(req.type, req.path);
        } catch (e) {
            console.warn('[folder-file-autoload] failed to read file:', e);
            return;
        }

        const mime = req.type === 'ifc' ? 'application/octet-stream' : 'application/xml';
        const file = new File([content], req.name, { type: mime });

        // Dispatch to page-specific handler
        if (req.type === 'ifc' && typeof window.handleFiles === 'function') {
            window.handleFiles([file]);
        } else if (req.type === 'ids' && typeof window.handleFile === 'function') {
            window.handleFile(file);
        } else {
            console.warn('[folder-file-autoload] no handler for type:', req.type);
        }
    }

    if (document.readyState === 'complete') {
        setTimeout(autoLoad, 500);
    } else {
        window.addEventListener('load', () => setTimeout(autoLoad, 500));
    }

    window.BIMFolderFileAutoload = { autoLoad };
})();
