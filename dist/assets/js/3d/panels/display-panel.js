// Display modes panel — Solid / X-ray / Transparent / Hidden-line / Wireframe + edges toggle.

const MODES = [
  { id: 'solid', label: 'Solid' },
  { id: 'xray', label: 'X-ray' },
  { id: 'transparent', label: 'Transparent' },
  { id: 'hidden-line', label: 'Hidden line' },
  { id: 'wireframe', label: 'Wireframe' },
];

export default class DisplayPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Zobrazení';
  }

  mount() {
    const current = this.engine.getDisplayMode() || 'solid';
    const edges = !!this.engine.getEdgesVisible?.();
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Mód</h4>
        <div class="v3d-panel__pills" data-role="modes">
          ${MODES.map(m => `<button class="v3d-pill ${m.id === current ? 'active' : ''}" data-mode="${m.id}">${m.label}</button>`).join('')}
        </div>
      </div>
      <div class="v3d-panel__section">
        <label class="v3d-panel__field"><input type="checkbox" data-role="edges" ${edges ? 'checked' : ''}> Hrany</label>
      </div>
      <p class="v3d-panel__hint">X-ray ponechá vybrané entity plné, ostatní průhledné.</p>
    `;
    this.host.querySelectorAll('[data-role="modes"] .v3d-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        this.engine.setDisplayMode(m);
        this.host.querySelectorAll('[data-role="modes"] .v3d-pill').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    this.host.querySelector('[data-role="edges"]').addEventListener('change', (e) => {
      this.engine.setEdgesVisible?.(e.target.checked);
    });
  }

  destroy() {}
}
