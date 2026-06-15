// Diff — compare two loaded IFC models.

const TABS = [
  { key: 'added', label: '＋ Přidáno' },
  { key: 'removed', label: '− Odebráno' },
  { key: 'modified', label: 'Δ Změněno' },
  { key: 'moved', label: '⇄ Přesunuto' },
];
const MAX_ROWS = 100;

export default class DiffPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    this.result = null;
    this.activeTab = 'added';
    this.busy = false;
    this.msg = null;       // { type, text }
    this.selA = null;
    this.selB = null;
    this._pulse = null;
    titleEl.textContent = 'Porovnání verzí (diff)';
  }

  mount() { this._render(); }

  _render() {
    const models = this.engine.getModels?.() || [];
    if (models.length < 2) {
      this.host.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">🔀</div>
          <p>Pro porovnání verzí načtěte<br>alespoň dva modely.</p>
        </div>`;
      return;
    }
    if (this.selA === null) this.selA = models[0].modelId;
    if (this.selB === null) this.selB = models[1].modelId;

    const opts = (sel) => models.map(m =>
      `<option value="${m.modelId}" ${m.modelId === sel ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');

    this.host.innerHTML = `
      <div class="v3d-panel__field">
        <label>Verze A (starší)</label>
        <select class="v3d-panel__select" data-role="a" ${this.busy ? 'disabled' : ''}>${opts(this.selA)}</select>
      </div>
      <div class="v3d-panel__field">
        <label>Verze B (novější)</label>
        <select class="v3d-panel__select" data-role="b" ${this.busy ? 'disabled' : ''}>${opts(this.selB)}</select>
      </div>
      <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="run" ${this.busy ? 'disabled' : ''}>🔀 Porovnat verze</button>
      ${this.busy ? '<div class="v3d-panel__progress" data-role="prog"><span></span></div><p class="v3d-panel__hint">Porovnávám modely…</p>' : ''}
      ${this.msg ? `<div class="v3d-panel__msg v3d-panel__msg--${this.msg.type}">${escapeHtml(this.msg.text)}</div>` : ''}
      ${this._resultHtml()}
    `;

    this.host.querySelector('[data-role="a"]').addEventListener('change', (e) => { this.selA = e.target.value; });
    this.host.querySelector('[data-role="b"]').addEventListener('change', (e) => { this.selB = e.target.value; });
    this.host.querySelector('[data-role="run"]').addEventListener('click', () => this._run());

    if (this.result) {
      this.host.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
        this.activeTab = b.dataset.tab;
        this._render();
      }));
      this._bindRowFocus();
    }
    if (this.busy) this._startPulse();
  }

  _resultHtml() {
    const r = this.result;
    if (!r) return '';
    const counts = {
      added: r.added?.length || 0,
      removed: r.removed?.length || 0,
      modified: r.modified?.length || 0,
      moved: r.moved?.length || 0,
    };
    const total = counts.added + counts.removed + counts.modified + counts.moved;
    const summary = total === 0
      ? '<div class="v3d-panel__msg v3d-panel__msg--ok">✓ Modely jsou shodné — žádné rozdíly.</div>'
      : `<div class="v3d-panel__pills">
           <span class="v3d-panel__badge">＋ ${counts.added}</span>
           <span class="v3d-panel__badge">− ${counts.removed}</span>
           <span class="v3d-panel__badge">Δ ${counts.modified}</span>
           <span class="v3d-panel__badge">⇄ ${counts.moved}</span>
         </div>
         <p class="v3d-panel__hint">Beze změny: ${r.unchanged_count ?? '?'} prvků</p>`;
    const tabs = TABS.map(t =>
      `<button class="v3d-pill${this.activeTab === t.key ? ' active' : ''}" data-tab="${t.key}">${t.label} (${counts[t.key]})</button>`).join('');
    return `
      <div class="v3d-panel__section">
        <h4>Výsledek</h4>
        ${summary}
        ${total > 0 ? `<div class="v3d-panel__pills">${tabs}</div>${this._rowsHtml()}` : ''}
      </div>`;
  }

  _rowsHtml() {
    const rows = this.result?.[this.activeTab] || [];
    if (rows.length === 0) return '<p class="v3d-panel__hint">V této kategorii nejsou žádné prvky.</p>';
    const html = rows.slice(0, MAX_ROWS).map((row, i) => {
      const ref = row.v2 || row.v1 || row;   // modified/moved nest refs under v1/v2
      const sub = this.activeTab === 'modified'
        ? `${row.changes?.length || 0} změněných vlastností`
        : (ref.guid || '#' + (ref.expressId ?? '?'));
      const canFocus = ref.modelId && ref.expressId && typeof this.engine.focusEntity === 'function';
      return `
        <div class="v3d-panel__item" data-row="${i}">
          <div class="v3d-panel__item-main">
            <div class="v3d-panel__item-title">${escapeHtml(ref.ifcType || '?')} ${escapeHtml(ref.name || '')}</div>
            <div class="v3d-panel__item-sub">${escapeHtml(String(sub))}</div>
          </div>
          ${canFocus ? `<button class="v3d-panel__item-btn" data-focus="${i}" title="Přiblížit kameru">📷</button>` : ''}
        </div>`;
    }).join('');
    const more = rows.length > MAX_ROWS
      ? `<p class="v3d-panel__hint">Zobrazeno prvních ${MAX_ROWS} z ${rows.length} prvků.</p>` : '';
    return html + more;
  }

  _bindRowFocus() {
    this.host.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = (this.result?.[this.activeTab] || [])[parseInt(b.dataset.focus, 10)];
      const ref = row?.v2 || row?.v1 || row;
      if (ref?.modelId && ref?.expressId) this.engine.focusEntity?.(ref.modelId, ref.expressId);
    }));
  }

  async _run() {
    if (this.busy) return;
    if (this.selA === this.selB) {
      this.msg = { type: 'warn', text: 'Vyberte dva různé modely.' };
      this._render();
      return;
    }
    if (typeof this.engine.computeDiff !== 'function') {
      this.msg = { type: 'warn', text: 'Porovnání verzí není v této verzi engine k dispozici.' };
      this._render();
      return;
    }
    this.busy = true;
    this.msg = null;
    this.result = null;
    this._render();
    await new Promise(r => setTimeout(r, 50)); // let the progress bar paint
    try {
      this.result = this.engine.computeDiff(this.selA, this.selB);
      this.activeTab = 'added';
      if (this.result?.stats?.error) {
        this.msg = { type: 'err', text: 'Diff selhal: ' + this.result.stats.error };
        this.result = null;
      }
    } catch (e) {
      console.error(e);
      this.msg = { type: 'err', text: 'Diff selhal: ' + (e.message || e) };
    }
    this._stopPulse();
    this.busy = false;
    this._render();
  }

  _startPulse() {
    this._stopPulse();
    const span = this.host.querySelector('[data-role="prog"] span');
    if (!span) return;
    let w = 10, dir = 1;
    span.style.width = w + '%';
    this._pulse = setInterval(() => {
      w += dir * 8;
      if (w >= 90) dir = -1;
      else if (w <= 10) dir = 1;
      span.style.width = w + '%';
    }, 150);
  }

  _stopPulse() {
    if (this._pulse) { clearInterval(this._pulse); this._pulse = null; }
  }

  destroy() { this._stopPulse(); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
