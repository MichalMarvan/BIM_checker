// Measure tool — distance/angle/area + snap-bar + history.

const HIST_KEY = 'bim_checker_measurements_v1';
const loadHist = () => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } };
const saveHist = (l) => localStorage.setItem(HIST_KEY, JSON.stringify(l));

export default class MeasurePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Měření';
    this._cleanup = null;
    this._mode = 'distance';
  }

  mount() { this._render(); }

  _render() {
    const hist = loadHist();
    this.host.innerHTML = `
      <div class="v3d-panel__pills">
        <button class="v3d-pill active" data-mode="distance">📏 Vzdálenost</button>
        <button class="v3d-pill" data-mode="angle">∠ Úhel</button>
        <button class="v3d-pill" data-mode="area">▱ Plocha</button>
      </div>
      <div class="v3d-panel__section" style="margin-top:8px">
        <h4>Snap</h4>
        <div class="v3d-panel__pills" data-role="snap">
          <button class="v3d-pill active" data-snap="vertex">V</button>
          <button class="v3d-pill" data-snap="midpoint">M</button>
          <button class="v3d-pill" data-snap="center">C</button>
          <button class="v3d-pill" data-snap="edge">E</button>
          <button class="v3d-pill" data-snap="perpendicular">⟂</button>
          <button class="v3d-pill" data-snap="intersection">×</button>
        </div>
      </div>
      <div class="v3d-panel__field">
        <button class="v3d-btn v3d-btn--primary" data-role="start">Začít měřit</button>
        <button class="v3d-pill" data-role="stop">Zastavit</button>
      </div>
      <p class="v3d-panel__hint" data-role="status"></p>
      <div class="v3d-panel__section">
        <h4>Historie (${hist.length})</h4>
        <div class="v3d-panel__pills" style="margin-bottom:6px">
          <button class="v3d-pill" data-act="export-csv">⇣ CSV</button>
          <button class="v3d-pill" data-act="export-json">⇣ JSON</button>
          <button class="v3d-pill" data-act="clear">Smazat</button>
        </div>
        <ul class="v3d-panel__list">
          ${hist.slice(-30).reverse().map((h, idx) => {
            const realIdx = hist.length - 1 - idx;
            return `
              <li>
                <span style="flex:1">${escapeHtml(h.label || h.kind)} = <strong>${fmt(h.value, h.unit)}</strong></span>
                <button class="v3d-pill" data-act="rename" data-i="${realIdx}">✎</button>
                <button class="v3d-pill" data-act="rm" data-i="${realIdx}">✕</button>
              </li>`;
          }).join('') || '<li style="color:var(--text-tertiary)">Prázdné</li>'}
        </ul>
      </div>
    `;
    this.host.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      this._mode = b.dataset.mode;
      this.host.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
    }));
    this.host.querySelectorAll('[data-snap]').forEach((b) => b.addEventListener('click', () => {
      b.classList.toggle('active');
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

  _start() {
    this._stop();
    const canvas = document.querySelector('#viewerContainer canvas');
    if (!canvas) return;
    const points = [];
    const need = this._mode === 'distance' ? 2 : this._mode === 'angle' ? 3 : 3; // area = 3+

    const status = this.host.querySelector('[data-role="status"]');
    status.textContent = `Klikněte ${need}+ bodů.`;

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
      if (!pt) { status.textContent = 'Mimo geometrii.'; return; }
      const p = Array.isArray(pt) ? pt : [pt.x, pt.y, pt.z];
      points.push(p);
      this.engine.getMeasureVisuals?.()?.addInProgressPoint?.(p);

      if (this._mode === 'distance' && points.length === 2) this._finish(points);
      else if (this._mode === 'angle' && points.length === 3) this._finish(points);
      else status.textContent = `${points.length}/${need}+ bodů. ${this._mode === 'area' ? 'Dokončete dvojklikem.' : ''}`;
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
    const hist = loadHist();
    hist.push({ kind: this._mode, value: result?.value ?? result, unit: result?.unit ?? (this._mode === 'angle' ? '°' : this._mode === 'area' ? 'm²' : 'm'), points, label: '' });
    saveHist(hist);
    this.engine.getMeasureVisuals?.()?.addMeasurement?.({ kind: this._mode, points, value: result?.value ?? result });
    this._stop();
    this._render();
  }

  _stop() {
    if (this._cleanup) { this._cleanup(); this._cleanup = null; }
    const status = this.host.querySelector('[data-role="status"]');
    if (status) status.textContent = '';
  }

  _histAction(act, i) {
    const hist = loadHist();
    if (act === 'rm') { hist.splice(i, 1); saveHist(hist); this._render(); }
    else if (act === 'rename') { const n = prompt('Název:', hist[i].label || ''); if (n != null) { hist[i].label = n; saveHist(hist); this._render(); } }
    else if (act === 'clear') { if (confirm('Smazat historii?')) { saveHist([]); this._render(); } }
    else if (act === 'export-csv') exportCsv(hist);
    else if (act === 'export-json') exportJson(hist);
  }

  destroy() { this._stop(); }
}

function fmt(v, u) { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(3)} ${u || ''}` : String(v); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function exportCsv(hist) {
  const safe = (s) => {
    const v = String(s == null ? '' : s);
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
