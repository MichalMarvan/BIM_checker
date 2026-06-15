// Measure tool — distance/angle/area + snap-bar + history.

const HIST_KEY = 'bim_checker_measurements_v1';
const loadHist = () => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } };
const saveHist = (l) => localStorage.setItem(HIST_KEY, JSON.stringify(l));

const KIND_CZ = { distance: 'Vzdálenost', angle: 'Úhel', area: 'Plocha' };
const SNAPS = [
  { id: 'vertex', label: 'Vrchol' },
  { id: 'midpoint', label: 'Střed hrany' },
  { id: 'center', label: 'Těžiště' },
  { id: 'edge', label: 'Hrana' },
  { id: 'perpendicular', label: '⟂ Kolmo' },
  { id: 'intersection', label: '× Průsečík' },
];

export default class MeasurePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Měření';
    this._cleanup = null;
    this._mode = 'distance';
    this._snaps = new Set(['vertex']);
    this._msg = null; // jednorázová zpráva pro příští render
  }

  mount() { this._render(); }

  _render() {
    const hist = loadHist();
    const last = hist[hist.length - 1];
    const msg = this._msg;
    this._msg = null;
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Režim měření</h4>
        <div class="v3d-panel__pills" data-role="modes">
          <button class="v3d-pill ${this._mode === 'distance' ? 'active' : ''}" data-mode="distance">📏 Vzdálenost</button>
          <button class="v3d-pill ${this._mode === 'angle' ? 'active' : ''}" data-mode="angle">∠ Úhel</button>
          <button class="v3d-pill ${this._mode === 'area' ? 'active' : ''}" data-mode="area">▱ Plocha</button>
        </div>
      </div>
      <div class="v3d-panel__section">
        <h4>Přichytávání</h4>
        <div class="v3d-panel__pills" data-role="snap">
          ${SNAPS.map(s => `<button class="v3d-pill ${this._snaps.has(s.id) ? 'active' : ''}" data-snap="${s.id}">${s.label}</button>`).join('')}
        </div>
        <p class="v3d-panel__hint">Aktivní přichytávání se použijí při klikání do modelu.</p>
      </div>
      <div class="v3d-panel__field">
        <div class="v3d-panel__row">
          <button class="v3d-panel__btn v3d-panel__btn--primary" data-role="start">▶ Začít měřit</button>
          <button class="v3d-panel__btn" data-role="stop">⏹ Stop</button>
        </div>
      </div>
      <div data-role="status">${msg ? `<div class="v3d-panel__msg v3d-panel__msg--${msg.type}">${escapeHtml(msg.text)}</div>` : ''}</div>
      ${last ? `
        <div class="v3d-panel__section">
          <h4>Poslední měření</h4>
          <div class="v3d-panel__kv"><span>Typ</span><b>${escapeHtml(KIND_CZ[last.kind] || last.kind)}</b></div>
          <div class="v3d-panel__kv"><span>Hodnota</span><b>${escapeHtml(fmt(last.value, last.unit))}</b></div>
          ${last.label ? `<div class="v3d-panel__kv"><span>Název</span><b>${escapeHtml(last.label)}</b></div>` : ''}
        </div>
      ` : ''}
      <hr class="v3d-panel__divider" />
      <div class="v3d-panel__section">
        <h4>Historie <span class="v3d-panel__badge">${hist.length}</span></h4>
        ${hist.length > 0 ? `
          <div class="v3d-panel__field">
            <div class="v3d-panel__row">
              <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="export-csv">⇣ CSV</button>
              <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="export-json">⇣ JSON</button>
              <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">Smazat vše</button>
            </div>
          </div>
          ${hist.slice(-30).reverse().map((h, idx) => {
            const realIdx = hist.length - 1 - idx;
            return `
              <div class="v3d-panel__item">
                <div class="v3d-panel__item-main">
                  <div class="v3d-panel__item-title">${escapeHtml(fmt(h.value, h.unit))}</div>
                  <div class="v3d-panel__item-sub">${escapeHtml(h.label || KIND_CZ[h.kind] || h.kind)}</div>
                </div>
                <button class="v3d-panel__item-btn" data-act="rename" data-i="${realIdx}" title="Přejmenovat">✎</button>
                <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-i="${realIdx}" title="Smazat">✕</button>
              </div>`;
          }).join('')}
        ` : `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">📏</div>
            <p>Zatím žádná měření.<br>Zvolte režim a klikněte na „Začít měřit“.</p>
          </div>
        `}
      </div>
    `;
    this.host.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      this._mode = b.dataset.mode;
      this.host.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
    }));
    this.host.querySelectorAll('[data-snap]').forEach((b) => b.addEventListener('click', () => {
      b.classList.toggle('active');
      if (b.classList.contains('active')) this._snaps.add(b.dataset.snap);
      else this._snaps.delete(b.dataset.snap);
    }));
    this.host.querySelector('[data-role="start"]').addEventListener('click', () => this._start());
    this.host.querySelector('[data-role="stop"]').addEventListener('click', () => this._stop());
    this.host.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this._histAction(b.dataset.act, parseInt(b.dataset.i, 10))));
  }

  _enabledSnaps() {
    const s = new Set();
    this.host.querySelectorAll('[data-snap].active').forEach(b => s.add(b.dataset.snap));
    return s;
  }

  _setStatus(text, type = 'ok') {
    const el = this.host.querySelector('[data-role="status"]');
    if (!el) return;
    el.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${type}">${escapeHtml(text)}</div>` : '';
  }

  _start() {
    this._stop();
    const canvas = document.querySelector('#viewerContainer canvas');
    if (!canvas) {
      this._setStatus('Plátno vieweru nenalezeno — načtěte nejprve model.', 'warn');
      return;
    }
    const points = [];
    const need = this._mode === 'distance' ? 2 : 3; // area = 3+

    const instructions = {
      distance: 'Klikněte 2 body v modelu.',
      angle: 'Klikněte 3 body — vrchol úhlu jako druhý.',
      area: 'Klikejte body obrysu (min. 3), dokončete dvojklikem.',
    };
    this._setStatus(instructions[this._mode] || `Klikněte ${need}+ bodů.`);

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const enabled = this._enabledSnaps();
      const snap = this.engine.snapAt?.(x, y, { enabled, thresholdPx: 12, lastPoint: points[points.length - 1] });
      if (snap?.point) this.engine.showMeasureSnapPreview?.(snap.point, snap.type);
      else this.engine.hideMeasureSnapPreview?.();
    };

    const onClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const enabled = this._enabledSnaps();
      const snap = this.engine.snapAt?.(x, y, { enabled, thresholdPx: 12, lastPoint: points[points.length - 1] });
      const pt = snap?.point || this.engine.raycastPoint(x, y);
      if (!pt) { this._setStatus('Mimo geometrii — klikněte na model.', 'warn'); return; }
      const p = Array.isArray(pt) ? pt : [pt.x, pt.y, pt.z];
      points.push(p);
      this.engine.getMeasureVisuals?.()?.addInProgressPoint?.(p);

      if (this._mode === 'distance' && points.length === 2) this._finish(points);
      else if (this._mode === 'angle' && points.length === 3) this._finish(points);
      else this._setStatus(`Bod ${points.length}/${need}${this._mode === 'area' ? '+ — dokončete dvojklikem.' : '.'}`);
    };

    const onDbl = () => {
      if (this._mode === 'area' && points.length >= 3) this._finish(points);
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDbl);

    this._cleanup = () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('dblclick', onDbl);
      this.engine.hideMeasureSnapPreview?.();
      this.engine.getMeasureVisuals?.()?.clearInProgressPoints?.();
    };
  }

  _finish(points) {
    let result;
    if (this._mode === 'distance') result = this.engine.measureDistance(points[0], points[1]);
    else if (this._mode === 'angle') result = this.engine.measureAngle(points[0], points[1], points[2]);
    else result = this.engine.measureArea(points);
    const value = result?.value ?? result;
    const unit = result?.unit ?? (this._mode === 'angle' ? '°' : this._mode === 'area' ? 'm²' : 'm');
    const hist = loadHist();
    hist.push({ kind: this._mode, value, unit, points, label: '' });
    saveHist(hist);
    this.engine.getMeasureVisuals?.()?.addMeasurement?.({ kind: this._mode, points, value });
    this._stop();
    this._msg = { type: 'ok', text: `Naměřeno: ${KIND_CZ[this._mode] || this._mode} = ${fmt(value, unit)}` };
    this._render();
  }

  _stop() {
    if (this._cleanup) { this._cleanup(); this._cleanup = null; }
    this._setStatus('');
  }

  _histAction(act, i) {
    const hist = loadHist();
    if (act === 'rm') { hist.splice(i, 1); saveHist(hist); this._render(); }
    else if (act === 'rename') { const n = prompt('Název měření:', hist[i].label || ''); if (n !== null) { hist[i].label = n; saveHist(hist); this._render(); } }
    else if (act === 'clear') { if (confirm('Smazat celou historii měření?')) { saveHist([]); this._render(); } }
    else if (act === 'export-csv') exportCsv(hist);
    else if (act === 'export-json') exportJson(hist);
  }

  destroy() { this._stop(); }
}

function fmt(v, u) { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(3)} ${u || ''}` : String(v); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function exportCsv(hist) {
  const safe = (s) => {
    const v = String(s === null || s === undefined ? '' : s);
    return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  };
  const head = 'kind,label,value,unit,points\n';
  const body = hist.map(h => [safe(h.kind), safe(h.label), safe(h.value), safe(h.unit), safe(JSON.stringify(h.points))].map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿', head, body], { type: 'text/csv;charset=utf-8' });
  download(blob, `measurements-${Date.now()}.csv`);
}
function exportJson(hist) { download(new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' }), `measurements-${Date.now()}.json`); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
