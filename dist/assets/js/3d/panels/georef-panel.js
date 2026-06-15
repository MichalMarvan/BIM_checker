// Geo-reference overlay — coords per model + apply real-world coords toggle.

export default class GeorefPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Geo-referenace';
  }

  mount() { this._render(); }

  _render() {
    const models = this.engine.getModels?.() || [];
    const rw = this.engine.getRealWorldCoords?.();
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Skutečné souřadnice</h4>
        <label class="v3d-panel__toggle">
          <input type="checkbox" data-role="rw" ${rw?.enabled ? 'checked' : ''}>
          Použít skutečné souřadnice (CRS L2)
        </label>
        ${rw?.enabled && rw.falseOrigin ? `
          <div class="v3d-panel__kv"><span>False origin E</span><b>${fmtNum(rw.falseOrigin[0])}</b></div>
          <div class="v3d-panel__kv"><span>False origin N</span><b>${fmtNum(rw.falseOrigin[1])}</b></div>
          <div class="v3d-panel__kv"><span>False origin H</span><b>${fmtNum(rw.falseOrigin[2])}</b></div>
        ` : ''}
      </div>
      <div data-role="msg"></div>
      <hr class="v3d-panel__divider">
      <div class="v3d-panel__section">
        <h4>Modely (${models.length})</h4>
        ${models.length ? `<div class="v3d-panel__list">${models.map(m => this._modelRow(m)).join('')}</div>` : `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">🌍</div>
            <p>Nejsou načteny žádné modely.</p>
          </div>`}
      </div>
    `;
    this.host.querySelector('[data-role="rw"]').addEventListener('change', (e) => {
      try {
        this.engine.setRealWorldCoords?.(e.target.checked, { falseOrigin: 'auto' });
        this._render();
      } catch (err) {
        this._msg(err.message, 'err');
      }
    });
  }

  _modelRow(m) {
    const c = this.engine.getCoords?.(m.modelId);
    const log = loGeoRef(c);
    const mc = c?.mapConversion;
    return `
      <div class="v3d-panel__item">
        <div class="v3d-panel__item-main">
          <div class="v3d-panel__item-title">${escapeHtml(m.name)}</div>
          <div class="v3d-panel__item-sub">${escapeHtml(c?.projectedCRS?.name || 'CRS neuvedeno')}</div>
          <div class="v3d-panel__kv"><span>Ref. zeměp. šířka</span><b>${fmtDeg(c?.refLat)}</b></div>
          <div class="v3d-panel__kv"><span>Ref. zeměp. délka</span><b>${fmtDeg(c?.refLon)}</b></div>
          ${mc ? `
            <div class="v3d-panel__kv"><span>Eastings</span><b>${fmtNum(mc.eastings)}</b></div>
            <div class="v3d-panel__kv"><span>Northings</span><b>${fmtNum(mc.northings)}</b></div>
            ${mc.orthogonalHeight !== null && mc.orthogonalHeight !== undefined ? `<div class="v3d-panel__kv"><span>Výška</span><b>${fmtNum(mc.orthogonalHeight)}</b></div>` : ''}
          ` : ''}
        </div>
        <span class="v3d-panel__badge">${log}</span>
      </div>
    `;
  }

  _msg(text, kind) {
    const box = this.host.querySelector('[data-role="msg"]');
    if (box) {
      box.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--${kind}">${escapeHtml(text)}</div>`;
    }
  }

  destroy() {}
}

function loGeoRef(c) {
  if (!c) {
    return 'LoGeoRef ?';
  }
  if (c.mapConversion && c.projectedCRS?.name) {
    return 'LoGeoRef 50';
  }
  if (c.refLat !== null && c.refLat !== undefined && c.refLon !== null && c.refLon !== undefined) {
    return 'LoGeoRef 20';
  }
  return 'LoGeoRef <20';
}

function fmtNum(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) {
    return '—';
  }
  return Number(v).toLocaleString('cs-CZ', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDeg(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) {
    return '—';
  }
  return Number(v).toLocaleString('cs-CZ', { minimumFractionDigits: 5, maximumFractionDigits: 5 }) + '°';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
