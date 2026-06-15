// Selection sets — save named groups of highlighted entities.

const STORE_KEY = 'bim_checker_selection_sets_v1';

export default class SelectionSetsPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Sady výběru';
    this._msg = null; // { type: 'ok'|'warn'|'err', text } — zobrazí se při příštím renderu
  }

  mount() { this._render(); }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    } catch (e) {
      console.warn('[selection-sets] load failed:', e);
      this._msg = { type: 'err', text: `Čtení uložených sad selhalo: ${e.message}` };
      return [];
    }
  }

  _persist(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.warn('[selection-sets] save failed:', e);
      this._msg = { type: 'err', text: `Uložení selhalo: ${e.message}` };
      return false;
    }
  }

  _render(prefill = {}) {
    const list = this._load();
    const msg = this._msg;
    this._msg = null;
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Nová sada</h4>
        <div class="v3d-panel__field">
          <label>Název a barva</label>
          <div class="v3d-panel__row">
            <input class="v3d-panel__input" data-role="name" placeholder="Např. Nosné stěny 1.NP" value="${escapeHtml(prefill.name || '')}" />
            <input type="color" data-role="color" value="${escapeHtml(prefill.color || '#facc15')}" title="Barva zvýraznění" />
          </div>
        </div>
        <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="save">＋ Uložit aktuální výběr</button>
        <p class="v3d-panel__hint">Uloží aktuálně zvýrazněné entity jako pojmenovanou sadu.</p>
      </div>
      ${msg ? `<div class="v3d-panel__msg v3d-panel__msg--${msg.type}">${escapeHtml(msg.text)}</div>` : ''}
      <hr class="v3d-panel__divider" />
      <div class="v3d-panel__section">
        <h4>Uložené sady <span class="v3d-panel__badge">${list.length}</span></h4>
        ${list.length === 0 ? `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">📑</div>
            <p>Žádné uložené sady.<br>Označte entity a uložte je jako sadu.</p>
          </div>
        ` : list.map((s, i) => `
          <div class="v3d-panel__item">
            <span class="v3d-panel__badge" style="background:${escapeHtml(s.color || '#facc15')};color:${escapeHtml(s.color || '#facc15')}">●</span>
            <div class="v3d-panel__item-main">
              <div class="v3d-panel__item-title">${escapeHtml(s.name)}</div>
              <div class="v3d-panel__item-sub">${s.items.length} ${plural(s.items.length, 'entita', 'entity', 'entit')}</div>
            </div>
            <button class="v3d-panel__item-btn" data-act="hl" data-i="${i}" title="Zvýraznit">✱</button>
            <button class="v3d-panel__item-btn" data-act="iso" data-i="${i}" title="Izolovat">⌖</button>
            <button class="v3d-panel__item-btn" data-act="hide" data-i="${i}" title="Skrýt">∅</button>
            <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="del" data-i="${i}" title="Smazat sadu">✕</button>
          </div>
        `).join('')}
      </div>
    `;
    this.host.querySelector('[data-role="save"]').addEventListener('click', () => this._saveSet());
    this.host.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => this._action(b.dataset.act, parseInt(b.dataset.i, 10)));
    });
  }

  _saveSet() {
    const name = (this.host.querySelector('[data-role="name"]').value || '').trim();
    const color = this.host.querySelector('[data-role="color"]').value;
    if (!name) {
      this._msg = { type: 'warn', text: 'Zadejte název sady.' };
      this._render({ color });
      return;
    }
    const items = this.engine.getHighlightedIds() || [];
    if (items.length === 0) {
      this._msg = { type: 'warn', text: 'Nejprve označte entity (kliknutím v modelu nebo přes Hledat).' };
      this._render({ name, color });
      return;
    }
    const list = this._load();
    list.push({ name, color, items: items.map(i => ({ modelId: i.modelId, expressId: i.expressId })) });
    if (this._persist(list)) {
      this._msg = { type: 'ok', text: `Sada „${name}“ uložena (${items.length} ${plural(items.length, 'entita', 'entity', 'entit')}).` };
      this._render();
    } else {
      this._render({ name, color });
    }
  }

  _action(act, i) {
    const list = this._load();
    const s = list[i];
    if (!s) return;
    if (act === 'hl') {
      this.engine.clearHighlights();
      this.engine.highlight(s.items, s.color);
    } else if (act === 'iso') {
      this.engine.isolateEntities(s.items);
    } else if (act === 'hide') {
      this.engine.hideEntities(s.items);
    } else if (act === 'del') {
      if (!confirm(`Smazat sadu „${s.name}“?`)) return;
      list.splice(i, 1);
      this._persist(list);
      this._render();
    }
  }

  destroy() {}
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
