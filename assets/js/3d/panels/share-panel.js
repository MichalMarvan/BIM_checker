// URL share — encode current view in URL fragment.

export default class SharePanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Sdílet pohled';
  }

  mount() {
    this.host.innerHTML = `
      <div class="v3d-panel__section">
        <h4>Sdílení pohledu</h4>
        <p class="v3d-panel__hint">Vygeneruje odkaz, který v sobě nese aktuální stav vieweru. Nic se neukládá na server — vše je zakódováno přímo v adrese. Příjemce musí mít načtené stejné modely.</p>
      </div>
      <div class="v3d-panel__section">
        <h4>Co odkaz obsahuje</h4>
        <div class="v3d-panel__kv"><span>Kamera</span><b>pozice + cíl</b></div>
        <div class="v3d-panel__kv"><span>Režim zobrazení</span><b data-kv="mode">—</b></div>
        <div class="v3d-panel__kv"><span>Modely</span><b data-kv="models">—</b></div>
        <div class="v3d-panel__kv"><span>Skryté prvky</span><b data-kv="hidden">—</b></div>
      </div>
      <button class="v3d-panel__btn v3d-panel__btn--primary v3d-panel__btn--block" data-act="make">🔗 Vytvořit odkaz</button>
      <div class="v3d-panel__field">
        <textarea class="v3d-panel__textarea" data-role="url" rows="3" placeholder="Odkaz se zobrazí zde — nebo sem vložte cizí odkaz a načtěte jej."></textarea>
      </div>
      <div class="v3d-panel__row">
        <button class="v3d-panel__btn v3d-panel__btn--block" data-act="copy">⧉ Kopírovat</button>
        <button class="v3d-panel__btn v3d-panel__btn--block" data-act="apply">Načíst z URL</button>
      </div>
      <div data-role="msg"></div>
    `;
    this.host.querySelector('[data-act="make"]').addEventListener('click', () => this._make());
    this.host.querySelector('[data-act="copy"]').addEventListener('click', () => this._copy());
    this.host.querySelector('[data-act="apply"]').addEventListener('click', () => this._apply());
    this._updateKv();
  }

  _msg(kind, text) {
    const box = this.host.querySelector('[data-role="msg"]');
    if (!box) return;
    box.innerHTML = text ? `<div class="v3d-panel__msg v3d-panel__msg--${kind}">${escapeHtml(text)}</div>` : '';
  }

  _updateKv() {
    const s = this._state();
    const set = (k, v) => { const el = this.host.querySelector(`[data-kv="${k}"]`); if (el) el.textContent = v; };
    set('mode', s.displayMode || '—');
    set('models', String(s.models.length));
    set('hidden', String(s.hidden.length));
  }

  _state() {
    return {
      camera: this.engine.getCameraState?.() || null,
      displayMode: this.engine.getDisplayMode?.(),
      models: (this.engine.getModels?.() || []).map(m => m.name),
      hidden: this.engine.getHiddenEntityIds?.() || [],
    };
  }

  _make() {
    try {
      const s = this._state();
      const json = JSON.stringify(s);
      const enc = btoa(unescape(encodeURIComponent(json)));
      const url = new URL(window.location.href);
      url.hash = 'v=' + enc;
      const str = url.toString();
      this.host.querySelector('[data-role="url"]').value = str;
      this._updateKv();
      if (str.length > 2000) {
        this._msg('warn', `Odkaz vytvořen (${str.length} znaků). Velmi dlouhé odkazy nemusí fungovat všude (e-mail, chat).`);
      } else {
        this._msg('ok', `Odkaz vytvořen (${str.length} znaků).`);
      }
    } catch (e) {
      this._msg('err', 'Odkaz se nepodařilo vytvořit: ' + (e.message || e));
    }
  }

  async _copy() {
    const ta = this.host.querySelector('[data-role="url"]');
    const v = ta.value.trim();
    if (!v) { this._msg('warn', 'Nejprve vytvořte odkaz.'); return; }
    const btn = this.host.querySelector('[data-act="copy"]');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(v);
      } else {
        ta.select();
        document.execCommand('copy');
      }
      const orig = btn.textContent;
      btn.textContent = '✓ Zkopírováno';
      setTimeout(() => { btn.textContent = orig; }, 1600);
      this._msg('ok', 'Odkaz zkopírován do schránky.');
    } catch (e) {
      this._msg('err', 'Kopírování selhalo: ' + (e.message || e));
    }
  }

  _apply() {
    const v = this.host.querySelector('[data-role="url"]').value.trim();
    if (!v) { this._msg('warn', 'Vložte odkaz do pole výše.'); return; }
    try {
      const url = new URL(v);
      const enc = url.hash.replace(/^#v=/, '');
      if (!enc) throw new Error('odkaz neobsahuje sdílený pohled (#v=…)');
      const json = decodeURIComponent(escape(atob(enc)));
      const s = JSON.parse(json);
      if (typeof this.engine.setCameraState !== 'function') {
        this._msg('warn', 'Engine nepodporuje obnovení kamery — pohled nelze načíst.');
        return;
      }
      if (s.camera) this.engine.setCameraState(s.camera);
      if (s.displayMode) this.engine.setDisplayMode?.(s.displayMode);
      this.engine.showAll?.();
      if (s.hidden?.length) this.engine.hideEntities?.(s.hidden);
      this._msg('ok', 'Sdílený pohled byl načten.');
    } catch (e) {
      this._msg('err', 'URL není platná: ' + (e.message || e));
    }
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
