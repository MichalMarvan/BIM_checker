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

    function _escapeHtml(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function _renderTreeNode(node, type, depth) {
        if (!node) return '';
        const hasContents = node.files.length > 0 || node.subfolders.length > 0;
        const isCollapsed = depth >= 2; // Root and first level expanded by default
        const padding = depth * 14;
        const badge = type === 'ifc'
            ? `<span class="folder-tree__badge">📐 ${node.ifcCount}</span>${node.idsCount > 0 ? `<span class="folder-tree__badge folder-tree__badge--muted">📋 ${node.idsCount}</span>` : ''}`
            : `<span class="folder-tree__badge">📋 ${node.idsCount}</span>${node.ifcCount > 0 ? `<span class="folder-tree__badge folder-tree__badge--muted">📐 ${node.ifcCount}</span>` : ''}`;
        let html = '';
        // Render folder header (always for depth > 0; root header only if multiple top-level dirs)
        const renderFolderHeader = depth > 0 || (node.subfolders.length > 1 && node.files.length === 0) || node.files.length > 0;
        if (renderFolderHeader) {
            const arrow = hasContents ? (isCollapsed ? '▶' : '▼') : ' ';
            html += `
                <div class="folder-tree__folder ${isCollapsed ? 'is-collapsed' : ''}" style="padding-left:${padding}px" data-folder-path="${_escapeHtml(node.path)}">
                    <span class="folder-tree__arrow">${arrow}</span>
                    <span class="folder-tree__icon">📁</span>
                    <span class="folder-tree__name">${_escapeHtml(node.name)}</span>
                    ${badge}
                </div>
                <div class="folder-tree__children" data-parent-path="${_escapeHtml(node.path)}" ${isCollapsed ? 'hidden' : ''}>
            `;
        }
        // Files in this folder
        for (const file of node.files) {
            const sizeKB = (file.size / 1024).toFixed(1);
            const filePadding = (depth + 1) * 14;
            html += `
                <div class="folder-tree__file" style="padding-left:${filePadding}px" data-file-path="${_escapeHtml(file.path)}" title="${_escapeHtml(file.path)}">
                    <span class="folder-tree__arrow" aria-hidden="true"> </span>
                    <span class="folder-tree__icon">📄</span>
                    <span class="folder-tree__name">${_escapeHtml(file.name)}</span>
                    <span class="folder-tree__size">${sizeKB} KB</span>
                </div>
            `;
        }
        // Subfolders
        for (const sub of node.subfolders) {
            html += _renderTreeNode(sub, type, depth + 1);
        }
        if (renderFolderHeader) html += `</div>`;
        return html;
    }

    function _renderFolderHeader(card, type, folderName, ifcCount, idsCount, folderTree) {
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
        const treeHtml = folderTree
            ? `<div class="folder-tree">${_renderTreeNode(folderTree, type, 0)}</div>`
            : `<div class="folder-tree__empty" data-i18n="storage.folder.noMatching">No ${type.toUpperCase()} files in this folder.</div>`;

        banner.innerHTML = `
            <div class="folder-banner__top">
                <div class="folder-banner__path" title="${_escapeHtml(folderName)}">📁 ${_escapeHtml(folderName)}</div>
                <button class="btn-icon-modern folder-banner__rescan" title="${t('storage.folder.rescan')}">🔄</button>
            </div>
            <div class="folder-banner__readonly" data-i18n="storage.folder.readOnlyHint">✏ File edits save back to disk (folder delete/rename not supported yet)</div>
            ${treeHtml}
        `;
        banner.querySelector('.folder-banner__rescan').addEventListener('click', async () => {
            const b = window.BIMStorage && window.BIMStorage.backend;
            if (b && b.kind === 'localFolder' && b.scan) {
                await b.scan();
                _refreshAll();
            }
        });
        // Click handler for folder header — toggle expand/collapse
        banner.querySelectorAll('.folder-tree__folder').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderPath = el.dataset.folderPath;
                const children = banner.querySelector(`.folder-tree__children[data-parent-path="${CSS.escape(folderPath)}"]`);
                if (!children) return;
                const collapsed = el.classList.toggle('is-collapsed');
                children.toggleAttribute('hidden', collapsed);
                const arrow = el.querySelector('.folder-tree__arrow');
                if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
            });
        });
        // Click handler for files — navigate to appropriate subpage with file pre-loaded
        banner.querySelectorAll('.folder-tree__file').forEach(el => {
            el.addEventListener('click', async () => {
                const path = el.dataset.filePath;
                const b = window.BIMStorage.backend;
                if (!b || b.kind !== 'localFolder') return;
                const name = el.querySelector('.folder-tree__name').textContent;
                // Stash request for the destination page to pick up after navigation
                sessionStorage.setItem('openFromFolder', JSON.stringify({ type, path, name, at: Date.now() }));
                // Dispatch event in case some on-page handler wants to handle in-place
                document.dispatchEvent(new CustomEvent('localFolderFileOpen', {
                    detail: { type, path, name }
                }));
                // Auto-navigate: IFC → viewer, IDS → parser
                const here = (window.location.pathname || '').toLowerCase();
                const isHomepage = !here.includes('/pages/');
                if (isHomepage) {
                    const target = type === 'ifc' ? 'pages/ifc-viewer-multi-file.html' : 'pages/ids-parser-visualizer.html';
                    window.location.href = target;
                } else {
                    const target = type === 'ifc' ? './ifc-viewer-multi-file.html' : './ids-parser-visualizer.html';
                    // Only navigate if we're on a different page than the target
                    if (!here.endsWith(target.slice(2))) {
                        window.location.href = target;
                    }
                }
            });
        });
        // Hide the existing file-tree-modern in folder mode
        const existingTree = card.querySelector('.file-tree-modern');
        if (existingTree) existingTree.style.display = 'none';
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

    function _formatBytes(bytes) {
        if (!bytes) return '0 KB';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function _updateStatsBox(boxId, count, totalBytes) {
        const box = document.getElementById(boxId);
        if (!box) return;
        const values = box.querySelectorAll('.stat-value');
        if (values.length >= 1) values[0].textContent = count;
        if (values.length >= 2) values[1].textContent = _formatBytes(totalBytes);
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

        // Update the bottom stats badges (Souborů / Velikost)
        _updateStatsBox('ifcStats', ifcStats.count, ifcStats.totalBytes);
        _updateStatsBox('idsStats', idsStats.count, idsStats.totalBytes);

        if (backend._initialized && backend.root) {
            const ifcTree = backend.getFolderTree ? backend.getFolderTree('ifc') : null;
            const idsTree = backend.getFolderTree ? backend.getFolderTree('ids') : null;
            if (ifcCard) _renderFolderHeader(ifcCard, 'ifc', backend.rootName, ifcStats.count, idsStats.count, ifcTree);
            if (idsCard) _renderFolderHeader(idsCard, 'ids', backend.rootName, ifcStats.count, idsStats.count, idsTree);
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
