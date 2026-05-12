/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * 3D Viewer page bootstrap.
 * Wires the BIM_checker UI shell (storage picker, navbar) to the IFC engine.
 * Phase 0: pick IFC from BIMStorage → engine.loadIfc(arrayBuffer) → render.
 */

import { IfcEngine } from './ifc-engine/index.js';

const state = {
    engine: null,
    canvas: null,
    loadedModels: new Map() // modelId → { name, stats }
};

function t(key) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
}

function setupCanvas() {
    const container = document.getElementById('viewerContainer');
    if (!container) throw new Error('viewerContainer not found');

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

function initEngine() {
    const canvas = setupCanvas();
    state.engine = new IfcEngine({ canvas });

    if (typeof ResizeObserver !== 'undefined') {
        const container = document.getElementById('viewerContainer');
        const ro = new ResizeObserver(() => {
            const r = container.getBoundingClientRect();
            const w = Math.max(1, Math.floor(r.width));
            const h = Math.max(1, Math.floor(r.height));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                state.engine.resize(w, h);
            }
        });
        ro.observe(container);
    }

    window.__engine = state.engine;
}

function setStatus(msg, kind = 'info') {
    const el = document.getElementById('viewer3dStatus');
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind;
    el.hidden = !msg;
}

function renderLoadedList() {
    const list = document.getElementById('viewer3dLoadedList');
    if (!list) return;
    if (state.loadedModels.size === 0) {
        list.hidden = true;
        list.innerHTML = '';
        return;
    }
    list.hidden = false;
    list.innerHTML = Array.from(state.loadedModels.entries()).map(([modelId, info]) => `
        <div class="viewer3d-loaded-item" data-model-id="${modelId}">
            <span class="viewer3d-loaded-item__name">📦 ${escapeHtml(info.name)}</span>
            <span class="viewer3d-loaded-item__stats">${info.stats ? `${info.stats.entityCount} entit` : ''}</span>
            <button class="viewer3d-loaded-item__remove" data-model-id="${modelId}" title="${t('viewer3d.removeModel') || 'Odebrat'}">✕</button>
        </div>
    `).join('');
    list.querySelectorAll('.viewer3d-loaded-item__remove').forEach(btn => {
        btn.addEventListener('click', () => removeModel(btn.dataset.modelId));
    });
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
}

async function loadIfcFromStorage(fileMeta) {
    try {
        setStatus(t('viewer3d.loading') || `Načítám ${fileMeta.name}…`);
        const raw = await window.BIMStorage.getFileContent('ifc', fileMeta.id);
        if (!raw) throw new Error('No content');
        // Engine accepts ArrayBuffer or Uint8Array
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
        const modelId = await state.engine.loadIfc(buffer, { name: fileMeta.name });
        const stats = state.engine.getStats(modelId);
        state.loadedModels.set(modelId, { name: fileMeta.name, stats });
        renderLoadedList();
        setStatus(`✓ ${fileMeta.name} — ${stats ? stats.entityCount : '?'} entit`, 'success');
    } catch (e) {
        console.error('IFC load failed:', e);
        setStatus(`✗ ${e.message || e}`, 'error');
        if (window.ErrorHandler && window.ErrorHandler.error) {
            window.ErrorHandler.error((t('viewer3d.loadFailed') || 'Načtení selhalo') + ': ' + (e.message || e));
        }
    }
}

function removeModel(modelId) {
    if (!state.engine) return;
    try {
        state.engine.removeModel(modelId);
    } catch (e) {
        console.warn('removeModel failed:', e);
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
        const files = await window.BIMStorage.listFiles('ifc');
        if (!files || files.length === 0) {
            listEl.innerHTML = `<p class="storage-empty-message" data-i18n="viewer3d.pickerEmpty">${escapeHtml(t('viewer3d.pickerEmpty') || 'Žádné IFC soubory ve storage.')}</p>`;
            return;
        }
        listEl.innerHTML = files.map(f => `
            <div class="viewer3d-picker-item" data-file-id="${escapeHtml(f.id)}">
                <span class="viewer3d-picker-item__name">📄 ${escapeHtml(f.name)}</span>
                <span class="viewer3d-picker-item__size">${formatBytes(f.size)}</span>
            </div>
        `).join('');
        listEl.querySelectorAll('.viewer3d-picker-item').forEach(item => {
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

function formatBytes(b) {
    if (!b) return '0 B';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function wireUI() {
    const loadBtn = document.getElementById('viewer3dLoadBtn');
    if (loadBtn) loadBtn.addEventListener('click', openStoragePicker);

    const closeBtn = document.getElementById('viewer3dPickerClose');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        document.getElementById('viewer3dPickerModal').classList.remove('active');
    });

    const modal = document.getElementById('viewer3dPickerModal');
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
}

function boot() {
    initEngine();
    wireUI();
    setStatus(t('viewer3d.empty') || 'Žádný model — klikni na „Načíst IFC" pro výběr.');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
