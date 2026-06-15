// Walk mode — WASD + gravity + collision (engine handles loop).

const CONTROLS = [
    { key: 'W A S D', desc: 'Pohyb vpřed / vlevo / vzad / vpravo' },
    { key: 'Myš', desc: 'Rozhlížení' },
    { key: 'Mezerník', desc: 'Skok / pohyb vzhůru' },
    { key: 'Shift', desc: 'Sprint' },
    { key: 'Esc', desc: 'Ukončit walk mode' },
];

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
            <div class="v3d-panel__section">
                <h4>Ovládání</h4>
                ${CONTROLS.map((c) => `
                    <div class="v3d-panel__kv"><span>${c.desc}</span><b>${c.key}</b></div>
                `).join('')}
            </div>
            <div class="v3d-panel__section">
                <label class="v3d-panel__toggle">
                    <input type="checkbox" data-role="gravity" checked> Gravitace + kolize
                </label>
                <p class="v3d-panel__hint">Při vypnutí létáte volně bez gravitace.</p>
            </div>
            <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-role="toggle">
                ${active ? '⏹ Zastavit walk' : '▶ Spustit walk'}
            </button>
        `;
        this.host.querySelector('[data-role="toggle"]').addEventListener('click', () => {
            if (this.engine.isWalking?.()) {
                this.engine.stopWalk?.();
            } else {
                const g = this.host.querySelector('[data-role="gravity"]').checked;
                this.engine.startWalk?.({ gravity: g });
            }
            this._render();
        });
    }

    destroy() { this.engine.stopWalk?.(); }
}
