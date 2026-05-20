// Walk mode — WASD + gravity + collision (engine handles loop).

export default class WalkPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Walk mode';
  }

  mount() { this._render(); }

  _render() {
    const active = this.engine.isWalking?.() === true;
    this.host.innerHTML = `
      <p class="v3d-panel__hint">WASD = pohyb, myš = rozhled, mezerník = skok / vzhůru, Shift = sprint, Esc = stop.</p>
      <div class="v3d-panel__field">
        <label><input type="checkbox" data-role="gravity" checked> Gravitace + kolize</label>
      </div>
      <button class="v3d-btn v3d-btn--primary" data-role="toggle">${active ? '⏹ Zastavit' : '▶ Spustit walk'}</button>
    `;
    this.host.querySelector('[data-role="toggle"]').addEventListener('click', () => {
      if (this.engine.isWalking?.()) { this.engine.stopWalk?.(); }
      else { const g = this.host.querySelector('[data-role="gravity"]').checked; this.engine.startWalk?.({ gravity: g }); }
      this._render();
    });
  }

  destroy() { this.engine.stopWalk?.(); }
}
