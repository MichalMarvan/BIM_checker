// Clash detection — bbox + mesh BVH.

export default class ClashPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Detekce kolizí';
  }

  mount() { this._render(); }

  _render(stats = null, clashes = null) {
    this.host.innerHTML = `
      <div class="v3d-panel__field">
        <label>Metoda</label>
        <div class="v3d-panel__pills" data-role="method">
          <button class="v3d-pill active" data-v="bbox">BBox (rychlé)</button>
          <button class="v3d-pill" data-v="mesh">Mesh BVH (přesné)</button>
        </div>
      </div>
      <div class="v3d-panel__field">
        <label>Páry</label>
        <div class="v3d-panel__pills" data-role="pairing">
          <button class="v3d-pill active" data-v="all">All-vs-all</button>
          <button class="v3d-pill" data-v="types">Podle typů</button>
        </div>
      </div>
      <div class="v3d-panel__field">
        <label>Typy kolizí</label>
        <div class="v3d-panel__pills" data-role="types">
          <button class="v3d-pill active" data-v="hard">Hard</button>
          <button class="v3d-pill" data-v="clearance">Vzdálenost</button>
          <button class="v3d-pill" data-v="duplicate">Duplikáty</button>
        </div>
      </div>
      <div class="v3d-panel__row">
        <input class="v3d-panel__input" data-role="clearance" type="number" value="50" placeholder="mm">
        <input class="v3d-panel__input" data-role="dup-tol" type="number" value="10" placeholder="mm">
      </div>
      <button class="v3d-btn v3d-btn--primary" data-role="run" style="margin-top:8px">▶ Spustit</button>
      <p class="v3d-panel__hint" data-role="status">${stats ? `${clashes.length} kolizí (${stats.elapsedMs || '?'} ms)` : ''}</p>
      <ul class="v3d-panel__list">
        ${(clashes || []).slice(0, 50).map((c, i) => `
          <li data-i="${i}">
            <span style="flex:1">${escapeHtml(c.kind || 'hard')} — ${escapeHtml(c.a?.ifcType || '?')} ↔ ${escapeHtml(c.b?.ifcType || '?')}</span>
            <button class="v3d-pill" data-act="show" data-i="${i}">📷</button>
          </li>
        `).join('') || ''}
      </ul>
    `;
    // pills toggle (single select per group)
    ['method', 'pairing'].forEach(g => {
      this.host.querySelectorAll(`[data-role="${g}"] .v3d-pill`).forEach(b => b.addEventListener('click', () => {
        this.host.querySelectorAll(`[data-role="${g}"] .v3d-pill`).forEach(x => x.classList.toggle('active', x === b));
      }));
    });
    // types multi-select
    this.host.querySelectorAll('[data-role="types"] .v3d-pill').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
    this.host.querySelector('[data-role="run"]').addEventListener('click', () => this._run());
    if (clashes) {
      this.host.querySelectorAll('[data-act="show"]').forEach((b) => b.addEventListener('click', () => {
        const c = clashes[parseInt(b.dataset.i, 10)];
        if (c?.a) this.engine.focusEntity?.(c.a.modelId, c.a.expressId);
        if (c?.a && c?.b) this.engine.highlight?.([{ modelId: c.a.modelId, expressId: c.a.expressId }, { modelId: c.b.modelId, expressId: c.b.expressId }], '#ef4444');
      }));
    }
  }

  async _run() {
    const status = this.host.querySelector('[data-role="status"]');
    status.textContent = 'Počítám…';
    const method = this.host.querySelector('[data-role="method"] .v3d-pill.active').dataset.v;
    const pairing = this.host.querySelector('[data-role="pairing"] .v3d-pill.active').dataset.v;
    const clashTypes = [...this.host.querySelectorAll('[data-role="types"] .v3d-pill.active')].map(b => b.dataset.v);
    const clearanceMm = parseFloat(this.host.querySelector('[data-role="clearance"]').value) || 50;
    const duplicateToleranceMm = parseFloat(this.host.querySelector('[data-role="dup-tol"]').value) || 10;
    try {
      const t0 = performance.now();
      const result = await this.engine.detectClashes({ method, pairing, clashTypes, clearanceMm, duplicateToleranceMm, modelUnitsToMm: 1000 });
      const ms = Math.round(performance.now() - t0);
      this._render({ ...result.stats, elapsedMs: ms }, result.clashes);
    } catch (e) {
      console.error(e); status.textContent = '✗ ' + (e.message || e);
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
