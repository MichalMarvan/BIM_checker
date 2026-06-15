// PDF report builder — basic multi-section, with progress feedback.

export default class PdfPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'PDF report';
  }

  mount() {
    this.host.innerHTML = `
      <p class="v3d-panel__hint">Sestaví PDF report z aktuálního stavu vieweru.</p>
      <div class="v3d-panel__section">
        <h4>Sekce reportu</h4>
        <label class="v3d-panel__toggle"><input type="checkbox" data-sec="cover" checked> Titulní strana</label>
        <label class="v3d-panel__toggle"><input type="checkbox" data-sec="snapshot" checked> Screenshot scény</label>
        <label class="v3d-panel__toggle"><input type="checkbox" data-sec="models" checked> Načtené modely</label>
        <label class="v3d-panel__toggle"><input type="checkbox" data-sec="issues"> Issues</label>
        <label class="v3d-panel__toggle"><input type="checkbox" data-sec="viewpoints"> Uložené pohledy</label>
        <label class="v3d-panel__toggle"><input type="checkbox" data-sec="measurements"> Měření</label>
      </div>
      <div class="v3d-panel__section">
        <h4>Nastavení</h4>
        <div class="v3d-panel__field">
          <label>Název reportu</label>
          <input class="v3d-panel__input" data-role="title" placeholder="Název reportu" value="BIM report" maxlength="120">
        </div>
      </div>
      <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="gen">📄 Generovat PDF</button>
      <div class="v3d-panel__progress" data-role="progress" hidden><span></span></div>
      <p class="v3d-panel__hint" data-role="step" hidden></p>
      <div data-role="msg"></div>
    `;
    this.host.querySelector('[data-role="gen"]').addEventListener('click', () => this._generate());
  }

  _msg(kind, text) {
    const box = this.host.querySelector('[data-role="msg"]');
    if (!box) return;
    box.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${kind}">${escapeHtml(text)}</div>` : '';
  }

  _progress(pct, label) {
    const bar = this.host.querySelector('[data-role="progress"]');
    const step = this.host.querySelector('[data-role="step"]');
    if (!bar || !step) return;
    if (pct === null || pct === undefined) {
      bar.hidden = true;
      step.hidden = true;
      return;
    }
    bar.hidden = false;
    step.hidden = false;
    bar.querySelector('span').style.width = `${Math.max(0, Math.min(100, pct))}%`;
    step.textContent = label || '';
  }

  async _generate() {
    const btn = this.host.querySelector('[data-role="gen"]');
    const warnings = [];
    btn.disabled = true;
    this._msg('ok', '');
    this._progress(5, 'Načítám knihovnu jsPDF…');
    try {
      const { jsPDF } = await import('https://esm.sh/jspdf@2.5.2');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const title = this.host.querySelector('[data-role="title"]').value || 'BIM report';
      const sec = (k) => this.host.querySelector(`[data-sec="${k}"]`).checked;
      const safeLoad = (key, label) => {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch {
          warnings.push(`Sekci „${label}“ se nepodařilo načíst z úložiště.`);
          return [];
        }
      };
      let y = 20;
      if (sec('cover')) {
        this._progress(15, 'Titulní strana…');
        doc.setFontSize(20); doc.text(title, 20, y); y += 10;
        doc.setFontSize(10); doc.text(new Date().toLocaleString(), 20, y); y += 10;
      }
      if (sec('snapshot')) {
        this._progress(35, 'Snímek scény…');
        if (typeof this.engine.takeScreenshot === 'function') {
          const blob = await this.engine.takeScreenshot({ scale: 1, format: 'image/jpeg', quality: 0.85 });
          if (blob) {
            const dataUrl = await blobToDataUrl(blob);
            doc.addImage(dataUrl, 'JPEG', 20, y, 170, 100);
            y += 110;
          } else {
            warnings.push('Screenshot scény se nepodařilo pořídit — sekce vynechána.');
          }
        } else {
          warnings.push('Engine nepodporuje screenshoty — sekce vynechána.');
        }
      }
      if (sec('models')) {
        this._progress(55, 'Seznam modelů…');
        doc.setFontSize(12); doc.text('Modely', 20, y); y += 6;
        doc.setFontSize(9);
        for (const m of (this.engine.getModels?.() || [])) {
          doc.text(`${m.name} — ${m.entityCount} entit, ${m.typeCount} typů`, 22, y);
          y += 5; if (y > 280) { doc.addPage(); y = 20; }
        }
        y += 5;
      }
      if (sec('issues')) {
        this._progress(70, 'Issues…');
        const issues = safeLoad('bim_checker_issues_v1', 'Issues');
        doc.setFontSize(12); doc.text(`Issues (${issues.length})`, 20, y); y += 6;
        doc.setFontSize(9);
        for (const it of issues) {
          doc.text(`[${it.status}] ${it.title} — ${it.priority}`, 22, y); y += 5;
          if (y > 280) { doc.addPage(); y = 20; }
        }
        y += 5;
      }
      if (sec('viewpoints')) {
        this._progress(80, 'Uložené pohledy…');
        const vps = safeLoad('bim_checker_viewpoints_v1', 'Pohledy');
        doc.setFontSize(12); doc.text(`Pohledy (${vps.length})`, 20, y); y += 6;
        doc.setFontSize(9);
        for (const v of vps) { doc.text(`• ${v.name}`, 22, y); y += 5; if (y > 280) { doc.addPage(); y = 20; } }
        y += 5;
      }
      if (sec('measurements')) {
        this._progress(90, 'Měření…');
        const meas = safeLoad('bim_checker_measurements_v1', 'Měření');
        doc.setFontSize(12); doc.text(`Měření (${meas.length})`, 20, y); y += 6;
        doc.setFontSize(9);
        for (const m of meas) { doc.text(`${m.kind}: ${m.value} ${m.unit || ''} ${m.label || ''}`, 22, y); y += 5; if (y > 280) { doc.addPage(); y = 20; } }
      }
      this._progress(100, 'Ukládám PDF…');
      doc.save(`${title.replace(/[^a-z0-9-_]+/gi, '_')}-${Date.now()}.pdf`);
      this._progress(null);
      if (warnings.length > 0) {
        this._msg('warn', 'PDF vytvořeno s výhradami: ' + warnings.join(' '));
      } else {
        this._msg('ok', 'PDF report byl vytvořen a stažen.');
      }
    } catch (e) {
      console.error(e);
      this._progress(null);
      this._msg('err', 'Generování PDF selhalo: ' + (e.message || e));
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
