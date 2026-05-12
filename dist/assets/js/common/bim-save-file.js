/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Centralized save flow for edited file content.
 * Backend-aware: folder mode opens dialog + writes via FS API;
 * IndexedDB mode saves directly via existing BIMStorage.saveFile.
 */

(function () {
    'use strict';

    async function save({ type, path, name, content, folderPath = '' }) {
        const backend = window.BIMStorage && window.BIMStorage.backend;
        if (!backend) return { ok: false, reason: 'no_backend' };

        // IndexedDB mode: save directly, no dialog
        if (backend.kind === 'indexedDB') {
            const mime = type === 'ifc' ? 'application/octet-stream' : 'application/xml';
            const blob = new Blob([content], { type: mime });
            const file = new File([blob], name, { type: mime });
            try {
                await window.BIMStorage.saveFile(type, file);
                return { ok: true, mode: 'overwrite', finalPath: name };
            } catch (e) {
                return { ok: false, reason: 'save_failed', message: e.message };
            }
        }

        if (backend.kind !== 'localFolder') return { ok: false, reason: 'unsupported_backend' };

        // Folder mode: dialog + backend write
        const contentSize = (typeof content === 'string') ? content.length : (content.byteLength || 0);
        const choice = await window.BIMSaveToFolderDialog.open({
            fileName: name, folderPath, contentSize, type
        });
        if (!choice) return { ok: false, reason: 'user_cancelled' };

        if (choice.mode === 'overwrite') {
            let result = await backend.saveFileContent(type, path, content);
            if (result.error === 'conflict_external_change') {
                const resolution = await window.BIMSaveToFolderDialog.openConflict({
                    fileName: name,
                    currentMtime: result.currentMtime,
                    knownMtime: result.knownMtime
                });
                if (!resolution) return { ok: false, reason: 'user_cancelled_conflict' };
                if (resolution === 'overwrite') {
                    result = await backend.saveFileContent(type, path, content, { force: true });
                } else if (resolution === 'copy') {
                    result = await backend.writeNewFile(type, folderPath, name, content);
                }
            }
            if (result.error) return { ok: false, reason: result.error, message: result.message };
            return { ok: true, mode: 'overwrite', finalPath: path };
        }

        if (choice.mode === 'copy') {
            const result = await backend.writeNewFile(type, folderPath, choice.newName, content);
            if (result.error) return { ok: false, reason: result.error, message: result.message };
            return { ok: true, mode: 'copy', finalPath: result.path, finalName: result.finalName };
        }

        return { ok: false, reason: 'unknown_mode' };
    }

    window.BIMSaveFile = { save };
})();
