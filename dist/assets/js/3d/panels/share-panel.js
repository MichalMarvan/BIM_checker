// URL share — encode current view in URL fragment.

export default class SharePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Sdílet pohled';
  }

  mount() {
    this.host.innerHTML = `
      <p class="v3d-panel__hint">Vytvoří URL s aktuálním pohledem a stavem. Při otevření v jiném tabu si vyžádá potvrzení.</p>
      <button class="v3d-btn v3d-btn--primary" data-act="make">🔗 Vytvořit URL</button>
      <textarea class="v3d-panel__input" data-role="url" rows="3" style="margin-top:8px"></textarea>
      <div class="v3d-panel__row" style="margin-top:6px">
        <button class="v3d-pill" data-act="copy">Kopírovat</button>
        <button class="v3d-pill" data-act="apply">Načíst z URL</button>
      </div>
      <p class="v3d-panel__hint" data-role="status"></p>
    `;
    this.host.querySelector('[data-act="make"]').addEventListener('click', () => this._make());
    this.host.querySelector('[data-act="copy"]').addEventListener('click', () => this._copy());
    this.host.querySelector('[data-act="apply"]').addEventListener('click', () => this._apply());
  }

  _state() {
    return {
      camera: this.engine.getCameraState(),
      displayMode: this.engine.getDisplayMode?.(),
      models: (this.engine.getModels?.() || []).map(m => m.name),
      hidden: this.engine.getHiddenEntityIds?.() || [],
    };
  }

  _make() {
    const s = this._state();
    const json = JSON.stringify(s);
    const enc = btoa(unescape(encodeURIComponent(json)));
    const url = new URL(window.location.href);
    url.hash = 'v=' + enc;
    this.host.querySelector('[data-role="url"]').value = url.toString();
    this.host.querySelector('[data-role="status"]').textContent = `${url.toString().length} B`;
  }

  _copy() {
    const v = this.host.querySelector('[data-role="url"]').value;
    if (!v) return;
    navigator.clipboard?.writeText(v).then(() => {
      this.host.querySelector('[data-role="status"]').textContent = '✓ Zkopírováno.';
    });
  }

  _apply() {
    const v = this.host.querySelector('[data-role="url"]').value;
    if (!v) return;
    if (!confirm('Aplikovat sdílený pohled? Aktuální stav bude přepsán.')) return;
    try {
      const url = new URL(v);
      const enc = url.hash.replace(/^#v=/, '');
      const json = decodeURIComponent(escape(atob(enc)));
      const s = JSON.parse(json);
      if (s.camera) this.engine.setCameraState(s.camera);
      if (s.displayMode) this.engine.setDisplayMode?.(s.displayMode);
      this.engine.showAll();
      if (s.hidden?.length) this.engine.hideEntities(s.hidden);
    } catch (e) { alert('URL neplatná: ' + e.message); }
  }

  destroy() {}
}
