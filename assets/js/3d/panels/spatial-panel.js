// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Michal Marvan
//
// Spatial tree — Project → Site → Building → Storey → Element grouping.
// Click highlights the node's WHOLE subtree (all contained elements),
// double-click isolates it; arrows expand/collapse.

const HIGHLIGHT_CAP = 3000;

export default class SpatialPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    this.nodes = [];          // flat registry: index → { node, modelId }
    this.expanded = new Set();
    this.activeNi = null;
    titleEl.textContent = 'Strom modelu';
  }

  mount() {
    const models = this.engine.getModels?.() || [];
    this.trees = models.map(m => ({
      modelId: m.modelId,
      name: m.name,
      tree: this.engine.getSpatialHierarchy?.(m.modelId) || null,
    }));
    // Expand the first two levels by default
    this.nodes = [];
    for (const t of this.trees) {
      if (t.tree) this._indexNode(t.tree, t.modelId, 0);
    }
    this._render();
  }

  _indexNode(node, modelId, depth) {
    const ni = this.nodes.length;
    this.nodes.push({ node, modelId, depth });
    if (depth < 2) this.expanded.add(ni);
    for (const c of (node.children || [])) this._indexNode(c, modelId, depth + 1);
    return ni;
  }

  _collectDeepIds(node, out) {
    if (out.length >= HIGHLIGHT_CAP) return out;
    if (node.expressId) out.push(node.expressId);
    for (const el of (node.elements || [])) {
      if (out.length >= HIGHLIGHT_CAP) return out;
      // getSpatialHierarchy returns element OBJECTS ({expressId, type, …})
      out.push(typeof el === 'object' ? el.expressId : el);
    }
    for (const c of (node.children || [])) this._collectDeepIds(c, out);
    return out;
  }

  _countDeep(node) {
    let n = (node.elements || []).length;
    for (const c of (node.children || [])) n += this._countDeep(c);
    return n;
  }

  _render() {
    if (!this.trees.some(t => t.tree)) {
      this.host.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">🌳</div>
          <p>Žádný model, nebo IFC neobsahuje prostorovou strukturu.</p>
        </div>`;
      return;
    }

    let html = '<p class="v3d-panel__hint">Klik = zvýraznit větev · dvojklik = izolovat · ✕ zrušit</p>';
    html += '<button class="v3d-panel__btn v3d-panel__btn--sm" data-clear style="margin:6px 0 10px">✕ Zrušit zvýraznění</button>';
    let ni = 0;
    const renderNode = (entry) => {
      const { node, depth } = entry;
      const myNi = ni++;
      const kids = node.children || [];
      const isOpen = this.expanded.has(myNi);
      const deepCount = this._countDeep(node);
      let s = `
        <div class="v3d-tree-node${this.activeNi === myNi ? ' is-active' : ''}" data-ni="${myNi}"
             style="padding-left:${6 + depth * 13}px">
          <span class="v3d-tree-node__arrow" data-arrow="${myNi}">${kids.length ? (isOpen ? '▾' : '▸') : ''}</span>
          <span class="v3d-tree-node__type">${escapeHtml(shortType(node.type))}</span>
          <span class="v3d-tree-node__name">${escapeHtml(node.name || ('#' + (node.expressId || '')))}</span>
          ${deepCount ? `<span class="v3d-tree-node__count">${deepCount}</span>` : ''}
        </div>`;
      if (isOpen) {
        for (const c of kids) {
          // children follow in this.nodes order — find their entries by walking ni
          s += renderNode(this.nodes[ni]);
        }
      } else {
        // skip the hidden subtree in the flat index
        ni += countSubtree(node) - 1;
      }
      return s;
    };
    for (let i = 0; i < this.nodes.length;) {
      if (this.nodes[i].depth === 0) {
        ni = i;
        html += renderNode(this.nodes[i]);
        i = ni;
      } else {
        i++;
      }
    }
    this.host.innerHTML = html;

    this.host.querySelector('[data-clear]')?.addEventListener('click', () => {
      this.engine.clearHighlights?.();
      this.engine.showAll?.();
      this.activeNi = null;
      this._render();
    });

    this.host.querySelectorAll('.v3d-tree-node').forEach(el => {
      const myNi = parseInt(el.dataset.ni, 10);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const entry = this.nodes[myNi];
        if (!entry) return;
        // Arrow click toggles expansion only
        if (e.target.dataset.arrow !== undefined && (entry.node.children || []).length) {
          if (this.expanded.has(myNi)) this.expanded.delete(myNi);
          else this.expanded.add(myNi);
          this._render();
          return;
        }
        const ids = this._collectDeepIds(entry.node, []);
        this.engine.clearHighlights?.();
        this.engine.highlight?.(ids.map(x => ({ modelId: entry.modelId, expressId: x })), 0xfacc15);
        if (entry.node.expressId) this.engine.focusEntity?.(entry.modelId, entry.node.expressId);
        this.activeNi = myNi;
        this._render();
      });
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const entry = this.nodes[myNi];
        if (!entry) return;
        const ids = this._collectDeepIds(entry.node, []);
        this.engine.isolateEntities?.(ids.map(x => ({ modelId: entry.modelId, expressId: x })));
      });
    });
  }

  destroy() {}
}

function countSubtree(node) {
  let n = 1;
  for (const c of (node.children || [])) n += countSubtree(c);
  return n;
}

function shortType(t) {
  return String(t || '?').replace(/^IFC/i, '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
