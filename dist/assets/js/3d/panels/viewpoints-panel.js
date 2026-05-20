// Saved viewpoints — camera + hidden + opacity + highlights, IDB persist.

const STORE_KEY = 'bim_checker_viewpoints_v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function save(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

export default class ViewpointsPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Uložené pohledy';
  }

  mount() {
    this._render();
  }

  _render() {
    const list = load();
    this.host.innerHTML = `
      <div class="v3d-panel__row">
        <input class="v3d-panel__input" data-role="name" placeholder="Jméno pohledu" />
        <button class="v3d-btn v3d-btn--primary" data-role="save">＋ Uložit</button>
      </div>
      <div class="v3d-panel__section" style="margin-top:10px">
        <h4>Pohledy (${list.length})</h4>
        <ul class="v3d-panel__list" data-role="list">
          ${list.length === 0 ? '<li style="color:var(--text-tertiary)">Žádné pohledy</li>' : list.map((v, i) => `
            <li data-i="${i}">
              <span style="flex:1">${escapeHtml(v.name)}</span>
              <button class="v3d-pill" data-act="apply" data-i="${i}">Použít</button>
              <button class="v3d-pill" data-act="delete" data-i="${i}">✕</button>
            </li>
          `).join('')}
        </ul>
      </div>
      <div class="v3d-panel__section">
        <div class="v3d-panel__row">
          <button class="v3d-pill" data-act="export">⇣ Export JSON</button>
          <label class="v3d-pill" style="cursor:pointer">
            ⇡ Import <input type="file" accept=".json" data-act="import" hidden>
          </label>
        </div>
      </div>
    `;

    this.host.querySelector('[data-role="save"]').addEventListener('click', () => this._save());
    this.host.querySelectorAll('[data-act="apply"]').forEach((b) => b.addEventListener('click', () => this._apply(parseInt(b.dataset.i, 10))));
    this.host.querySelectorAll('[data-act="delete"]').forEach((b) => b.addEventListener('click', () => this._delete(parseInt(b.dataset.i, 10))));
    this.host.querySelector('[data-act="export"]').addEventListener('click', () => this._export());
    this.host.querySelector('[data-act="import"]').addEventListener('change', (e) => this._import(e.target.files[0]));
  }

  _save() {
    const name = (this.host.querySelector('[data-role="name"]').value || '').trim();
    if (!name) return;
    const vp = {
      name,
      created: new Date().toISOString(),
      camera: this.engine.getCameraState(),
      hidden: this.engine.getHiddenEntityIds() || [],
      opacity: this.engine.getOpacityEntries() || [],
      highlights: this.engine.getHighlightedIds() || [],
      displayMode: this.engine.getDisplayMode?.() || 'solid',
    };
    const list = load();
    list.push(vp);
    save(list);
    this._render();
  }

  _apply(i) {
    const list = load();
    const v = list[i];
    if (!v) return;
    try {
      if (v.camera) this.engine.setCameraState(v.camera);
      this.engine.showAll();
      if (v.hidden?.length) this.engine.hideEntities(v.hidden);
      if (v.opacity?.length) {
        const grouped = new Map();
        for (const o of v.opacity) {
          const k = o.alpha;
          if (!grouped.has(k)) grouped.set(k, []);
          grouped.get(k).push({ modelId: o.modelId, expressId: o.expressId });
        }
        for (const [a, items] of grouped) this.engine.setEntityOpacity(items, a);
      }
      this.engine.clearHighlights();
      if (v.highlights?.length) {
        const items = v.highlights.map(h => ({ modelId: h.modelId, expressId: h.expressId, color: h.color }));
        this.engine.highlight(items);
      }
      if (v.displayMode) this.engine.setDisplayMode(v.displayMode);
    } catch (e) { console.error(e); }
  }

  _delete(i) {
    const list = load();
    list.splice(i, 1);
    save(list);
    this._render();
  }

  _export() {
    const json = JSON.stringify(load(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `viewpoints-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async _import(file) {
    if (!file) return;
    const text = await file.text();
    try {
      const items = JSON.parse(text);
      if (!Array.isArray(items)) throw new Error('expected array');
      save(items);
      this._render();
    } catch (e) { alert('Import selhal: ' + e.message); }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
