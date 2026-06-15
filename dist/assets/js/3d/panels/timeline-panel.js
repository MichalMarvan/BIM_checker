// 4D Timeline — CSV/MS Project/P6/IfcWorkSchedule + date scrubber + play/pause animation.

export default class TimelinePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    this.titleEl = titleEl;
    this._playTimer = null;
    titleEl.textContent = 'Časová osa';
  }

  mount() { this._render(); }

  _render() {
    this._stop();
    const state = this.engine.getTimelineState?.();
    const wsList = this.engine.findIfcWorkSchedules?.() || [];
    const range = this._scheduleRange(state?.schedule);
    const hasSchedule = !!state?.schedule;
    const taskCount = state?.schedule?.tasks?.length || 0;
    const date = state?.date || (range ? range.min : new Date().toISOString().slice(0, 10));

    this.titleEl.textContent = hasSchedule ? '4D časová osa' : 'Časová osa';

    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Import harmonogramu</h4>
        <div class="v3d-panel__row">
          <label class="v3d-panel__btn v3d-panel__btn--sm">⇡ CSV<input type="file" accept=".csv" hidden data-act="csv"></label>
          <label class="v3d-panel__btn v3d-panel__btn--sm">⇡ MS Project<input type="file" accept=".xml" hidden data-act="msp"></label>
          <label class="v3d-panel__btn v3d-panel__btn--sm">⇡ P6 XER<input type="file" accept=".xer" hidden data-act="xer"></label>
        </div>
        ${wsList.length ? `
          <div class="v3d-panel__field">
            <label>IfcWorkSchedule</label>
            <div class="v3d-panel__row">
              <select class="v3d-panel__select" data-role="ws">${wsList.map(w => `<option value="${w.modelId}|${w.expressId}">${escapeHtml(w.name)}</option>`).join('')}</select>
              <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="load-ws">Načíst</button>
            </div>
          </div>` : ''}
      </div>
      <div data-role="msg"></div>
      ${hasSchedule ? `
        <hr class="v3d-panel__divider">
        <div class="v3d-panel__section">
          <h4>Simulace výstavby</h4>
          <div class="v3d-panel__kv"><span>Úkoly</span><b>${taskCount}</b></div>
          ${range ? `<div class="v3d-panel__kv"><span>Rozsah</span><b>${range.min} – ${range.max}</b></div>` : ''}
          <div class="v3d-panel__field">
            <label>Datum simulace</label>
            <input type="date" class="v3d-panel__input" data-role="date" value="${date}" ${range ? `min="${range.min}" max="${range.max}"` : ''}>
          </div>
          ${range ? `
            <div class="v3d-panel__field">
              <label data-role="slider-label">${date}</label>
              <input type="range" class="v3d-panel__input" data-role="slider" min="0" max="${range.days}" value="${this._dayOffset(range.min, date)}" step="1">
            </div>
            <div class="v3d-panel__row">
              <button class="v3d-panel__btn v3d-panel__btn--primary" data-role="play">▶ Přehrát</button>
              <button class="v3d-panel__btn v3d-panel__btn--danger" data-act="clear">⏹ Vyčistit</button>
            </div>` : `
            <button class="v3d-panel__btn v3d-panel__btn--danger v3d-panel__btn--block" data-act="clear">⏹ Vyčistit</button>`}
        </div>` : `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">📅</div>
          <p>Naimportujte harmonogram pro simulaci výstavby v čase.</p>
        </div>`}
    `;

    this._range = range;
    this.host.querySelector('[data-act="csv"]')?.addEventListener('change', (e) => this._load(e.target.files[0], 'csv'));
    this.host.querySelector('[data-act="msp"]')?.addEventListener('change', (e) => this._load(e.target.files[0], 'msp'));
    this.host.querySelector('[data-act="xer"]')?.addEventListener('change', (e) => this._load(e.target.files[0], 'xer'));

    const dateEl = this.host.querySelector('[data-role="date"]');
    if (dateEl) {
      dateEl.addEventListener('change', () => this._setDate(dateEl.value));
    }
    const slider = this.host.querySelector('[data-role="slider"]');
    if (slider && range) {
      slider.addEventListener('input', () => {
        const d = this._addDays(range.min, parseInt(slider.value, 10));
        this._setDate(d, { skipSlider: true });
      });
    }
    const playBtn = this.host.querySelector('[data-role="play"]');
    if (playBtn) {
      playBtn.addEventListener('click', () => this._togglePlay());
    }
    const clearBtn = this.host.querySelector('[data-act="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => { this.engine.clearTimeline?.(); this._render(); });
    }
    const loadWs = this.host.querySelector('[data-act="load-ws"]');
    if (loadWs) {
      loadWs.addEventListener('click', () => {
        const v = this.host.querySelector('[data-role="ws"]').value;
        const [mid, eid] = v.split('|');
        try {
          const sched = this.engine.parseIfcWorkSchedule?.(mid, parseInt(eid, 10));
          this.engine.setActiveSchedule?.(sched, new Date().toISOString().slice(0, 10));
          this._render();
        } catch (e) {
          this._msg(e.message, 'err');
        }
      });
    }
  }

  _setDate(dateStr, opts = {}) {
    this.engine.setTimelineDate?.(dateStr);
    const dateEl = this.host.querySelector('[data-role="date"]');
    if (dateEl) {
      dateEl.value = dateStr;
    }
    const label = this.host.querySelector('[data-role="slider-label"]');
    if (label) {
      label.textContent = dateStr;
    }
    if (!opts.skipSlider && this._range) {
      const slider = this.host.querySelector('[data-role="slider"]');
      if (slider) {
        slider.value = String(this._dayOffset(this._range.min, dateStr));
      }
    }
  }

  _togglePlay() {
    if (this._playTimer) {
      this._stop();
      return;
    }
    const range = this._range;
    if (!range) {
      return;
    }
    const playBtn = this.host.querySelector('[data-role="play"]');
    if (playBtn) {
      playBtn.textContent = '⏸ Pauza';
    }
    let offset = this._dayOffset(range.min, this.host.querySelector('[data-role="date"]')?.value || range.min);
    if (offset >= range.days) {
      offset = 0;
    }
    const step = Math.max(1, Math.round(range.days / 60)); // ~60 frames over full range
    this._playTimer = setInterval(() => {
      offset += step;
      if (offset >= range.days) {
        offset = range.days;
        this._setDate(this._addDays(range.min, offset));
        this._stop();
        return;
      }
      this._setDate(this._addDays(range.min, offset));
    }, 200);
  }

  _stop() {
    if (this._playTimer) {
      clearInterval(this._playTimer);
      this._playTimer = null;
    }
    const playBtn = this.host?.querySelector('[data-role="play"]');
    if (playBtn) {
      playBtn.textContent = '▶ Přehrát';
    }
  }

  _scheduleRange(schedule) {
    if (!schedule?.tasks?.length) {
      return null;
    }
    let min = null;
    let max = null;
    for (const t of schedule.tasks) {
      if (t.start && (min === null || t.start < min)) {
        min = t.start;
      }
      if (t.end && (max === null || t.end > max)) {
        max = t.end;
      }
    }
    if (schedule.projectStart && (min === null || schedule.projectStart < min)) {
      min = schedule.projectStart;
    }
    if (schedule.projectEnd && (max === null || schedule.projectEnd > max)) {
      max = schedule.projectEnd;
    }
    if (!min || !max || min > max) {
      return null;
    }
    return { min, max, days: this._dayOffset(min, max) };
  }

  _dayOffset(from, to) {
    const a = Date.parse(from);
    const b = Date.parse(to);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return 0;
    }
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  _addDays(from, days) {
    const d = new Date(Date.parse(from) + days * 86400000);
    return d.toISOString().slice(0, 10);
  }

  async _load(file, fmt) {
    if (!file) {
      return;
    }
    const text = await file.text();
    try {
      let sched;
      if (fmt === 'csv') {
        sched = this.engine.parseScheduleCsv?.(text);
      } else if (fmt === 'msp') {
        sched = this.engine.parseMsProjectXml?.(text);
      } else if (fmt === 'xer') {
        sched = this.engine.parseP6Xer?.(text);
      }
      if (!sched) {
        throw new Error('Import není v tomto enginu podporován.');
      }
      this.engine.setActiveSchedule?.(sched, new Date().toISOString().slice(0, 10));
      this._render();
    } catch (e) {
      this._msg('Import: ' + e.message, 'err');
    }
  }

  _msg(text, kind) {
    const box = this.host.querySelector('[data-role="msg"]');
    if (box) {
      box.innerHTML = `<div class="v3d-panel__msg v3d-panel__msg--${kind}">${escapeHtml(text)}</div>`;
    }
  }

  destroy() { this._stop(); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
