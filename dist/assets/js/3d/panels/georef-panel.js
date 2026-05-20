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
      <div class="v3d-panel__field">
        <label><input type="checkbox" data-role="rw" ${rw?.enabled ? 'checked' : ''}> Použít skutečné souřadnice (CRS L2)</label>
      </div>
      <p class="v3d-panel__hint">${rw?.enabled ? `False origin: ${JSON.stringify(rw.falseOrigin)}` : ''}</p>
      <h4 style="margin-top:8px">Modely (${models.length})</h4>
      <ul class="v3d-panel__list">
        ${models.map(m => {
          const c = this.engine.getCoords?.(m.modelId);
          const log = loGeoRef(c);
          return `
            <li style="flex-direction:column;align-items:flex-start;gap:2px">
              <div style="display:flex;width:100%;align-items:center;gap:6px">
                <strong style="flex:1">${escapeHtml(m.name)}</strong>
                <span class="v3d-pill" style="font-size:10px">${log}</span>
              </div>
              <small style="color:var(--text-tertiary)">
                ${c?.projectedCRS?.name || '—'} ·
                ref ${c?.refLat?.toFixed(5) ?? '—'}, ${c?.refLon?.toFixed(5) ?? '—'}
              </small>
            </li>
          `;
        }).join('') || '<li style="color:var(--text-tertiary)">Žádné modely</li>'}
      </ul>
    `;
    this.host.querySelector('[data-role="rw"]').addEventListener('change', (e) => {
      try {
        this.engine.setRealWorldCoords?.(e.target.checked, { falseOrigin: 'auto' });
        this._render();
      } catch (err) { alert(err.message); }
    });
  }

  destroy() {}
}

function loGeoRef(c) {
  if (!c) return 'LoGeoRef ?';
  if (c.mapConversion && c.projectedCRS?.name) return 'LoGeoRef 50';
  if (c.refLat != null && c.refLon != null) return 'LoGeoRef 20';
  return 'LoGeoRef <20';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
