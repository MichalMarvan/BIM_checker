// Issues tracker — CDE-grade markup with comments thread + BCF export.

const STORE = 'bim_checker_issues_v1';
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
const save = (l) => localStorage.setItem(STORE, JSON.stringify(l));

const STATUSES = ['Open', 'In Review', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];

export default class IssuesPanel {
  constructor({ engine, host, titleEl }) {
    this.engine = engine;
    this.host = host;
    titleEl.textContent = 'Issues';
    this._editIdx = -1;
  }

  mount() { this._render(); }

  _render() {
    const list = load();
    this.host.innerHTML = `
      <div class="v3d-panel__row">
        <button class="v3d-btn v3d-btn--primary" data-act="new">＋ Nový issue</button>
        <button class="v3d-pill" data-act="bcf">⇣ BCF</button>
        <button class="v3d-pill" data-act="bcf-import">⇡ BCF</button>
        <input type="file" data-act="bcf-import-file" accept=".bcf,.bcfzip" hidden>
      </div>
      <ul class="v3d-panel__list" style="margin-top:8px">
        ${list.map((it, i) => `
          <li style="flex-direction:column;align-items:flex-start;gap:2px">
            <div style="display:flex;align-items:center;gap:6px;width:100%">
              <span style="flex:1"><strong>${escapeHtml(it.title)}</strong></span>
              <span class="v3d-pill" style="font-size:10px">${escapeHtml(it.status)}</span>
              <button class="v3d-pill" data-act="open" data-i="${i}">⌖</button>
              <button class="v3d-pill" data-act="del" data-i="${i}">✕</button>
            </div>
            <small style="color:var(--text-tertiary)">${escapeHtml(it.priority)} · ${escapeHtml(it.assignee || '—')} · ${escapeHtml((it.comments || []).length + ' kom')}</small>
          </li>
        `).join('') || '<li style="color:var(--text-tertiary)">Žádné issues</li>'}
      </ul>
      <div data-role="editor"></div>
    `;
    this.host.querySelector('[data-act="new"]').addEventListener('click', () => this._edit(-1));
    this.host.querySelector('[data-act="bcf"]').addEventListener('click', () => this._exportBcf());
    this.host.querySelector('[data-act="bcf-import"]').addEventListener('click', () => this.host.querySelector('[data-act="bcf-import-file"]').click());
    this.host.querySelector('[data-act="bcf-import-file"]').addEventListener('change', (e) => this._importBcf(e.target.files[0]));
    this.host.querySelectorAll('[data-act="open"]').forEach(b => b.addEventListener('click', () => this._open(parseInt(b.dataset.i, 10))));
    this.host.querySelectorAll('[data-act="del"]').forEach(b => b.addEventListener('click', () => {
      const list = load(); list.splice(parseInt(b.dataset.i, 10), 1); save(list); this._render();
    }));
  }

  _edit(i) {
    const list = load();
    const it = i >= 0 ? list[i] : { title: '', description: '', priority: 'Normal', status: 'Open', assignee: '', created: new Date().toISOString(), comments: [] };
    const editor = this.host.querySelector('[data-role="editor"]');
    editor.innerHTML = `
      <div class="v3d-panel__section">
        <h4>${i < 0 ? 'Nový issue' : 'Upravit'}</h4>
        <input class="v3d-panel__input" data-f="title" value="${escapeHtml(it.title)}" maxlength="120" placeholder="Název" style="margin-bottom:4px">
        <textarea class="v3d-panel__input" data-f="description" placeholder="Popis" rows="3" maxlength="2000">${escapeHtml(it.description)}</textarea>
        <div class="v3d-panel__row" style="margin-top:4px">
          <select class="v3d-panel__select" data-f="priority">${PRIORITIES.map(p => `<option ${p === it.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
          <select class="v3d-panel__select" data-f="status">${STATUSES.map(s => `<option ${s === it.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <input class="v3d-panel__input" data-f="assignee" value="${escapeHtml(it.assignee || '')}" placeholder="Přiřazeno" maxlength="80" style="margin-top:4px">
        <div class="v3d-panel__row" style="margin-top:6px">
          <button class="v3d-btn v3d-btn--primary" data-act="save">Uložit</button>
          <button class="v3d-pill" data-act="cancel">Zrušit</button>
        </div>
      </div>
    `;
    editor.querySelector('[data-act="save"]').addEventListener('click', () => {
      const get = (k) => editor.querySelector(`[data-f="${k}"]`).value.slice(0, 2000);
      const updated = { ...it, title: get('title'), description: get('description'), priority: get('priority'), status: get('status'), assignee: get('assignee') };
      if (i < 0) {
        // Capture current viewpoint
        try { updated.viewpoint = this.engine.getCameraState(); updated.highlights = this.engine.getHighlightedIds() || []; } catch {}
        list.push(updated);
      } else {
        list[i] = updated;
      }
      save(list); this._render();
    });
    editor.querySelector('[data-act="cancel"]').addEventListener('click', () => { editor.innerHTML = ''; });
  }

  _open(i) {
    const it = load()[i];
    if (!it) return;
    if (it.viewpoint) try { this.engine.setCameraState(it.viewpoint); } catch {}
    if (it.highlights?.length) try { this.engine.clearHighlights(); this.engine.highlight(it.highlights); } catch {}
    this._edit(i);
  }

  async _exportBcf() {
    // Minimal BCF 2.1: zip with bcf.version, markup per issue
    try {
      const list = load();
      const JSZip = await import('https://esm.sh/jszip@3.10.1').then(m => m.default);
      const zip = new JSZip();
      zip.file('bcf.version', '<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>');
      list.forEach((it, idx) => {
        const guid = it.guid || crypto.randomUUID();
        zip.folder(guid).file('markup.bcf',
          `<?xml version="1.0"?><Markup><Topic Guid="${guid}" TopicType="Issue" TopicStatus="${escAttr(it.status)}"><Title>${escapeHtml(it.title)}</Title><Priority>${escapeHtml(it.priority)}</Priority><Description>${escapeHtml(it.description || '')}</Description><AssignedTo>${escapeHtml(it.assignee || '')}</AssignedTo></Topic></Markup>`);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      download(blob, `issues-${Date.now()}.bcf`);
    } catch (e) { alert('BCF export selhal: ' + e.message); }
  }

  async _importBcf(file) {
    if (!file) return;
    try {
      const JSZip = await import('https://esm.sh/jszip@3.10.1').then(m => m.default);
      const zip = await JSZip.loadAsync(file);
      const list = load();
      for (const name of Object.keys(zip.files)) {
        if (!name.endsWith('markup.bcf')) continue;
        const xml = await zip.files[name].async('string');
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const topic = doc.querySelector('Topic');
        if (!topic) continue;
        list.push({
          title: doc.querySelector('Title')?.textContent || 'BCF',
          description: doc.querySelector('Description')?.textContent || '',
          priority: doc.querySelector('Priority')?.textContent || 'Normal',
          status: topic.getAttribute('TopicStatus') || 'Open',
          assignee: doc.querySelector('AssignedTo')?.textContent || '',
          guid: topic.getAttribute('Guid'),
          comments: [],
          created: new Date().toISOString(),
        });
      }
      save(list); this._render();
    } catch (e) { alert('BCF import selhal: ' + e.message); }
  }

  destroy() {}
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
