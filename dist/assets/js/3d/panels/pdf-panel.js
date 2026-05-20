// PDF report builder — basic multi-section.

export default class PdfPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'PDF report';
  }

  mount() {
    this.host.innerHTML = `
      <p class="v3d-panel__hint">Vyberte sekce, které chcete do reportu zahrnout:</p>
      <div class="v3d-panel__field">
        <label><input type="checkbox" data-sec="cover" checked> Titulní strana</label><br>
        <label><input type="checkbox" data-sec="snapshot" checked> Screenshot</label><br>
        <label><input type="checkbox" data-sec="models" checked> Načtené modely</label><br>
        <label><input type="checkbox" data-sec="issues"> Issues</label><br>
        <label><input type="checkbox" data-sec="viewpoints"> Pohledy</label><br>
        <label><input type="checkbox" data-sec="measurements"> Měření</label>
      </div>
      <div class="v3d-panel__field">
        <input class="v3d-panel__input" data-role="title" placeholder="Název reportu" value="BIM report">
      </div>
      <button class="v3d-btn v3d-btn--primary" data-role="gen">Generovat PDF</button>
      <p class="v3d-panel__hint" data-role="status"></p>
    `;
    this.host.querySelector('[data-role="gen"]').addEventListener('click', () => this._generate());
  }

  async _generate() {
    const status = this.host.querySelector('[data-role="status"]');
    status.textContent = 'Generuji…';
    try {
      const { jsPDF } = await import('https://esm.sh/jspdf@2.5.2');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const title = this.host.querySelector('[data-role="title"]').value || 'BIM report';
      const sec = (k) => this.host.querySelector(`[data-sec="${k}"]`).checked;
      let y = 20;
      if (sec('cover')) {
        doc.setFontSize(20); doc.text(title, 20, y); y += 10;
        doc.setFontSize(10); doc.text(new Date().toLocaleString(), 20, y); y += 10;
      }
      if (sec('snapshot')) {
        const blob = await this.engine.takeScreenshot({ scale: 1, format: 'image/jpeg', quality: 0.85 });
        const dataUrl = await blobToDataUrl(blob);
        doc.addImage(dataUrl, 'JPEG', 20, y, 170, 100);
        y += 110;
      }
      if (sec('models')) {
        doc.setFontSize(12); doc.text('Modely', 20, y); y += 6;
        doc.setFontSize(9);
        for (const m of (this.engine.getModels?.() || [])) {
          doc.text(`${m.name} — ${m.entityCount} entit, ${m.typeCount} typů`, 22, y);
          y += 5; if (y > 280) { doc.addPage(); y = 20; }
        }
        y += 5;
      }
      if (sec('issues')) {
        const issues = JSON.parse(localStorage.getItem('bim_checker_issues_v1') || '[]');
        doc.setFontSize(12); doc.text(`Issues (${issues.length})`, 20, y); y += 6;
        doc.setFontSize(9);
        for (const it of issues) {
          doc.text(`[${it.status}] ${it.title} — ${it.priority}`, 22, y); y += 5;
          if (y > 280) { doc.addPage(); y = 20; }
        }
        y += 5;
      }
      if (sec('viewpoints')) {
        const vps = JSON.parse(localStorage.getItem('bim_checker_viewpoints_v1') || '[]');
        doc.setFontSize(12); doc.text(`Pohledy (${vps.length})`, 20, y); y += 6;
        doc.setFontSize(9);
        for (const v of vps) { doc.text(`• ${v.name}`, 22, y); y += 5; if (y > 280) { doc.addPage(); y = 20; } }
        y += 5;
      }
      if (sec('measurements')) {
        const meas = JSON.parse(localStorage.getItem('bim_checker_measurements_v1') || '[]');
        doc.setFontSize(12); doc.text(`Měření (${meas.length})`, 20, y); y += 6;
        doc.setFontSize(9);
        for (const m of meas) { doc.text(`${m.kind}: ${m.value} ${m.unit || ''} ${m.label || ''}`, 22, y); y += 5; if (y > 280) { doc.addPage(); y = 20; } }
      }
      doc.save(`${title.replace(/[^a-z0-9-_]+/gi, '_')}-${Date.now()}.pdf`);
      status.textContent = '✓ Hotovo.';
    } catch (e) {
      console.error(e); status.textContent = '✗ ' + (e.message || e);
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
