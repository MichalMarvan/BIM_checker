// Color by property — auto palette + legend.

export default class ColorPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Obarvit podle vlastnosti';
  }

  async mount() {
    const props = (await this.engine.getAvailableProperties?.()) || [];
    const grouped = new Map();
    for (const p of props) {
      const k = `${p.pset}.${p.property}`;
      if (!grouped.has(k)) grouped.set(k, { pset: p.pset, property: p.property, count: p.count });
    }
    const opts = [...grouped.values()].slice(0, 200);
    this.host.innerHTML = `
      <div class="v3d-panel__field">
        <label>PSet / Vlastnost</label>
        <select class="v3d-panel__select" data-role="prop">
          <option value="">— vyberte —</option>
          ${opts.map(o => `<option value="${o.pset}|${o.property}">${escapeHtml(o.pset)} / ${escapeHtml(o.property)} (${o.count})</option>`).join('')}
        </select>
      </div>
      <div class="v3d-panel__field">
        <div class="v3d-panel__row">
          <button class="v3d-btn v3d-btn--primary" data-role="apply">Použít</button>
          <button class="v3d-pill" data-role="clear">Reset</button>
        </div>
      </div>
      <div class="v3d-panel__section" data-role="legend"></div>
      <p class="v3d-panel__hint">Auto-paleta HSL napříč unikátními hodnotami.</p>
    `;
    this.host.querySelector('[data-role="apply"]').addEventListener('click', () => this._apply());
    this.host.querySelector('[data-role="clear"]').addEventListener('click', () => {
      this.engine.clearColorByProperty?.();
      this.host.querySelector('[data-role="legend"]').innerHTML = '';
    });
  }

  _apply() {
    const v = this.host.querySelector('[data-role="prop"]').value;
    if (!v) return;
    const [pset, property] = v.split('|');
    const result = this.engine.colorByProperty?.({ pset, property });
    if (!result) return;
    const legend = this.host.querySelector('[data-role="legend"]');
    const entries = Object.entries(result.valueToColor || {});
    legend.innerHTML = `<h4>Legenda (${entries.length}) — ${result.matchedTotal || 0} entit</h4>` + entries.map(([val, col]) => `
      <div class="v3d-panel__row" style="font-size:11px;margin-bottom:3px">
        <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${col}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(val)}</span>
        <span style="color:var(--text-tertiary)">${result.valueToCount?.[val] ?? '?'}</span>
      </div>
    `).join('');
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
