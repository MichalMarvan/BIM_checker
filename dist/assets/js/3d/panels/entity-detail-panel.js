// Full properties of the currently selected entity (or first of N).

export default class EntityDetailPanel {
  constructor({ engine, host, titleEl, ctx }) {
    this.engine = engine;
    this.host = host;
    this.titleEl = titleEl;
    this.ctx = ctx || {};
    this._unsub = null;
  }

  mount() {
    this._render();
    // Auto-refresh on selection change
    this._handler = () => this._render();
    this.engine.on?.('selectionChanged', this._handler);
  }

  _render() {
    const sel = this.engine.getSelectedEntities?.() || this.ctx.selection || [];
    if (sel.length === 0) {
      this.titleEl.textContent = 'Detail prvku';
      this.host.innerHTML = '<p class="v3d-panel__hint">Žádný vybraný prvek.</p>';
      return;
    }
    const first = sel[0];
    const meta = this.engine.getEntityMeta?.(first.modelId, first.expressId) || {};
    const props = this.engine.getProperties?.(first.modelId, first.expressId);
    this.titleEl.textContent = sel.length > 1 ? `Detail (${sel.length} prvků)` : 'Detail prvku';

    const sections = [];
    sections.push(`
      <div class="v3d-panel__section">
        <h4>${escapeHtml(meta.ifcType || props?.category || '?')}</h4>
        <div class="v3d-panel__field"><label>Jméno</label> ${escapeHtml(meta.name || props?.name || '—')}</div>
        <div class="v3d-panel__field"><label>GUID</label> <code style="font-family:ui-monospace,monospace;font-size:11px">${escapeHtml(meta.guid || props?.guid || '—')}</code></div>
        <div class="v3d-panel__field"><label>Express ID</label> ${first.expressId} <small style="color:var(--text-tertiary)">(model ${escapeHtml(first.modelId)})</small></div>
      </div>
    `);

    if (props?.attributes?.length) {
      sections.push(`
        <div class="v3d-panel__section">
          <h4>Atributy</h4>
          ${props.attributes.map(a => `<div class="v3d-panel__field"><label>${escapeHtml(a.name)}</label> ${escapeHtml(String(a.value ?? ''))}</div>`).join('')}
        </div>
      `);
    }

    for (const pset of (props?.propertySets || [])) {
      sections.push(`
        <div class="v3d-panel__section">
          <h4>${escapeHtml(pset.name)}</h4>
          ${(pset.properties || []).map(p => `
            <div class="v3d-panel__field"><label>${escapeHtml(p.name)}</label> ${escapeHtml(String(p.value ?? ''))}</div>
          `).join('') || '<p class="v3d-panel__hint">Prázdný PSet</p>'}
        </div>
      `);
    }

    if (sel.length > 1) {
      sections.push(`
        <div class="v3d-panel__section">
          <h4>Další vybrané (${sel.length - 1})</h4>
          <ul class="v3d-panel__list">
            ${sel.slice(1, 21).map(s => `<li>${escapeHtml(s.ifcType || '?')} #${s.expressId}</li>`).join('')}
            ${sel.length > 21 ? `<li style="color:var(--text-tertiary)">…a dalších ${sel.length - 21}</li>` : ''}
          </ul>
        </div>
      `);
    }

    this.host.innerHTML = sections.join('');
  }

  destroy() {
    if (this._handler) this.engine.off?.('selectionChanged', this._handler);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
