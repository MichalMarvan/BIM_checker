// Issues tracker — CDE-grade markup with comments thread + BCF export.

const STORE = 'bim_checker_issues_v1';
const load = () => {
    try {
        return JSON.parse(localStorage.getItem(STORE) || '[]');
    } catch {
        return [];
    }
};

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

    _save(list) {
        try {
            localStorage.setItem(STORE, JSON.stringify(list));
            return true;
        } catch (e) {
            this._msg(`Uložení selhalo: ${e.message}`, 'err');
            return false;
        }
    }

    _msg(text, kind) {
        const box = this.host.querySelector('[data-role="msg"]');
        if (!box) {
            return;
        }
        box.className = `v3d-panel__msg v3d-panel__msg--${kind}`;
        box.textContent = text;
        box.hidden = false;
    }

    _render() {
        const list = load();
        this.host.innerHTML = `
            <div class="v3d-panel__row">
                <button class="v3d-panel__btn v3d-panel__btn--primary" data-act="new">＋ Nový issue</button>
                <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="bcf">⇣ BCF</button>
                <button class="v3d-panel__btn v3d-panel__btn--sm" data-act="bcf-import">⇡ BCF</button>
                <input type="file" data-act="bcf-import-file" accept=".bcf,.bcfzip" hidden>
            </div>
            <div class="v3d-panel__msg" data-role="msg" hidden></div>
            ${list.length ? `
                <div class="v3d-panel__section">
                    ${list.map((it, i) => `
                        <div class="v3d-panel__item">
                            <div class="v3d-panel__item-main">
                                <div class="v3d-panel__item-title">${escapeHtml(it.title) || '(bez názvu)'}</div>
                                <div class="v3d-panel__item-sub">${escapeHtml(it.priority)} · ${escapeHtml(it.assignee || '—')} · ${(it.comments || []).length} kom.</div>
                            </div>
                            <span class="v3d-panel__badge">${escapeHtml(it.status)}</span>
                            <button class="v3d-panel__item-btn" data-act="open" data-i="${i}" title="Otevřít">⌖</button>
                            <button class="v3d-panel__item-btn v3d-panel__item-btn--danger" data-act="del" data-i="${i}" title="Smazat">✕</button>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="v3d-panel__empty">
                    <div class="v3d-panel__empty-icon">🗒️</div>
                    <p>Žádné issues.<br>Vytvořte nový nebo importujte BCF.</p>
                </div>
            `}
            <div data-role="editor"></div>
        `;
        this.host.querySelector('[data-act="new"]').addEventListener('click', () => this._edit(-1));
        this.host.querySelector('[data-act="bcf"]').addEventListener('click', () => this._exportBcf());
        this.host.querySelector('[data-act="bcf-import"]').addEventListener('click', () => this.host.querySelector('[data-act="bcf-import-file"]').click());
        this.host.querySelector('[data-act="bcf-import-file"]').addEventListener('change', (e) => this._importBcf(e.target.files[0]));
        this.host.querySelectorAll('[data-act="open"]').forEach((b) => b.addEventListener('click', () => this._open(parseInt(b.dataset.i, 10))));
        this.host.querySelectorAll('[data-act="del"]').forEach((b) => b.addEventListener('click', () => {
            if (!confirm('Smazat tento issue?')) {
                return;
            }
            const next = load();
            next.splice(parseInt(b.dataset.i, 10), 1);
            if (this._save(next)) {
                this._render();
            }
        }));
    }

    _edit(i) {
        const list = load();
        const it = i >= 0 ? list[i] : { title: '', description: '', priority: 'Normal', status: 'Open', assignee: '', created: new Date().toISOString(), comments: [] };
        const editor = this.host.querySelector('[data-role="editor"]');
        editor.innerHTML = `
            <hr class="v3d-panel__divider">
            <div class="v3d-panel__section">
                <h4>${i < 0 ? 'Nový issue' : 'Upravit issue'}</h4>
                <div class="v3d-panel__field">
                    <label>Název</label>
                    <input class="v3d-panel__input" data-f="title" value="${escAttr(it.title)}" maxlength="120" placeholder="Název issue">
                </div>
                <div class="v3d-panel__field">
                    <label>Popis</label>
                    <textarea class="v3d-panel__textarea" data-f="description" placeholder="Popis" rows="3" maxlength="2000">${escapeHtml(it.description)}</textarea>
                </div>
                <div class="v3d-panel__field">
                    <label>Priorita / stav</label>
                    <div class="v3d-panel__row">
                        <select class="v3d-panel__select" data-f="priority">${PRIORITIES.map((p) => `<option ${p === it.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
                        <select class="v3d-panel__select" data-f="status">${STATUSES.map((s) => `<option ${s === it.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
                    </div>
                </div>
                <div class="v3d-panel__field">
                    <label>Přiřazeno</label>
                    <input class="v3d-panel__input" data-f="assignee" value="${escAttr(it.assignee || '')}" placeholder="Přiřazeno" maxlength="80">
                </div>
                <div class="v3d-panel__row">
                    <button class="v3d-panel__btn v3d-panel__btn--primary" data-act="save">Uložit</button>
                    <button class="v3d-panel__btn" data-act="cancel">Zrušit</button>
                </div>
            </div>
        `;
        editor.querySelector('[data-act="save"]').addEventListener('click', () => {
            const get = (k) => editor.querySelector(`[data-f="${k}"]`).value.slice(0, 2000);
            const updated = { ...it, title: get('title'), description: get('description'), priority: get('priority'), status: get('status'), assignee: get('assignee') };
            if (i < 0) {
                // Capture current viewpoint
                try {
                    updated.viewpoint = this.engine.getCameraState?.();
                    updated.highlights = this.engine.getHighlightedIds?.() || [];
                } catch {
                    // viewpoint capture is best-effort
                }
                list.push(updated);
            } else {
                list[i] = updated;
            }
            if (this._save(list)) {
                this._render();
            }
        });
        editor.querySelector('[data-act="cancel"]').addEventListener('click', () => { editor.innerHTML = ''; });
    }

    _open(i) {
        const it = load()[i];
        if (!it) {
            return;
        }
        if (it.viewpoint) {
            try {
                this.engine.setCameraState?.(it.viewpoint);
            } catch {
                // ignore
            }
        }
        if (it.highlights?.length) {
            try {
                this.engine.clearHighlights?.();
                this.engine.highlight?.(it.highlights);
            } catch {
                // ignore
            }
        }
        this._edit(i);
    }

    async _exportBcf() {
        // Minimal BCF 2.1: zip with bcf.version, markup per issue
        try {
            const list = load();
            if (!list.length) {
                this._msg('Žádné issues k exportu.', 'warn');
                return;
            }
            const JSZip = await import('https://esm.sh/jszip@3.10.1').then((m) => m.default);
            const zip = new JSZip();
            zip.file('bcf.version', '<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>');
            list.forEach((it) => {
                const guid = it.guid || crypto.randomUUID();
                zip.folder(guid).file('markup.bcf',
                    `<?xml version="1.0"?><Markup><Topic Guid="${guid}" TopicType="Issue" TopicStatus="${escAttr(it.status)}"><Title>${escapeHtml(it.title)}</Title><Priority>${escapeHtml(it.priority)}</Priority><Description>${escapeHtml(it.description || '')}</Description><AssignedTo>${escapeHtml(it.assignee || '')}</AssignedTo></Topic></Markup>`);
            });
            const blob = await zip.generateAsync({ type: 'blob' });
            download(blob, `issues-${Date.now()}.bcf`);
            this._msg(`Exportováno ${list.length} issues do BCF.`, 'ok');
        } catch (e) {
            this._msg(`BCF export selhal: ${e.message}`, 'err');
        }
    }

    async _importBcf(file) {
        if (!file) {
            return;
        }
        try {
            const JSZip = await import('https://esm.sh/jszip@3.10.1').then((m) => m.default);
            const zip = await JSZip.loadAsync(file);
            const list = load();
            let added = 0;
            for (const name of Object.keys(zip.files)) {
                if (!name.endsWith('markup.bcf')) {
                    continue;
                }
                const xml = await zip.files[name].async('string');
                const doc = new DOMParser().parseFromString(xml, 'text/xml');
                const topic = doc.querySelector('Topic');
                if (!topic) {
                    continue;
                }
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
                added++;
            }
            if (this._save(list)) {
                this._render();
                this._msg(`Importováno ${added} issues z BCF.`, 'ok');
            }
        } catch (e) {
            this._msg(`BCF import selhal: ${e.message}`, 'err');
        }
    }

    destroy() {}
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) {
    return String(s ?? '').replace(/"/g, '&quot;');
}
function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
