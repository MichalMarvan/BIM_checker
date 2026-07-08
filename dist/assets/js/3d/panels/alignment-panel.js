// Alignment — LandXML import, list, section-at-station.

import { buildMultiSectionDxf } from './dxf-export.js';
import { formatStation } from '../ifc-engine/viewer/station-section-visuals.js';

export default class AlignmentPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    this.swapXY = true;
    this.busy = false;
    this.msg = null;          // { type: 'ok'|'warn'|'err', text }
    this.warnings = [];       // Czech warning strings from last import
    this._suggestSwap = null; // pending swapXY suggestion: { ids, suggested } or null
    this._lastXmlText = null; // raw XML of last LandXML import (for re-import)
    this._hidden = new Set(); // alignment ids switched off
    titleEl.textContent = 'Osy trasy (LandXML)';
  }

  mount() { this._render(); }

  _render() {
    const list = this.engine.getAlignments?.() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Import</h4>
        <div class="v3d-panel__row">
          <label class="v3d-panel__btn v3d-panel__btn--sm">
            ⇡ LandXML
            <input type="file" accept=".xml,.landxml" hidden data-act="upload" ${this.busy ? 'disabled' : ''}>
          </label>
          <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="from-ifc" ${this.busy ? 'disabled' : ''}>Z IFC (IfcAlignment)</button>
        </div>
        <label class="v3d-panel__toggle">
          <input type="checkbox" data-role="swap" ${this.swapXY ? 'checked' : ''}> Prohodit X/Y (česká data)
        </label>
        ${this.busy ? '<div class="v3d-panel__progress" data-role="prog"><span></span></div><p class="v3d-panel__hint">Načítám trasu…</p>' : ''}
      </div>
      ${this.msg ? `<div class="v3d-panel__msg v3d-panel__msg--${this.msg.type}">${escapeHtml(this.msg.text)}</div>` : ''}
      ${this._warningsHtml()}
      <div class="v3d-panel__section">
        <h4>Osy (${list.length})</h4>
        ${list.length === 0 ? `
          <div class="v3d-panel__empty">
            <div class="v3d-panel__empty-icon">🛤️</div>
            <p>Žádné osy.<br>Importujte LandXML nebo načtěte IfcAlignment z modelu.</p>
          </div>` : list.map(a => `
          <div class="v3d-panel__item">
            <div class="v3d-panel__item-main">
              <div class="v3d-panel__item-title">${escapeHtml(a.name || '(bez názvu)')}</div>
              <div class="v3d-panel__item-sub">${(a.length || 0).toFixed(0)} m · ${a.elementCount ?? '?'} prvků · ${a.hasProfile ? 'niveleta ✓' : 'bez nivelety'}</div>
            </div>
            <button class="v3d-panel__item-btn" data-act="vis" data-id="${a.id}" title="Zobrazit / skrýt">${this._hidden.has(a.id) ? '🙈' : '👁'}</button>
            <button class="v3d-panel__item-btn" data-act="section" data-id="${a.id}" title="Řez na staničení">✂</button>
            <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="rm" data-id="${a.id}" title="Odebrat">✕</button>
          </div>`).join('')}
        ${list.length > 0 ? '<button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-act="clear">✕ Smazat vše</button>' : ''}
      </div>
      <div data-role="section-controls"></div>
    `;

    this.host.querySelector('[data-act="upload"]').addEventListener('change', (e) => this._upload(e.target.files[0]));
    this.host.querySelector('[data-act="from-ifc"]').addEventListener('click', () => this._fromIfc());
    this.host.querySelector('[data-role="swap"]').addEventListener('change', (e) => { this.swapXY = e.target.checked; });
    this.host.querySelector('[data-act="swap-reimport"]')?.addEventListener('click', () => this._reimportSwapped());
    this.host.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
      if (!confirm('Smazat všechny osy?')) return;
      this.engine.clearAlignments?.();
      this._hidden.clear();
      this.msg = null;
      this.warnings = [];
      this._suggestSwap = null;
      this._render();
    });
    this.host.querySelectorAll('[data-act="vis"]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      const show = this._hidden.has(id);
      this.engine.setAlignmentVisible?.(id, show);
      if (show) this._hidden.delete(id);
      else this._hidden.add(id);
      b.textContent = show ? '👁' : '🙈';
    }));
    this.host.querySelectorAll('[data-act="rm"]').forEach(b => b.addEventListener('click', () => {
      this.engine.removeAlignment?.(b.dataset.id);
      this._hidden.delete(b.dataset.id);
      this.msg = null;
      this.warnings = [];
      this._suggestSwap = null;
      this._render();
    }));
    this.host.querySelectorAll('[data-act="section"]').forEach(b => b.addEventListener('click', () => this._sectionControls(b.dataset.id)));

    if (this.busy) this._startPulse();
  }

  async _upload(file) {
    if (!file) return;
    if (typeof this.engine.loadAlignment !== 'function') {
      this.msg = { type: 'warn', text: 'Import LandXML není v této verzi engine k dispozici.' };
      this._render();
      return;
    }
    this.busy = true;
    this.msg = null;
    this.warnings = [];
    this._suggestSwap = null;
    this._render();
    try {
      const xml = await file.text();
      this._lastXmlText = xml;
      this._applyImport(xml, this.swapXY, `✓ LandXML „${file.name}" importováno`);
    } catch (e) {
      console.error(e);
      this.msg = { type: 'err', text: 'Import selhal: ' + (e.message || e) };
    }
    this._stopPulse();
    this.busy = false;
    this._render();
  }

  // Shared import path for initial upload and swapXY re-import.
  _applyImport(xml, swapXY, okPrefix) {
    const res = this.engine.loadAlignment(xml, { swapXY });
    const ids = Array.isArray(res) ? res : (res?.ids || []);
    const warnings = Array.isArray(res) ? [] : (res?.warnings || []);
    const meta = Array.isArray(res) ? {} : (res?.meta || {});
    this.warnings = Array.isArray(warnings) ? warnings.slice() : [];
    this.msg = { type: 'ok', text: `${okPrefix} (${ids.length} os).` };
    if (typeof meta.suggestSwapXY === 'boolean' && meta.suggestSwapXY !== swapXY) {
      this._suggestSwap = { ids: ids.slice(), suggested: meta.suggestSwapXY };
    } else {
      this._suggestSwap = null;
    }
  }

  _reimportSwapped() {
    if (!this._suggestSwap || this._lastXmlText == null) return;
    const { ids, suggested } = this._suggestSwap;
    for (const id of ids) this.engine.removeAlignment?.(id);
    for (const id of ids) this._hidden.delete(id);
    this.swapXY = suggested;
    this.warnings = [];
    this._suggestSwap = null;
    try {
      this._applyImport(this._lastXmlText, this.swapXY, '✓ Přenačteno');
    } catch (e) {
      console.error(e);
      this.msg = { type: 'err', text: 'Přenačtení selhalo: ' + (e.message || e) };
    }
    this._render();
  }

  _fromIfc() {
    const found = this.engine.findIfcAlignments?.() || [];
    if (found.length === 0) {
      this.msg = { type: 'warn', text: 'Žádné IfcAlignment v načtených modelech.' };
      this._render();
      return;
    }
    let ok = 0, failed = 0;
    for (const a of found) {
      try { this.engine.loadAlignmentFromIfc?.(a.modelId, a.expressId); ok++; }
      catch (e) { console.warn(e); failed++; }
    }
    this.msg = failed === 0
      ? { type: 'ok', text: `✓ Načteno ${ok} os z IFC.` }
      : { type: 'warn', text: `Načteno ${ok} os, ${failed} se nepodařilo (viz konzole).` };
    this._render();
  }

  _sectionControls(alignmentId) {
    const a = (this.engine.getAlignments?.() || []).find(x => x.id === alignmentId);
    if (!a) return;
    const host = this.host.querySelector('[data-role="section-controls"]');
    host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Řez na ${escapeHtml(a.name || '(bez názvu)')}</h4>
        <div class="v3d-panel__pills" data-role="mode">
          <button class="v3d-pill active" data-v="single">Jeden řez</button>
          <button class="v3d-pill" data-v="batch">Po staničení</button>
        </div>
        <div data-role="tab-single"></div>
        <div data-role="tab-batch" hidden></div>
      </div>
    `;
    this._renderSingleTab(alignmentId, a, host.querySelector('[data-role="tab-single"]'));
    this._renderBatchTab(alignmentId, a, host.querySelector('[data-role="tab-batch"]'));
    host.querySelectorAll('[data-role="mode"] .v3d-pill').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll('[data-role="mode"] .v3d-pill').forEach(x => x.classList.toggle('active', x === b));
      const single = b.dataset.v === 'single';
      host.querySelector('[data-role="tab-single"]').hidden = !single;
      host.querySelector('[data-role="tab-batch"]').hidden = single;
    }));
  }

  _renderSingleTab(alignmentId, a, tab) {
    tab.innerHTML = `
      <div class="v3d-panel__field">
        <label>Staničení (m)</label>
        <div class="v3d-panel__row">
          <input class="v3d-panel__input" type="range" min="${a.staStart || 0}" max="${a.staEnd || a.length}" step="0.5" value="${a.staStart || 0}" data-role="sta">
          <input class="v3d-panel__input" data-role="sta-num" type="number" value="${(a.staStart || 0).toFixed(1)}">
        </div>
      </div>
      <div class="v3d-panel__field">
        <label>Orientace roviny</label>
        <div class="v3d-panel__pills" data-role="perp">
          <button class="v3d-pill active" data-v="plan">Půdorys</button>
          <button class="v3d-pill" data-v="3d">3D kolmá</button>
          <button class="v3d-pill" data-v="longitudinal">Podélný</button>
        </div>
      </div>
      <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="create">✂ Vytvořit řez</button>
      <div data-role="sec-msg"></div>
    `;
    const sta = tab.querySelector('[data-role="sta"]');
    const num = tab.querySelector('[data-role="sta-num"]');
    sta.addEventListener('input', () => { num.value = sta.value; });
    num.addEventListener('input', () => { sta.value = num.value; });
    tab.querySelectorAll('[data-role="perp"] .v3d-pill').forEach(b => b.addEventListener('click', () => {
      tab.querySelectorAll('[data-role="perp"] .v3d-pill').forEach(x => x.classList.toggle('active', x === b));
    }));
    tab.querySelector('[data-role="create"]').addEventListener('click', () => {
      const station = parseFloat(num.value);
      const perp = tab.querySelector('[data-role="perp"] .v3d-pill.active').dataset.v;
      const msgEl = tab.querySelector('[data-role="sec-msg"]');
      try {
        this.engine.createSectionAtStation?.(alignmentId, station, perp);
        msgEl.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--ok">✓ Řez vytvořen na staničení ${station.toFixed(1)} m.</div>`;
      } catch (e) {
        msgEl.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--err">Řez se nepodařil: ${escapeHtml(e.message || String(e))}</div>`;
      }
    });
  }

  _renderBatchTab(alignmentId, a, tab) {
    const staStart = Number.isFinite(a.staStart) ? a.staStart : 0;
    const staEnd = Number.isFinite(a.staEnd) ? a.staEnd : (a.length || 0);
    tab.innerHTML = `
      <div class="v3d-panel__row">
        <div class="v3d-panel__field" style="flex:1">
          <label>Od (m)</label>
          <input class="v3d-panel__input" type="number" data-role="od" value="${staStart.toFixed(1)}">
        </div>
        <div class="v3d-panel__field" style="flex:1">
          <label>Do (m)</label>
          <input class="v3d-panel__input" type="number" data-role="do" value="${staEnd.toFixed(1)}">
        </div>
        <div class="v3d-panel__field" style="flex:1">
          <label>Krok (m)</label>
          <input class="v3d-panel__input" type="number" min="0" data-role="step" value="25">
        </div>
      </div>
      <div class="v3d-panel__field">
        <label>Vlastní seznam staničení (nepovinné)</label>
        <textarea class="v3d-panel__textarea" data-role="custom" placeholder="např. 0, 25, 50, 100 — má přednost před rozsahem"></textarea>
      </div>
      <div class="v3d-panel__row">
        <div class="v3d-panel__field" style="flex:1">
          <label>Šířka (m)</label>
          <input class="v3d-panel__input" type="number" min="0" data-role="width" value="40">
        </div>
        <div class="v3d-panel__field" style="flex:1">
          <label>Výška (m)</label>
          <input class="v3d-panel__input" type="number" min="0" data-role="height" value="20">
        </div>
      </div>
      <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="create-marks">Vytvořit označení řezů</button>
      <div class="v3d-panel__row" style="margin-top:6px">
        <button class="v3d-panel__btn v3d-panel__btn--sm v3d-panel__btn--danger" data-role="clear-marks">✕ Smazat</button>
        <button class="v3d-panel__btn v3d-panel__btn--sm" data-role="dxf-all">⇣ DXF všech řezů</button>
      </div>
      <div data-role="batch-msg"></div>
    `;

    const readNum = (role, fallback) => {
      const v = parseFloat(tab.querySelector(`[data-role="${role}"]`).value);
      return Number.isFinite(v) ? v : fallback;
    };
    const readDims = () => ({
      width: Math.max(0.001, readNum('width', 40)),
      height: Math.max(0.001, readNum('height', 20)),
    });
    const setMsg = (type, text) => {
      tab.querySelector('[data-role="batch-msg"]').innerHTML =
        `<div class="v3d-panel__msg v3d-panel__msg--${type}">${escapeHtml(text)}</div>`;
    };

    // Vygeneruje seznam staničení: vlastní seznam má přednost před rozsahem+krokem.
    const computeStations = () => {
      const start = staStart;
      const end = staEnd;
      const raw = tab.querySelector('[data-role="custom"]').value.trim();
      if (raw) {
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        const parsed = raw.split(/[,;\s]+/).map(Number).filter(Number.isFinite);
        let dropped = 0;
        const kept = [];
        for (const s of parsed) {
          if (s < lo - 1e-6 || s > hi + 1e-6) { dropped++; continue; }
          kept.push(Math.min(hi, Math.max(lo, s)));
        }
        const uniq = Array.from(new Set(kept.map(v => Math.round(v * 1e6) / 1e6))).sort((x, y) => x - y);
        let note = dropped > 0 ? `${dropped} mimo rozsah osy vynecháno.` : '';
        if (uniq.length === 0) {
          note = (note ? note + ' ' : '') + 'Použito staničení začátku osy.';
          return { stations: [lo], note };
        }
        return { stations: uniq, note };
      }
      const od = readNum('od', start);
      const doo = readNum('do', end);
      const step = readNum('step', 25);
      const lo = Math.min(od, doo);
      const hi = Math.max(od, doo);
      if (!(step > 0)) return { stations: [lo], note: 'Krok musí být kladný — použito jen počáteční staničení.' };
      const out = [];
      const kFrom = Math.ceil(lo / step - 1e-9);
      const kTo = Math.floor(hi / step + 1e-9);
      for (let k = kFrom; k <= kTo; k++) out.push(Math.round(k * step * 1e6) / 1e6);
      if (out.length === 0) return { stations: [lo], note: 'Použito staničení začátku osy.' };
      return { stations: out, note: '' };
    };

    tab.querySelector('[data-role="create-marks"]').addEventListener('click', () => {
      if (this._batchExporting) return;
      const { stations, note } = computeStations();
      const { width, height } = readDims();
      try {
        const items = this.engine.createStationSections?.(alignmentId, { stations, width, height });
        const count = Array.isArray(items) ? items.length : stations.length;
        setMsg('ok', `✓ Vytvořeno ${count} označení řezů.${note ? ' ' + note : ''}`);
      } catch (e) {
        console.error(e);
        setMsg('err', 'Vytvoření označení selhalo: ' + (e.message || String(e)));
      }
    });

    tab.querySelector('[data-role="clear-marks"]').addEventListener('click', () => {
      if (this._batchExporting) return;
      this.engine.clearStationSections?.(alignmentId);
      setMsg('ok', 'Označení řezů smazáno.');
    });

    tab.querySelector('[data-role="dxf-all"]').addEventListener('click', (e) => {
      this._exportBatchDxf(alignmentId, a, tab, e.currentTarget, setMsg);
    });
  }

  async _exportBatchDxf(alignmentId, a, tab, btn, setMsg) {
    if (this._batchExporting) return;
    if (typeof this.engine.computeSectionCurves !== 'function') {
      setMsg('warn', 'Výpočet křivek řezu není v tomto prostředí dostupný.');
      return;
    }
    const data = this.engine.getStationSections?.(alignmentId);
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      setMsg('warn', 'Nejprve vytvořte označení řezů.');
      return;
    }
    const { width, height } = data;
    const items = data.items;

    this._batchExporting = true;
    btn.disabled = true;
    let empties = 0;
    const sections = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setMsg('ok', `Řez ${i + 1}/${items.length} (${formatStation(it.station)})…`);
        let curves = null;
        try {
          curves = this.engine.computeSectionCurves({
            point: it.point,
            normal: it.normal,
            bounds: { origin: it.point, hAxis: it.hAxis, halfWidth: width / 2, halfHeight: height / 2 },
          });
        } catch (err) {
          console.warn('Řez selhal na staničení', it.station, err);
        }
        if (!curves || curves.length === 0) {
          empties++;
        } else {
          for (const c of curves) {
            c._layer = this.engine.getElementLayer?.(c.modelId, c.expressId) || null;
            c._dz = this.engine.getElevationOffset?.(c.modelId) || 0;
          }
          sections.push({ station: it.station, curves, plane: { point: it.point, normal: it.normal } });
        }
        // Nechat UI dýchat mezi iteracemi.
        await new Promise(r => requestAnimationFrame(r));
      }

      if (sections.length === 0) {
        setMsg('warn', `Žádný řez neprotíná geometrii (${items.length} staničení bez průniku).`);
        return;
      }

      const dxf = await buildMultiSectionDxf(sections, { width, height });
      if (!dxf) {
        setMsg('warn', 'DXF se nepodařilo sestavit — žádná data.');
        return;
      }
      const step = parseFloat(tab.querySelector('[data-role="step"]').value);
      const stepStr = Number.isFinite(step) && step > 0 ? String(step) : 'ruc';
      const name = sanitizeFilePart(`rezy-${a.name || 'osa'}-${stepStr}m`);
      const blob = new Blob([dxf], { type: 'application/dxf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${name}.dxf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setMsg('ok', `DXF staženo (${sections.length} ${plural(sections.length, 'řez', 'řezy', 'řezů')}${empties > 0 ? `, ${empties} staničení bez průniku` : ''}).`);
    } catch (e) {
      console.error(e);
      setMsg('err', 'Export DXF selhal: ' + (e.message || String(e)));
    } finally {
      this._batchExporting = false;
      btn.disabled = false;
    }
  }

  _warningsHtml() {
    const lines = Array.isArray(this.warnings) ? this.warnings.slice() : [];
    if (this._suggestSwap) {
      lines.push('Souřadnice vypadají na opačné pořadí — zkuste přepnout „Prohodit X/Y".');
    }
    if (lines.length === 0) return '';
    const items = lines.map(w => `<div>• ${escapeHtml(String(w))}</div>`).join('');
    const btn = this._suggestSwap
      ? `<button class="v3d-panel__btn v3d-panel__btn--sm" data-act="swap-reimport">Přenačíst s ${this._suggestSwap.suggested ? 'prohozeným' : 'standardním'} X/Y</button>`
      : '';
    const body = lines.length > 3
      ? `<details><summary>Upozornění (${lines.length})</summary>${items}</details>${btn}`
      : `${items}${btn}`;
    return `<div class="v3d-panel__msg v3d-panel__msg--warn">${body}</div>`;
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

// Bezpečná část názvu souboru: nepovolené znaky → '_'.
function sanitizeFilePart(s) {
  return String(s).replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'rezy';
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
