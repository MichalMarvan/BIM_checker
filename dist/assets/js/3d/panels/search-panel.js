// Search panel — fulltext + IFC type + Pset filter.

export default class SearchPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Hledat objekty';
    this._debounce = null;
  }

  mount() {
    this.host.innerHTML = `
      <div class="v3d-panel__field">
        <input class="v3d-panel__input" data-role="text" placeholder="Název / GUID / typ…" />
      </div>
      <div class="v3d-panel__field">
        <label>IFC typ (volitelné)</label>
        <input class="v3d-panel__input" data-role="type" placeholder="IFCWALL" />
      </div>
      <div class="v3d-panel__field">
        <div class="v3d-panel__row">
          <button class="v3d-pill" data-role="search">🔍 Hledat</button>
          <button class="v3d-pill" data-role="highlight">✱ Zvýraznit vše</button>
          <button class="v3d-pill" data-role="clear">Smazat</button>
        </div>
      </div>
      <div class="v3d-panel__section">
        <h4>Výsledky <span data-role="count">0</span></h4>
        <ul class="v3d-panel__list" data-role="results"></ul>
      </div>
    `;
    const textEl = this.host.querySelector('[data-role="text"]');
    textEl.addEventListener('input', () => this._scheduleSearch());
    this.host.querySelector('[data-role="type"]').addEventListener('input', () => this._scheduleSearch());
    this.host.querySelector('[data-role="search"]').addEventListener('click', () => this._search());
    this.host.querySelector('[data-role="highlight"]').addEventListener('click', () => this._highlightAll());
    this.host.querySelector('[data-role="clear"]').addEventListener('click', () => {
      this.engine.clearHighlights();
      this.host.querySelector('[data-role="results"]').innerHTML = '';
      this.host.querySelector('[data-role="count"]').textContent = '0';
      this._lastResults = [];
    });
    this._lastResults = [];
    setTimeout(() => textEl.focus(), 50);
  }

  _scheduleSearch() {
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this._search(), 250);
  }

  _search() {
    const text = this.host.querySelector('[data-role="text"]').value.trim();
    const type = this.host.querySelector('[data-role="type"]').value.trim().toUpperCase();
    if (!text && !type) {
      this.host.querySelector('[data-role="results"]').innerHTML = '';
      this.host.querySelector('[data-role="count"]').textContent = '0';
      return;
    }
    const results = this.engine.search({ text: text || undefined, type: type || undefined, limit: 200 }) || [];
    this._lastResults = results;
    this.host.querySelector('[data-role="count"]').textContent = String(results.length);
    const list = this.host.querySelector('[data-role="results"]');
    list.innerHTML = results.slice(0, 200).map((r) => `
      <li data-mid="${r.modelId}" data-eid="${r.expressId}">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.name || '')}">
          <strong>${escapeHtml(r.ifcType)}</strong> ${escapeHtml(r.name || '#' + r.expressId)}
        </span>
        <button class="v3d-pill" data-act="focus" data-mid="${r.modelId}" data-eid="${r.expressId}">📷</button>
      </li>
    `).join('');
    list.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const mid = li.dataset.mid;
        const eid = parseInt(li.dataset.eid, 10);
        this.engine.clearHighlights();
        this.engine.highlight([{ modelId: mid, expressId: eid }], '#facc15');
      });
    });
    list.querySelectorAll('[data-act="focus"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.focusEntity(b.dataset.mid, parseInt(b.dataset.eid, 10));
      });
    });
  }

  _highlightAll() {
    if (!this._lastResults || this._lastResults.length === 0) this._search();
    const items = (this._lastResults || []).map(r => ({ modelId: r.modelId, expressId: r.expressId }));
    if (items.length) this.engine.highlight(items, '#facc15');
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
