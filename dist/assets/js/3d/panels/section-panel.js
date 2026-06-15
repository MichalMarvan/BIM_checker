// Section panel — interactive cut planes:
//  • by face   — click a surface, plane lies in that face
//  • ⊥ edge    — snap to an edge, plane perpendicular to it (3D tangent)
//  • vertical  — snap to an edge, vertical plane ⊥ to the edge's plan direction
// Plus per-plane offset slider, flip, visibility, DXF export.

const MODES = {
  face: { icon: '▱', label: 'Plochou', hint: 'Klikněte na plochu — řez se položí přesně do ní.' },
  edge: { icon: '⊥', label: 'Kolmo k hraně', hint: 'Najeďte na hranu a klikněte — řez bude kolmý na hranu.' },
  vertical: { icon: '⊟', label: 'Svislý k hraně', hint: 'Najeďte na hranu a klikněte — svislý řez kolmý na půdorysný směr hrany.' },
};

export default class SectionPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Řez modelem';
    this._msg = null;
    this._mode = null;       // active pick mode id | null
    this._pickCleanup = null;
  }

  mount() { this._render(); }

  _render() {
    const planes = this.engine.getSectionPlanes?.() || [];
    const msg = this._msg;
    this._msg = null;

    const modeBtns = Object.entries(MODES).map(([id, m]) => `
      <button class="v3d-panel__btn v3d-panel__btn--sm ${this._mode === id ? 'v3d-panel__btn--primary' : ''}"
              data-mode="${id}" title="${m.hint}">${m.icon} ${m.label}</button>`).join('');

    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Nová rovina řezu</h4>
        <div class="v3d-panel__pills">${modeBtns}</div>
        <p class="v3d-panel__hint" data-role="hint">${this._mode ? MODES[this._mode].hint : 'Vyberte způsob zadání roviny.'}</p>
      </div>
      <div data-role="status">${msg ? `<div class="v3d-panel__msg v3d-panel__msg--${msg.type}">${escapeHtml(msg.text)}</div>` : ''}</div>
      <hr class="v3d-panel__divider" />
      <div class="v3d-panel__section">
        <h4>Roviny <span class="v3d-panel__badge">${planes.length}</span></h4>
        ${planes.length === 0 ? `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">✂️</div>
            <p>Žádné roviny řezu.<br>Vyberte způsob zadání a klikněte do modelu.</p>
          </div>
        ` : `
          ${planes.map((p) => {
            const visible = p.visible !== false;
            return `
              <div class="v3d-panel__item" style="flex-wrap:wrap">
                <div class="v3d-panel__item-main">
                  <div class="v3d-panel__item-title">${escapeHtml(p.name || '#' + p.id)}</div>
                  <div class="v3d-panel__item-sub">offset ${(p.offset ?? 0).toFixed(2)} m${visible ? '' : ' · skrytá'}</div>
                </div>
                <button class="v3d-panel__item-btn" data-act="flip" data-id="${p.id}" title="Otočit směr řezu">↔</button>
                <button class="v3d-panel__item-btn" data-act="vis" data-id="${p.id}" title="${visible ? 'Skrýt rovinu' : 'Zobrazit rovinu'}">${visible ? '●' : '◌'}</button>
                <button class="v3d-panel__item-btn" data-act="dxf" data-id="${p.id}" title="Exportovat křivky řezu do DXF">⇣</button>
                <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-id="${p.id}" title="Odebrat rovinu">✕</button>
                <input class="v3d-section-offset" type="range" min="-60" max="60" step="0.05" value="${p.offset ?? 0}" data-off="${p.id}"
                       title="Posun roviny podél normály" style="flex:1 1 100%;margin-top:6px;accent-color:var(--primary-color)">
              </div>`;
          }).join('')}
          <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">✕ Odebrat všechny</button>
          <p class="v3d-panel__hint">Posuvník posouvá rovinu podél normály. ⇣ stáhne křivky řezu jako DXF.</p>
        `}
      </div>
    `;

    this.host.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this._toggleMode(b.dataset.mode)));
    this.host.querySelector('[data-act="clear"]')?.addEventListener('click', () => { this.engine.clearSectionPlanes?.(); this._render(); });
    this.host.querySelectorAll('[data-act="flip"]').forEach((b) => b.addEventListener('click', () => { this.engine.updateSectionPlane?.(b.dataset.id, { flip: true }); this._render(); }));
    this.host.querySelectorAll('[data-act="vis"]').forEach((b) => b.addEventListener('click', () => {
      const p = (this.engine.getSectionPlanes() || []).find((x) => x.id === b.dataset.id);
      this.engine.updateSectionPlane?.(b.dataset.id, { visible: !(p?.visible !== false) });
      this._render();
    }));
    this.host.querySelectorAll('[data-act="rm"]').forEach((b) => b.addEventListener('click', () => { this.engine.removeSectionPlane?.(b.dataset.id); this._render(); }));
    this.host.querySelectorAll('[data-act="dxf"]').forEach((b) => b.addEventListener('click', () => this._exportDxf(b.dataset.id)));
    // Offset sliders — live update without a full re-render (keeps the thumb grabbed)
    this.host.querySelectorAll('[data-off]').forEach((s) => s.addEventListener('input', () => {
      this.engine.updateSectionPlane?.(s.dataset.off, { offset: parseFloat(s.value) });
      const sub = s.closest('.v3d-panel__item')?.querySelector('.v3d-panel__item-sub');
      if (sub) sub.textContent = `offset ${parseFloat(s.value).toFixed(2)} m`;
    }));
  }

  _toggleMode(mode) {
    if (this._mode === mode) { this._stopPick(); this._mode = null; this._render(); return; }
    this._mode = mode;
    this._render();
    this._startPick();
  }

  _canvas() { return document.querySelector('#viewerContainer canvas'); }

  _startPick() {
    this._stopPick();
    const canvas = this._canvas();
    if (!canvas) { this._setStatus('Plátno vieweru nenalezeno — načtěte model.', 'warn'); return; }

    const xy = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    const onMove = (e) => {
      const [x, y] = xy(e);
      if (this._mode === 'face') {
        this.engine.showSectionGhostFromClient?.(x, y);
      } else {
        const edge = this.engine.pickEdgeAt?.(x, y);
        if (edge) this.engine.showMeasureSnapPreview?.(edge.point, 'edge');
        else this.engine.hideMeasureSnapPreview?.();
      }
    };

    const onClick = (e) => {
      const [x, y] = xy(e);
      if (this._mode === 'face') {
        const f = this.engine.pickFace?.(x, y);
        if (!f || !f.normal) { this._setStatus('Mimo plochu — klikněte na povrch prvku.', 'warn'); this._render(); return; }
        this.engine.addSectionPlane(f.point, f.normal);
        this._finish('Řez položen do plochy.');
      } else {
        const edge = this.engine.pickEdgeAt?.(x, y);
        if (!edge) { this._setStatus('Mimo hranu — najeďte přesně na hranu prvku.', 'warn'); this._render(); return; }
        let normal = edge.tangent;
        if (this._mode === 'vertical') {
          const [tx, , tz] = edge.tangent;
          const len = Math.hypot(tx, tz);
          if (len < 1e-6) { this._setStatus('Hrana je svislá — svislý řez na ni nelze sestrojit.', 'warn'); this._render(); return; }
          normal = [tx / len, 0, tz / len];   // horizontal → vertical cutting plane
        }
        this.engine.addSectionPlane(edge.point, normal);
        this._finish(this._mode === 'vertical' ? 'Svislý řez kolmý na hranu vytvořen.' : 'Řez kolmý na hranu vytvořen.');
      }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.style.cursor = 'crosshair';
    this._pickCleanup = () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      canvas.style.cursor = '';
      this.engine.hideSectionGhost?.();
      this.engine.hideMeasureSnapPreview?.();
    };
  }

  _stopPick() {
    if (this._pickCleanup) { this._pickCleanup(); this._pickCleanup = null; }
  }

  _finish(text) {
    this._stopPick();
    this._mode = null;
    this._msg = { text, type: 'ok' };
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
        this._setStatus('Žádné křivky — rovina nejspíš neprotíná geometrii.', 'warn');
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

  destroy() { this._stopPick(); }
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
