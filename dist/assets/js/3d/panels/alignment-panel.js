// Alignment — LandXML import, list, section-at-station.

export default class AlignmentPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Alignment (LandXML)';
  }

  mount() { this._render(); }

  _render() {
    const list = this.engine.getAlignments?.() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__field">
        <label class="v3d-pill" style="cursor:pointer; display:inline-flex">
          ⇡ LandXML
          <input type="file" accept=".xml,.landxml" hidden data-act="upload">
        </label>
        <label style="margin-left:8px"><input type="checkbox" data-role="swap" checked> Swap X/Y (CZ data)</label>
      </div>
      <div class="v3d-panel__field">
        <button class="v3d-pill" data-act="from-ifc">Z IFC (IfcAlignment)</button>
        <button class="v3d-pill" data-act="clear">Smazat vše</button>
      </div>
      <ul class="v3d-panel__list">
        ${list.map(a => `
          <li>
            <span style="flex:1">${escapeHtml(a.name)} <small>${(a.length || 0).toFixed(0)} m</small></span>
            <button class="v3d-pill" data-act="vis" data-id="${a.id}">●</button>
            <button class="v3d-pill" data-act="section" data-id="${a.id}">✂ řez</button>
            <button class="v3d-pill" data-act="rm" data-id="${a.id}">✕</button>
          </li>
        `).join('') || '<li style="color:var(--text-tertiary)">Žádné osy</li>'}
      </ul>
      <div data-role="section-controls"></div>
    `;
    this.host.querySelector('[data-act="upload"]').addEventListener('change', (e) => this._upload(e.target.files[0]));
    this.host.querySelector('[data-act="from-ifc"]').addEventListener('click', () => this._fromIfc());
    this.host.querySelector('[data-act="clear"]').addEventListener('click', () => { this.engine.clearAlignments?.(); this._render(); });
    this.host.querySelectorAll('[data-act="vis"]').forEach(b => b.addEventListener('click', () => { this.engine.setAlignmentVisible?.(b.dataset.id, b.textContent === '●' ? false : true); b.textContent = b.textContent === '●' ? '◌' : '●'; }));
    this.host.querySelectorAll('[data-act="rm"]').forEach(b => b.addEventListener('click', () => { this.engine.removeAlignment?.(b.dataset.id); this._render(); }));
    this.host.querySelectorAll('[data-act="section"]').forEach(b => b.addEventListener('click', () => this._sectionControls(b.dataset.id)));
  }

  async _upload(file) {
    if (!file) return;
    const xml = await file.text();
    const swap = this.host.querySelector('[data-role="swap"]').checked;
    try {
      this.engine.loadAlignment?.(xml, { swapXY: swap });
      this._render();
    } catch (e) { alert('Import selhal: ' + e.message); }
  }

  _fromIfc() {
    const found = this.engine.findIfcAlignments?.() || [];
    if (found.length === 0) { alert('Žádné IfcAlignment v načtených modelech.'); return; }
    for (const a of found) {
      try { this.engine.loadAlignmentFromIfc?.(a.modelId, a.expressId); } catch (e) { console.warn(e); }
    }
    this._render();
  }

  _sectionControls(alignmentId) {
    const a = (this.engine.getAlignments?.() || []).find(x => x.id === alignmentId);
    if (!a) return;
    const host = this.host.querySelector('[data-role="section-controls"]');
    host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Řez na ${escapeHtml(a.name)}</h4>
        <div class="v3d-panel__row">
          <input class="v3d-panel__input" type="range" min="${a.staStart || 0}" max="${a.staEnd || a.length}" step="0.5" data-role="sta">
          <input class="v3d-panel__input" data-role="sta-num" type="number" value="${(a.staStart || 0).toFixed(1)}">
        </div>
        <div class="v3d-panel__pills" data-role="perp">
          <button class="v3d-pill active" data-v="plan">Plan</button>
          <button class="v3d-pill" data-v="3d">3D</button>
          <button class="v3d-pill" data-v="longitudinal">Podélný</button>
        </div>
        <button class="v3d-btn v3d-btn--primary" data-role="create">✂ Vytvořit řez</button>
      </div>
    `;
    const sta = host.querySelector('[data-role="sta"]');
    const num = host.querySelector('[data-role="sta-num"]');
    sta.addEventListener('input', () => { num.value = sta.value; });
    num.addEventListener('input', () => { sta.value = num.value; });
    host.querySelectorAll('[data-role="perp"] .v3d-pill').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll('[data-role="perp"] .v3d-pill').forEach(x => x.classList.toggle('active', x === b));
    }));
    host.querySelector('[data-role="create"]').addEventListener('click', () => {
      const station = parseFloat(num.value);
      const perp = host.querySelector('[data-role="perp"] .v3d-pill.active').dataset.v;
      try { this.engine.createSectionAtStation?.(alignmentId, station, perp); }
      catch (e) { alert('Nepodařilo se: ' + e.message); }
    });
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
