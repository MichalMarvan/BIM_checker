// Section panel — axis-aligned planes + free planes + DXF export.

export default class SectionPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Řez modelem';
    this._msg = null; // jednorázová zpráva pro příští render
  }

  mount() { this._render(); }

  _render() {
    const planes = this.engine.getSectionPlanes?.() || [];
    const activeAxes = new Set(planes.map(p => axisOf(p.normal)).filter(Boolean));
    const msg = this._msg;
    this._msg = null;
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Přidat rovinu řezu</h4>
        <div class="v3d-panel__pills">
          <button class="v3d-pill ${activeAxes.has('X') ? 'active' : ''}" data-axis="X" title="Rovina kolmá na osu X">⊕ Osa X</button>
          <button class="v3d-pill ${activeAxes.has('Y') ? 'active' : ''}" data-axis="Y" title="Rovina kolmá na osu Y">⊕ Osa Y</button>
          <button class="v3d-pill ${activeAxes.has('Z') ? 'active' : ''}" data-axis="Z" title="Rovina kolmá na osu Z">⊕ Osa Z</button>
        </div>
        <p class="v3d-panel__hint">Rovina vznikne ve středu scény, kolmo na zvolenou osu. Zvýrazněné osy už rovinu mají.</p>
      </div>
      <div data-role="status">${msg ? `<div class="v3d-panel__msg v3d-panel__msg--${msg.type}">${escapeHtml(msg.text)}</div>` : ''}</div>
      <hr class="v3d-panel__divider" />
      <div class="v3d-panel__section">
        <h4>Roviny <span class="v3d-panel__badge">${planes.length}</span></h4>
        ${planes.length === 0 ? `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">✂️</div>
            <p>Žádné roviny řezu.<br>Přidejte rovinu tlačítky výše.</p>
          </div>
        ` : `
          ${planes.map(p => {
            const axis = axisOf(p.normal);
            const visible = p.visible !== false;
            return `
              <div class="v3d-panel__item">
                <div class="v3d-panel__item-main">
                  <div class="v3d-panel__item-title">${escapeHtml(p.name || '#' + p.id)}</div>
                  <div class="v3d-panel__item-sub">${axis ? `osa ${axis} · ` : ''}offset ${(p.offset ?? 0).toFixed(2)} m${visible ? '' : ' · skrytá'}</div>
                </div>
                <button class="v3d-panel__item-btn" data-act="flip" data-id="${p.id}" title="Otočit směr řezu">↔</button>
                <button class="v3d-panel__item-btn" data-act="vis" data-id="${p.id}" title="${visible ? 'Skrýt rovinu' : 'Zobrazit rovinu'}">${visible ? '●' : '◌'}</button>
                <button class="v3d-panel__item-btn" data-act="dxf" data-id="${p.id}" title="Exportovat křivky řezu do DXF">⇣</button>
                <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-id="${p.id}" title="Odebrat rovinu">✕</button>
              </div>`;
          }).join('')}
          <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">✕ Odebrat všechny</button>
          <p class="v3d-panel__hint">⇣ stáhne křivky řezu jako DXF.</p>
        `}
      </div>
    `;
    this.host.querySelectorAll('[data-axis]').forEach((b) => b.addEventListener('click', () => this._add(b.dataset.axis)));
    this.host.querySelector('[data-act="clear"]')?.addEventListener('click', () => { this.engine.clearSectionPlanes?.(); this._render(); });
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
    // Axes are presented in IFC/BIM convention (Z = up). The viewer renders
    // in three.js Y-up, so map BIM → three: BIM-Z (vertical, plan cut) →
    // three-Y, BIM-Y (horizontal depth) → three-Z, BIM-X → three-X.
    this.engine.addSectionPlane([0, 0, 0], bimAxisToThreeNormal(axis));
    this._render();
  }

  _setStatus(text, type) {
    const el = this.host.querySelector('[data-role="status"]');
    if (!el) return;
    el.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${type}">${escapeHtml(text)}</div>` : '';
  }

  async _exportDxf(planeId) {
    if (typeof this.engine.computeSectionCurves !== 'function') {
      this._setStatus('Výpočet křivek řezu není v tomto prostředí dostupný.', 'warn');
      return;
    }
    try {
      const curves = this.engine.computeSectionCurves(planeId);
      if (!curves || curves.length === 0) {
        this._setStatus('Žádné křivky pro tuto rovinu — rovina nejspíš neprotíná geometrii.', 'warn');
        return;
      }
      const dxf = curvesToDxf(curves);
      const blob = new Blob([dxf], { type: 'application/dxf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `section-${planeId}.dxf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this._setStatus(`DXF staženo (${curves.length} ${plural(curves.length, 'křivka', 'křivky', 'křivek')}).`, 'ok');
    } catch (e) {
      console.error(e);
      this._setStatus(`Export DXF selhal: ${e.message}`, 'err');
    }
  }

  destroy() {}
}

/** BIM axis letter (Z = up) → three.js Y-up normal vector. */
function bimAxisToThreeNormal(axis) {
  if (axis === 'X') return [1, 0, 0];
  if (axis === 'Z') return [0, 1, 0];   // BIM vertical → three Y
  return [0, 0, 1];                      // BIM Y (depth) → three Z
}

/**
 * Returns the BIM axis letter ('X' | 'Y' | 'Z', Z = up) for an axis-aligned
 * three.js normal, or null. Inverse of bimAxisToThreeNormal: three-Y → 'Z',
 * three-Z → 'Y'.
 */
function axisOf(normal) {
  if (!Array.isArray(normal) || normal.length < 3) return null;
  const [x, y, z] = normal.map(Math.abs);
  if (x > 0.99 && y < 0.01 && z < 0.01) return 'X';
  if (y > 0.99 && x < 0.01 && z < 0.01) return 'Z';  // three-Y is BIM vertical
  if (z > 0.99 && x < 0.01 && y < 0.01) return 'Y';  // three-Z is BIM depth
  return null;
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
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
