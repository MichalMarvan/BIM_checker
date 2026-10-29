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

function tr(key, fallback) {
    const value = window.i18n?.t?.(key);
    return value && value !== key ? value : fallback;
}

function locale() {
    return window.i18n?.getCurrentLanguage?.() === 'en' ? 'en-US' : 'cs-CZ';
}

export default class ModelsPanel {
    constructor({ engine, host, titleEl, ctx }) {
        this.engine = engine;
        this.host = host;
        this.ctx = ctx || {};
        this.openMenuId = null;   // modelId with the ⋯ dropdown open
        this.infoId = null;       // modelId with the inline info section open
        this._onDocDown = (e) => {
            if (this.openMenuId && !e.target.closest('.v3d-model-menu, [data-act="menu"]')) {
                this.openMenuId = null;
                this._render();
            }
        };
        document.addEventListener('mousedown', this._onDocDown);
        this.titleEl = titleEl;
        titleEl.textContent = tr('viewer3d.rail.models', 'Modely');
    }

    mount() {
        this._render();
    }
    refresh() {
        this.titleEl.textContent = tr('viewer3d.rail.models', 'Modely');
        this._render();
    }

    /** Engine may not exist before the first model loads — resolve per render. */
    _engine() {
        return (this.ctx.getEngineIfReady && this.ctx.getEngineIfReady()) || this.engine;
    }

    _modelMeta(modelId) {
        const engine = this._engine();
        if (!engine || typeof engine.getModels !== 'function') {
            return null;
        }
        return engine.getModels().find(m => m.modelId === modelId) || null;
    }

    _render() {
        const engine = this._engine();
        const models = (this.ctx.getLoadedModels && this.ctx.getLoadedModels()) || [];
        const cards = models.map(({ modelId, name, stats }) => {
            const visible = engine && typeof engine.isModelVisible === 'function'
                ? engine.isModelVisible(modelId)
                : true;
            const menuOpen = this.openMenuId === modelId;
            const infoOpen = this.infoId === modelId;
            let infoHtml = '';
            if (infoOpen) {
                const meta = this._modelMeta(modelId) || {};
                const geometry = meta.geometry || stats?.geometry || {};
                const rows = [
                    [tr('viewer3d.models.schema', 'Schéma'), meta.schema || '—'],
                    ['MVD', (meta.viewDefinitions && meta.viewDefinitions.length) ? meta.viewDefinitions.join(', ') : null],
                    [tr('viewer3d.models.entities', 'Entit'), (meta.entityCount || (stats && stats.entityCount) || 0).toLocaleString(locale())],
                    [tr('viewer3d.models.types', 'Typů'), meta.typeCount ? meta.typeCount.toLocaleString(locale()) : null],
                    [tr('viewer3d.models.products', 'IFC produktů'), Number.isFinite(geometry.productCount) ? geometry.productCount.toLocaleString(locale()) : null],
                    [tr('viewer3d.models.rendered', 'Vykreslených prvků'), Number.isFinite(geometry.renderedElementCount) ? geometry.renderedElementCount.toLocaleString(locale()) : null],
                    [tr('viewer3d.models.withoutGeometry', 'Bez geometrie'), geometry.elementsWithoutGeometry ? geometry.elementsWithoutGeometry.toLocaleString(locale()) : null],
                    [tr('viewer3d.models.fallbacks', 'Aproximací CSG'), geometry.fallbackGeometryCount ? geometry.fallbackGeometryCount.toLocaleString(locale()) : null],
                    [tr('viewer3d.models.outliers', 'Vynechaných odlehlých částí'), geometry.outlierItemCount ? geometry.outlierItemCount.toLocaleString(locale()) : null],
                ].filter(([, v]) => v !== null && v !== undefined);
                const unsupported = Array.isArray(geometry.unsupportedRepresentationTypes)
                    ? geometry.unsupportedRepresentationTypes : [];
                const warnings = geometry.geometryWarningCount || 0;
                infoHtml = `<div class="v3d-model-info">${rows.map(([k, v]) =>
                    `<div class="v3d-model-info__row"><span>${escapeHtml(k)}</span><b>${escapeHtml(String(v))}</b></div>`).join('')}
          ${unsupported.length ? `<div class="v3d-model-info__detail"><span>${escapeHtml(tr('viewer3d.models.unsupported', 'Nepodporované reprezentace'))}</span><code>${escapeHtml(unsupported.join(', '))}</code></div>` : ''}
          <div class="v3d-model-info__quality ${warnings ? 'has-warnings' : 'is-ok'}">${escapeHtml(warnings
    ? tr('viewer3d.models.geometryWarnings', 'Geometrie obsahuje upozornění').replace('{count}', warnings.toLocaleString(locale()))
    : tr('viewer3d.models.geometryOk', 'Bez zjištěných upozornění geometrie'))}</div>
        </div>`;
            }
            return `
        <div class="v3d-model-card${visible ? '' : ' is-hidden'}" data-model-id="${escapeHtml(modelId)}">
          <div class="v3d-model-card__row">
            <div class="v3d-model-card__main">
              <div class="v3d-model-card__name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
              <div class="v3d-model-card__stats">${stats && stats.entityCount ? `${stats.entityCount.toLocaleString(locale())} ${escapeHtml(tr('viewer3d.models.entities', 'Entit').toLowerCase())}` : ''}${stats?.geometry && Number.isFinite(stats.geometry.renderedElementCount) ? ` · ${stats.geometry.renderedElementCount.toLocaleString(locale())} ${escapeHtml(tr('viewer3d.models.renderedShort', 'vykresleno'))}` : ''}</div>
            </div>
            <button class="v3d-model-card__btn" data-act="visibility" title="${escapeHtml(visible ? tr('viewer3d.models.hide', 'Skrýt model') : tr('viewer3d.models.show', 'Zobrazit model'))}">
              ${visible
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'}
            </button>
            <button class="v3d-model-card__btn v3d-model-card__btn--remove" data-act="remove" title="${escapeHtml(tr('viewer3d.models.remove', 'Odebrat model ze scény'))}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <button class="v3d-model-card__btn" data-act="menu" title="${escapeHtml(tr('viewer3d.models.more', 'Další akce'))}">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
            ${menuOpen ? `
            <div class="v3d-model-menu">
              <button class="v3d-model-menu__item" data-act="zoom">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                ${escapeHtml(tr('viewer3d.models.zoom', 'Přiblížit na model'))}
              </button>
              <button class="v3d-model-menu__item" data-act="isolate">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3.5"/></svg>
                ${escapeHtml(tr('viewer3d.models.isolate', 'Izolovat model'))}
              </button>
              <button class="v3d-model-menu__item" data-act="table">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="4" x2="8" y2="20"/><line x1="14" y1="4" x2="14" y2="20"/></svg>
                ${escapeHtml(tr('viewer3d.models.openTable', 'Otevřít v tabulce'))}
              </button>
              <button class="v3d-model-menu__item" data-act="info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                ${escapeHtml(infoOpen ? tr('viewer3d.models.hideInfo', 'Skrýt informace') : tr('viewer3d.models.info', 'Informace'))}
              </button>
            </div>` : ''}
          </div>
          ${infoHtml}
        </div>`;
        }).join('');

        this.host.innerHTML = models.length === 0
            ? `<p class="v3d-panel__hint">${escapeHtml(tr('viewer3d.models.empty', 'Žádný načtený model. Soubory najdeš v záložce Storage.'))}</p>`
            : `<div class="v3d-model-list">${cards}</div>`;
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
                if (this.ctx.removeModel) {
                    this.ctx.removeModel(modelId);
                }
                this._render();
            });
            card.querySelector('[data-act="menu"]').addEventListener('click', () => {
                this.openMenuId = this.openMenuId === modelId ? null : modelId;
                this._render();
            });
            const menuAct = (act, fn) => {
                const el = card.querySelector(`.v3d-model-menu [data-act="${act}"]`);
                if (el) {
                    el.addEventListener('click', fn);
                }
            };
            menuAct('zoom', () => {
                const eng = this._engine();
                if (eng && typeof eng.fitModel === 'function') {
                    eng.fitModel(modelId);
                }
                this.openMenuId = null;
                this._render();
            });
            menuAct('isolate', () => {
                const eng = this._engine();
                const all = (this.ctx.getLoadedModels && this.ctx.getLoadedModels()) || [];
                if (eng && typeof eng.setModelVisible === 'function') {
                    for (const m of all) {
                        eng.setModelVisible(m.modelId, m.modelId === modelId);
                    }
                }
                if (eng && typeof eng.fitModel === 'function') {
                    eng.fitModel(modelId);
                }
                this.openMenuId = null;
                this._render();
            });
            menuAct('table', () => {
                if (this.ctx.openTableForModel) {
                    this.ctx.openTableForModel(modelId);
                }
            });
            menuAct('info', () => {
                this.infoId = this.infoId === modelId ? null : modelId;
                this.openMenuId = null;
                this._render();
            });
        });
    }

    destroy() {
        document.removeEventListener('mousedown', this._onDocDown);
    }
}
