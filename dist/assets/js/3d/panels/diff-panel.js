// Diff — compare two loaded IFC models.

export default class DiffPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Diff dvou verzí';
  }

  mount() { this._render(); }

  _render(result = null) {
    const models = this.engine.getModels?.() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__field">
        <label>Verze A</label>
        <select class="v3d-panel__select" data-role="a">
          ${models.map(m => `<option value="${m.modelId}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>
      <div class="v3d-panel__field">
        <label>Verze B</label>
        <select class="v3d-panel__select" data-role="b">
          ${models.map(m => `<option value="${m.modelId}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>
      <button class="v3d-btn v3d-btn--primary" data-role="run">Spustit diff</button>
      ${result ? `
        <div class="v3d-panel__section">
          <div class="v3d-panel__pills">
            <button class="v3d-pill active" data-tab="added">＋ Přidáno (${result.added?.length || 0})</button>
            <button class="v3d-pill" data-tab="removed">− Odebráno (${result.removed?.length || 0})</button>
            <button class="v3d-pill" data-tab="modified">Δ Změněno (${result.modified?.length || 0})</button>
          </div>
          <ul class="v3d-panel__list" data-role="rows"></ul>
        </div>
      ` : ''}
    `;
    this.host.querySelector('[data-role="run"]').addEventListener('click', () => this._run());
    if (result) {
      this.host.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
        this.host.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
        this._renderRows(result, b.dataset.tab);
      }));
      this._renderRows(result, 'added');
    }
  }

  _renderRows(result, tab) {
    const rows = result[tab] || [];
    this.host.querySelector('[data-role="rows"]').innerHTML = rows.slice(0, 100).map(r => `
      <li><span style="flex:1">${escapeHtml(r.ifcType || '?')} ${escapeHtml(r.name || r.guid || '#' + (r.expressId || ''))}</span></li>
    `).join('') || '<li style="color:var(--text-tertiary)">Prázdné</li>';
  }

  _run() {
    const a = this.host.querySelector('[data-role="a"]').value;
    const b = this.host.querySelector('[data-role="b"]').value;
    if (a === b) { alert('Vyberte dva různé modely.'); return; }
    try {
      const result = this.engine.computeDiff?.(a, b);
      this._render(result);
    } catch (e) { alert('Diff selhal: ' + e.message); }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
