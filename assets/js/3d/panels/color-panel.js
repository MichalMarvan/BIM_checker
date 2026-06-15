// Color by property — auto palette + legend.

export default class ColorPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Obarvit podle vlastnosti';
    this._destroyed = false;
  }

  async mount() {
    // Loading state — sběr vlastností prochází všechny entity a může trvat.
    this.host.innerHTML = `
      <div class="v3d-panel__empty">
        <div class="v3d-panel__empty-icon">⏳</div>
        <p>Načítám dostupné vlastnosti…</p>
      </div>`;
    await paintFrame();
    if (this._destroyed) return;

    let props = [];
    try {
      props = (await this.engine.getAvailableProperties?.()) || [];
    } catch (e) {
      console.warn('[color-panel] getAvailableProperties failed:', e);
      this.host.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--err">Načtení vlastností selhalo: ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (this._destroyed) return;

    if (props.length === 0) {
      this.host.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">🎨</div>
          <p>Žádné vlastnosti k dispozici.<br>Načtěte nejprve model s PSety.</p>
        </div>`;
      return;
    }

    const grouped = new Map();
    for (const p of props) {
      const k = `${p.pset}.${p.property}`;
      if (!grouped.has(k)) grouped.set(k, { pset: p.pset, property: p.property, count: p.count });
    }
    const opts = [...grouped.values()].slice(0, 200);

    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Vlastnost</h4>
        <div class="v3d-panel__field">
          <label>PSet / vlastnost (${opts.length})</label>
          <select class="v3d-panel__select" data-role="prop">
            <option value="">— vyberte —</option>
            ${opts.map(o => `<option value="${escapeHtml(o.pset)}|${escapeHtml(o.property)}">${escapeHtml(o.pset)} / ${escapeHtml(o.property)} (${o.count})</option>`).join('')}
          </select>
        </div>
        <div class="v3d-panel__field">
          <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="apply">🎨 Obarvit model</button>
        </div>
        <button class="v3d-panel__btn v3d-panel__btn--sm" data-role="clear">↺ Obnovit barvy</button>
        <p class="v3d-panel__hint">Každá unikátní hodnota dostane vlastní barvu z automatické palety.</p>
      </div>
      <div data-role="status"></div>
      <div class="v3d-panel__section" data-role="legend"></div>
    `;
    this.host.querySelector('[data-role="apply"]').addEventListener('click', () => this._apply());
    this.host.querySelector('[data-role="clear"]').addEventListener('click', () => {
      this.engine.clearColorByProperty?.();
      this.host.querySelector('[data-role="legend"]').innerHTML = '';
      this._setStatus('Původní barvy obnoveny.', 'ok');
    });
  }

  async _apply() {
    const v = this.host.querySelector('[data-role="prop"]').value;
    if (!v) {
      this._setStatus('Nejprve vyberte vlastnost.', 'warn');
      return;
    }
    const [pset, property] = v.split('|');
    this._setStatus('⏳ Obarvuji entity…');
    this.host.querySelector('[data-role="legend"]').innerHTML = '';
    await paintFrame();
    if (this._destroyed) return;

    let result;
    try {
      result = this.engine.colorByProperty?.({ pset, property });
    } catch (e) {
      console.warn('[color-panel] colorByProperty failed:', e);
      this._setStatus(`Obarvení selhalo: ${e.message}`, 'err');
      return;
    }
    if (!result) {
      this._setStatus('Obarvení není v tomto prostředí dostupné.', 'warn');
      return;
    }

    const entries = Object.entries(result.valueToColor || {});
    const matched = result.matchedTotal || 0;
    const unmatched = result.unmatchedTotal || 0;
    this._setStatus(
      `Obarveno ${matched} ${plural(matched, 'entita', 'entity', 'entit')} v ${entries.length} ${plural(entries.length, 'hodnotě', 'hodnotách', 'hodnotách')}.`
      + (unmatched ? ` Bez vlastností: ${unmatched}.` : ''),
      'ok'
    );

    const legend = this.host.querySelector('[data-role="legend"]');
    if (entries.length === 0) {
      legend.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">🪣</div>
          <p>Žádná entita tuto vlastnost nemá.</p>
        </div>`;
      return;
    }
    legend.innerHTML = `
      <h4>Legenda <span class="v3d-panel__badge">${entries.length}</span></h4>
      ${entries.map(([val, col]) => `
        <div class="v3d-panel__kv">
          <span><span class="v3d-panel__badge" style="background:${col};color:${col}">●</span> ${escapeHtml(val || '(bez hodnoty)')}</span>
          <b>${result.valueToCount?.[val] ?? '?'}</b>
        </div>
      `).join('')}
    `;
  }

  _setStatus(text, type) {
    const el = this.host.querySelector('[data-role="status"]');
    if (!el) return;
    el.innerHTML = text
      ? `<div class="v3d-panel__msg${type ? ` v3d-panel__msg--${type}` : ''}">${escapeHtml(text)}</div>`
      : '';
  }

  destroy() {
    this._destroyed = true;
  }
}

/** Počká na vykreslení snímku, aby se stihl ukázat loading stav před synchronní prací. */
function paintFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
