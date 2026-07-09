// Uložené pohledy — kamera + skryté + průhlednost + zvýraznění + režim + řezy
// + viditelnost měření + náhled. Persistence v IndexedDB (store `views`), vazba
// na modely přes content hashe. Řezné roviny se ukládají model-lokálně vůči
// kotevnímu modelu (první načtený), aby přežily posun/rotaci federace.

import { viewPut, viewDelete, viewsAll } from '../ifc-engine/state/viewer-state-store.js';

const LEGACY_KEY = 'bim_checker_viewpoints_v1';
const THUMB_WIDTH = 256;

export default class ViewpointsPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Uložené pohledy';
    this._views = [];
    this._loaded = false;
    this._renderToken = 0;
    this._message = null;
  }

  async mount() {
    this._renderLoading();
    try {
      await this._migrateIfNeeded();
    } catch (e) {
      console.warn('[viewpoints] migrace selhala:', e);
    }
    await this._reload();
  }

  destroy() {}

  // ── Data ────────────────────────────────────────────────────────────────

  /** Přenese legacy localStorage pohledy do IDB, pokud je store prázdný. */
  async _migrateIfNeeded() {
    let raw;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch { raw = null; }
    if (!raw) return;
    const existing = await viewsAll();
    if (existing.length > 0) return;              // IDB už má data — nesahat
    let list;
    try { list = JSON.parse(raw); } catch { list = null; }
    if (Array.isArray(list) && list.length) {
      for (const old of list) {
        const view = {
          schemaVersion: 1,
          id: (old && old.id) || randomId(),
          name: (old && old.name) || 'Pohled',
          createdAt: (old && (old.createdAt || old.created)) || new Date().toISOString(),
          models: [],
          camera: (old && old.camera) || null,
          displayMode: (old && old.displayMode) || 'solid',
          hidden: (old && old.hidden) || [],
          opacity: (old && old.opacity) || [],
          highlights: (old && old.highlights) || [],
          sectionPlanes: [],
          visibleMeasurementIds: [],
          thumbnail: null,
        };
        await viewPut(view);
      }
    }
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  }

  /** Znovu načte pohledy z IDB a překreslí panel. */
  async _reload() {
    const token = ++this._renderToken;
    let views = [];
    try { views = await viewsAll(); } catch (e) { console.warn('[viewpoints] viewsAll selhalo:', e); }
    if (token !== this._renderToken) return;      // mezitím proběhl novější reload
    this._views = views;
    this._loaded = true;
    this._render();
  }

  /** Content hashe aktuálně načtených modelů. */
  _loadedHashes() {
    const set = new Set();
    const models = this.engine.getModels?.() || [];
    for (const m of models) {
      const h = this.engine.getModelContentHash?.(m.modelId);
      if (h) set.add(h);
    }
    return set;
  }

  // ── Uložení ─────────────────────────────────────────────────────────────

  async _save() {
    const input = this.host.querySelector('[data-role="name"]');
    const name = (input && input.value || '').trim();
    if (!name) return;

    const models = this.engine.getModels?.() || [];
    const anchorId = models.length ? models[0].modelId : null;
    const anchorHash = anchorId ? (this.engine.getModelContentHash?.(anchorId) || null) : null;
    const hashes = [...this._loadedHashes()];

    const view = {
      schemaVersion: 1,
      id: randomId(),
      name,
      createdAt: new Date().toISOString(),
      models: hashes,
      camera: this.engine.getCameraState?.() || null,
      displayMode: this.engine.getDisplayMode?.() || 'solid',
      hidden: this.engine.getHiddenEntityIds?.() || [],
      opacity: this.engine.getOpacityEntries?.() || [],
      highlights: this.engine.getHighlightedIds?.() || [],
      sectionPlanes: this._captureSectionPlanes(anchorId, anchorHash),
      visibleMeasurementIds: this._captureVisibleMeasurements(),
      thumbnail: await this._captureThumbnail(),
    };

    try {
      await viewPut(view);
    } catch (e) {
      console.warn('[viewpoints] uložení selhalo:', e);
      this._message = { kind: 'err', text: 'Uložení pohledu selhalo.' };
      this._render();
      return;
    }
    if (input) input.value = '';
    this._message = null;
    await this._reload();
  }

  /** Řezné roviny převedené do model-lokálních souřadnic kotevního modelu. */
  _captureSectionPlanes(anchorId, anchorHash) {
    const planes = this.engine.getSectionPlanes?.() || [];
    if (!planes.length) return [];
    // Bez kotevního modelu (žádný model / bez hashe) uložíme roviny ve světových
    // souřadnicích a anchorHash necháme null — aplikace je pak vezme tak jak jsou.
    const canLocalize = anchorId && anchorHash
      && this.engine.worldToModelLocal && this.engine.worldToModelLocalDir;
    return planes.map((p) => {
      let point = p.point;
      let normal = p.normal;
      if (canLocalize) {
        const lp = this.engine.worldToModelLocal(anchorId, p.point);
        const ln = this.engine.worldToModelLocalDir(anchorId, p.normal);
        if (lp && ln) { point = lp; normal = ln; }
      }
      return {
        name: p.name,
        point,
        normal,
        offset: p.offset,
        visible: p.visible,
        anchorHash: canLocalize ? anchorHash : null,
      };
    });
  }

  /** Id viditelných měření v aktuální scéně. */
  _captureVisibleMeasurements() {
    const items = this.engine.getMeasurements?.() || [];
    return items.filter((m) => m.visible).map((m) => m.id);
  }

  /**
   * Náhled: screenshot vieweru (Blob) → obrázek → zmenšení na šířku 256 px →
   * JPEG dataURL. Jakékoli selhání vrací null (náhled je volitelný).
   * @returns {Promise<string|null>}
   */
  async _captureThumbnail() {
    try {
      const shot = this.engine.takeViewportScreenshot?.();
      const blob = shot && typeof shot.then === 'function' ? await shot : shot;
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadImage(url);
        const w = THUMB_WIDTH;
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w) || 1);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.7);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('[viewpoints] náhled selhal:', e);
      return null;
    }
  }

  // ── Aplikace ────────────────────────────────────────────────────────────

  /**
   * Aplikuje pohled. `cameraOnly` = jen kamera + režim (pro pohledy jiných
   * modelů). Vrací hlášku (nebo null), kterou volající zobrazí.
   * @returns {string|null}
   */
  _applyView(view, cameraOnly) {
    if (!view) return null;
    let msg = null;
    try {
      if (view.camera) this.engine.setCameraState?.(view.camera);
      if (view.displayMode) this.engine.setDisplayMode?.(view.displayMode);
      if (cameraOnly) {
        return 'Pohled patří jinému modelu — aplikována jen kamera a režim.';
      }

      this.engine.showAll?.();
      if (view.hidden?.length) this.engine.hideEntities?.(view.hidden);

      this._applyOpacity(view.opacity);

      this.engine.clearHighlights?.();
      if (view.highlights?.length) {
        const items = view.highlights.map((h) => ({ modelId: h.modelId, expressId: h.expressId, color: h.color }));
        this.engine.highlight?.(items);
      }

      msg = this._applySectionPlanes(view.sectionPlanes);
      this._applyMeasurementVisibility(view.visibleMeasurementIds);
    } catch (e) {
      console.error('[viewpoints] aplikace pohledu selhala:', e);
      return 'Aplikace pohledu selhala.';
    }
    return msg;
  }

  _applyOpacity(opacity) {
    if (!opacity?.length || !this.engine.setEntityOpacity) return;
    const grouped = new Map();
    for (const o of opacity) {
      const k = o.alpha;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push({ modelId: o.modelId, expressId: o.expressId });
    }
    for (const [a, items] of grouped) this.engine.setEntityOpacity(items, a);
  }

  /**
   * Obnoví řezné roviny z dokumentu. Roviny s `anchorHash` jsou model-lokální —
   * převedou se zpět do světa přes kotevní model. Pokud kotevní model není
   * načtený, roviny se přeskočí a vrátí se hláška.
   * @returns {string|null}
   */
  _applySectionPlanes(sectionPlanes) {
    if (!this.engine.clearSectionPlanes) return null;
    this.engine.clearSectionPlanes();
    if (!sectionPlanes?.length) return null;

    // Anchor modely jsou pojmenované hashem — najdeme modelId dle hashe.
    const hashToModel = new Map();
    const models = this.engine.getModels?.() || [];
    for (const m of models) {
      const h = this.engine.getModelContentHash?.(m.modelId);
      if (h) hashToModel.set(h, m.modelId);
    }

    let skippedMissing = false;
    for (const sp of sectionPlanes) {
      let point = sp.point;
      let normal = sp.normal;
      if (sp.anchorHash) {
        const modelId = hashToModel.get(sp.anchorHash);
        if (!modelId) { skippedMissing = true; continue; }
        const wp = this.engine.modelLocalToWorld?.(modelId, sp.point);
        const wn = this.engine.modelLocalToWorldDir?.(modelId, sp.normal);
        if (!wp || !wn) { skippedMissing = true; continue; }
        point = wp; normal = wn;
      }
      const id = this.engine.addSectionPlane?.(point, normal);
      if (id) this.engine.updateSectionPlane?.(id, { offset: sp.offset, visible: sp.visible, name: sp.name });
    }
    return skippedMissing ? 'Řezy přeskočeny — chybí model pohledu.' : null;
  }

  /** Viditelná zůstanou jen měření z `visibleMeasurementIds`, ostatní skryta. */
  _applyMeasurementVisibility(visibleIds) {
    if (!this.engine.setMeasurementVisible) return;
    const wanted = new Set(visibleIds || []);
    const items = this.engine.getMeasurements?.() || [];
    for (const m of items) {
      this.engine.setMeasurementVisible(m.id, wanted.has(m.id));
    }
  }

  // ── Export / Import ──────────────────────────────────────────────────────

  _export() {
    const json = JSON.stringify(this._views, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `viewpoints-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async _import(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const items = JSON.parse(text);
      if (!Array.isArray(items)) throw new Error('očekáváno pole pohledů');
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const view = { ...item };
        if (!view.id) view.id = randomId();
        if (typeof view.schemaVersion !== 'number') view.schemaVersion = 1;
        if (!Array.isArray(view.models)) view.models = [];
        await viewPut(view);
      }
      this._message = { kind: 'ok', text: 'Import dokončen.' };
      await this._reload();
    } catch (e) {
      console.warn('[viewpoints] import selhal:', e);
      this._message = { kind: 'err', text: 'Import selhal: ' + e.message };
      this._render();
    }
  }

  async _delete(id) {
    try { await viewDelete(id); } catch (e) { console.warn('[viewpoints] mazání selhalo:', e); }
    await this._reload();
  }

  // ── Render ──────────────────────────────────────────────────────────────

  _renderLoading() {
    this.host.innerHTML = '<div style="color:var(--text-tertiary);padding:8px 0">Načítám…</div>';
  }

  _render() {
    const loadedHashes = this._loadedHashes();
    const own = [];
    const others = [];
    for (const v of this._views) {
      const models = Array.isArray(v.models) ? v.models : [];
      const isOwn = models.length > 0 && models.every((h) => loadedHashes.has(h));
      (isOwn ? own : others).push(v);
    }

    this.host.innerHTML = `
      <div class="v3d-panel__row">
        <input class="v3d-panel__input" data-role="name" placeholder="Jméno pohledu" />
        <button class="v3d-btn v3d-btn--primary" data-role="save">＋ Uložit</button>
      </div>
      ${this._message ? `<div class="v3d-view-msg v3d-view-msg--${this._message.kind}">${escapeHtml(this._message.text)}</div>` : ''}
      <div class="v3d-panel__section" style="margin-top:10px">
        <h4>Pohledy (${own.length})</h4>
        ${own.length === 0
          ? '<div style="color:var(--text-tertiary);font-size:11.5px">Žádné pohledy pro aktuální modely</div>'
          : `<div class="v3d-view-grid">${own.map((v) => this._cardHtml(v, false)).join('')}</div>`}
      </div>
      ${others.length ? `
      <details class="v3d-panel__section">
        <summary style="cursor:pointer;font-size:12px;font-weight:600">Pohledy jiných modelů (${others.length})</summary>
        <div class="v3d-view-grid" style="margin-top:8px">${others.map((v) => this._cardHtml(v, true)).join('')}</div>
      </details>` : ''}
      <div class="v3d-panel__section">
        <div class="v3d-panel__row">
          <button class="v3d-pill" data-act="export">⇣ Export JSON</button>
          <label class="v3d-pill" style="cursor:pointer">
            ⇡ Import <input type="file" accept=".json" data-act="import" hidden>
          </label>
        </div>
      </div>
    `;

    this.host.querySelector('[data-role="save"]')?.addEventListener('click', () => this._save());
    this.host.querySelector('[data-role="name"]')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._save(); });
    this.host.querySelectorAll('[data-act="apply"]').forEach((b) => b.addEventListener('click', () => this._onApply(b.dataset.id, b.dataset.other === '1')));
    this.host.querySelectorAll('[data-act="delete"]').forEach((b) => b.addEventListener('click', () => this._delete(b.dataset.id)));
    this.host.querySelector('[data-act="export"]')?.addEventListener('click', () => this._export());
    this.host.querySelector('[data-act="import"]')?.addEventListener('change', (e) => this._import(e.target.files[0]));
  }

  _onApply(id, other) {
    const view = this._views.find((v) => v.id === id);
    if (!view) return;
    const msg = this._applyView(view, other);
    this._message = msg ? { kind: 'warn', text: msg } : null;
    this._render();
  }

  _cardHtml(v, other) {
    const thumb = isDataImage(v.thumbnail)
      ? `<img class="v3d-view-card__thumb" src="${escapeHtml(v.thumbnail)}" alt="" />`
      : '<div class="v3d-view-card__thumb v3d-view-card__thumb--empty">bez náhledu</div>';
    return `
      <div class="v3d-view-card" data-id="${escapeHtml(v.id)}">
        ${thumb}
        <div class="v3d-view-card__body">
          <div class="v3d-view-card__title" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</div>
          <div class="v3d-view-card__date">${escapeHtml(formatDate(v.createdAt))}</div>
        </div>
        <div class="v3d-view-card__actions">
          <button class="v3d-pill" data-act="apply" data-id="${escapeHtml(v.id)}" data-other="${other ? '1' : '0'}">Použít</button>
          <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="delete" data-id="${escapeHtml(v.id)}" title="Smazat">✕</button>
        </div>
      </div>
    `;
  }
}

// ── Pomocné funkce ─────────────────────────────────────────────────────────

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'view_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('nelze načíst obrázek náhledu'));
    img.src = url;
  });
}

function isDataImage(s) {
  return typeof s === 'string' && s.startsWith('data:image/');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
