// Ask Anything — RAG semantic search.

export default class AskPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Ask (RAG sémanticky)';
  }

  mount() {
    this.host.innerHTML = `
      <p class="v3d-panel__hint">První dotaz spustí indexaci (~30 s, transformers.js MiniLM). Pak instant.</p>
      <div class="v3d-panel__field">
        <input class="v3d-panel__input" data-role="q" placeholder="Najdi nosné stěny tlustší než 200 mm…">
      </div>
      <div class="v3d-panel__row">
        <select class="v3d-panel__select" data-role="level">
          <option value="">— level (auto) —</option>
          <option value="entity">entity</option>
          <option value="storey">storey</option>
          <option value="model">model</option>
        </select>
        <input class="v3d-panel__input" data-role="k" type="number" value="10" min="1" max="50" style="max-width:80px">
        <button class="v3d-btn v3d-btn--primary" data-role="ask">Hledat</button>
      </div>
      <p class="v3d-panel__hint" data-role="status"></p>
      <ul class="v3d-panel__list" data-role="results"></ul>
    `;
    this.host.querySelector('[data-role="ask"]').addEventListener('click', () => this._ask());
    this.host.querySelector('[data-role="q"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') this._ask(); });
  }

  async _ask() {
    const q = this.host.querySelector('[data-role="q"]').value.trim();
    if (!q) return;
    const level = this.host.querySelector('[data-role="level"]').value || undefined;
    const k = parseInt(this.host.querySelector('[data-role="k"]').value, 10) || 10;
    const status = this.host.querySelector('[data-role="status"]');
    status.textContent = 'Hledám…';
    try {
      this.engine.onRagLoadProgress?.((p) => { status.textContent = `Indexuji ${(p * 100).toFixed(0)} %`; });
      const results = await this.engine.semanticSearch?.(q, { level, k }) || [];
      status.textContent = `${results.length} výsledků`;
      const list = this.host.querySelector('[data-role="results"]');
      list.innerHTML = results.map(r => `
        <li data-mid="${r.chunk?.modelId || ''}" data-eid="${r.chunk?.refExpressId || ''}">
          <span style="flex:1">
            <strong>${escapeHtml(r.chunk?.ifcType || r.chunk?.level || '?')}</strong> ${escapeHtml(r.chunk?.name || r.chunk?.text || '').slice(0, 80)}
            <small style="color:var(--text-tertiary)"> ${(r.score * 100).toFixed(0)}%</small>
          </span>
          ${r.chunk?.refExpressId ? `<button class="v3d-pill" data-act="focus">📷</button>` : ''}
        </li>
      `).join('');
      list.querySelectorAll('[data-act="focus"]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const li = b.closest('li');
        this.engine.focusEntity?.(li.dataset.mid, parseInt(li.dataset.eid, 10));
      }));
    } catch (e) {
      console.error(e); status.textContent = '✗ ' + (e.message || e);
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
