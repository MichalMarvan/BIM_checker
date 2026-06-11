// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Michal Marvan
//
// Models panel (left rail) — loaded-model cards with visibility / remove,
// plus the storage-picker entry point. Replaces the old navbar "Načíst IFC"
// button and the floating chip stack.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default class ModelsPanel {
  constructor({ engine, host, titleEl, ctx }) {
    this.engine = engine;
    this.host = host;
    this.ctx = ctx || {};
    titleEl.textContent = 'Modely';
  }

  mount() { this._render(); }
  refresh() { this._render(); }

  /** Engine may not exist before the first model loads — resolve per render. */
  _engine() {
    return (this.ctx.getEngineIfReady && this.ctx.getEngineIfReady()) || this.engine;
  }

  _render() {
    const engine = this._engine();
    const models = (this.ctx.getLoadedModels && this.ctx.getLoadedModels()) || [];
    const cards = models.map(({ modelId, name, stats }) => {
      const visible = engine && typeof engine.isModelVisible === 'function'
        ? engine.isModelVisible(modelId)
        : true;
      return `
        <div class="v3d-model-card${visible ? '' : ' is-hidden'}" data-model-id="${escapeHtml(modelId)}">
          <div class="v3d-model-card__main">
            <div class="v3d-model-card__name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="v3d-model-card__stats">${stats && stats.entityCount ? `${stats.entityCount.toLocaleString('cs-CZ')} entit` : ''}</div>
          </div>
          <button class="v3d-model-card__btn" data-act="visibility" title="${visible ? 'Skrýt model' : 'Zobrazit model'}">
            ${visible
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'}
          </button>
          <button class="v3d-model-card__btn v3d-model-card__btn--remove" data-act="remove" title="Odebrat model ze scény">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
    }).join('');

    this.host.innerHTML = `
      ${models.length === 0
    ? '<p class="v3d-panel__hint">Žádný načtený model.<br>Soubory najdeš v záložce Storage.</p>'
    : `<div class="v3d-model-list">${cards}</div>`}
      <button class="v3d-btn v3d-btn--primary v3d-drawer__load-btn" data-act="open-storage">+ Načíst ze Storage</button>
    `;

    this.host.querySelector('[data-act="open-storage"]').addEventListener('click', () => {
      if (this.ctx.openStorage) this.ctx.openStorage();
    });
    this.host.querySelectorAll('.v3d-model-card').forEach((card) => {
      const modelId = card.dataset.modelId;
      card.querySelector('[data-act="visibility"]').addEventListener('click', () => {
        const eng = this._engine();
        if (eng && typeof eng.setModelVisible === 'function') {
          eng.setModelVisible(modelId, !eng.isModelVisible(modelId));
        }
        this._render();
      });
      card.querySelector('[data-act="remove"]').addEventListener('click', () => {
        if (this.ctx.removeModel) this.ctx.removeModel(modelId);
        this._render();
      });
    });
  }

  destroy() {}
}
