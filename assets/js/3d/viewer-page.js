/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * 3D Viewer page bootstrap.
 * Wires the BIM_checker UI shell (storage picker, navbar) to the IFC engine.
 *
 * Engine is loaded LAZILY on first IFC load so a top-level import failure
 * (CDN, missing module, etc.) doesn't break the UI / picker. The user gets
 * a clear status error instead of a silently dead button.
 */

console.log('[3d-viewer] module loaded — v58+ (lazy engine init)');

const state = {
    engine: null,
    enginePromise: null,
    canvas: null,
    loadedModels: new Map(),  // modelId → { name, stats }
    federationAnchor: null    // [x, y, z] world coords of FIRST model's bbox center
                              // Subsequent loads shift by the SAME anchor so models
                              // keep their real-world relative positions.
};

function t(key) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
}

function setStatus(msg, kind = 'info') {
    const el = document.getElementById('viewer3dStatus');
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind;
    el.hidden = !msg;
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
}

function formatBytes(b) {
    if (!b) return '0 B';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function setupCanvas() {
    const container = document.getElementById('viewerContainer');
    if (!container) throw new Error('viewerContainer not found');
    if (state.canvas) return state.canvas;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvas.width = w;
    canvas.height = h;
    console.log('[3d-viewer] canvas created:', w, '×', h, '(container rect:', rect.width, '×', rect.height, ')');
    container.appendChild(canvas);
    state.canvas = canvas;
    return canvas;
}

/**
 * Lazy-load the IFC engine on first use. Cached promise so subsequent calls
 * reuse the same instance. Any import-time failure (CDN, deep submodule)
 * surfaces here, not at page load, so the UI / picker stays alive.
 */
function getEngine() {
    if (state.enginePromise) return state.enginePromise;
    state.enginePromise = (async () => {
        setStatus(t('viewer3d.initEngine') || 'Inicializuji 3D engine…');
        const mod = await import('./ifc-engine/index.js');
        const canvas = setupCanvas();
        const engine = new mod.IfcEngine({ canvas });

        if (typeof ResizeObserver !== 'undefined') {
            const container = document.getElementById('viewerContainer');
            const ro = new ResizeObserver(() => {
                const r = container.getBoundingClientRect();
                const w = Math.max(1, Math.floor(r.width));
                const h = Math.max(1, Math.floor(r.height));
                if (canvas.width !== w || canvas.height !== h) {
                    canvas.width = w;
                    canvas.height = h;
                    if (typeof engine.resize === 'function') engine.resize(w, h);
                }
            });
            ro.observe(container);
        }

        state.engine = engine;
        window.__engine = engine;
        return engine;
    })().catch(err => {
        state.enginePromise = null;
        console.error('[3D viewer] engine init failed:', err);
        setStatus(`✗ Engine init: ${err.message || err}`, 'error');
        throw err;
    });
    return state.enginePromise;
}

function updateFileChip(name) {
    const chip = document.getElementById('v3dFileInfo');
    const label = document.getElementById('v3dFileName');
    if (!chip || !label) return;
    if (name) {
        label.textContent = name;
        chip.hidden = false;
    } else {
        chip.hidden = true;
    }
}

function renderLoadedList() {
    const list = document.getElementById('viewer3dLoadedList');
    if (!list) return;
    if (state.loadedModels.size === 0) {
        list.hidden = true;
        list.innerHTML = '';
        updateFileChip(null);
        return;
    }
    list.hidden = false;
    list.innerHTML = Array.from(state.loadedModels.entries()).map(([modelId, info]) => `
        <div class="v3d-loaded-item" data-model-id="${modelId}">
            <span class="v3d-loaded-item__name">📦 ${escapeHtml(info.name)}</span>
            <span class="v3d-loaded-item__stats">${info.stats ? `${info.stats.entityCount}` : ''}</span>
            <button class="v3d-loaded-item__remove" data-model-id="${modelId}" title="${t('viewer3d.removeModel') || 'Odebrat'}">✕</button>
        </div>
    `).join('');
    list.querySelectorAll('.v3d-loaded-item__remove').forEach(btn => {
        btn.addEventListener('click', () => removeModel(btn.dataset.modelId));
    });
    const lastEntry = Array.from(state.loadedModels.values()).pop();
    updateFileChip(lastEntry ? lastEntry.name : null);
}

async function loadIfcFromStorage(fileMeta) {
    console.log('[3d-viewer] loadIfcFromStorage:', fileMeta.name);
    try {
        setStatus(`${t('viewer3d.loading') || 'Načítám'} ${fileMeta.name}…`);
        const raw = await window.BIMStorage.getFileContent('ifc', fileMeta.id);
        if (!raw) throw new Error('Empty file content');
        let buffer;
        if (raw instanceof ArrayBuffer) buffer = raw;
        else if (typeof raw === 'string') buffer = new TextEncoder().encode(raw).buffer;
        else if (raw && raw.buffer instanceof ArrayBuffer) buffer = raw.buffer;
        else buffer = raw;
        console.log('[3d-viewer] buffer ready, requesting engine…');
        const engine = await getEngine();
        console.log('[3d-viewer] engine ready, calling loadIfc…');
        const modelId = await engine.loadIfc(buffer, { name: fileMeta.name });
        console.log('[3d-viewer] loadIfc resolved, modelId =', modelId);
        const stats = (typeof engine.getStats === 'function') ? engine.getStats(modelId) : null;
        console.log('[3d-viewer] stats =', stats);

        // Diagnostic: how many meshes were actually built by the geometry pipeline?
        let meshCount = 0;
        try {
            const internal = engine._viewer && engine._viewer._models && engine._viewer._models.get(modelId);
            meshCount = internal && internal.meshes ? internal.meshes.length : 0;
            console.log('[3d-viewer] meshes built:', meshCount, internal);
        } catch (e) {
            console.warn('[3d-viewer] mesh introspection failed:', e);
        }

        state.loadedModels.set(modelId, { name: fileMeta.name, stats });
        renderLoadedList();

        // Log what georef data this IFC actually carries — federation strategy
        // depends on whether the file has IfcMapConversion vs IfcSite refs vs
        // nothing (geometry baked at world coords).
        try {
            const coords = typeof engine.getCoords === 'function' ? engine.getCoords(modelId) : null;
            console.log('[3d-viewer] getCoords:', coords);
        } catch (e) { console.warn('[3d-viewer] getCoords failed:', e); }

        // Force a resize sync — covers the case where canvas was created
        // before the container had layout dimensions.
        try {
            const c = state.canvas;
            const container = document.getElementById('viewerContainer');
            if (c && container) {
                const r = container.getBoundingClientRect();
                const w = Math.max(1, Math.floor(r.width));
                const h = Math.max(1, Math.floor(r.height));
                console.log('[3d-viewer] post-load resize sync:', w, '×', h);
                if (typeof engine.resize === 'function') engine.resize(w, h);
            }
        } catch (e) { console.warn('[3d-viewer] resize sync failed:', e); }

        // Shift this model's group to scene origin so geometry sits near (0,0,0).
        // Civil IFCs (Czech S-JTSK etc.) place vertices at world coords ~10^6 m.
        // WebGL vertex transform precision is f32 — at that magnitude, triangles
        // jitter or vanish. Engine's federation auto-mode leaves the FIRST model
        // at its world origin (expects building IFCs with origin near 0), so we
        // do it ourselves here.
        // Federation strategy (= @thatopen autoCoordinate behavior):
        // Each model is shifted so its OWN bbox center sits at scene (0,0,0).
        // This is the "building federation" pattern — different disciplines of
        // the same site overlay naturally. For civil IFCs whose IfcSite anchors
        // sit at different S-JTSK origins (file 1 site (-751800,-1041200), file 2
        // site (-752000,-1040600)) the per-file content visually collapses to a
        // shared local frame instead of being placed at the literal real-world
        // delta (205m apart for SO112201 vs SO112402 here).
        //
        // Cross-CRS or true real-world placement comes later via
        // engine.setRealWorldCoords + IfcMapConversion or proj4js reprojection.
        try {
            const internal = engine._viewer && engine._viewer._models && engine._viewer._models.get(modelId);
            if (internal && internal.group) {
                internal.group.position.set(0, 0, 0);
                internal.group.updateMatrixWorld(true);
                let minX=Infinity, minY=Infinity, minZ=Infinity, maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
                for (const m of internal.meshes) {
                    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
                    const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
                    if (b.min.x < minX) minX = b.min.x;
                    if (b.min.y < minY) minY = b.min.y;
                    if (b.min.z < minZ) minZ = b.min.z;
                    if (b.max.x > maxX) maxX = b.max.x;
                    if (b.max.y > maxY) maxY = b.max.y;
                    if (b.max.z > maxZ) maxZ = b.max.z;
                }
                if (Number.isFinite(minX)) {
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;
                    const cz = (minZ + maxZ) / 2;
                    console.log('[3d-viewer] model world bbox center:', cx, cy, cz);
                    internal.group.position.set(-cx, -cy, -cz);
                    internal.group.updateMatrixWorld(true);
                    console.log('[3d-viewer] group position after collapse-to-origin:', internal.group.position.toArray());
                }
            }
        } catch (e) { console.warn('[3d-viewer] federation collapse failed:', e); }

        // Frame the camera on whatever is now in the scene
        if (typeof engine.fitAll === 'function') {
            try { engine.fitAll(); console.log('[3d-viewer] fitAll done'); } catch (e) { console.warn('[3d-viewer] fitAll failed:', e); }
        }

        // Diagnostic: log camera position + bounding box after fitAll
        try {
            const v = engine._viewer;
            if (v && v._camera) {
                console.log('[3d-viewer] camera position:', v._camera.position.toArray());
                console.log('[3d-viewer] controls target:', v._controls && v._controls.target ? v._controls.target.toArray() : null);
            }
        } catch (e) { /* ignore */ }

        if (meshCount === 0) {
            setStatus(`⚠ ${fileMeta.name} — 0 mesh (geometrie tohoto IFC zatím není podporovaná)`, 'error');
        } else {
            setStatus(`✓ ${fileMeta.name}${stats ? ` — ${stats.entityCount} entit, ${meshCount} mesh` : ''}`, 'success');
        }
        return modelId;
    } catch (e) {
        console.error('[3d-viewer] IFC load failed:', e);
        setStatus(`✗ ${e.message || e}`, 'error');
        if (window.ErrorHandler && window.ErrorHandler.error) {
            window.ErrorHandler.error((t('viewer3d.loadFailed') || 'Načtení selhalo') + ': ' + (e.message || e));
        }
        throw e;
    }
}

async function loadSelectedFromPicker() {
    const ids = Array.from(pickerState.selected);
    if (ids.length === 0) return;
    const modal = document.getElementById('viewer3dPickerModal');
    if (modal) modal.classList.remove('show');
    for (const fileId of ids) {
        const meta = pickerState.files[fileId];
        if (!meta) continue;
        try { await loadIfcFromStorage(meta); } catch (_) { /* keep going through the batch */ }
    }
    pickerState.selected.clear();
}

function removeModel(modelId) {
    if (state.engine && typeof state.engine.removeModel === 'function') {
        try { state.engine.removeModel(modelId); } catch (e) { console.warn('removeModel failed:', e); }
    }
    state.loadedModels.delete(modelId);
    // When the scene is empty, drop the federation anchor so the next loaded
    // model starts a fresh federation at its own origin.
    if (state.loadedModels.size === 0) {
        state.federationAnchor = null;
        setStatus(t('viewer3d.empty') || 'Žádný model');
    }
    renderLoadedList();
}

// In-memory state for picker tree
const pickerState = {
    folders: {},   // folderId → { id, name, parentId, children: [folderId], files: [fileId] }
    files: {},     // fileId → { id, name, size, folder }
    expanded: new Set(['root']),
    selected: new Set()   // fileIds checked for loading
};

function escAttr(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/** Build unified {folders, files} from active BIMStorage backend. */
async function buildPickerTree() {
    const backend = window.BIMStorage && window.BIMStorage.backend;
    if (!backend) throw new Error('BIMStorage backend not ready');

    // Folder mode — walk getFolderTree('ifc')
    if (backend.kind === 'localFolder' && typeof backend.getFolderTree === 'function') {
        const tree = backend.getFolderTree('ifc');
        const folders = {};
        const files = {};
        function walk(node, parentId, folderId) {
            folders[folderId] = {
                id: folderId,
                name: node.name || 'root',
                parentId,
                children: node.subfolders.map(sub => sub.path || sub.name),
                files: node.files.map(f => f.path)
            };
            for (const f of node.files) {
                files[f.path] = { id: f.path, name: f.name, size: f.size, folder: folderId };
            }
            for (const sub of node.subfolders) walk(sub, folderId, sub.path || sub.name);
        }
        if (tree) walk(tree, null, 'root');
        return { folders, files };
    }

    // IDB mode — read structure from BIMStorage.ifcStorage
    if (window.BIMStorage.ifcStorage && typeof window.BIMStorage.ifcStorage.loadMetadata === 'function') {
        await window.BIMStorage.ifcStorage.loadMetadata();
        const meta = window.BIMStorage.ifcStorage.metadata;
        if (meta && meta.folders) {
            const folders = {};
            const files = {};
            for (const fId in meta.folders) {
                const f = meta.folders[fId];
                folders[fId] = {
                    id: fId,
                    name: f.name,
                    parentId: f.parent,
                    children: Array.isArray(f.children) ? [...f.children] : [],
                    files: Array.isArray(f.files) ? [...f.files] : []
                };
            }
            // metadata.files only carries metadata after explicit load; fall back to getFiles for raw list
            const list = await window.BIMStorage.getFiles('ifc');
            for (const f of list) {
                files[f.id] = { id: f.id, name: f.name, size: f.size, folder: f.folderId || 'root' };
            }
            return { folders, files };
        }
    }

    // Fallback flat list (no folders) — synthesize a single root folder
    const list = await window.BIMStorage.getFiles('ifc');
    const folders = { root: { id: 'root', name: t('storage.rootFolder') || 'Root', parentId: null, children: [], files: list.map(f => f.id) } };
    const files = {};
    for (const f of list) files[f.id] = { id: f.id, name: f.name, size: f.size, folder: 'root' };
    return { folders, files };
}

function getAllFilesInFolder(folderId) {
    const folder = pickerState.folders[folderId];
    if (!folder) return [];
    let acc = [...folder.files];
    for (const childId of folder.children) acc = acc.concat(getAllFilesInFolder(childId));
    return acc;
}

function renderPickerFolderRecursive(folderId, level) {
    const folder = pickerState.folders[folderId];
    if (!folder) return '';
    const isExpanded = pickerState.expanded.has(folderId);
    const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0);
    const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';
    const safeId = escAttr(folderId);
    const count = getAllFilesInFolder(folderId).length;

    let html = '';
    if (folderId !== 'root') {
        html += `
            <div class="v3d-tree-folder" style="padding-left: ${level * 14}px;">
                <span data-folder-id="${safeId}" class="v3d-folder-toggle">
                    <span class="v3d-tree-arrow">${arrow}</span>
                    <span class="v3d-tree-name">📁 ${escapeHtml(folder.name)}</span>
                    ${count > 0 ? `<span class="v3d-tree-count">(${count})</span>` : ''}
                </span>
            </div>
        `;
    }

    if (isExpanded || folderId === 'root') {
        for (const childId of folder.children) {
            html += renderPickerFolderRecursive(childId, level + (folderId === 'root' ? 0 : 1));
        }
        for (const fileId of folder.files) {
            const file = pickerState.files[fileId];
            if (!file) continue;
            const safeFileId = escAttr(fileId);
            const indent = (folderId === 'root') ? level * 14 : (level + 1) * 14;
            const checked = pickerState.selected.has(fileId) ? 'checked' : '';
            html += `
                <label class="v3d-picker-file" data-file-id="${safeFileId}" style="padding-left: ${indent + 18}px;">
                    <input type="checkbox" class="v3d-picker-check" data-file-id="${safeFileId}" ${checked}>
                    <span class="v3d-picker-file__name">📄 ${escapeHtml(file.name)}</span>
                    <span class="v3d-picker-file__size">${formatBytes(file.size)}</span>
                </label>
            `;
        }
    }
    return html;
}

function refreshPickerSelectionCount() {
    const btn = document.getElementById('v3dPickerConfirm');
    const count = pickerState.selected.size;
    if (btn) {
        btn.disabled = count === 0;
        btn.textContent = count === 0
            ? (t('viewer3d.pickerConfirm') || 'Načíst vybrané')
            : `${t('viewer3d.pickerConfirm') || 'Načíst vybrané'} (${count})`;
    }
}

function attachPickerTreeListeners(listEl, modal) {
    listEl.querySelectorAll('.v3d-folder-toggle').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const folderId = el.dataset.folderId;
            if (!folderId) return;
            if (pickerState.expanded.has(folderId)) pickerState.expanded.delete(folderId);
            else pickerState.expanded.add(folderId);
            listEl.innerHTML = renderPickerFolderRecursive('root', 0);
            attachPickerTreeListeners(listEl, modal);
        });
    });
    listEl.querySelectorAll('.v3d-picker-check').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const fileId = input.dataset.fileId;
            if (!fileId) return;
            if (input.checked) pickerState.selected.add(fileId);
            else pickerState.selected.delete(fileId);
            refreshPickerSelectionCount();
        });
    });
    // Click on file row (outside checkbox) toggles too
    listEl.querySelectorAll('.v3d-picker-file').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const check = row.querySelector('.v3d-picker-check');
            if (check) {
                check.checked = !check.checked;
                check.dispatchEvent(new Event('change'));
            }
        });
    });
}

async function openStoragePicker() {
    const modal = document.getElementById('viewer3dPickerModal');
    const listEl = document.getElementById('viewer3dPickerList');
    if (!modal || !listEl) return;

    listEl.innerHTML = `<p class="storage-empty-message">${escapeHtml(t('viewer3d.pickerLoading') || 'Načítám…')}</p>`;
    modal.classList.add('show');

    try {
        if (!window.BIMStorage) throw new Error('BIMStorage not initialized');
        if (typeof window.BIMStorage.init === 'function') {
            try { await window.BIMStorage.init(); } catch (_) { /* ignore */ }
        }
        const tree = await buildPickerTree();
        pickerState.folders = tree.folders;
        pickerState.files = tree.files;
        // Auto-expand all top-level so the file tree is visible by default
        for (const fId of Object.keys(tree.folders)) pickerState.expanded.add(fId);

        if (Object.keys(tree.files).length === 0) {
            listEl.innerHTML = `<p class="storage-empty-message" data-i18n="viewer3d.pickerEmpty">${escapeHtml(t('viewer3d.pickerEmpty') || 'Žádné IFC soubory ve storage.')}</p>`;
            refreshPickerSelectionCount();
            return;
        }
        listEl.innerHTML = renderPickerFolderRecursive('root', 0);
        attachPickerTreeListeners(listEl, modal);
        refreshPickerSelectionCount();
    } catch (e) {
        console.error('Picker load failed:', e);
        listEl.innerHTML = `<p class="storage-error-message">${escapeHtml(e.message || String(e))}</p>`;
    }
}

function wireUI() {
    const loadBtn = document.getElementById('viewer3dLoadBtn');
    console.log('[3d-viewer] wireUI: loadBtn =', loadBtn);
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            console.log('[3d-viewer] Load IFC clicked');
            openStoragePicker();
        });
    }

    const closeBtn = document.getElementById('viewer3dPickerClose');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        document.getElementById('viewer3dPickerModal').classList.remove('show');
    });

    const cancelBtn = document.getElementById('v3dPickerCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        document.getElementById('viewer3dPickerModal').classList.remove('show');
        pickerState.selected.clear();
    });

    const confirmBtn = document.getElementById('v3dPickerConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', loadSelectedFromPicker);

    const modal = document.getElementById('viewer3dPickerModal');
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });

    document.querySelectorAll('.v3d-tool').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            document.querySelectorAll('.v3d-tool').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const label = btn.title || tool;
            setStatus(`${label} — ${t('viewer3d.comingSoon') || 'tool přijde v dalším iteration'}`, 'info');
        });
    });
}

function boot() {
    wireUI();
    setStatus(t('viewer3d.empty') || 'Žádný model — klikni na „Načíst IFC".');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
