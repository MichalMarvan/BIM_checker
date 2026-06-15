// Search panel — fulltext + IFC type + Pset filter.

const RESULT_LIMIT = 200;

export default class SearchPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Hledat objekty';
    this._debounce = null;
    this._lastResults = [];
  }

  mount() {
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Filtr</h4>
        <div class="v3d-panel__field">
          <label>Text (název / GUID / typ)</label>
          <input class="v3d-panel__input" data-role="text" placeholder="Např. stěna, GUID…" />
        </div>
        <div class="v3d-panel__field">
          <label>IFC typ (volitelné)</label>
          <input class="v3d-panel__input" data-role="type" placeholder="IFCWALL" />
        </div>
        <div class="v3d-panel__field">
          <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="search">🔍 Hledat</button>
        </div>
        <div class="v3d-panel__row">
          <button class="v3d-panel__btn v3d-panel__btn--sm" data-role="highlight">✱ Zvýraznit vše</button>
          <button class="v3d-panel__btn v3d-panel__btn--sm" data-role="clear">✕ Vymazat</button>
        </div>
      </div>
      <hr class="v3d-panel__divider" />
      <div class="v3d-panel__section">
        <h4>Výsledky <span class="v3d-panel__badge" data-role="count">0</span></h4>
        <div data-role="results"></div>
      </div>
    `;
    const textEl = this.host.querySelector('[data-role="text"]');
    textEl.addEventListener('input', () => this._scheduleSearch());
    this.host.querySelector('[data-role="type"]').addEventListener('input', () => this._scheduleSearch());
    this.host.querySelector('[data-role="search"]').addEventListener('click', () => this._search());
    this.host.querySelector('[data-role="highlight"]').addEventListener('click', () => this._highlightAll());
    this.host.querySelector('[data-role="clear"]').addEventListener('click', () => this._clear());
    this._renderResults(null);
    setTimeout(() => textEl.focus(), 50);
  }

  _scheduleSearch() {
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this._search(), 250);
  }

  _clear() {
    this.engine.clearHighlights();
    this.host.querySelector('[data-role="text"]').value = '';
    this.host.querySelector('[data-role="type"]').value = '';
    this._lastResults = [];
    this.host.querySelector('[data-role="count"]').textContent = '0';
    this._renderResults(null);
  }

  _search() {
    const text = this.host.querySelector('[data-role="text"]').value.trim();
    const type = this.host.querySelector('[data-role="type"]').value.trim().toUpperCase();
    if (!text && !type) {
      this._lastResults = [];
      this.host.querySelector('[data-role="count"]').textContent = '0';
      this._renderResults(null);
      return;
    }
    const results = this.engine.search({ text: text || undefined, type: type || undefined, limit: RESULT_LIMIT }) || [];
    this._lastResults = results;
    this.host.querySelector('[data-role="count"]').textContent = String(results.length);
    this._renderResults(results);
  }

  /** @param {Array|null} results — null = ještě se nehledalo (prázdný dotaz) */
  _renderResults(results) {
    const box = this.host.querySelector('[data-role="results"]');
    if (results === null) {
      box.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">🔍</div>
          <p>Zadejte text nebo IFC typ.<br>Hledá se průběžně při psaní.</p>
        </div>`;
      return;
    }
    if (results.length === 0) {
      box.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">🤷</div>
          <p>Nic nenalezeno.<br>Zkuste jiný text nebo IFC typ.</p>
        </div>`;
      return;
    }
    box.innerHTML = `
      <ul class="v3d-panel__list">
        ${results.map((r) => `
          <li data-mid="${r.modelId}" data-eid="${r.expressId}" title="${escapeHtml(r.name || '')}">
            <div class="v3d-panel__item-main">
              <div class="v3d-panel__item-title">${escapeHtml(r.name || '#' + r.expressId)}</div>
              <div class="v3d-panel__item-sub">${escapeHtml(r.ifcType)} · #${r.expressId}</div>
            </div>
            <button class="v3d-panel__item-btn" data-act="focus" data-mid="${r.modelId}" data-eid="${r.expressId}" title="Přiblížit kameru">📷</button>
          </li>
        `).join('')}
      </ul>
      ${results.length >= RESULT_LIMIT ? `<p class="v3d-panel__hint">Zobrazeno prvních ${RESULT_LIMIT} výsledků — upřesněte hledání.</p>` : ''}
    `;
    box.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const mid = li.dataset.mid;
        const eid = parseInt(li.dataset.eid, 10);
        this.engine.clearHighlights();
        this.engine.highlight([{ modelId: mid, expressId: eid }], '#facc15');
      });
    });
    box.querySelectorAll('[data-act="focus"]').forEach((b) => {
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

  destroy() {
    clearTimeout(this._debounce);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
