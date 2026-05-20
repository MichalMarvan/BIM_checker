// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Michal Marvan
//
// Floating right-side panel manager for the 3D viewer.
// Lazy-loads panel modules on first activation; one panel open at a time.

const registry = new Map();
let activeTool = null;
let activeInstance = null;
let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'v3dPanelHost';
  host.className = 'v3d-panel-host';
  host.hidden = true;
  document.body.appendChild(host);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeTool) closePanel();
  });
  return host;
}

export function registerPanel(toolId, loader) {
  registry.set(toolId, { loader, instance: null });
}

export function getActiveTool() {
  return activeTool;
}

export async function togglePanel(toolId, engine, ctx = {}) {
  if (activeTool === toolId) {
    closePanel();
    return;
  }
  if (activeTool) closePanel();

  const reg = registry.get(toolId);
  if (!reg) {
    console.warn('[panel-manager] no panel registered for', toolId);
    return;
  }

  ensureHost();
  host.hidden = false;
  host.innerHTML = `
    <section class="v3d-panel" data-tool="${toolId}">
      <header class="v3d-panel__header">
        <h3 class="v3d-panel__title" data-role="title">${toolId}</h3>
        <button class="v3d-panel__close" data-role="close" aria-label="Close">×</button>
      </header>
      <div class="v3d-panel__body" data-role="body"></div>
    </section>
  `;
  host.querySelector('[data-role="close"]').addEventListener('click', closePanel);

  const body = host.querySelector('[data-role="body"]');
  const titleEl = host.querySelector('[data-role="title"]');

  try {
    const mod = await reg.loader();
    const Panel = mod.default || mod.Panel;
    if (!Panel) throw new Error('panel module missing default export');
    const inst = new Panel({ engine, host: body, titleEl, ctx, close: closePanel });
    if (typeof inst.mount === 'function') await inst.mount();
    activeInstance = inst;
    activeTool = toolId;
    syncToolbarActive(toolId);
  } catch (err) {
    console.error('[panel-manager] failed to load panel', toolId, err);
    body.innerHTML = `<div class="v3d-panel__error">Failed: ${err.message || err}</div>`;
  }
}

export function closePanel() {
  if (activeInstance && typeof activeInstance.destroy === 'function') {
    try { activeInstance.destroy(); } catch (e) { console.warn(e); }
  }
  activeInstance = null;
  activeTool = null;
  if (host) { host.hidden = true; host.innerHTML = ''; }
  syncToolbarActive(null);
}

function syncToolbarActive(toolId) {
  document.querySelectorAll('.v3d-tool').forEach((b) => {
    b.classList.toggle('active', toolId !== null && b.dataset.tool === toolId);
  });
}
