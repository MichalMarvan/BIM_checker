// IDS templates — library of canned IDS rule files + validate against loaded models.

export default class IdsTemplatesPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'IDS šablony';
  }

  mount() {
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Validace IDS</h4>
        <p class="v3d-panel__hint">Nahrajte IDS XML soubor pro validaci načtených modelů. Pro plnohodnotný editor IDS přejděte na stránku IDS Validator.</p>
        <div class="v3d-panel__row">
          <label class="v3d-panel__btn v3d-panel__btn--primary">⇡ Nahrát IDS XML<input type="file" accept=".xml,.ids" hidden data-act="upload"></label>
          <a class="v3d-panel__btn" href="ids-ifc-validator.html">→ IDS Validator</a>
        </div>
      </div>
      <div data-role="result"></div>
    `;
    this.host.querySelector('[data-act="upload"]').addEventListener('change', (e) => this._validate(e.target.files[0]));
  }

  async _validate(file) {
    if (!file) {
      return;
    }
    const out = this.host.querySelector('[data-role="result"]');
    out.innerHTML = '<div class="v3d-panel__msg">Validuji…</div>';
    try {
      const xml = await file.text();
      // Try the project IDS validator
      const parser = await import('../../ids/parser.js').catch(() => null);
      const validator = await import('../../ids/validator.js').catch(() => null);
      if (!parser || !validator) {
        out.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">IDS modul nenalezen. Validaci spusťte na stránce IDS Validator.</div>';
        return;
      }
      const ids = parser.parseIds?.(xml) || parser.default?.(xml);
      const specs = ids?.specifications || [];
      if (!specs.length) {
        out.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">IDS soubor neobsahuje žádné specifikace.</div>';
        return;
      }
      const models = this.engine.getModels?.() || [];
      if (!models.length) {
        out.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">Nejsou načteny žádné modely k validaci.</div>';
        return;
      }
      if (typeof validator.runSpecification !== 'function') {
        out.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">IDS validátor nepodporuje runSpecification.</div>';
        return;
      }
      let pass = 0;
      let fail = 0;
      const rows = [];
      for (const m of models) {
        for (const spec of specs) {
          const result = validator.runSpecification(spec, this.engine, m.modelId);
          if (!result) {
            continue;
          }
          pass += result.pass || 0;
          fail += result.fail || 0;
          rows.push(`
            <div class="v3d-panel__item">
              <div class="v3d-panel__item-main">
                <div class="v3d-panel__item-title">${escapeHtml(spec.name || 'spec')}</div>
                <div class="v3d-panel__item-sub">${escapeHtml(m.name)}</div>
              </div>
              <span class="v3d-panel__badge">${result.pass || 0} ✓ / ${result.fail || 0} ✗</span>
            </div>
          `);
        }
      }
      if (!rows.length) {
        out.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">Žádné výsledky validace.</div>';
        return;
      }
      out.innerHTML = `
        <div class="v3d-panel__msg v3d-panel__msg--${fail > 0 ? 'warn' : 'ok'}">${pass} PASS · ${fail} FAIL</div>
        ${rows.join('')}
      `;
    } catch (e) {
      out.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--err">✗ ${escapeHtml(e.message || String(e))}</div>`;
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
