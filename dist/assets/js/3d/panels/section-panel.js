// Section panel — interactive cut planes:
//  • by face   — click a surface, plane lies in that face
//  • ⊥ edge    — snap to an edge, plane perpendicular to it (3D tangent)
//  • vertical  — snap to an edge, vertical plane ⊥ to the edge's plan direction
// Plus per-plane offset slider, flip, visibility, DXF export.

import { buildDxf } from './dxf-export.js';

const MODES = {
  face: { icon: '▱', label: 'Plochou', hint: 'Klikněte na plochu — řez se položí přesně do ní.' },
  edge: { icon: '⊥', label: 'Kolmo k hraně', hint: 'Najeďte na hranu a klikněte — řez bude kolmý na hranu.' },
  vertical: { icon: '⊟', label: 'Svislý k hraně', hint: 'Najeďte na hranu a klikněte — svislý řez kolmý na půdorysný směr hrany.' },
};

export default class SectionPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Řez modelem';
    this._msg = null;
    this._mode = null;       // active pick mode id | null
    this._pickCleanup = null;
  }

  mount() {
    this._render();
    this._wireDrag();
  }

  /**
   * Drag a section plane in the 3D scene: pointerdown on a plane's visual
   * grabs it, drag slides it along its normal, orbit is suspended meanwhile.
   * Active for the whole life of the panel; gated strictly on hitting a
   * section-plane quad so normal selection/orbit are untouched otherwise.
   */
  _wireDrag() {
    const canvas = this._canvas();
    if (!canvas) return;
    let dragId = null;
    let pointerId = null;
    let hoverRaf = 0;
    // Souřadnice se předávají engine jako CLIENT (viewport) — přepočet rectu
    // si dělá pickSectionPlaneAt / dragSectionPlaneTo sám (kontrakt Task 10).

    const onDown = (e) => {
      if (e.button !== 0 || this._mode) return;   // ne během pokládání nové roviny
      const hit = this.engine.pickSectionPlaneAt?.(e.clientX, e.clientY);
      if (!hit) return;
      dragId = hit.id;
      pointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* capture nemusí být podporováno */ }
      this.engine.beginSectionPlaneDrag?.(dragId, e.clientX, e.clientY);
      this.engine.setOrbitEnabled?.(false);
      canvas.style.cursor = 'grabbing';
      e.preventDefault(); e.stopPropagation();
    };

    const onMove = (e) => {
      if (dragId === null) {
        if (this._mode) return;                   // v režimu pokládání hover neřešíme
        if (hoverRaf) return;                     // throttle na jeden pick za snímek
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = 0;
          if (dragId !== null || this._mode) return;
          const hit = this.engine.pickSectionPlaneAt?.(e.clientX, e.clientY);
          canvas.style.cursor = hit ? 'grab' : '';
          this.engine.setSectionHandleHover?.(hit?.id ?? null);
        });
        return;
      }
      const off = this.engine.dragSectionPlaneTo?.(dragId, e.clientX, e.clientY);
      if (Number.isFinite(off)) {
        const sub = this.host.querySelector(`.v3d-panel__item[data-plane="${dragId}"] .v3d-panel__item-sub`);
        if (sub) sub.textContent = `offset ${off.toFixed(2)} m`;
        this._showDragTip(canvas, e.clientX, e.clientY, off);
      }
      e.preventDefault(); e.stopPropagation();
    };

    const endDrag = (e) => {
      if (dragId === null) return;
      dragId = null;
      if (pointerId !== null) {
        try {
          if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
        } catch { /* už uvolněno */ }
        pointerId = null;
      }
      this.engine.endSectionPlaneDrag?.();
      this.engine.setOrbitEnabled?.(true);
      canvas.style.cursor = this._mode ? 'crosshair' : '';
      this._hideDragTip();
    };

    canvas.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    this._dragCleanup = () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', endDrag, true);
      window.removeEventListener('pointercancel', endDrag, true);
      if (hoverRaf) { cancelAnimationFrame(hoverRaf); hoverRaf = 0; }
      this.engine.endSectionPlaneDrag?.();
      this.engine.setSectionHandleHover?.(null);
      this.engine.setOrbitEnabled?.(true);
      this._hideDragTip();
    };
  }

  /** Overlay popisek offsetu u kurzoru během tažení (iTwin.js pattern). */
  _showDragTip(canvas, clientX, clientY, offset) {
    const parent = canvas.parentElement;
    if (!parent) return;
    if (!this._dragTip) {
      this._dragTip = document.createElement('div');
      this._dragTip.className = 'v3d-drag-tip';
      parent.appendChild(this._dragTip);
    }
    const sign = offset >= 0 ? '+' : '';
    this._dragTip.textContent = `${sign}${offset.toFixed(2).replace('.', ',')} m`;
    const r = parent.getBoundingClientRect();
    this._dragTip.style.left = `${clientX - r.left + 14}px`;
    this._dragTip.style.top = `${clientY - r.top - 10}px`;
  }

  /** Skrýt (odstranit) overlay popisek offsetu. */
  _hideDragTip() {
    if (this._dragTip) { this._dragTip.remove(); this._dragTip = null; }
  }

  _render() {
    const planes = this.engine.getSectionPlanes?.() || [];
    const msg = this._msg;
    this._msg = null;

    const modeBtns = Object.entries(MODES).map(([id, m]) => `
      <button class="v3d-panel__btn v3d-panel__btn--sm ${this._mode === id ? 'v3d-panel__btn--primary' : ''}"
              data-mode="${id}" title="${m.hint}">${m.icon} ${m.label}</button>`).join('');

    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Nová rovina řezu</h4>
        <div class="v3d-panel__pills">${modeBtns}</div>
        <p class="v3d-panel__hint" data-role="hint">${this._mode ? MODES[this._mode].hint : 'Vyberte způsob zadání roviny.'}</p>
      </div>
      <div data-role="status">${msg ? `<div class="v3d-panel__msg v3d-panel__msg--${msg.type}">${escapeHtml(msg.text)}</div>` : ''}</div>
      <hr class="v3d-panel__divider" />
      <div class="v3d-panel__section">
        <h4>Roviny <span class="v3d-panel__badge">${planes.length}</span></h4>
        ${planes.length === 0 ? `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">✂️</div>
            <p>Žádné roviny řezu.<br>Vyberte způsob zadání a klikněte do modelu.</p>
          </div>
        ` : `
          ${planes.map((p) => {
            const visible = p.visible !== false;
            return `
              <div class="v3d-panel__item" data-plane="${p.id}">
                <div class="v3d-panel__item-main">
                  <div class="v3d-panel__item-title">${escapeHtml(p.name || '#' + p.id)}</div>
                  <div class="v3d-panel__item-sub">offset ${(p.offset ?? 0).toFixed(2)} m${visible ? '' : ' · skrytá'}</div>
                </div>
                <button class="v3d-panel__item-btn" data-act="flip" data-id="${p.id}" title="Otočit směr řezu">↔</button>
                <button class="v3d-panel__item-btn" data-act="vis" data-id="${p.id}" title="${visible ? 'Skrýt rovinu' : 'Zobrazit rovinu'}">${visible ? '●' : '◌'}</button>
                <button class="v3d-panel__item-btn" data-act="dxf" data-id="${p.id}" title="Exportovat křivky řezu do DXF">⇣</button>
                <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-id="${p.id}" title="Odebrat rovinu">✕</button>
              </div>`;
          }).join('')}
          <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">✕ Odebrat všechny</button>
          <p class="v3d-panel__hint">Táhni za rukojeť ✂ uprostřed roviny pro posun řezu. ⇣ stáhne křivky řezu jako DXF.</p>
        `}
      </div>
    `;

    this.host.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this._toggleMode(b.dataset.mode)));
    this.host.querySelector('[data-act="clear"]')?.addEventListener('click', () => { this.engine.clearSectionPlanes?.(); this._render(); });
    this.host.querySelectorAll('[data-act="flip"]').forEach((b) => b.addEventListener('click', () => { this.engine.updateSectionPlane?.(b.dataset.id, { flip: true }); this._render(); }));
    this.host.querySelectorAll('[data-act="vis"]').forEach((b) => b.addEventListener('click', () => {
      const p = (this.engine.getSectionPlanes() || []).find((x) => x.id === b.dataset.id);
      this.engine.updateSectionPlane?.(b.dataset.id, { visible: !(p?.visible !== false) });
      this._render();
    }));
    this.host.querySelectorAll('[data-act="rm"]').forEach((b) => b.addEventListener('click', () => { this.engine.removeSectionPlane?.(b.dataset.id); this._render(); }));
    this.host.querySelectorAll('[data-act="dxf"]').forEach((b) => b.addEventListener('click', () => this._exportDxf(b.dataset.id)));
  }

  _toggleMode(mode) {
    if (this._mode === mode) { this._stopPick(); this._mode = null; this._render(); return; }
    this._mode = mode;
    this._render();
    this._startPick();
  }

  _canvas() { return document.querySelector('#viewerContainer canvas'); }

  _startPick() {
    this._stopPick();
    const canvas = this._canvas();
    if (!canvas) { this._setStatus('Plátno vieweru nenalezeno — načtěte model.', 'warn'); return; }

    const xy = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    const onMove = (e) => {
      const [x, y] = xy(e);
      if (this._mode === 'face') {
        this.engine.showSectionGhostFromClient?.(x, y);
      } else {
        const edge = this.engine.pickEdgeAt?.(x, y);
        if (edge) this.engine.showMeasureSnapPreview?.(edge.point, 'edge');
        else this.engine.hideMeasureSnapPreview?.();
      }
    };

    const onClick = (e) => {
      const [x, y] = xy(e);
      if (this._mode === 'face') {
        const f = this.engine.pickFace?.(x, y);
        if (!f || !f.normal) { this._setStatus('Mimo plochu — klikněte na povrch prvku.', 'warn'); this._render(); return; }
        this.engine.addSectionPlane(f.point, f.normal);
        this._finish('Řez položen do plochy.');
      } else {
        const edge = this.engine.pickEdgeAt?.(x, y);
        if (!edge) { this._setStatus('Mimo hranu — najeďte přesně na hranu prvku.', 'warn'); this._render(); return; }
        let normal = edge.tangent;
        if (this._mode === 'vertical') {
          const [tx, , tz] = edge.tangent;
          const len = Math.hypot(tx, tz);
          if (len < 1e-6) { this._setStatus('Hrana je svislá — svislý řez na ni nelze sestrojit.', 'warn'); this._render(); return; }
          normal = [tx / len, 0, tz / len];   // horizontal → vertical cutting plane
        }
        this.engine.addSectionPlane(edge.point, normal);
        this._finish(this._mode === 'vertical' ? 'Svislý řez kolmý na hranu vytvořen.' : 'Řez kolmý na hranu vytvořen.');
      }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.style.cursor = 'crosshair';
    this._pickCleanup = () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      canvas.style.cursor = '';
      this.engine.hideSectionGhost?.();
      this.engine.hideMeasureSnapPreview?.();
    };
  }

  _stopPick() {
    if (this._pickCleanup) { this._pickCleanup(); this._pickCleanup = null; }
  }

  _finish(text) {
    this._stopPick();
    this._mode = null;
    this._msg = { text, type: 'ok' };
    this._render();
  }

  _setStatus(text, type) {
    const el = this.host.querySelector('[data-role="status"]');
    if (!el) return;
    el.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${type}">${escapeHtml(text)}</div>` : '';
  }

  async _exportDxf(planeId) {
    if (typeof this.engine.computeSectionCurves !== 'function') {
      this._setStatus('Výpočet křivek řezu není v tomto prostředí dostupný.', 'warn');
      return;
    }
    try {
      const curves = this.engine.computeSectionCurves(planeId);
      if (!curves || curves.length === 0) {
        this._setStatus('Žádné křivky — rovina nejspíš neprotíná geometrii.', 'warn');
        return;
      }
      const plane = (this.engine.getSectionPlanes() || []).find((p) => p.id === planeId);
      // Enrich each curve with its CAD layer ("hladina") and the model's
      // elevation offset (scene-local Y → authored IFC Z).
      for (const c of curves) {
        c._layer = this.engine.getElementLayer?.(c.modelId, c.expressId) || null;
        c._dz = this.engine.getElevationOffset?.(c.modelId) || 0;
      }
      const dxf = await buildDxf(curves, plane);
      const blob = new Blob([dxf], { type: 'application/dxf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `section-${planeId}.dxf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this._setStatus(`DXF staženo (${curves.length} ${plural(curves.length, 'křivka', 'křivky', 'křivek')}).`, 'ok');
    } catch (e) {
      console.error(e);
      this._setStatus(`Export DXF selhal: ${e.message}`, 'err');
    }
  }

  destroy() { this._stopPick(); if (this._dragCleanup) this._dragCleanup(); }
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
