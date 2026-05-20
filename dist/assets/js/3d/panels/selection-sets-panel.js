// Selection sets — save named groups of highlighted entities.

const STORE_KEY = 'bim_checker_selection_sets_v1';
const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } };
const save = (l) => localStorage.setItem(STORE_KEY, JSON.stringify(l));

export default class SelectionSetsPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Sady výběru';
  }

  mount() { this._render(); }

  _render() {
    const list = load();
    this.host.innerHTML = `
      <div class="v3d-panel__row">
        <input class="v3d-panel__input" data-role="name" placeholder="Název sady" />
        <input type="color" data-role="color" value="#facc15" style="width:32px;height:30px;border:none;background:transparent;cursor:pointer">
        <button class="v3d-btn v3d-btn--primary" data-role="save">＋</button>
      </div>
      <p class="v3d-panel__hint">Uloží aktuálně zvýrazněné entity jako pojmenovanou sadu.</p>
      <ul class="v3d-panel__list" style="margin-top:10px">
        ${list.length === 0 ? '<li style="color:var(--text-tertiary)">Žádné sady</li>' : list.map((s, i) => `
          <li>
            <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${s.color}"></span>
            <span style="flex:1">${escapeHtml(s.name)} <small style="color:var(--text-tertiary)">${s.items.length}</small></span>
            <button class="v3d-pill" data-act="hl" data-i="${i}">✱</button>
            <button class="v3d-pill" data-act="iso" data-i="${i}">⌖</button>
            <button class="v3d-pill" data-act="hide" data-i="${i}">∅</button>
            <button class="v3d-pill" data-act="del" data-i="${i}">✕</button>
          </li>
        `).join('')}
      </ul>
    `;
    this.host.querySelector('[data-role="save"]').addEventListener('click', () => this._save());
    this.host.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => this._action(b.dataset.act, parseInt(b.dataset.i, 10)));
    });
  }

  _save() {
    const name = (this.host.querySelector('[data-role="name"]').value || '').trim();
    const color = this.host.querySelector('[data-role="color"]').value;
    if (!name) return;
    const items = this.engine.getHighlightedIds() || [];
    if (items.length === 0) { alert('Nejprve označte entity (klikem nebo přes Hledat).'); return; }
    const list = load();
    list.push({ name, color, items: items.map(i => ({ modelId: i.modelId, expressId: i.expressId })) });
    save(list);
    this._render();
  }

  _action(act, i) {
    const list = load();
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
      list.splice(i, 1); save(list); this._render();
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
