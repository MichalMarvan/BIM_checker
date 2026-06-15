// 3D Tiles export — ECEF + glTF.

export default class ThreeTilesPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Export 3D Tiles';
  }

  mount() {
    const models = this.engine.getModels?.() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Modely k exportu</h4>
        <p class="v3d-panel__hint">Vyexportuje se tileset.json + glTF buňky zabalené v ZIP archivu (ECEF souřadnice).</p>
        ${models.length ? `
          <div class="v3d-panel__field">
            ${models.map(m => `
              <label class="v3d-panel__toggle">
                <input type="checkbox" data-mid="${m.modelId}" checked> ${escapeHtml(m.name)}
              </label>`).join('')}
          </div>
          <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-act="export">Exportovat ZIP</button>` : `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">📦</div>
            <p>Nejsou načteny žádné modely k exportu.</p>
          </div>`}
      </div>
      <div data-role="status"></div>
    `;
    this.host.querySelector('[data-act="export"]')?.addEventListener('click', () => this._export());
  }

  async _export() {
    const status = this.host.querySelector('[data-role="status"]');
    const btn = this.host.querySelector('[data-act="export"]');

    if (typeof this.engine.exportThreeDTiles !== 'function') {
      status.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">Export 3D Tiles není v tomto enginu dostupný.</div>';
      return;
    }

    const ids = [...this.host.querySelectorAll('input[data-mid]:checked')].map(i => i.dataset.mid);
    if (!ids.length) {
      status.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--warn">Vyberte alespoň jeden model.</div>';
      return;
    }

    btn.disabled = true;
    status.innerHTML = `
      <div class="v3d-panel__msg">Generuji tileset…</div>
      <div class="v3d-panel__progress"><span style="width:30%"></span></div>
    `;
    try {
      const result = await this.engine.exportThreeDTiles({ modelIds: ids });
      if (!result?.zipBlob) {
        throw new Error('Export vrátil prázdný výsledek.');
      }
      download(result.zipBlob, `tileset-${Date.now()}.zip`);
      status.innerHTML = '<div class="v3d-panel__msg v3d-panel__msg--ok">✓ Export hotov, ZIP stažen.</div>';
    } catch (e) {
      console.error(e);
      status.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--err">✗ ${escapeHtml(e.message || String(e))}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
