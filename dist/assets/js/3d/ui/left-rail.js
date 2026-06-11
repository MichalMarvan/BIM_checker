// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Michal Marvan
//
// Left icon rail (Trimble-style) + slide-out drawer for the 3D viewer.
// One drawer at a time; panel classes share the interface of the right-side
// panel-manager ({ engine, host, titleEl, ctx } + mount()/destroy()).

const LOADERS = {
  models: () => import('../panels/models-panel.js'),
  viewpoints: () => import('../panels/viewpoints-panel.js'),
};

// Panels that need a live engine instance before they can mount.
// 'models' works without one (empty list + load button).
const NEEDS_ENGINE = new Set(['viewpoints']);

let _deps = null;
let _active = null;
let _instance = null;

function _els() {
  return {
    drawer: document.getElementById('v3dDrawer'),
    title: document.getElementById('v3dDrawerTitle'),
    body: document.getElementById('v3dDrawerBody'),
  };
}

function _syncRailActive() {
  document.querySelectorAll('.v3d-rail__item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rail === _active);
  });
}

export function initLeftRail(deps) {
  _deps = deps;
  document.querySelectorAll('.v3d-rail__item').forEach((btn) => {
    btn.addEventListener('click', () => toggleRailPanel(btn.dataset.rail));
  });
  const closeBtn = document.getElementById('v3dDrawerClose');
  if (closeBtn) closeBtn.addEventListener('click', closeRailPanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _active) closeRailPanel();
  });
}

export async function toggleRailPanel(id) {
  if (_active === id) {
    closeRailPanel();
    return;
  }
  await openRailPanel(id);
}

export async function openRailPanel(id) {
  const loader = LOADERS[id];
  if (!loader || !_deps) return;
  if (_active) closeRailPanel();

  const { drawer, title, body } = _els();
  if (!drawer) return;
  drawer.hidden = false;
  body.innerHTML = '';
  title.textContent = '…';
  _active = id;
  _syncRailActive();

  try {
    const engine = NEEDS_ENGINE.has(id)
      ? await _deps.getEngine()
      : _deps.getEngineIfReady();
    const mod = await loader();
    const Panel = mod.default || mod.Panel;
    if (!Panel) throw new Error('panel module missing default export');
    const inst = new Panel({ engine, host: body, titleEl: title, ctx: _deps.ctx || {} });
    if (typeof inst.mount === 'function') await inst.mount();
    _instance = inst;
  } catch (err) {
    console.error('[left-rail] failed to open panel', id, err);
    body.innerHTML = `<div class="v3d-panel__error">Failed: ${err.message || err}</div>`;
  }
}

export function closeRailPanel() {
  if (_instance && typeof _instance.destroy === 'function') {
    try { _instance.destroy(); } catch (e) { console.warn(e); }
  }
  _instance = null;
  _active = null;
  const { drawer, body } = _els();
  if (drawer) { drawer.hidden = true; body.innerHTML = ''; }
  _syncRailActive();
}

export function getActiveRailPanel() {
  return _active;
}

/** Re-render the open drawer panel (e.g. after a model loads / unloads). */
export function refreshRailPanel() {
  if (_instance && typeof _instance.refresh === 'function') _instance.refresh();
}
