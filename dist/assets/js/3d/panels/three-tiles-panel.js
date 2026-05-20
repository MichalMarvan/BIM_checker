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
      <p class="v3d-panel__hint">Vyberte modely, vyexportuje se tileset.json + glTF buňky v ZIP.</p>
      <div class="v3d-panel__field">
        ${models.map(m => `<label style="display:block"><input type="checkbox" data-mid="${m.modelId}" checked> ${escapeHtml(m.name)}</label>`).join('') || '<p style="color:var(--text-tertiary)">Žádné modely.</p>'}
      </div>
      <button class="v3d-btn v3d-btn--primary" data-act="export">Exportovat</button>
      <p class="v3d-panel__hint" data-role="status"></p>
    `;
    this.host.querySelector('[data-act="export"]').addEventListener('click', () => this._export());
  }

  async _export() {
    const status = this.host.querySelector('[data-role="status"]');
    status.textContent = 'Generuji…';
    try {
      const ids = [...this.host.querySelectorAll('input[data-mid]:checked')].map(i => i.dataset.mid);
      if (!ids.length) return;
      const result = await this.engine.exportThreeDTiles({ modelIds: ids });
      if (!result?.zipBlob) throw new Error('engine.exportThreeDTiles returned empty');
      download(result.zipBlob, `tileset-${Date.now()}.zip`);
      status.textContent = '✓ Hotovo.';
    } catch (e) {
      console.error(e); status.textContent = '✗ ' + (e.message || e);
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
