// Screenshot panel — PNG/JPG, 1×/2×/4×, optional watermark.

export default class ScreenshotPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Screenshot';
  }

  mount() {
    this.host.innerHTML = `
      <div class="v3d-panel__field">
        <label>Měřítko</label>
        <div class="v3d-panel__pills" data-role="scale">
          <button class="v3d-pill active" data-scale="1">1×</button>
          <button class="v3d-pill" data-scale="2">2×</button>
          <button class="v3d-pill" data-scale="4">4×</button>
        </div>
      </div>
      <div class="v3d-panel__field">
        <label>Formát</label>
        <div class="v3d-panel__pills" data-role="format">
          <button class="v3d-pill active" data-fmt="image/png">PNG</button>
          <button class="v3d-pill" data-fmt="image/jpeg">JPG</button>
        </div>
      </div>
      <div class="v3d-panel__field">
        <label><input type="checkbox" data-role="wm"> Vodoznak (název + datum)</label>
      </div>
      <div class="v3d-panel__field">
        <button class="v3d-btn v3d-btn--primary" data-role="capture">📸 Zachytit</button>
      </div>
      <p class="v3d-panel__hint" data-role="status"></p>
    `;

    const togglePill = (sel) => this.host.querySelectorAll(sel + ' .v3d-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.host.querySelectorAll(sel + ' .v3d-pill').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    togglePill('[data-role="scale"]');
    togglePill('[data-role="format"]');

    this.host.querySelector('[data-role="capture"]').addEventListener('click', () => this._capture());
  }

  async _capture() {
    const status = this.host.querySelector('[data-role="status"]');
    status.textContent = 'Generuji…';
    try {
      const scale = parseInt(this.host.querySelector('[data-role="scale"] .v3d-pill.active').dataset.scale, 10);
      const format = this.host.querySelector('[data-role="format"] .v3d-pill.active').dataset.fmt;
      const wm = this.host.querySelector('[data-role="wm"]').checked;
      const watermark = wm ? {
        modelName: Array.from(window.__engine?.getModels?.() || []).map((m) => m.name).join(', ') || '3D viewer',
        viewpoint: '',
        date: new Date().toLocaleString(),
      } : undefined;
      const blob = await this.engine.takeScreenshot({ scale, format, quality: 0.92, watermark });
      if (!blob) throw new Error('takeScreenshot returned null');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `viewer-${Date.now()}.${format === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = '✓ Staženo.';
    } catch (e) {
      console.error(e);
      status.textContent = '✗ ' + (e.message || e);
    }
  }

  destroy() {}
}
