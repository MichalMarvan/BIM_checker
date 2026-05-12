/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Save-to-folder dialog component.
 * Reusable across IDS Editor + IFC Viewer when in local folder mode.
 */

(function () {
    'use strict';

    function tr(key, params) {
        return (window.i18n && window.i18n.t) ? window.i18n.t(key, params) : key;
    }

    function esc(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function formatBytes(b) {
        if (!b) return '0 KB';
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    }

    function suggestedCopyName(fileName) {
        const dot = fileName.lastIndexOf('.');
        const base = dot > 0 ? fileName.slice(0, dot) : fileName;
        const ext = dot > 0 ? fileName.slice(dot) : '';
        return `${base}_v2${ext}`;
    }

    function open({ fileName, folderPath, contentSize, type }) {
        return new Promise((resolve) => {
            const defaultCopyName = suggestedCopyName(fileName);
            const wrap = document.createElement('div');
            wrap.className = 'save-to-folder-dialog modal-overlay show';
            wrap.innerHTML = `
                <div class="modal-container save-to-folder-dialog__container">
                    <div class="modal-header">
                        <h2 data-i18n="saveDialog.title">Save changes?</h2>
                    </div>
                    <div class="modal-body">
                        <p class="save-to-folder-dialog__file">
                            <strong>${esc(fileName)}</strong>
                            <span class="save-to-folder-dialog__size">${formatBytes(contentSize)}</span>
                        </p>
                        <div class="save-to-folder-dialog__options">
                            <label class="save-to-folder-dialog__option">
                                <input type="radio" name="saveDialogMode" value="overwrite">
                                <span>
                                    <strong data-i18n="saveDialog.overwriteOption">Overwrite original</strong>
                                    <span class="save-to-folder-dialog__warn" data-i18n="saveDialog.overwriteWarn">⚠ Original will be replaced, cannot be undone</span>
                                </span>
                            </label>
                            <label class="save-to-folder-dialog__option">
                                <input type="radio" name="saveDialogMode" value="copy" checked>
                                <span>
                                    <strong data-i18n="saveDialog.copyOption">Save as copy</strong>
                                    <input type="text" class="save-to-folder-dialog__name" value="${esc(defaultCopyName)}">
                                    <span class="save-to-folder-dialog__folder">📁 ${esc(folderPath || '/')}</span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary save-to-folder-dialog__cancel" data-i18n="saveDialog.cancel">Cancel</button>
                        <button class="btn btn-primary save-to-folder-dialog__confirm" data-i18n="saveDialog.confirm">Save</button>
                    </div>
                </div>
            `;
            document.body.appendChild(wrap);
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();

            const cleanup = () => { wrap.remove(); };

            wrap.querySelector('.save-to-folder-dialog__cancel').addEventListener('click', () => {
                cleanup();
                resolve(null);
            });
            wrap.querySelector('.save-to-folder-dialog__confirm').addEventListener('click', () => {
                const mode = wrap.querySelector('input[name="saveDialogMode"]:checked').value;
                const newName = wrap.querySelector('.save-to-folder-dialog__name').value.trim();
                cleanup();
                if (mode === 'overwrite') {
                    resolve({ mode: 'overwrite' });
                } else {
                    resolve({ mode: 'copy', newName: newName || defaultCopyName });
                }
            });
        });
    }

    function openConflict({ fileName, currentMtime, knownMtime }) {
        return new Promise((resolve) => {
            const wrap = document.createElement('div');
            wrap.className = 'save-to-folder-dialog modal-overlay show';
            const ageMs = currentMtime - knownMtime;
            const ageDesc = ageMs > 60000 ? `${Math.round(ageMs / 60000)} min` : `${Math.round(ageMs / 1000)} s`;
            wrap.innerHTML = `
                <div class="modal-container save-to-folder-dialog__container">
                    <div class="modal-header">
                        <h2 data-i18n="saveDialog.conflictTitle">⚠ File changed externally</h2>
                    </div>
                    <div class="modal-body">
                        <p data-i18n="saveDialog.conflictExplain">The file on disk was modified after you opened it (probably by a CDE sync or another tool).</p>
                        <p><strong>${esc(fileName)}</strong> — ${esc(ageDesc)} <span data-i18n="saveDialog.conflictAge">newer on disk</span></p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary save-to-folder-dialog__cancel" data-i18n="saveDialog.cancel">Cancel</button>
                        <button class="btn btn-secondary save-to-folder-dialog__copyConflict" data-i18n="saveDialog.saveAsCopy">Save as copy</button>
                        <button class="btn btn-danger save-to-folder-dialog__force" data-i18n="saveDialog.forceOverwrite">Force overwrite</button>
                    </div>
                </div>
            `;
            document.body.appendChild(wrap);
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();

            const cleanup = () => { wrap.remove(); };

            wrap.querySelector('.save-to-folder-dialog__cancel').addEventListener('click', () => { cleanup(); resolve(null); });
            wrap.querySelector('.save-to-folder-dialog__copyConflict').addEventListener('click', () => { cleanup(); resolve('copy'); });
            wrap.querySelector('.save-to-folder-dialog__force').addEventListener('click', () => { cleanup(); resolve('overwrite'); });
        });
    }

    window.BIMSaveToFolderDialog = { open, openConflict };
})();
