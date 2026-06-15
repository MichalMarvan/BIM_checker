// 3D pins — point / line / bbox / entity types.

const TYPES = [
    { id: 'point', label: '＋ Bod' },
    { id: 'line', label: '＋ Linie' },
    { id: 'bbox', label: '＋ BBox' },
    { id: 'entity', label: '＋ Entity' },
];

const DEFAULT_HINT = 'Vyberte typ, pak klikněte do scény.';

export default class PinsPanel {
    constructor({ engine, host, titleEl }) {
        this.engine = engine;
        this.host = host;
        titleEl.textContent = 'Piny / markup';
        this._pickHandler = null;
    }

    mount() { this._render(); }

    _render() {
        let pins = [];
        try {
            pins = this.engine.getPins?.() || [];
        } catch {
            pins = [];
        }
        this.host.innerHTML = `
            <div class="v3d-panel__section">
                <h4>Přidat pin</h4>
                <div class="v3d-panel__pills">
                    ${TYPES.map((tpe) => `<button class="v3d-panel__btn v3d-panel__btn--sm" data-add="${tpe.id}">${tpe.label}</button>`).join('')}
                </div>
                <p class="v3d-panel__hint" data-role="hint">${DEFAULT_HINT}</p>
            </div>
            ${pins.length ? `
                <div class="v3d-panel__section">
                    ${pins.map((p) => `
                        <div class="v3d-panel__item">
                            <span class="v3d-panel__badge">${escapeHtml(p.type)}</span>
                            <div class="v3d-panel__item-main">
                                <div class="v3d-panel__item-title">${escapeHtml(p.label || '#' + p.id)}</div>
                            </div>
                            <button class="v3d-panel__item-btn" data-act="focus" data-id="${escAttr(p.id)}" title="Zaměřit">⌖</button>
                            <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="del" data-id="${escAttr(p.id)}" title="Smazat">✕</button>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="v3d-panel__empty">
                    <div class="v3d-panel__empty-icon">📍</div>
                    <p>Žádné piny.<br>Vyberte typ a klikněte do scény.</p>
                </div>
            `}
        `;
        this.host.querySelectorAll('[data-add]').forEach((b) => {
            b.addEventListener('click', () => this._startAdd(b.dataset.add));
        });
        this.host.querySelectorAll('[data-act="focus"]').forEach((b) => {
            b.addEventListener('click', () => {
                if (this.engine.focusPin) {
                    try {
                        this.engine.focusPin(b.dataset.id);
                    } catch {
                        this._hint('Zaměření selhalo.');
                    }
                } else {
                    this._hint('Zaměření pinu není podporováno.');
                }
            });
        });
        this.host.querySelectorAll('[data-act="del"]').forEach((b) => {
            b.addEventListener('click', () => {
                try {
                    this.engine.removePin?.(b.dataset.id);
                } catch {
                    this._hint('Smazání selhalo.');
                }
                this._render();
            });
        });
    }

    _hint(text) {
        const hint = this.host.querySelector('[data-role="hint"]');
        if (hint) {
            hint.textContent = text;
        }
    }

    _startAdd(type) {
        this._hint(`Klikněte do scény (${type}).`);
        const canvas = document.querySelector('#viewerContainer canvas');
        if (!canvas) {
            this._hint('Scéna není připravená.');
            return;
        }

        const points = [];
        const need = (type === 'point' || type === 'entity') ? 1 : 2;

        const onClick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (type === 'entity') {
                const ent = this.engine.pickEntity?.(x, y);
                if (!ent) {
                    this._hint('Nic není pod kurzorem.');
                    return;
                }
                this.engine.addPin?.({ type: 'entity', modelId: ent.modelId, expressId: ent.expressId, label: `${ent.ifcType}#${ent.expressId}` });
                cleanup();
                this._render();
                return;
            }
            const p = this.engine.raycastPoint?.(x, y);
            if (!p) {
                this._hint('Mimo geometrii — zkuste jinde.');
                return;
            }
            points.push([p.x, p.y, p.z]);
            if (points.length === need) {
                if (type === 'point') {
                    this.engine.addPin?.({ type: 'point', point: points[0] });
                } else if (type === 'line') {
                    this.engine.addPin?.({ type: 'line', from: points[0], to: points[1] });
                } else if (type === 'bbox') {
                    const min = [Math.min(points[0][0], points[1][0]), Math.min(points[0][1], points[1][1]), Math.min(points[0][2], points[1][2])];
                    const max = [Math.max(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1]), Math.max(points[0][2], points[1][2])];
                    this.engine.addPin?.({ type: 'bbox', min, max });
                }
                cleanup();
                this._render();
            } else {
                this._hint(`${points.length}/${need} bodů — klikněte ještě.`);
            }
        };

        const cleanup = () => {
            canvas.removeEventListener('click', onClick);
            this._pickHandler = null;
            this._hint(DEFAULT_HINT);
        };
        if (this._pickHandler) {
            this._pickHandler();
        }
        this._pickHandler = cleanup;
        canvas.addEventListener('click', onClick);
    }

    destroy() {
        if (this._pickHandler) {
            this._pickHandler();
        }
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) {
    return String(s ?? '').replace(/"/g, '&quot;');
}
