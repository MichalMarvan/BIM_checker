// Alignment — LandXML import, list, section-at-station.

export default class AlignmentPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    this.swapXY = true;
    this.busy = false;
    this.msg = null;          // { type: 'ok'|'warn'|'err', text }
    this._hidden = new Set(); // alignment ids switched off
    titleEl.textContent = 'Osy trasy (LandXML)';
  }

  mount() { this._render(); }

  _render() {
    const list = this.engine.getAlignments?.() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Import</h4>
        <div class="v3d-panel__row">
          <label class="v3d-panel__btn v3d-panel__btn--sm">
            ⇡ LandXML
            <input type="file" accept=".xml,.landxml" hidden data-act="upload" ${this.busy ? 'disabled' : ''}>
          </label>
          <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="from-ifc" ${this.busy ? 'disabled' : ''}>Z IFC (IfcAlignment)</button>
        </div>
        <label class="v3d-panel__toggle">
          <input type="checkbox" data-role="swap" ${this.swapXY ? 'checked' : ''}> Prohodit X/Y (česká data)
        </label>
        ${this.busy ? '<div class="v3d-panel__progress" data-role="prog"><span></span></div><p class="v3d-panel__hint">Načítám trasu…</p>' : ''}
      </div>
      ${this.msg ? `<div class="v3d-panel__msg v3d-panel__msg--${this.msg.type}">${escapeHtml(this.msg.text)}</div>` : ''}
      <div class="v3d-panel__section">
        <h4>Osy (${list.length})</h4>
        ${list.length === 0 ? `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">🛤️</div>
            <p>Žádné osy.<br>Importujte LandXML nebo načtěte IfcAlignment z modelu.</p>
          </div>` : list.map(a => `
          <div class="v3d-panel__item">
            <div class="v3d-panel__item-main">
              <div class="v3d-panel__item-title">${escapeHtml(a.name || '(bez názvu)')}</div>
              <div class="v3d-panel__item-sub">${(a.length || 0).toFixed(0)} m · ${a.elementCount ?? '?'} prvků</div>
            </div>
            <button class="v3d-panel__item-btn" data-act="vis" data-id="${a.id}" title="Zobrazit / skrýt">${this._hidden.has(a.id) ? '🙈' : '👁'}</button>
            <button class="v3d-panel__item-btn" data-act="section" data-id="${a.id}" title="Řez na staničení">✂</button>
            <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-id="${a.id}" title="Odebrat">✕</button>
          </div>`).join('')}
        ${list.length > 0 ? '<button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">✕ Smazat vše</button>' : ''}
      </div>
      <div data-role="section-controls"></div>
    `;

    this.host.querySelector('[data-act="upload"]').addEventListener('change', (e) => this._upload(e.target.files[0]));
    this.host.querySelector('[data-act="from-ifc"]').addEventListener('click', () => this._fromIfc());
    this.host.querySelector('[data-role="swap"]').addEventListener('change', (e) => { this.swapXY = e.target.checked; });
    this.host.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
      if (!confirm('Smazat všechny osy?')) return;
      this.engine.clearAlignments?.();
      this._hidden.clear();
      this.msg = null;
      this._render();
    });
    this.host.querySelectorAll('[data-act="vis"]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      const show = this._hidden.has(id);
      this.engine.setAlignmentVisible?.(id, show);
      if (show) this._hidden.delete(id);
      else this._hidden.add(id);
      b.textContent = show ? '👁' : '🙈';
    }));
    this.host.querySelectorAll('[data-act="rm"]').forEach(b => b.addEventListener('click', () => {
      this.engine.removeAlignment?.(b.dataset.id);
      this._hidden.delete(b.dataset.id);
      this.msg = null;
      this._render();
    }));
    this.host.querySelectorAll('[data-act="section"]').forEach(b => b.addEventListener('click', () => this._sectionControls(b.dataset.id)));

    if (this.busy) this._startPulse();
  }

  async _upload(file) {
    if (!file) return;
    if (typeof this.engine.loadAlignment !== 'function') {
      this.msg = { type: 'warn', text: 'Import LandXML není v této verzi engine k dispozici.' };
      this._render();
      return;
    }
    this.busy = true;
    this.msg = null;
    this._render();
    try {
      const xml = await file.text();
      this.engine.loadAlignment(xml, { swapXY: this.swapXY });
      this.msg = { type: 'ok', text: `✓ LandXML „${file.name}" importováno.` };
    } catch (e) {
      console.error(e);
      this.msg = { type: 'err', text: 'Import selhal: ' + (e.message || e) };
    }
    this._stopPulse();
    this.busy = false;
    this._render();
  }

  _fromIfc() {
    const found = this.engine.findIfcAlignments?.() || [];
    if (found.length === 0) {
      this.msg = { type: 'warn', text: 'Žádné IfcAlignment v načtených modelech.' };
      this._render();
      return;
    }
    let ok = 0, failed = 0;
    for (const a of found) {
      try { this.engine.loadAlignmentFromIfc?.(a.modelId, a.expressId); ok++; }
      catch (e) { console.warn(e); failed++; }
    }
    this.msg = failed === 0
      ? { type: 'ok', text: `✓ Načteno ${ok} os z IFC.` }
      : { type: 'warn', text: `Načteno ${ok} os, ${failed} se nepodařilo (viz konzole).` };
    this._render();
  }

  _sectionControls(alignmentId) {
    const a = (this.engine.getAlignments?.() || []).find(x => x.id === alignmentId);
    if (!a) return;
    const host = this.host.querySelector('[data-role="section-controls"]');
    host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Řez na ${escapeHtml(a.name || '(bez názvu)')}</h4>
        <div class="v3d-panel__field">
          <label>Staničení (m)</label>
          <div class="v3d-panel__row">
            <input class="v3d-panel__input" type="range" min="${a.staStart || 0}" max="${a.staEnd || a.length}" step="0.5" value="${a.staStart || 0}" data-role="sta">
            <input class="v3d-panel__input" data-role="sta-num" type="number" value="${(a.staStart || 0).toFixed(1)}">
          </div>
        </div>
        <div class="v3d-panel__field">
          <label>Orientace roviny</label>
          <div class="v3d-panel__pills" data-role="perp">
            <button class="v3d-pill active" data-v="plan">Půdorys</button>
            <button class="v3d-pill" data-v="3d">3D kolmá</button>
            <button class="v3d-pill" data-v="longitudinal">Podélný</button>
          </div>
        </div>
        <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="create">✂ Vytvořit řez</button>
        <div data-role="sec-msg"></div>
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
      const msgEl = host.querySelector('[data-role="sec-msg"]');
      try {
        this.engine.createSectionAtStation?.(alignmentId, station, perp);
        msgEl.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--ok">✓ Řez vytvořen na staničení ${station.toFixed(1)} m.</div>`;
      } catch (e) {
        msgEl.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--err">Řez se nepodařil: ${escapeHtml(e.message || String(e))}</div>`;
      }
    });
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
