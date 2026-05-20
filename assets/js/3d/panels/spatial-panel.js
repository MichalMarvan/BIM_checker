// Spatial tree — Project → Site → Building → Storey → Element grouping.

export default class SpatialPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Strom modelu';
  }

  mount() { this._render(); }

  _render() {
    const models = this.engine.getModels?.() || [];
    if (models.length === 0) {
      this.host.innerHTML = '<p class="v3d-panel__hint">Žádný model.</p>';
      return;
    }
    const sections = models.map(m => {
      const tree = this.engine.getSpatialHierarchy?.(m.modelId);
      return `
        <div class="v3d-panel__section">
          <h4>${escapeHtml(m.name)}</h4>
          ${tree ? this._renderNode(tree, m.modelId, 0) : '<p style="color:var(--text-tertiary)">Strom není dostupný</p>'}
        </div>
      `;
    }).join('');
    this.host.innerHTML = sections;
    this.host.querySelectorAll('[data-node]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mid = el.dataset.mid;
        const eid = parseInt(el.dataset.eid, 10);
        // Collect descendants
        const ids = collectIds(el);
        this.engine.clearHighlights();
        this.engine.highlight(ids.map(x => ({ modelId: mid, expressId: x })), '#facc15');
        if (eid) this.engine.focusEntity?.(mid, eid);
      });
    });
  }

  _renderNode(node, modelId, depth) {
    const indent = depth * 12;
    const children = (node.children || []).slice(0, 200);
    const elemIds = (node.elements || []).slice(0, 50);
    return `
      <div data-node data-mid="${modelId}" data-eid="${node.expressId || ''}" style="padding-left:${indent}px;font-size:11px;cursor:pointer;line-height:1.5">
        <strong>${escapeHtml(node.type || '?')}</strong> ${escapeHtml(node.name || '#' + node.expressId)}
        ${elemIds.length ? `<small style="color:var(--text-tertiary)"> · ${node.elements.length} prvků</small>` : ''}
      </div>
      ${children.map(c => this._renderNode(c, modelId, depth + 1)).join('')}
    `;
  }

  destroy() {}
}

function collectIds(rootEl) {
  // For now, just the entity itself; expand to children if you need deep highlight
  const eid = parseInt(rootEl.dataset.eid, 10);
  return eid ? [eid] : [];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
