// Schedule — configurable element table with type filter + CSV/JSON export.

const STORE = 'bim_checker_schedule_cols_v1';
const DISPLAY_CAP = 500;

export default class SchedulePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Tabulka prvků';
    this._cols = [];
    this._all = [];      // raw search results (entities)
    this._filter = '';
  }

  async mount() {
    try { this._cols = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { this._cols = []; }
    if (!Array.isArray(this._cols) || this._cols.length === 0) {
      this._cols = [{ pset: '_attr', property: 'ifcType' }, { pset: '_attr', property: 'name' }];
    }
    await this._refresh();
  }

  _msg(kind, text) {
    const box = this.host.querySelector('[data-role="msg"]');
    if (!box) return;
    box.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${kind}">${escapeHtml(text)}</div>` : '';
  }

  _saveCols() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this._cols));
      return true;
    } catch (e) {
      this._msg('err', 'Nastavení sloupců se nepodařilo uložit: ' + (e.message || e));
      return false;
    }
  }

  async _refresh() {
    this._all = (typeof this.engine.search === 'function' ? this.engine.search({}) : []) || [];
    this._render();
    if (typeof this.engine.search !== 'function') {
      this._msg('warn', 'Engine nepodporuje vyhledávání prvků — tabulka je prázdná.');
    }
  }

  _filteredEntities() {
    const f = this._filter.trim().toLowerCase();
    if (!f) return this._all;
    return this._all.filter(e => String(e.ifcType || '').toLowerCase().includes(f));
  }

  _buildRow(e) {
    const row = { _ref: { modelId: e.modelId, expressId: e.expressId }, ifcType: e.ifcType, name: e.name, guid: e.guid };
    for (const c of this._cols) {
      if (c.pset === '_attr') row[`${c.pset}.${c.property}`] = e[c.property] ?? '';
      else row[`${c.pset}.${c.property}`] = this.engine.getPropertyValue?.(e.modelId, e.expressId, c.pset, c.property) ?? '';
    }
    return row;
  }

  _render() {
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Sloupce</h4>
        <div class="v3d-panel__field">
          <div class="v3d-panel__pills">
            ${this._cols.map((c, i) => `<button class="v3d-pill" data-rm-col="${i}" title="Odebrat sloupec ${escapeAttr(c.pset === '_attr' ? c.property : c.pset + ' / ' + c.property)}">${escapeHtml(c.property)} ✕</button>`).join('')}
          </div>
        </div>
        <div data-role="addbox"></div>
        <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="add-col">＋ Přidat sloupec</button>
      </div>
      <div class="v3d-panel__section">
        <h4>Filtr</h4>
        <input class="v3d-panel__input" data-role="filter" placeholder="Filtrovat dle IFC typu… (např. IfcWall)" value="${escapeAttr(this._filter)}">
      </div>
      <div data-role="msg"></div>
      <div class="v3d-panel__section">
        <h4>Prvky</h4>
        <p class="v3d-panel__hint" data-role="count"></p>
        <div data-role="rows"></div>
      </div>
      <hr class="v3d-panel__divider">
      <div class="v3d-panel__row">
        <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--block" data-act="csv">⇣ CSV</button>
        <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--block" data-act="json">⇣ JSON</button>
        <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="refresh" title="Obnovit data z modelu">↻</button>
      </div>
    `;

    this.host.querySelector('[data-act="add-col"]').addEventListener('click', () => this._addCol());
    this.host.querySelector('[data-act="csv"]').addEventListener('click', () => this._exportCsv());
    this.host.querySelector('[data-act="json"]').addEventListener('click', () => this._exportJson());
    this.host.querySelector('[data-act="refresh"]').addEventListener('click', () => this._refresh());
    this.host.querySelector('[data-role="filter"]').addEventListener('input', (e) => {
      this._filter = e.target.value;
      this._renderRows();
    });
    this.host.querySelectorAll('[data-rm-col]').forEach(b => b.addEventListener('click', () => {
      this._cols.splice(parseInt(b.dataset.rmCol, 10), 1);
      this._saveCols();
      this._render();
    }));

    this._renderRows();
  }

  _renderRows() {
    const rowsBox = this.host.querySelector('[data-role="rows"]');
    const countEl = this.host.querySelector('[data-role="count"]');
    if (!rowsBox || !countEl) return;

    const filtered = this._filteredEntities();
    const shown = filtered.slice(0, DISPLAY_CAP);
    countEl.textContent = `Zobrazeno ${shown.length} z ${filtered.length} prvků · klik = přiblížit prvek`;

    if (filtered.length === 0) {
      countEl.textContent = '';
      rowsBox.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">📋</div>
          <p>${this._all.length === 0 ? 'Žádné prvky. Načtěte nejprve model.' : 'Filtru neodpovídá žádný prvek.'}</p>
        </div>`;
      return;
    }

    rowsBox.innerHTML = shown.map((e) => {
      const row = this._buildRow(e);
      const first = this._cols[0];
      const title = first ? String(row[`${first.pset}.${first.property}`] ?? '') : (e.name || '');
      const sub = this._cols.slice(1)
        .map(c => `${escapeHtml(c.property)}: ${escapeHtml(String(row[`${c.pset}.${c.property}`] ?? '') || '—')}`)
        .join(' · ');
      return `
        <div class="v3d-panel__item" data-mid="${escapeAttr(e.modelId)}" data-eid="${e.expressId}" title="Klik = přiblížit prvek">
          <div class="v3d-panel__item-main">
            <div class="v3d-panel__item-title">${escapeHtml(title || '—')}</div>
            ${sub ? `<div class="v3d-panel__item-sub">${sub}</div>` : ''}
          </div>
          <span class="v3d-panel__item-btn" aria-hidden="true">⌖</span>
        </div>`;
    }).join('');

    rowsBox.querySelectorAll('[data-mid]').forEach(el => el.addEventListener('click', () => {
      if (typeof this.engine.focusEntity !== 'function') {
        this._msg('warn', 'Engine nepodporuje přiblížení na prvek.');
        return;
      }
      this.engine.focusEntity(el.dataset.mid, parseInt(el.dataset.eid, 10));
    }));
  }

  async _addCol() {
    const box = this.host.querySelector('[data-role="addbox"]');
    if (!box) return;
    if (typeof this.engine.getAvailableProperties !== 'function') {
      this._msg('warn', 'Engine nenabízí seznam dostupných vlastností.');
      return;
    }
    const props = (await this.engine.getAvailableProperties()) || [];
    if (props.length === 0) {
      this._msg('warn', 'V modelu nebyly nalezeny žádné vlastnosti.');
      return;
    }
    const choices = props.slice(0, 200);
    box.innerHTML = `
      <div class="v3d-panel__field">
        <label>Nový sloupec</label>
        <select class="v3d-panel__select" data-role="col-pick">
          ${choices.map(p => `<option value="${escapeAttr(p.pset + '|' + p.property)}">${escapeHtml(p.pset)} / ${escapeHtml(p.property)} (${p.count})</option>`).join('')}
        </select>
      </div>
      <div class="v3d-panel__row v3d-panel__field">
        <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--sm" data-act="col-confirm">Přidat</button>
        <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="col-cancel">Zrušit</button>
      </div>
    `;
    box.querySelector('[data-act="col-confirm"]').addEventListener('click', () => {
      const [pset, property] = box.querySelector('[data-role="col-pick"]').value.split('|');
      this._cols.push({ pset, property });
      this._saveCols();
      this._render();
    });
    box.querySelector('[data-act="col-cancel"]').addEventListener('click', () => { box.innerHTML = ''; });
  }

  _exportRows() {
    return this._filteredEntities().map(e => this._buildRow(e));
  }

  _exportCsv() {
    const rows = this._exportRows();
    if (rows.length === 0) { this._msg('warn', 'Není co exportovat.'); return; }
    const safe = (s) => { const v = String((s === null || s === undefined) ? "" : s); return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; };
    const head = this._cols.map(c => safe(c.property)).join(',');
    const body = rows.map(r => this._cols.map(c => `"${safe(r[`${c.pset}.${c.property}`]).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(new Blob(['﻿', head, '\n', body], { type: 'text/csv;charset=utf-8' }), `schedule-${Date.now()}.csv`);
    this._msg('ok', `CSV staženo (${rows.length} řádků).`);
  }

  _exportJson() {
    const rows = this._exportRows();
    if (rows.length === 0) { this._msg('warn', 'Není co exportovat.'); return; }
    download(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), `schedule-${Date.now()}.json`);
    this._msg('ok', `JSON stažen (${rows.length} řádků).`);
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
