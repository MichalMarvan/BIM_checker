// Screenshot panel — PNG/JPG, 1×/2×/4×, optional watermark, preview of last capture.

export default class ScreenshotPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Screenshot';
  }

  mount() {
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Nastavení</h4>
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
        <label class="v3d-panel__toggle"><input type="checkbox" data-role="wm"> Vodoznak (název modelu + datum)</label>
      </div>
      <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="capture">📸 Zachytit snímek</button>
      <div data-role="msg"></div>
      <div class="v3d-panel__section" data-role="preview" hidden>
        <h4>Poslední snímek</h4>
        <img data-role="preview-img" alt="Náhled posledního snímku" width="100%">
        <p class="v3d-panel__hint" data-role="preview-meta"></p>
      </div>
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

  _msg(kind, text) {
    const box = this.host.querySelector('[data-role="msg"]');
    if (!box) return;
    box.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${kind}">${escapeHtml(text)}</div>` : '';
  }

  async _capture() {
    const btn = this.host.querySelector('[data-role="capture"]');
    if (typeof this.engine.takeScreenshot !== 'function') {
      this._msg('warn', 'Engine nepodporuje pořizování snímků.');
      return;
    }
    btn.disabled = true;
    this._msg('ok', 'Generuji snímek…');
    try {
      const scale = parseInt(this.host.querySelector('[data-role="scale"] .v3d-pill.active').dataset.scale, 10);
      const format = this.host.querySelector('[data-role="format"] .v3d-pill.active').dataset.fmt;
      const wm = this.host.querySelector('[data-role="wm"]').checked;
      const watermark = wm ? {
        modelName: (this.engine.getModels?.() || []).map((m) => m.name).join(', ') || '3D viewer',
        viewpoint: '',
        date: new Date().toLocaleString(),
      } : undefined;
      const blob = await this.engine.takeScreenshot({ scale, format, quality: 0.92, watermark });
      if (!blob) throw new Error('Snímek se nepodařilo vytvořit (engine vrátil prázdná data).');

      // Download
      const ext = format === 'image/png' ? 'png' : 'jpg';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `viewer-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // Preview thumbnail
      const dataUrl = await blobToDataUrl(blob);
      const previewBox = this.host.querySelector('[data-role="preview"]');
      const img = this.host.querySelector('[data-role="preview-img"]');
      const metaEl = this.host.querySelector('[data-role="preview-meta"]');
      img.onload = () => {
        metaEl.textContent = `${img.naturalWidth}×${img.naturalHeight} px · ${ext.toUpperCase()} · ${formatBytes(blob.size)}`;
      };
      img.src = dataUrl;
      previewBox.hidden = false;

      this._msg('ok', `Snímek byl stažen (${ext.toUpperCase()}, měřítko ${scale}×).`);
    } catch (e) {
      console.error(e);
      this._msg('err', 'Snímek selhal: ' + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  destroy() {}
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
