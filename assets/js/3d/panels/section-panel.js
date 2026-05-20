// Section panel — axis-aligned planes + free planes + DXF export.

export default class SectionPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Řez modelem';
  }

  mount() { this._render(); }

  _render() {
    const planes = this.engine.getSectionPlanes?.() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__pills">
        <button class="v3d-pill" data-axis="X">⊕ X</button>
        <button class="v3d-pill" data-axis="Y">⊕ Y</button>
        <button class="v3d-pill" data-axis="Z">⊕ Z</button>
        <button class="v3d-pill" data-act="clear">Vyčistit</button>
      </div>
      <p class="v3d-panel__hint">Nová rovina v aktuálním středu scény.</p>
      <ul class="v3d-panel__list" style="margin-top:8px">
        ${planes.map(p => `
          <li>
            <span style="flex:1">${escapeHtml(p.name || '#' + p.id)} <small style="color:var(--text-tertiary)">offset ${(p.offset ?? 0).toFixed(2)}</small></span>
            <button class="v3d-pill" data-act="flip" data-id="${p.id}">↔</button>
            <button class="v3d-pill" data-act="vis" data-id="${p.id}">${p.visible === false ? '◌' : '●'}</button>
            <button class="v3d-pill" data-act="dxf" data-id="${p.id}">DXF</button>
            <button class="v3d-pill" data-act="rm" data-id="${p.id}">✕</button>
          </li>
        `).join('') || '<li style="color:var(--text-tertiary)">Žádné roviny</li>'}
      </ul>
    `;
    this.host.querySelectorAll('[data-axis]').forEach((b) => b.addEventListener('click', () => this._add(b.dataset.axis)));
    this.host.querySelector('[data-act="clear"]').addEventListener('click', () => { this.engine.clearSectionPlanes?.(); this._render(); });
    this.host.querySelectorAll('[data-act="flip"]').forEach((b) => b.addEventListener('click', () => { this.engine.updateSectionPlane?.(b.dataset.id, { flip: true }); this._render(); }));
    this.host.querySelectorAll('[data-act="vis"]').forEach((b) => b.addEventListener('click', () => {
      const p = (this.engine.getSectionPlanes() || []).find(x => x.id === b.dataset.id);
      this.engine.updateSectionPlane?.(b.dataset.id, { visible: !(p?.visible !== false) });
      this._render();
    }));
    this.host.querySelectorAll('[data-act="rm"]').forEach((b) => b.addEventListener('click', () => { this.engine.removeSectionPlane?.(b.dataset.id); this._render(); }));
    this.host.querySelectorAll('[data-act="dxf"]').forEach((b) => b.addEventListener('click', () => this._exportDxf(b.dataset.id)));
  }

  _add(axis) {
    // Use scene center as point; normal aligns with axis.
    const n = axis === 'X' ? [1, 0, 0] : axis === 'Y' ? [0, 1, 0] : [0, 0, 1];
    this.engine.addSectionPlane([0, 0, 0], n);
    this._render();
  }

  async _exportDxf(planeId) {
    try {
      const curves = this.engine.computeSectionCurves?.(planeId);
      if (!curves || curves.length === 0) { alert('Žádné křivky pro tuto rovinu.'); return; }
      const dxf = curvesToDxf(curves);
      const blob = new Blob([dxf], { type: 'application/dxf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `section-${planeId}.dxf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      console.error(e); alert('Export DXF selhal: ' + e.message);
    }
  }

  destroy() {}
}

function curvesToDxf(curves) {
  const lines = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const c of curves) {
    const layer = c.ifcType || 'IFC';
    for (const loop of (c.loops || [])) {
      const pts = loop.points || [];
      if (pts.length < 2) continue;
      lines.push('0', 'POLYLINE', '8', layer, '66', '1', '70', loop.closed ? '1' : '0', '10', '0', '20', '0', '30', '0');
      for (const p of pts) {
        lines.push('0', 'VERTEX', '8', layer, '10', String(p[0] ?? p.x ?? 0), '20', String(p[1] ?? p.y ?? 0), '30', String(p[2] ?? p.z ?? 0));
      }
      lines.push('0', 'SEQEND');
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
