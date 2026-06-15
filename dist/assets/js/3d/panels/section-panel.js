// Section panel — interactive cut planes:
//  • by face   — click a surface, plane lies in that face
//  • ⊥ edge    — snap to an edge, plane perpendicular to it (3D tangent)
//  • vertical  — snap to an edge, vertical plane ⊥ to the edge's plan direction
// Plus per-plane offset slider, flip, visibility, DXF export.

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
    const xy = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    const onDown = (e) => {
      if (e.button !== 0 || this._mode) return;   // not while placing a new plane
      const [x, y] = xy(e);
      const hit = this.engine.pickSectionPlaneAt?.(x, y);
      if (!hit) return;
      dragId = hit.id;
      this.engine.setOrbitEnabled?.(false);
      canvas.style.cursor = 'ns-resize';
      e.preventDefault(); e.stopPropagation();
    };
    const onMove = (e) => {
      if (dragId === null) return;
      const [x, y] = xy(e);
      const off = this.engine.dragSectionPlaneTo?.(dragId, x, y);
      const slider = this.host.querySelector(`[data-off="${dragId}"]`);
      if (slider && Number.isFinite(off)) {
        slider.value = String(off);
        const sub = slider.closest('.v3d-panel__item')?.querySelector('.v3d-panel__item-sub');
        if (sub) sub.textContent = `offset ${off.toFixed(2)} m`;
      }
      e.preventDefault(); e.stopPropagation();
    };
    const onUp = () => {
      if (dragId === null) return;
      dragId = null;
      this.engine.setOrbitEnabled?.(true);
      canvas.style.cursor = this._mode ? 'crosshair' : '';
    };

    canvas.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    this._dragCleanup = () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      this.engine.setOrbitEnabled?.(true);
    };
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
              <div class="v3d-panel__item" style="flex-wrap:wrap">
                <div class="v3d-panel__item-main">
                  <div class="v3d-panel__item-title">${escapeHtml(p.name || '#' + p.id)}</div>
                  <div class="v3d-panel__item-sub">offset ${(p.offset ?? 0).toFixed(2)} m${visible ? '' : ' · skrytá'}</div>
                </div>
                <button class="v3d-panel__item-btn" data-act="flip" data-id="${p.id}" title="Otočit směr řezu">↔</button>
                <button class="v3d-panel__item-btn" data-act="vis" data-id="${p.id}" title="${visible ? 'Skrýt rovinu' : 'Zobrazit rovinu'}">${visible ? '●' : '◌'}</button>
                <button class="v3d-panel__item-btn" data-act="dxf" data-id="${p.id}" title="Exportovat křivky řezu do DXF">⇣</button>
                <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-id="${p.id}" title="Odebrat rovinu">✕</button>
                <input class="v3d-section-offset" type="range" min="-60" max="60" step="0.01" value="${p.offset ?? 0}" data-off="${p.id}"
                       title="Posun roviny podél normály" style="flex:1 1 100%;margin-top:6px;accent-color:var(--primary-color)">
              </div>`;
          }).join('')}
          <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">✕ Odebrat všechny</button>
          <p class="v3d-panel__hint">Posuvník posouvá rovinu podél normály. ⇣ stáhne křivky řezu jako DXF.</p>
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
    // Offset sliders — live update without a full re-render (keeps the thumb grabbed)
    this.host.querySelectorAll('[data-off]').forEach((s) => s.addEventListener('input', () => {
      this.engine.updateSectionPlane?.(s.dataset.off, { offset: parseFloat(s.value) });
      const sub = s.closest('.v3d-panel__item')?.querySelector('.v3d-panel__item-sub');
      if (sub) sub.textContent = `offset ${parseFloat(s.value).toFixed(2)} m`;
    }));
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
      const dxf = curvesToDxf(curves, plane);
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

/**
 * Build a 2D DXF (mm-agnostic model units) from 3D section curves.
 *
 * Coordinates: the cut is flattened into the drawing XY plane.
 *  • vertical-ish cut → elevation view: DXF X = signed horizontal distance
 *    within the cut plane (centred near 0), DXF Y = the point's height (the
 *    real Z of the cut) so the drawing reads upright with elevations on Y.
 *  • horizontal cut → plan view: DXF X/Y = the two ground axes, relative to
 *    the plane origin.
 * Layers (DXF code 8) = IFC type, so types stay on separate layers; a LAYER
 * table is emitted so CAD apps show them with distinct colours.
 */
function curvesToDxf(curves, plane) {
  const project = makeProjector(plane);

  // Layer name = "hladina (IFCTYPE)"; colour from the cut element's own
  // display colour (true RGB). Build the LAYER table first.
  const layerName = (c) => {
    const type = String(c.ifcType || 'IFC');
    return sanitizeLayer(c._layer ? `${c._layer} (${type})` : type);
  };
  const layers = new Map(); // name → rgb
  for (const c of curves) {
    const name = layerName(c);
    if (!layers.has(name)) layers.set(name, c.color ?? 0x808080);
  }

  const head = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.size)];
  for (const [name, rgb] of layers) {
    head.push('0', 'LAYER', '2', name, '70', '0', '62', String(rgbToAci(rgb)), '420', String(rgb & 0xffffff), '6', 'CONTINUOUS');
  }
  head.push('0', 'ENDTAB', '0', 'ENDSEC');

  const ents = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const c of curves) {
    const layer = layerName(c);
    const rgb = (c.color ?? 0x808080) & 0xffffff;
    const dz = c._dz || 0;
    for (const loop of (c.loops || [])) {
      const pts = loop.points || [];
      if (pts.length < 2) continue;
      // Per-entity true colour (420) so lines carry the cut element's colour.
      ents.push('0', 'POLYLINE', '8', layer, '62', String(rgbToAci(rgb)), '420', String(rgb), '66', '1', '70', loop.closed ? '1' : '0', '10', '0', '20', '0', '30', '0');
      for (const p of pts) {
        const raw = Array.isArray(p) ? p : [p.x, p.y, p.z];
        const [X, Y] = project(raw, dz);
        ents.push('0', 'VERTEX', '8', layer, '10', fmtNum(X), '20', fmtNum(Y), '30', '0');
      }
      ents.push('0', 'SEQEND');
    }
  }
  ents.push('0', 'ENDSEC', '0', 'EOF');
  return head.concat(ents).join('\n');
}

/** Crude 24-bit RGB → nearest AutoCAD Color Index (fallback for old CAD). */
function rgbToAci(rgb) {
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
  if (r > 200 && g > 200 && b > 200) return 7;   // white/light → 7
  if (r > 180 && g < 80 && b < 80) return 1;       // red
  if (r < 80 && g > 180 && b < 80) return 3;       // green
  if (r < 80 && g < 80 && b > 180) return 5;       // blue
  if (r > 180 && g > 180 && b < 80) return 2;       // yellow
  if (r > 180 && g < 80 && b > 180) return 6;       // magenta
  if (r < 80 && g > 180 && b > 180) return 4;       // cyan
  return 8;                                          // grey
}

/**
 * Returns p(3D)→[X,Y] projecting section curves into the drawing plane.
 * Falls back to a passthrough (X=x, Y=z) when no plane is supplied.
 */
function makeProjector(plane) {
  if (!plane || !plane.normal || !plane.point) {
    return (p, dz = 0) => [p[0], p[2] + 0 * dz];
  }
  const n = plane.normal;
  const off = plane.offset || 0;
  // On-plane origin (point shifted by offset along the normal)
  const O = [plane.point[0] + n[0] * off, plane.point[1] + n[1] * off, plane.point[2] + n[2] * off];
  const nUp = Math.abs(n[1]);              // |normal · world-up|, up = three-Y
  if (nUp > 0.99) {
    // Horizontal cut → plan view (X east, Y north), local to origin.
    return (p) => [p[0] - O[0], p[2] - O[2]];
  }
  // Vertical-ish cut → elevation view. In-plane horizontal axis = up × n,
  // normalised in the ground plane: cross((0,1,0), n) = (n.z, 0, -n.x).
  let hx = n[2], hz = -n[0];
  const len = Math.hypot(hx, hz) || 1;
  hx /= len; hz /= len;
  return (p, dz = 0) => {
    const X = (p[0] - O[0]) * hx + (p[2] - O[2]) * hz;  // horizontal in-plane
    const Y = p[1] + dz;                                 // authored IFC Z (= scene-local Y + elevation offset)
    return [X, Y];
  };
}

function fmtNum(v) { return (Math.round(v * 1e5) / 1e5).toString(); }
// Keep spaces, parentheses and unicode (modern DXF R2000+ allows them);
// only strip the few characters AutoCAD forbids in layer names.
function sanitizeLayer(s) { return (String(s).replace(/[<>/\\":;?*|,=]/g, '_').trim() || 'IFC').slice(0, 200); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
