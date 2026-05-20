// 3D pins — point / line / bbox / entity types.

export default class PinsPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Piny / markup';
    this._pickHandler = null;
  }

  mount() { this._render(); }

  _render() {
    const pins = this.engine.getPins() || [];
    this.host.innerHTML = `
      <div class="v3d-panel__pills">
        <button class="v3d-pill" data-add="point">＋ Bod</button>
        <button class="v3d-pill" data-add="line">＋ Linie</button>
        <button class="v3d-pill" data-add="bbox">＋ BBox</button>
        <button class="v3d-pill" data-add="entity">＋ Entity</button>
      </div>
      <p class="v3d-panel__hint" data-role="hint">Vyberte typ, pak klikněte do scény.</p>
      <ul class="v3d-panel__list" style="margin-top:10px">
        ${pins.map(p => `
          <li>
            <span style="flex:1">${escapeHtml(p.type)} ${escapeHtml(p.label || '#' + p.id)}</span>
            <button class="v3d-pill" data-act="del" data-id="${p.id}">✕</button>
          </li>
        `).join('') || '<li style="color:var(--text-tertiary)">Žádné piny</li>'}
      </ul>
    `;
    this.host.querySelectorAll('[data-add]').forEach((b) => {
      b.addEventListener('click', () => this._startAdd(b.dataset.add));
    });
    this.host.querySelectorAll('[data-act="del"]').forEach((b) => {
      b.addEventListener('click', () => { this.engine.removePin(b.dataset.id); this._render(); });
    });
  }

  _startAdd(type) {
    const hint = this.host.querySelector('[data-role="hint"]');
    hint.textContent = `Klikněte do scény (${type}).`;
    const canvas = document.querySelector('#viewerContainer canvas');
    if (!canvas) return;

    const points = [];
    const need = (type === 'point' || type === 'entity') ? 1 : 2;

    const onClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (type === 'entity') {
        const ent = this.engine.pickEntity(x, y);
        if (!ent) { hint.textContent = 'Nic není pod kurzorem.'; return; }
        this.engine.addPin({ type: 'entity', modelId: ent.modelId, expressId: ent.expressId, label: `${ent.ifcType}#${ent.expressId}` });
        cleanup();
        this._render();
        return;
      }
      const p = this.engine.raycastPoint(x, y);
      if (!p) { hint.textContent = 'Mimo geometrii — zkuste jinde.'; return; }
      points.push([p.x, p.y, p.z]);
      if (points.length === need) {
        if (type === 'point') this.engine.addPin({ type: 'point', point: points[0] });
        else if (type === 'line') this.engine.addPin({ type: 'line', from: points[0], to: points[1] });
        else if (type === 'bbox') {
          const min = [Math.min(points[0][0], points[1][0]), Math.min(points[0][1], points[1][1]), Math.min(points[0][2], points[1][2])];
          const max = [Math.max(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1]), Math.max(points[0][2], points[1][2])];
          this.engine.addPin({ type: 'bbox', min, max });
        }
        cleanup();
        this._render();
      } else {
        hint.textContent = `${points.length}/${need} bodů — klikněte ještě.`;
      }
    };

    const cleanup = () => {
      canvas.removeEventListener('click', onClick);
      this._pickHandler = null;
      hint.textContent = 'Vyberte typ, pak klikněte do scény.';
    };
    if (this._pickHandler) this._pickHandler();
    this._pickHandler = cleanup;
    canvas.addEventListener('click', onClick);
  }

  destroy() {
    if (this._pickHandler) this._pickHandler();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
