// Measure tool — distance/edge/angle/area, snap-bar, live snap tooltip.
// Měření je aktivní hned po mountu (žádný Start/Stop). Stav měření drží engine
// (registr měření); panel jen řídí interakci a vykresluje seznam z getMeasurements().

const MODES = [
  { id: 'distance', label: '📏 Vzdálenost', need: 2 },
  { id: 'edge', label: '⟍ Hrana', need: 1 },
  { id: 'angle', label: '∠ Úhel', need: 3 },
  { id: 'area', label: '▱ Plocha', need: 3 },
  { id: 'point', label: '📍 Bod', need: 1 },
];
const MODE_CZ = { distance: 'Vzdálenost', edge: 'Hrana', angle: 'Úhel', area: 'Plocha', point: 'Bod' };
const SNAPS = [
  { id: 'vertex', label: 'Vrchol' },
  { id: 'midpoint', label: 'Střed hrany' },
  { id: 'center', label: 'Těžiště' },
  { id: 'edge', label: 'Hrana' },
  { id: 'perpendicular', label: '⟂ Kolmice' },
  { id: 'intersection', label: '× Průsečík' },
];
const SNAP_CZ = {
  vertex: 'Vrchol', midpoint: 'Střed hrany', center: 'Těžiště', edge: 'Hrana',
  perpendicular: 'Kolmice', intersection: 'Průsečík', surface: 'Povrch',
};

export default class MeasurePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Měření';
    this._mode = 'distance';
    this._snaps = new Set(['vertex', 'midpoint', 'edge']);
    this._points = [];        // rozpracované body [[x,y,z], ...]
    this._canvas = null;
    this._snapTip = null;     // overlay tooltip element
    this._listeners = [];     // [{ target, type, fn, opts }] pro úklid
    this._boundKeydown = null;
  }

  mount() {
    this._renderPanel();
    this._attachInteraction();
  }

  destroy() {
    this._resetInProgress();
    this._detachInteraction();
    this._hideSnapTip();
    const v = this.engine.getMeasureVisuals?.();
    v?.hideRubberBand?.();
    v?.hideEdgeHighlight?.();
    v?.hideSnapPreview?.();
    v?.clearInProgressPoints?.();
  }

  // ── Panel (seznam + pilulky) ────────────────────────────────────────────
  _renderPanel() {
    const items = this.engine.getMeasurements?.() || [];
    const anyVisible = items.some(m => m.visible);
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Režim měření</h4>
        <div class="v3d-panel__pills" data-role="modes">
          ${MODES.map(m => `<button class="v3d-pill ${this._mode === m.id ? 'active' : ''}" data-mode="${m.id}">${m.label}</button>`).join('')}
        </div>
      </div>
      <div class="v3d-panel__section">
        <h4>Přichytávání</h4>
        <div class="v3d-panel__pills" data-role="snap">
          ${SNAPS.map(s => `<button class="v3d-pill ${this._snaps.has(s.id) ? 'active' : ''}" data-snap="${s.id}">${s.label}</button>`).join('')}
        </div>
        <p class="v3d-panel__hint">${escapeHtml(this._modeHint())}</p>
      </div>
      <div data-role="status"></div>
      <hr class="v3d-panel__divider" />
      <div class="v3d-panel__section">
        <h4>Měření <span class="v3d-panel__badge">${items.length}</span></h4>
        ${items.length > 0 ? `
          <div class="v3d-panel__field">
            <div class="v3d-panel__row">
              <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="${anyVisible ? 'hide-all' : 'show-all'}">${anyVisible ? '🙈 Skrýt vše' : '👁 Zobrazit vše'}</button>
              <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="export-csv">⇣ CSV</button>
              <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="export-json">⇣ JSON</button>
              <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">✕ Smazat vše</button>
            </div>
          </div>
          ${items.slice().reverse().map(m => `
            <div class="v3d-panel__item" data-id="${escapeHtml(m.id)}">
              <div class="v3d-panel__item-main">
                <div class="v3d-panel__item-title">${escapeHtml(m.type === 'point' ? fmtCoords(m.coords || m.points[0]) : fmt(m.value, m.unit))}</div>
                <div class="v3d-panel__item-sub">${escapeHtml(m.label || MODE_CZ[m.type] || m.type)}${m.visible ? '' : ' · skryto'}</div>
              </div>
              <button class="v3d-panel__item-btn" data-act="vis" data-id="${escapeHtml(m.id)}" title="${m.visible ? 'Skrýt' : 'Zobrazit'}">${m.visible ? '👁' : '◌'}</button>
              <button class="v3d-panel__item-btn" data-act="rename" data-id="${escapeHtml(m.id)}" title="Přejmenovat">✎</button>
              <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-id="${escapeHtml(m.id)}" title="Smazat">✕</button>
            </div>`).join('')}
        ` : `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">📏</div>
            <p>Zatím žádná měření.<br>Zvolte režim a klikejte do modelu.</p>
          </div>
        `}
      </div>
    `;
    this.host.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => this._setMode(b.dataset.mode)));
    this.host.querySelectorAll('[data-snap]').forEach(b => b.addEventListener('click', () => this._toggleSnap(b)));
    this.host.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this._listAction(b.dataset.act, b.dataset.id)));
  }

  _modeHint() {
    return {
      distance: 'Klikněte 2 body v modelu.',
      edge: 'Najeďte na hranu a klikněte — změří se rovnou.',
      angle: 'Klikněte 3 body — vrchol úhlu jako druhý.',
      area: 'Klikejte body obrysu (min. 3), dokončete dvojklikem nebo Enter.',
      point: 'Klikněte na plochu — bod se souřadnicemi se přidá rovnou.',
    }[this._mode] || 'Aktivní přichytávání se použijí při klikání do modelu.';
  }

  _setStatus(text, type = 'ok') {
    const el = this.host.querySelector('[data-role="status"]');
    if (!el) return;
    el.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${type}">${escapeHtml(text)}</div>` : '';
  }

  _setMode(mode) {
    if (!mode || mode === this._mode) return;
    this._mode = mode;
    this._resetInProgress();
    this._renderPanel();
  }

  _toggleSnap(btn) {
    const id = btn.dataset.snap;
    if (this._snaps.has(id)) this._snaps.delete(id); else this._snaps.add(id);
    btn.classList.toggle('active');
  }

  _listAction(act, id) {
    if (act === 'vis') {
      const m = (this.engine.getMeasurements?.() || []).find(x => x.id === id);
      if (m) this.engine.setMeasurementVisible?.(id, !m.visible);
      this._renderPanel();
    } else if (act === 'rename') {
      const m = (this.engine.getMeasurements?.() || []).find(x => x.id === id);
      const n = prompt('Název měření:', m?.label || '');
      if (n !== null) { this.engine.updateMeasurement?.(id, { label: n }); this._renderPanel(); }
    } else if (act === 'rm') {
      this.engine.removeMeasurement?.(id); this._renderPanel();
    } else if (act === 'hide-all') {
      for (const m of this.engine.getMeasurements?.() || []) this.engine.setMeasurementVisible?.(m.id, false);
      this._renderPanel();
    } else if (act === 'show-all') {
      for (const m of this.engine.getMeasurements?.() || []) this.engine.setMeasurementVisible?.(m.id, true);
      this._renderPanel();
    } else if (act === 'clear') {
      if (confirm('Smazat všechna měření?')) { this.engine.clearMeasurements?.(); this._renderPanel(); }
    } else if (act === 'export-csv') {
      exportCsv(this.engine.getMeasurements?.() || []);
    } else if (act === 'export-json') {
      exportJson(this.engine.getMeasurements?.() || []);
    }
  }

  // ── Interakce (canvas + klávesy) ────────────────────────────────────────
  _attachInteraction() {
    const canvas = document.querySelector('#viewerContainer canvas');
    if (!canvas) { this._setStatus('Plátno vieweru nenalezeno — načtěte nejprve model.', 'warn'); return; }
    this._canvas = canvas;

    this._on(canvas, 'mousemove', (e) => this._onMove(e));
    this._on(canvas, 'click', (e) => this._onClick(e));
    this._on(canvas, 'dblclick', () => this._onDbl());
    this._on(canvas, 'contextmenu', (e) => this._onContextMenu(e));
    this._on(canvas, 'mouseleave', () => this._onLeave());
    this._on(document, 'keydown', (e) => this._onKeydown(e));
    canvas.style.cursor = 'crosshair';
  }

  _detachInteraction() {
    for (const { target, type, fn, opts } of this._listeners) target.removeEventListener(type, fn, opts);
    this._listeners = [];
    if (this._canvas) { this._canvas.style.cursor = ''; this._canvas = null; }
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push({ target, type, fn, opts });
  }

  _visuals() { return this.engine.getMeasureVisuals?.() || null; }

  _modelId() { return this.engine.getModels?.()[0]?.modelId ?? null; }

  _onMove(e) {
    const v = this._visuals();
    if (this._mode === 'edge') {
      const edge = this.engine.pickEdgeAt?.(e.clientX, e.clientY);
      if (edge?.a && edge?.b) {
        v?.showEdgeHighlight?.(edge.a, edge.b);
        v?.hideSnapPreview?.();
        const len = this.engine.measureDistance?.(edge.a, edge.b);
        this._showSnapTip(e, 'Hrana', Number.isFinite(len) ? fmt(len, 'm') : null);
      } else {
        v?.hideEdgeHighlight?.();
        this._hideSnapTip();
      }
      return;
    }
    const snap = this.engine.snapAt?.(e.clientX, e.clientY, {
      enabled: this._snaps, thresholdPx: 12, lastPoint: this._points[this._points.length - 1],
    });
    if (this._mode === 'point') {
      const raw = snap?.point || this.engine.raycastPoint?.(e.clientX, e.clientY);
      if (snap?.point) v?.showSnapPreview?.(snap.point, snap.type);
      else v?.hideSnapPreview?.();
      v?.hideRubberBand?.();
      if (raw) {
        const p = Array.isArray(raw) ? raw : [raw.x, raw.y, raw.z];
        this._showSnapTip(e, SNAP_CZ[snap?.type] || SNAP_CZ.surface, this._coordsTip(p));
      } else {
        this._hideSnapTip();
      }
      return;
    }
    const last = this._points[this._points.length - 1];
    if (snap?.point) {
      v?.showSnapPreview?.(snap.point, snap.type);
      if (last) v?.showRubberBand?.(last, snap.point);
      this._showSnapTip(e, SNAP_CZ[snap.type] || SNAP_CZ.surface, last ? this._rubberValue(last, snap.point) : null);
    } else {
      v?.hideSnapPreview?.();
      const pt = this.engine.raycastPoint?.(e.clientX, e.clientY);
      if (pt && last) { v?.showRubberBand?.(last, pt); this._showSnapTip(e, SNAP_CZ.surface, this._rubberValue(last, pt)); }
      else if (pt) { this._showSnapTip(e, SNAP_CZ.surface, null); v?.hideRubberBand?.(); }
      else { this._hideSnapTip(); v?.hideRubberBand?.(); }
    }
  }

  _rubberValue(from, to) {
    const d = this.engine.measureDistance?.(from, to);
    return Number.isFinite(d) ? fmt(d, 'm') : null;
  }

  /** Souřadnice bodu v IFC rámu modelu pro tooltip (fallback world). */
  _coordsTip(worldPoint) {
    const local = this.engine.worldToIfcCoords?.(this._modelId(), worldPoint) || worldPoint;
    return `X ${local[0].toFixed(3)}  Y ${local[1].toFixed(3)}  Z ${local[2].toFixed(3)}`;
  }

  _onClick(e) {
    const v = this._visuals();
    if (this._mode === 'edge') {
      const edge = this.engine.pickEdgeAt?.(e.clientX, e.clientY);
      if (!edge?.a || !edge?.b) { this._setStatus('Mimo hranu — najeďte přesně na hranu prvku.', 'warn'); return; }
      this.engine.addMeasurement?.({ type: 'edge', points: [edge.a, edge.b], modelId: this._modelId() });
      v?.hideEdgeHighlight?.();
      this._hideSnapTip();
      this._renderPanel();
      return;
    }
    const snap = this.engine.snapAt?.(e.clientX, e.clientY, {
      enabled: this._snaps, thresholdPx: 12, lastPoint: this._points[this._points.length - 1],
    });
    const raw = snap?.point || this.engine.raycastPoint?.(e.clientX, e.clientY);
    if (!raw) { this._setStatus('Mimo geometrii — klikněte na model.', 'warn'); return; }
    const p = Array.isArray(raw) ? raw : [raw.x, raw.y, raw.z];
    if (this._mode === 'point') {
      this.engine.addMeasurement?.({ type: 'point', points: [p], modelId: this._modelId() });
      this._renderPanel();
      return;
    }
    this._points.push(p);
    v?.addInProgressPoint?.(p);
    v?.hideRubberBand?.();

    const need = MODES.find(m => m.id === this._mode)?.need || 2;
    if (this._mode === 'distance' && this._points.length === 2) this._finish();
    else if (this._mode === 'angle' && this._points.length === 3) this._finish();
    else this._setStatus(`Bod ${this._points.length}${this._mode === 'area' ? ' (min. 3, dokončete dvojklikem/Enter)' : ` / ${need}`}.`);
  }

  _onDbl() {
    if (this._mode !== 'area') return;
    // Dvojklik vyvolá dva `click` eventy → poslední bod je téměř koincidenční
    // s předchozím. Zahodíme ho, aby nekazil obrys (CSV/JSON body).
    this._dropCoincidentLast();
    if (this._points.length >= 3) this._finish();
  }

  /** Zahodí poslední bod, je-li do 1 mm (< 0.001) od předchozího. */
  _dropCoincidentLast() {
    const n = this._points.length;
    if (n < 2) return;
    const a = this._points[n - 1], b = this._points[n - 2];
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    if (Math.hypot(dx, dy, dz) < 0.001) {
      this._points.pop();
      const v = this._visuals();
      v?.clearInProgressPoints?.();
      for (const p of this._points) v?.addInProgressPoint?.(p);
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    if (this._points.length === 0) return;
    this._points.pop();
    // In-progress markery nemají jednotlivé id — překreslíme zbývající.
    const v = this._visuals();
    v?.clearInProgressPoints?.();
    for (const p of this._points) v?.addInProgressPoint?.(p);
    v?.hideRubberBand?.();
    if (this._points.length === 0) this._setStatus('');
    else this._setStatus(`Bod ${this._points.length}${this._mode === 'area' ? ' (min. 3)' : ''}.`);
  }

  _onLeave() {
    this._hideSnapTip();
    const v = this._visuals();
    v?.hideSnapPreview?.();
    v?.hideEdgeHighlight?.();
    if (this._points.length === 0) v?.hideRubberBand?.();
  }

  _onKeydown(e) {
    if (e.key === 'Escape') {
      if (this._points.length > 0) { this._resetInProgress(); this._setStatus('Měření zrušeno.', 'warn'); }
    } else if (e.key === 'Enter') {
      if (this._mode === 'area' && this._points.length >= 3) { e.preventDefault(); this._finish(); }
    }
  }

  _finish() {
    const type = this._mode; // distance | angle | area
    this.engine.addMeasurement?.({ type, points: this._points.slice(), modelId: this._modelId() });
    this._resetInProgress();
    this._renderPanel();
  }

  _resetInProgress() {
    this._points = [];
    const v = this._visuals();
    v?.clearInProgressPoints?.();
    v?.hideRubberBand?.();
    v?.hideSnapPreview?.();
    v?.hideEdgeHighlight?.();
    this._hideSnapTip();
  }

  // ── Snap tooltip overlay ────────────────────────────────────────────────
  _showSnapTip(e, title, valueLine) {
    if (!this._canvas) return;
    const parent = this._canvas.parentElement;
    if (!parent) return;
    if (!this._snapTip) {
      this._snapTip = document.createElement('div');
      this._snapTip.className = 'v3d-snap-tip';
      parent.appendChild(this._snapTip);
    }
    this._snapTip.textContent = valueLine ? `${title}\n${valueLine}` : title;
    const r = parent.getBoundingClientRect();
    this._snapTip.style.left = `${e.clientX - r.left + 14}px`;
    this._snapTip.style.top = `${e.clientY - r.top - 10}px`;
  }

  _hideSnapTip() {
    if (this._snapTip) { this._snapTip.remove(); this._snapTip = null; }
  }
}

function fmt(v, u) { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(3)} ${u || ''}`.trim() : String(v); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtCoords(c) {
  if (!Array.isArray(c) || c.length < 3) return '—';
  return c.map(v => Number(v).toFixed(3)).join(', ');
}

function exportCsv(items) {
  const safe = (s) => {
    const v = String(s === null || s === undefined ? '' : s);
    return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  };
  const head = 'type,label,value,unit,points,x,y,z\n';
  const body = items.map(m => {
    const c = m.type === 'point' ? (m.coords || m.points[0] || []) : [];
    return [
      safe(m.type), safe(m.label), safe(m.value), safe(m.unit), safe(JSON.stringify(m.points)),
      safe(c[0] ?? ''), safe(c[1] ?? ''), safe(c[2] ?? ''),
    ].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
  }).join('\n');
  const blob = new Blob(['﻿', head, body], { type: 'text/csv;charset=utf-8' });
  download(blob, `measurements-${Date.now()}.csv`);
}

function exportJson(items) {
  const rows = items.map(m => ({
    type: m.type, label: m.label, value: m.value, unit: m.unit, points: m.points,
    ...(m.type === 'point' ? { coords: m.coords || m.points[0] || null } : {}),
  }));
  download(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), `measurements-${Date.now()}.json`);
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
