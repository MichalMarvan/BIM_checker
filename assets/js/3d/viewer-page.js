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
    loadedModels: new Map() // modelId → { name, stats }
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
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
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
    try {
        setStatus(`${t('viewer3d.loading') || 'Načítám'} ${fileMeta.name}…`);
        const raw = await window.BIMStorage.getFileContent('ifc', fileMeta.id);
        if (!raw) throw new Error('Empty file content');
        let buffer;
        if (raw instanceof ArrayBuffer) {
            buffer = raw;
        } else if (typeof raw === 'string') {
            buffer = new TextEncoder().encode(raw).buffer;
        } else if (raw && raw.buffer instanceof ArrayBuffer) {
            buffer = raw.buffer;
        } else {
            buffer = raw;
        }
        const engine = await getEngine();
        const modelId = await engine.loadIfc(buffer, { name: fileMeta.name });
        const stats = (typeof engine.getStats === 'function') ? engine.getStats(modelId) : null;
        state.loadedModels.set(modelId, { name: fileMeta.name, stats });
        renderLoadedList();
        setStatus(`✓ ${fileMeta.name}${stats ? ` — ${stats.entityCount} entit` : ''}`, 'success');
    } catch (e) {
        console.error('IFC load failed:', e);
        setStatus(`✗ ${e.message || e}`, 'error');
        if (window.ErrorHandler && window.ErrorHandler.error) {
            window.ErrorHandler.error((t('viewer3d.loadFailed') || 'Načtení selhalo') + ': ' + (e.message || e));
        }
    }
}

function removeModel(modelId) {
    if (state.engine && typeof state.engine.removeModel === 'function') {
        try { state.engine.removeModel(modelId); } catch (e) { console.warn('removeModel failed:', e); }
    }
    state.loadedModels.delete(modelId);
    renderLoadedList();
    if (state.loadedModels.size === 0) {
        setStatus(t('viewer3d.empty') || 'Žádný model');
    }
}

async function openStoragePicker() {
    const modal = document.getElementById('viewer3dPickerModal');
    const listEl = document.getElementById('viewer3dPickerList');
    if (!modal || !listEl) return;

    listEl.innerHTML = `<p class="storage-empty-message">${escapeHtml(t('viewer3d.pickerLoading') || 'Načítám…')}</p>`;
    modal.classList.add('active');

    try {
        if (!window.BIMStorage) throw new Error('BIMStorage not initialized');
        if (typeof window.BIMStorage.init === 'function') {
            try { await window.BIMStorage.init(); } catch (_) { /* ignore */ }
        }
        const files = await window.BIMStorage.getFiles('ifc');
        if (!files || files.length === 0) {
            listEl.innerHTML = `<p class="storage-empty-message" data-i18n="viewer3d.pickerEmpty">${escapeHtml(t('viewer3d.pickerEmpty') || 'Žádné IFC soubory ve storage.')}</p>`;
            return;
        }
        listEl.innerHTML = files.map(f => `
            <div class="v3d-picker-item" data-file-id="${escapeHtml(f.id)}">
                <span class="v3d-picker-item__name">📄 ${escapeHtml(f.name)}</span>
                <span class="v3d-picker-item__size">${formatBytes(f.size)}</span>
            </div>
        `).join('');
        listEl.querySelectorAll('.v3d-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                const fileId = item.dataset.fileId;
                const meta = files.find(f => String(f.id) === fileId);
                if (meta) {
                    modal.classList.remove('active');
                    loadIfcFromStorage(meta);
                }
            });
        });
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
        document.getElementById('viewer3dPickerModal').classList.remove('active');
    });

    const modal = document.getElementById('viewer3dPickerModal');
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
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
