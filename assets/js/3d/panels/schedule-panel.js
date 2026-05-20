// Schedule — configurable element table with CSV/JSON export.

const STORE = 'bim_checker_schedule_cols_v1';

export default class SchedulePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Tabulka prvků';
    this._cols = [];
    this._rows = [];
  }

  async mount() {
    try { this._cols = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { this._cols = []; }
    if (this._cols.length === 0) this._cols = [{ pset: '_attr', property: 'ifcType' }, { pset: '_attr', property: 'name' }];
    await this._refresh();
  }

  async _refresh() {
    const all = this.engine.search?.({}) || [];
    this._rows = all.slice(0, 1000).map(e => {
      const row = { _ref: { modelId: e.modelId, expressId: e.expressId }, ifcType: e.ifcType, name: e.name, guid: e.guid };
      for (const c of this._cols) {
        if (c.pset === '_attr') row[`${c.pset}.${c.property}`] = e[c.property] ?? '';
        else row[`${c.pset}.${c.property}`] = this.engine.getPropertyValue?.(e.modelId, e.expressId, c.pset, c.property) ?? '';
      }
      return row;
    });
    this._render();
  }

  _render() {
    this.host.innerHTML = `
      <div class="v3d-panel__row">
        <button class="v3d-pill" data-act="add-col">＋ Sloupec</button>
        <button class="v3d-pill" data-act="csv">⇣ CSV</button>
        <button class="v3d-pill" data-act="json">⇣ JSON</button>
        <button class="v3d-pill" data-act="refresh">↻</button>
      </div>
      <p class="v3d-panel__hint">${this._rows.length} řádků</p>
      <div style="overflow:auto;max-height:60vh">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead>
            <tr>
              ${this._cols.map((c, i) => `<th style="text-align:left;padding:4px;border-bottom:1px solid var(--border-primary)">${escapeHtml(c.property)}<button data-act="rm-col" data-i="${i}" style="border:none;background:transparent;cursor:pointer;color:var(--text-tertiary)">×</button></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${this._rows.slice(0, 100).map(r => `
              <tr style="cursor:pointer" data-mid="${r._ref.modelId}" data-eid="${r._ref.expressId}">
                ${this._cols.map(c => `<td style="padding:3px 4px;border-bottom:1px solid var(--border-primary)">${escapeHtml(String(r[`${c.pset}.${c.property}`] ?? ''))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    this.host.querySelector('[data-act="add-col"]').addEventListener('click', () => this._addCol());
    this.host.querySelector('[data-act="csv"]').addEventListener('click', () => this._exportCsv());
    this.host.querySelector('[data-act="json"]').addEventListener('click', () => this._exportJson());
    this.host.querySelector('[data-act="refresh"]').addEventListener('click', () => this._refresh());
    this.host.querySelectorAll('[data-act="rm-col"]').forEach(b => b.addEventListener('click', () => {
      this._cols.splice(parseInt(b.dataset.i, 10), 1);
      localStorage.setItem(STORE, JSON.stringify(this._cols));
      this._refresh();
    }));
    this.host.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => {
      this.engine.focusEntity?.(tr.dataset.mid, parseInt(tr.dataset.eid, 10));
    }));
  }

  async _addCol() {
    const props = (await this.engine.getAvailableProperties?.()) || [];
    const choices = props.slice(0, 200);
    const html = choices.map(p => `<option value="${p.pset}|${p.property}">${p.pset} / ${p.property} (${p.count})</option>`).join('');
    const dlg = document.createElement('div');
    dlg.innerHTML = `<select class="v3d-panel__select" id="__col_pick" style="max-width:300px">${html}</select>`;
    dlg.style.cssText = 'position:fixed;top:30%;left:50%;transform:translateX(-50%);background:var(--bg-secondary);padding:12px;border:1px solid var(--border-primary);border-radius:6px;z-index:200';
    document.body.appendChild(dlg);
    const sel = dlg.querySelector('select');
    const btn = document.createElement('button'); btn.textContent = 'Přidat'; btn.className = 'v3d-btn v3d-btn--primary'; btn.style.marginLeft = '8px';
    dlg.appendChild(btn);
    const cancel = document.createElement('button'); cancel.textContent = '×'; cancel.style.cssText = 'border:none;background:transparent;cursor:pointer;float:right';
    dlg.appendChild(cancel);
    btn.addEventListener('click', () => {
      const [pset, property] = sel.value.split('|');
      this._cols.push({ pset, property });
      localStorage.setItem(STORE, JSON.stringify(this._cols));
      dlg.remove();
      this._refresh();
    });
    cancel.addEventListener('click', () => dlg.remove());
  }

  _exportCsv() {
    const safe = (s) => { const v = String(s == null ? '' : s); return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; };
    const head = this._cols.map(c => safe(c.property)).join(',');
    const body = this._rows.map(r => this._cols.map(c => `"${safe(r[`${c.pset}.${c.property}`]).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(new Blob(['﻿', head, '\n', body], { type: 'text/csv;charset=utf-8' }), `schedule-${Date.now()}.csv`);
  }
  _exportJson() {
    download(new Blob([JSON.stringify(this._rows, null, 2)], { type: 'application/json' }), `schedule-${Date.now()}.json`);
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
