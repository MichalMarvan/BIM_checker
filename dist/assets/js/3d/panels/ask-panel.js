// Ask Anything — RAG semantic search.

export default class AskPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Ask (RAG sémanticky)';
  }

  mount() {
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Dotaz</h4>
        <div class="v3d-panel__field">
          <textarea class="v3d-panel__textarea" data-role="q" placeholder="Najdi nosné stěny tlustší než 200 mm…"></textarea>
        </div>
        <div class="v3d-panel__row">
          <select class="v3d-panel__select" data-role="level">
            <option value="">— úroveň (auto) —</option>
            <option value="entity">entity</option>
            <option value="storey">podlaží</option>
            <option value="model">model</option>
          </select>
          <input class="v3d-panel__input" data-role="k" type="number" value="10" min="1" max="50" aria-label="Počet výsledků">
        </div>
        <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="ask">Hledat</button>
        <p class="v3d-panel__hint">První dotaz spustí indexaci (~30 s, transformers.js MiniLM). Pak je vyhledávání okamžité.</p>
      </div>
      <div data-role="status"></div>
      <div class="v3d-panel__section" data-role="results-wrap" hidden>
        <h4>Výsledky</h4>
        <ul class="v3d-panel__list" data-role="results"></ul>
      </div>
    `;
    this.host.querySelector('[data-role="ask"]').addEventListener('click', () => this._ask());
    this.host.querySelector('[data-role="q"]').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this._ask();
      }
    });
  }

  async _ask() {
    const q = this.host.querySelector('[data-role="q"]').value.trim();
    if (!q) {
      return;
    }
    const level = this.host.querySelector('[data-role="level"]').value || undefined;
    const k = parseInt(this.host.querySelector('[data-role="k"]').value, 10) || 10;
    const status = this.host.querySelector('[data-role="status"]');
    const askBtn = this.host.querySelector('[data-role="ask"]');
    const wrap = this.host.querySelector('[data-role="results-wrap"]');
    const list = this.host.querySelector('[data-role="results"]');

    if (typeof this.engine.semanticSearch !== 'function') {
      status.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">Sémantické vyhledávání není v tomto enginu dostupné.</div>';
      return;
    }

    askBtn.disabled = true;
    wrap.hidden = true;
    status.innerHTML = '<div class="v3d-panel__msg" data-role="busy">Hledám…</div>';
    const busy = status.querySelector('[data-role="busy"]');
    try {
      this.engine.onRagLoadProgress?.((p) => {
        if (busy) {
          busy.textContent = `Indexuji ${(p * 100).toFixed(0)} %…`;
        }
      });
      const results = await this.engine.semanticSearch(q, { level, k }) || [];
      if (!results.length) {
        status.innerHTML = '';
        wrap.hidden = false;
        list.innerHTML = `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">🔍</div>
            <p>Nic nenalezeno. Zkuste přeformulovat dotaz.</p>
          </div>
        `;
        return;
      }
      status.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--ok">${results.length} výsledků</div>`;
      wrap.hidden = false;
      list.innerHTML = results.map(r => `
        <li class="v3d-panel__item" data-mid="${r.chunk?.modelId || ''}" data-eid="${r.chunk?.refExpressId || ''}">
          <div class="v3d-panel__item-main">
            <div class="v3d-panel__item-title">${escapeHtml(r.chunk?.ifcType || r.chunk?.level || '?')}</div>
            <div class="v3d-panel__item-sub">${escapeHtml(r.chunk?.name || r.chunk?.text || '').slice(0, 80)}</div>
          </div>
          <span class="v3d-panel__badge">${(r.score * 100).toFixed(0)}%</span>
          ${r.chunk?.refExpressId ? '<button class="v3d-panel__item-btn" data-act="focus" title="Zaměřit">📷</button>' : ''}
        </li>
      `).join('');
      list.querySelectorAll('[data-act="focus"]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const li = b.closest('li');
        this.engine.focusEntity?.(li.dataset.mid, parseInt(li.dataset.eid, 10));
      }));
    } catch (e) {
      console.error(e);
      status.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--err">✗ ${escapeHtml(e.message || String(e))}</div>`;
    } finally {
      askBtn.disabled = false;
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
