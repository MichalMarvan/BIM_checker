// IDS templates — library of canned IDS rule files + validate against loaded models.

export default class IdsTemplatesPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'IDS šablony';
  }

  mount() {
    this.host.innerHTML = `
      <p class="v3d-panel__hint">Nahrajte IDS XML soubor pro validaci modelu. Pro fulltext editor IDS přejděte na stránku IDS Validator.</p>
      <div class="v3d-panel__field">
        <label class="v3d-pill" style="cursor:pointer">
          ⇡ IDS XML
          <input type="file" accept=".xml,.ids" hidden data-act="upload">
        </label>
      </div>
      <div class="v3d-panel__field">
        <a class="v3d-pill" href="ids-ifc-validator.html" style="text-decoration:none;display:inline-block">→ Otevřít IDS Validator</a>
      </div>
      <div data-role="result"></div>
    `;
    this.host.querySelector('[data-act="upload"]').addEventListener('change', (e) => this._validate(e.target.files[0]));
  }

  async _validate(file) {
    if (!file) return;
    const out = this.host.querySelector('[data-role="result"]');
    out.innerHTML = '<p class="v3d-panel__hint">Validuji…</p>';
    try {
      const xml = await file.text();
      // Try the project IDS validator
      const parser = await import('../../ids/parser.js').catch(() => null);
      const validator = await import('../../ids/validator.js').catch(() => null);
      if (!parser || !validator) throw new Error('IDS modul nenalezen.');
      const ids = parser.parseIds?.(xml) || parser.default?.(xml);
      const specs = ids?.specifications || [];
      const models = this.engine.getModels?.() || [];
      let pass = 0, fail = 0;
      const lines = [];
      for (const m of models) {
        for (const spec of specs) {
          const result = validator.runSpecification?.(spec, this.engine, m.modelId);
          if (!result) continue;
          pass += result.pass || 0;
          fail += result.fail || 0;
          lines.push(`<li><strong>${escapeHtml(spec.name || 'spec')}</strong> · ${m.name}: ${result.pass || 0} pass / ${result.fail || 0} fail</li>`);
        }
      }
      out.innerHTML = `
        <div class="v3d-panel__pills" style="margin-top:8px">
          <span class="v3d-pill" style="color:#16a34a">${pass} PASS</span>
          <span class="v3d-pill" style="color:#dc2626">${fail} FAIL</span>
        </div>
        <ul class="v3d-panel__list">${lines.join('')}</ul>
      `;
    } catch (e) {
      out.innerHTML = `<p class="v3d-panel__hint" style="color:#dc2626">✗ ${escapeHtml(e.message || String(e))}</p>`;
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
