// 4D Timeline — CSV/MS Project/P6/IfcWorkSchedule + Gantt + color by status.

export default class TimelinePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = '4D Timeline';
  }

  mount() { this._render(); }

  _render() {
    const state = this.engine.getTimelineState?.();
    const wsList = this.engine.findIfcWorkSchedules?.() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__row">
        <label class="v3d-pill" style="cursor:pointer">⇡ CSV<input type="file" accept=".csv" hidden data-act="csv"></label>
        <label class="v3d-pill" style="cursor:pointer">⇡ MS Project<input type="file" accept=".xml" hidden data-act="msp"></label>
        <label class="v3d-pill" style="cursor:pointer">⇡ P6 XER<input type="file" accept=".xer" hidden data-act="xer"></label>
      </div>
      ${wsList.length ? `<div class="v3d-panel__field"><label>IfcWorkSchedule</label>
        <select class="v3d-panel__select" data-role="ws">${wsList.map(w => `<option value="${w.modelId}|${w.expressId}">${escapeHtml(w.name)}</option>`).join('')}</select>
        <button class="v3d-pill" data-act="load-ws">Načíst</button></div>` : ''}
      <div class="v3d-panel__field" data-role="active" ${state?.schedule ? '' : 'hidden'}>
        <label>Datum simulace</label>
        <input type="date" class="v3d-panel__input" data-role="date" value="${state?.date || new Date().toISOString().slice(0, 10)}">
        <button class="v3d-pill" data-act="clear">⏹ Vyčistit</button>
      </div>
      <p class="v3d-panel__hint" data-role="status">${state?.schedule ? `Tasky: ${state.schedule.tasks?.length || 0}` : ''}</p>
    `;
    this.host.querySelector('[data-act="csv"]').addEventListener('change', (e) => this._load(e.target.files[0], 'csv'));
    this.host.querySelector('[data-act="msp"]').addEventListener('change', (e) => this._load(e.target.files[0], 'msp'));
    this.host.querySelector('[data-act="xer"]').addEventListener('change', (e) => this._load(e.target.files[0], 'xer'));
    const dateEl = this.host.querySelector('[data-role="date"]');
    if (dateEl) dateEl.addEventListener('change', () => this.engine.setTimelineDate?.(dateEl.value));
    const clearBtn = this.host.querySelector('[data-act="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', () => { this.engine.clearTimeline?.(); this._render(); });
    const loadWs = this.host.querySelector('[data-act="load-ws"]');
    if (loadWs) loadWs.addEventListener('click', () => {
      const v = this.host.querySelector('[data-role="ws"]').value;
      const [mid, eid] = v.split('|');
      try { const sched = this.engine.parseIfcWorkSchedule?.(mid, parseInt(eid, 10)); this.engine.setActiveSchedule?.(sched, new Date().toISOString().slice(0, 10)); this._render(); }
      catch (e) { alert(e.message); }
    });
  }

  async _load(file, fmt) {
    if (!file) return;
    const text = await file.text();
    try {
      let sched;
      if (fmt === 'csv') sched = this.engine.parseScheduleCsv?.(text);
      else if (fmt === 'msp') sched = this.engine.parseMsProjectXml?.(text);
      else if (fmt === 'xer') sched = this.engine.parseP6Xer?.(text);
      this.engine.setActiveSchedule?.(sched, new Date().toISOString().slice(0, 10));
      this._render();
    } catch (e) { alert('Import: ' + e.message); }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
