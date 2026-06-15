// Display modes panel — Solid / X-ray / Transparent / Hidden-line / Wireframe + edges toggle.

const MODES = [
    { id: 'solid', label: 'Plné' },
    { id: 'xray', label: 'X-ray' },
    { id: 'transparent', label: 'Průhledné' },
    { id: 'hidden-line', label: 'Skryté hrany' },
    { id: 'wireframe', label: 'Drátový model' },
];

export default class DisplayPanel {
    constructor({ engine, host, titleEl }) {
        this.engine = engine;
        this.host = host;
        titleEl.textContent = 'Zobrazení';
    }

    mount() {
        const current = this.engine.getDisplayMode?.() || 'solid';
        const edges = !!this.engine.getEdgesVisible?.();
        this.host.innerHTML = `
            <div class="v3d-panel__section">
                <h4>Mód</h4>
                <div class="v3d-panel__pills" data-role="modes">
                    ${MODES.map((m) => `
                        <button class="v3d-panel__btn v3d-panel__btn--sm ${m.id === current ? 'v3d-panel__btn--primary' : ''}" data-mode="${m.id}">${m.label}</button>
                    `).join('')}
                </div>
                <p class="v3d-panel__hint">X-ray ponechá vybrané entity plné, ostatní průhledné.</p>
            </div>
            <div class="v3d-panel__section">
                <label class="v3d-panel__toggle">
                    <input type="checkbox" data-role="edges" ${edges ? 'checked' : ''}> Zobrazit hrany
                </label>
            </div>
        `;
        this.host.querySelectorAll('[data-role="modes"] [data-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const m = btn.dataset.mode;
                this.engine.setDisplayMode?.(m);
                this.host.querySelectorAll('[data-role="modes"] [data-mode]').forEach((b) => {
                    b.classList.toggle('v3d-panel__btn--primary', b === btn);
                });
            });
        });
        this.host.querySelector('[data-role="edges"]').addEventListener('change', (e) => {
            this.engine.setEdgesVisible?.(e.target.checked);
        });
    }

    destroy() {}
}
