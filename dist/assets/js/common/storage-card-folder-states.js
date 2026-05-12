/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Renders 4 states (A/B/C/D) of storage cards on homepage when LocalFolder backend
 * is active. Event-driven updates via storage:backendChanged.
 */

(function () {
    const t = (k, params) => (window.i18n && window.i18n.t) ? window.i18n.t(k, params) : k;

    function _findCard(type) {
        const headers = document.querySelectorAll('.storage-card h3[data-i18n]');
        for (const h of headers) {
            const key = h.getAttribute('data-i18n');
            if (type === 'ifc' && key === 'storage.ifc') return h.closest('.storage-card');
            if (type === 'ids' && key === 'storage.ids') return h.closest('.storage-card');
        }
        return null;
    }

    function _renderFolderHeader(card, type, folderName, ifcCount, idsCount) {
        const dropZone = card.querySelector('.drop-zone-modern');
        if (dropZone) dropZone.style.display = 'none';

        let banner = card.querySelector('.folder-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'folder-banner';
            const tree = card.querySelector('.file-tree-modern');
            if (tree && tree.parentNode) tree.parentNode.insertBefore(banner, tree);
        }
        const count = type === 'ifc' ? ifcCount : idsCount;
        banner.innerHTML = `
            <div class="folder-banner__path">📁 ${folderName}</div>
            <div class="folder-banner__actions">
                <button class="btn-icon-modern folder-banner__rescan" title="${t('storage.folder.rescan')}">🔄</button>
            </div>
            <div class="folder-banner__readonly" data-i18n="storage.folder.readOnlyHint">⚠ Read-only — edits stay in the browser for now</div>
            <div class="folder-banner__count">${count} ${type === 'ifc' ? 'IFC' : 'IDS'}</div>
        `;
        banner.querySelector('.folder-banner__rescan').addEventListener('click', _refreshAll);
    }

    function _renderReconnectBanner(card, folderName) {
        const dropZone = card.querySelector('.drop-zone-modern');
        if (dropZone) dropZone.style.display = 'none';
        let banner = card.querySelector('.folder-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'folder-banner';
            const tree = card.querySelector('.file-tree-modern');
            if (tree && tree.parentNode) tree.parentNode.insertBefore(banner, tree);
        }
        banner.innerHTML = `
            <div class="folder-banner__path">📁 ${folderName || t('storage.folder.connectPrompt')}</div>
            <div class="folder-banner__actions">
                <button class="btn btn-primary folder-banner__connect" data-i18n="storage.folder.connect">Connect</button>
                <button class="btn btn-secondary folder-banner__useDB" data-i18n="storage.folder.useDB">Use browser</button>
            </div>
        `;
        banner.querySelector('.folder-banner__connect').addEventListener('click', async () => {
            try {
                const lf = new window.LocalFolderStorageBackend();
                const result = await lf.restoreFromIndexedDB();
                if (result.state === 'needs_permission') {
                    const ok = await lf.requestPermissionAgain(result.handle);
                    if (ok) {
                        await lf.scan();
                        window.BIMStorage.setBackend(lf);
                        localStorage.setItem('activeBackend', 'localFolder');
                    }
                } else if (result.state === 'no_handle') {
                    await lf.connect();
                    await lf.scan();
                    window.BIMStorage.setBackend(lf);
                    localStorage.setItem('activeBackend', 'localFolder');
                }
            } catch (e) { console.warn('Reconnect failed:', e); }
        });
        banner.querySelector('.folder-banner__useDB').addEventListener('click', () => {
            window.BIMStorage.setBackend(window.BIMStorage.indexedDBBackend);
            localStorage.setItem('activeBackend', 'indexedDB');
        });
    }

    function _renderErrorBanner(card) {
        const dropZone = card.querySelector('.drop-zone-modern');
        if (dropZone) dropZone.style.display = 'none';
        let banner = card.querySelector('.folder-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'folder-banner';
            const tree = card.querySelector('.file-tree-modern');
            if (tree && tree.parentNode) tree.parentNode.insertBefore(banner, tree);
        }
        banner.innerHTML = `
            <div class="folder-banner__error" data-i18n="storage.folder.unavailable">⚠ Folder unavailable</div>
            <div class="folder-banner__actions">
                <button class="btn btn-primary folder-banner__reconnect" data-i18n="storage.folder.reconnect">Reconnect</button>
                <button class="btn btn-secondary folder-banner__useDB" data-i18n="storage.folder.useDB">Use browser</button>
            </div>
        `;
        banner.querySelector('.folder-banner__reconnect').addEventListener('click', async () => {
            try {
                const lf = new window.LocalFolderStorageBackend();
                await lf.connect();
                await lf.scan();
                window.BIMStorage.setBackend(lf);
                localStorage.setItem('activeBackend', 'localFolder');
            } catch (e) { console.warn('Reconnect failed:', e); }
        });
        banner.querySelector('.folder-banner__useDB').addEventListener('click', () => {
            window.BIMStorage.setBackend(window.BIMStorage.indexedDBBackend);
            localStorage.setItem('activeBackend', 'indexedDB');
        });
    }

    function _renderStateA(card) {
        const dropZone = card.querySelector('.drop-zone-modern');
        if (dropZone) dropZone.style.display = '';
        const banner = card.querySelector('.folder-banner');
        if (banner) banner.remove();
    }

    async function _refreshAll() {
        const backend = window.BIMStorage && window.BIMStorage.backend;
        const ifcCard = _findCard('ifc');
        const idsCard = _findCard('ids');

        if (!backend || backend.kind !== 'localFolder') {
            if (ifcCard) _renderStateA(ifcCard);
            if (idsCard) _renderStateA(idsCard);
            return;
        }

        const ifcStats = backend.getStats('ifc');
        const idsStats = backend.getStats('ids');

        if (backend._initialized && backend.root) {
            if (ifcCard) _renderFolderHeader(ifcCard, 'ifc', backend.rootName, ifcStats.count, idsStats.count);
            if (idsCard) _renderFolderHeader(idsCard, 'ids', backend.rootName, ifcStats.count, idsStats.count);
        } else if (backend._pendingPermission) {
            if (ifcCard) _renderReconnectBanner(ifcCard, backend._pendingFolderName);
            if (idsCard) _renderReconnectBanner(idsCard, backend._pendingFolderName);
        } else {
            if (ifcCard) _renderErrorBanner(ifcCard);
            if (idsCard) _renderErrorBanner(idsCard);
        }

        if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();
    }

    function init() {
        document.addEventListener('storage:backendChanged', _refreshAll);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _refreshAll);
        } else {
            _refreshAll();
        }
    }

    init();
    window.BIMStorageCardFolderStates = { refresh: _refreshAll };
})();
