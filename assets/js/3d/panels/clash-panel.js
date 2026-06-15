// Clash detection — bbox + mesh BVH.

const TYPE_LABELS = {
  hard: 'Hard',
  clearance: 'Vzdálenost',
  duplicate: 'Duplikát',
};

const MAX_ROWS = 50;

export default class ClashPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    this.settings = { method: 'bbox', pairing: 'all', types: ['hard'], clearanceMm: 50, dupTolMm: 10 };
    this.result = null;     // { clashes, stats, elapsedMs }
    this.running = false;
    this.msg = null;        // { type: 'ok'|'warn'|'err', text }
    this._pulse = null;
    titleEl.textContent = 'Detekce kolizí';
  }

  mount() { this._render(); }

  _render() {
    const s = this.settings;
    const available = typeof this.engine.detectClashes === 'function';
    const pill = (group, v, label, active) =>
      `<button class="v3d-pill${active ? ' active' : ''}" data-group="${group}" data-v="${v}">${label}</button>`;

    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Nastavení</h4>
        <div class="v3d-panel__field">
          <label>Metoda</label>
          <div class="v3d-panel__pills" data-role="method">
            ${pill('method', 'bbox', 'BBox (rychlé)', s.method === 'bbox')}
            ${pill('method', 'mesh', 'Mesh BVH (přesné)', s.method === 'mesh')}
          </div>
        </div>
        <div class="v3d-panel__field">
          <label>Páry</label>
          <div class="v3d-panel__pills" data-role="pairing">
            ${pill('pairing', 'all', 'Všechny proti všem', s.pairing === 'all')}
            ${pill('pairing', 'types', 'Podle typů', s.pairing === 'types')}
          </div>
        </div>
        <div class="v3d-panel__field">
          <label>Typy kolizí</label>
          <div class="v3d-panel__pills" data-role="types">
            ${pill('types', 'hard', 'Hard', s.types.includes('hard'))}
            ${pill('types', 'clearance', 'Vzdálenost', s.types.includes('clearance'))}
            ${pill('types', 'duplicate', 'Duplikáty', s.types.includes('duplicate'))}
          </div>
        </div>
        ${s.types.includes('clearance') ? `
          <div class="v3d-panel__field">
            <label>Minimální vzdálenost (mm)</label>
            <input class="v3d-panel__input" data-role="clearance" type="number" min="0" value="${s.clearanceMm}">
          </div>` : ''}
        ${s.types.includes('duplicate') ? `
          <div class="v3d-panel__field">
            <label>Tolerance duplikátů (mm)</label>
            <input class="v3d-panel__input" data-role="dup-tol" type="number" min="0" value="${s.dupTolMm}">
          </div>` : ''}
      </div>
      ${available ? '' : '<div class="v3d-panel__msg v3d-panel__msg--warn">Detekce kolizí není v této verzi engine k dispozici.</div>'}
      <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-act="run"
        ${this.running || !available ? 'disabled' : ''}>▶ Spustit detekci</button>
      ${this.running ? `
        <div class="v3d-panel__progress" data-role="prog"><span></span></div>
        <p class="v3d-panel__hint">Počítám kolize…</p>` : ''}
      ${this.msg ? `<div class="v3d-panel__msg v3d-panel__msg--${this.msg.type}">${escapeHtml(this.msg.text)}</div>` : ''}
      ${this._resultsHtml()}
    `;

    // Single-select pill groups
    this.host.querySelectorAll('[data-group="method"], [data-group="pairing"]').forEach(b =>
      b.addEventListener('click', () => {
        this.settings[b.dataset.group] = b.dataset.v;
        this._render();
      }));
    // Multi-select clash types
    this.host.querySelectorAll('[data-group="types"]').forEach(b =>
      b.addEventListener('click', () => {
        const v = b.dataset.v;
        const i = this.settings.types.indexOf(v);
        if (i >= 0) this.settings.types.splice(i, 1);
        else this.settings.types.push(v);
        this._render();
      }));
    this.host.querySelector('[data-role="clearance"]')?.addEventListener('change', (e) => {
      this.settings.clearanceMm = parseFloat(e.target.value) || 50;
    });
    this.host.querySelector('[data-role="dup-tol"]')?.addEventListener('change', (e) => {
      this.settings.dupTolMm = parseFloat(e.target.value) || 10;
    });
    this.host.querySelector('[data-act="run"]').addEventListener('click', () => this._run());

    // Click-to-focus on result cards
    this.host.querySelectorAll('[data-clash]').forEach((el) => el.addEventListener('click', () => {
      const c = this.result?.clashes[parseInt(el.dataset.clash, 10)];
      if (!c) return;
      this.engine.clearHighlights?.();
      if (c.a && c.b) {
        this.engine.highlight?.([
          { modelId: c.a.modelId, expressId: c.a.expressId },
          { modelId: c.b.modelId, expressId: c.b.expressId },
        ], '#ef4444');
      }
      if (c.a) this.engine.focusEntity?.(c.a.modelId, c.a.expressId);
    }));

    if (this.running) this._startPulse();
  }

  _resultsHtml() {
    if (!this.result) return '';
    const { clashes, stats, elapsedMs } = this.result;
    const pairs = stats.pairsTested ?? '?';
    const ms = stats.durationMs ?? elapsedMs;
    if (clashes.length === 0) {
      return `<div class="v3d-panel__msg v3d-panel__msg--ok">✓ Žádné kolize — otestováno ${pairs} párů (${ms} ms).</div>`;
    }
    const rows = clashes.slice(0, MAX_ROWS).map((c, i) => {
      const kind = c.type || c.kind || 'hard';
      const dist = kind === 'clearance' && Number.isFinite(c.distance)
        ? ` · mezera ${c.distance.toFixed(0)} mm` : '';
      return `
        <div class="v3d-panel__item" data-clash="${i}" title="Kliknutím přiblížíte kameru">
          <span class="v3d-panel__badge">${escapeHtml(TYPE_LABELS[kind] || kind)}</span>
          <div class="v3d-panel__item-main">
            <div class="v3d-panel__item-title">${escapeHtml(c.a?.ifcType || '?')} ↔ ${escapeHtml(c.b?.ifcType || '?')}</div>
            <div class="v3d-panel__item-sub">${escapeHtml(c.a?.name || '#' + (c.a?.expressId ?? '?'))} · ${escapeHtml(c.b?.name || '#' + (c.b?.expressId ?? '?'))}${dist}</div>
          </div>
          <button class="v3d-panel__item-btn" title="Přiblížit kameru">📷</button>
        </div>`;
    }).join('');
    return `
      <div class="v3d-panel__section">
        <h4>Výsledky</h4>
        <div class="v3d-panel__msg v3d-panel__msg--warn">${clashes.length} kolizí / ${pairs} párů · ${ms} ms</div>
        ${rows}
        ${clashes.length > MAX_ROWS ? `<p class="v3d-panel__hint">Zobrazeno prvních ${MAX_ROWS} z ${clashes.length} kolizí.</p>` : ''}
      </div>`;
  }

  async _run() {
    if (this.running || typeof this.engine.detectClashes !== 'function') return;
    if (this.settings.types.length === 0) {
      this.msg = { type: 'warn', text: 'Vyberte alespoň jeden typ kolize.' };
      this._render();
      return;
    }
    this.running = true;
    this.msg = null;
    this.result = null;
    this._render();
    try {
      const t0 = performance.now();
      const result = await this.engine.detectClashes({
        method: this.settings.method,
        pairing: this.settings.pairing,
        clashTypes: [...this.settings.types],
        clearanceMm: this.settings.clearanceMm,
        duplicateToleranceMm: this.settings.dupTolMm,
        modelUnitsToMm: 1000,
      });
      this.result = {
        clashes: result?.clashes || [],
        stats: result?.stats || {},
        elapsedMs: Math.round(performance.now() - t0),
      };
    } catch (e) {
      console.error(e);
      this.msg = { type: 'err', text: 'Detekce selhala: ' + (e.message || e) };
    }
    this._stopPulse();
    this.running = false;
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
