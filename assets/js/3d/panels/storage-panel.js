// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Michal Marvan
//
// Storage panel (left rail) — folder tree of IFC files from the active
// storage backend with per-file load. The "Modely" panel shows only the
// loaded models; browsing + loading lives here.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

export default class StoragePanel {
  constructor({ host, titleEl, ctx }) {
    this.host = host;
    this.ctx = ctx || {};
    this.folders = {};
    this.files = {};
    this.expanded = new Set(['root']);
    this.loading = new Set();    // fileIds currently loading
    this.folderLoading = null;   // folderId of a running batch load
    titleEl.textContent = 'Storage';
  }

  async mount() { await this._load(); }
  refresh() { this._render(); }

  async _load() {
    this.host.innerHTML = '<p class="v3d-panel__hint">Načítám storage…</p>';
    try {
      const { folders, files } = await this.ctx.buildTree();
      this.folders = folders;
      this.files = files;
      // root folder id differs per backend ('root' everywhere currently, but be safe)
      const rootId = Object.values(folders).find(f => !f.parentId)?.id;
      if (rootId) this.expanded.add(rootId);
      this._render();
    } catch (e) {
      this.host.innerHTML = `<div class="v3d-panel__error">Failed: ${escapeHtml(e.message || e)}</div>`;
    }
  }

  _loadedNames() {
    const models = (this.ctx.getLoadedModels && this.ctx.getLoadedModels()) || [];
    return new Set(models.map(m => m.name));
  }

  _render() {
    const rootId = Object.values(this.folders).find(f => !f.parentId)?.id;
    if (!rootId || Object.keys(this.files).length === 0) {
      this.host.innerHTML = `
        <p class="v3d-panel__hint">Ve storage nejsou žádné IFC soubory.<br>
        Nahraj je na hlavní stránce, nebo připoj složku z počítače.</p>
        <button class="v3d-btn v3d-st-refresh" data-act="rescan">↻ Obnovit</button>`;
      this.host.querySelector('[data-act="rescan"]').addEventListener('click', () => this._load());
      return;
    }
    const loaded = this._loadedNames();
    this.host.innerHTML = `
      <div class="v3d-st-tree">${this._renderFolder(rootId, 0, loaded)}</div>
      <button class="v3d-btn v3d-st-refresh" data-act="rescan" title="Znovu načíst obsah storage">↻ Obnovit</button>`;
    this.host.querySelector('[data-act="rescan"]').addEventListener('click', () => this._load());

    this.host.querySelectorAll('[data-folder-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.folderToggle;
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        this._render();
      });
    });
    this.host.querySelectorAll('[data-load-file]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const file = this.files[btn.dataset.loadFile];
        if (!file || !this.ctx.loadFile || this.loading.has(file.id) || this.folderLoading) return;
        this.loading.add(file.id);
        this._render();
        try {
          await this.ctx.loadFile(file);
        } finally {
          this.loading.delete(file.id);
          this._render();
        }
      });
    });

    // Folder batch load — all not-yet-loaded IFC files in the folder incl.
    // subfolders, sequentially (the engine pauses rendering per load anyway).
    this.host.querySelectorAll('[data-load-folder]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();  // the row click toggles expand
        if (this.folderLoading || !this.ctx.loadFile) return;
        const folderId = btn.dataset.loadFolder;
        const loaded = this._loadedNames();
        const files = this._filesInFolder(folderId).filter(f => !loaded.has(f.name));
        if (files.length === 0) return;
        this.folderLoading = folderId;
        this._render();
        try {
          for (const f of files) {
            this.loading.add(f.id);
            this._render();
            try {
              await this.ctx.loadFile(f);
            } finally {
              this.loading.delete(f.id);
            }
          }
        } finally {
          this.folderLoading = null;
          this._render();
        }
      });
    });
  }

  /** Files of a folder including all descendants. */
  _filesInFolder(folderId) {
    const folder = this.folders[folderId];
    if (!folder) return [];
    const out = folder.files.map(fid => this.files[fid]).filter(Boolean);
    for (const childId of folder.children) out.push(...this._filesInFolder(childId));
    return out;
  }

  _renderFolder(folderId, level, loaded) {
    const folder = this.folders[folderId];
    if (!folder) return '';
    const isOpen = this.expanded.has(folderId);
    const pad = 8 + level * 14;
    const fileRows = isOpen ? folder.files.map(fid => {
      const f = this.files[fid];
      if (!f) return '';
      const isLoaded = loaded.has(f.name);
      const isLoading = this.loading.has(f.id);
      return `
        <div class="v3d-st-file${isLoaded ? ' is-loaded' : ''}" style="padding-left:${pad + 16}px">
          <span class="v3d-st-file__name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
          <span class="v3d-st-file__size">${fmtSize(f.size)}</span>
          <button class="v3d-st-load" data-load-file="${escapeHtml(f.id)}" ${(isLoading || this.folderLoading) ? 'disabled' : ''}
                  title="${isLoaded ? 'Načíst znovu (přidá další instanci)' : 'Načíst do scény'}">
            ${isLoading ? '…' : (isLoaded ? '✓' : 'Načíst')}
          </button>
        </div>`;
    }).join('') : '';
    const childRows = isOpen
      ? folder.children.map(cid => this._renderFolder(cid, level + 1, loaded)).join('')
      : '';
    const total = this._countFiles(folderId);
    const batchRunning = this.folderLoading === folderId;
    const loadBtn = total > 0
      ? `<button class="v3d-st-load v3d-st-load--folder" data-load-folder="${escapeHtml(folderId)}"
                 ${this.folderLoading ? 'disabled' : ''} title="Načíst všechny IFC ze složky (včetně podsložek)">
           ${batchRunning ? '…' : `⤓ Načíst (${total})`}
         </button>`
      : '';
    return `
      <div class="v3d-st-folder" data-folder-toggle="${escapeHtml(folderId)}" style="padding-left:${pad}px">
        <span class="v3d-st-folder__arrow">${isOpen ? '▾' : '▸'}</span>
        <span class="v3d-st-folder__name">${escapeHtml(folder.name)}</span>
        ${loadBtn}
        <span class="v3d-st-folder__count">${total}</span>
      </div>
      ${fileRows}${childRows}`;
  }

  _countFiles(folderId) {
    const folder = this.folders[folderId];
    if (!folder) return 0;
    return folder.files.length + folder.children.reduce((s, c) => s + this._countFiles(c), 0);
  }

  destroy() {}
}
