# Local Folder Storage v2 (Write-back) — Design

**Status:** Approved by user, ready for implementation plan
**Date:** 2026-05-12
**Branch:** `local-folder-storage-v2` (cut from `local-folder-storage-v1` HEAD)
**Builds on:** v1 read-only — see `2026-05-12-local-folder-storage-v1-design.md`

## Goal

Enable writing changes back to disk when in local folder mode. User edits IFC properties in viewer or IDS specs in editor → can save changes directly to the original file (overwrite) or as a new copy. Closes the CDE-sync loop: pull from cloud → edit in BIM_checker → push back.

v1 (read-only) PR #18 stays open. v2 builds on top and merges as one combined feature when ready.

## User direction (brainstorm answers, 2026-05-12)

| Topic | Decision |
|---|---|
| Scope for v2 | **Save existing files only** (no delete/rename/create folder; those stay blocked) |
| When to request write permission | **At folder connect time** — `showDirectoryPicker({ mode: 'readwrite' })` |
| Save dialog UX | **Always ask** — modal with [Overwrite original / Save as copy / Cancel]. Default = copy |
| Filename conflict on copy | **Auto-suffix** — `wall_v2.ifc`, `wall_v3.ifc`... user can edit |
| External change detection | **Yes, warn before save** — track mtime, conflict warning dialog if disk newer |
| Save wire-up locations | **IDS Editor + IFC Viewer edit panel** (Validator doesn't modify files) |

## Architecture

### LocalFolderStorageBackend write methods

The v1 backend currently returns `{ error: 'read_only_backend' }` from all write methods. v2 replaces this with real implementations for save operations only. Delete/rename/create folder remain blocked.

```js
class LocalFolderStorageBackend {
    static isSupported() { /* same as v1 */ }

    constructor(rootDirHandle = null) {
        // v1 fields + new:
        this._readMtimes = new Map(); // path → lastModified seen at read time
    }

    isReadOnly() { return false; } // v2 = writable

    async connect() {
        // CHANGED: mode 'readwrite' instead of 'read'
        const handle = await window.showDirectoryPicker({ id: 'bim-checker-root', mode: 'readwrite' });
        // ... persist as in v1
    }

    async restoreFromIndexedDB() {
        // CHANGED: queryPermission with mode 'readwrite'
        // If existing handle has only 'read' granted (from v1), request upgrade to 'readwrite'
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        // ... rest similar to v1
    }

    async getFileContent(type, path) {
        // CHANGED: also record mtime for conflict detection
        const record = this._fileCache.get(path);
        const file = await record.handle.getFile();
        this._readMtimes.set(path, file.lastModified);
        return await file.arrayBuffer();
    }

    /**
     * Save content back to an existing file in the connected folder.
     * If mtime on disk newer than what was read, returns conflict error
     * (unless force=true).
     */
    async saveFileContent(type, path, content, { force = false } = {}) {
        const record = this._fileCache.get(path);
        if (!record) return { error: 'file_not_found', message: 'File handle missing — rescan needed' };

        if (!force && this._readMtimes.has(path)) {
            const currentFile = await record.handle.getFile();
            if (currentFile.lastModified > this._readMtimes.get(path)) {
                return {
                    error: 'conflict_external_change',
                    currentMtime: currentFile.lastModified,
                    knownMtime: this._readMtimes.get(path),
                    message: 'File was modified externally since you opened it'
                };
            }
        }

        try {
            const writable = await record.handle.createWritable();
            await writable.write(content);
            await writable.close();
            // Re-read mtime after write
            const newFile = await record.handle.getFile();
            this._readMtimes.set(path, newFile.lastModified);
            record.size = newFile.size;
            return { ok: true, mtime: newFile.lastModified, size: newFile.size };
        } catch (e) {
            return { error: 'write_failed', message: e.message };
        }
    }

    /**
     * Write a new file to the connected folder (used for "Save as copy").
     * If newName collides, automatically suffix with _v2, _v3, ...
     */
    async writeNewFile(type, folderPath, fileName, content) {
        try {
            const dirHandle = await this._resolveDirHandle(folderPath);
            const finalName = await this._resolveUniqueName(dirHandle, fileName);
            const fileHandle = await dirHandle.getFileHandle(finalName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            // Add to cache so it appears in next file lookup
            const fullPath = folderPath ? `${folderPath}/${finalName}` : finalName;
            const ext = finalName.toLowerCase().split('.').pop();
            const fileType = ext === 'ifc' ? 'ifc' : 'ids';
            const file = await fileHandle.getFile();
            this._fileCache.set(fullPath, {
                path: fullPath,
                name: finalName,
                type: fileType,
                size: file.size,
                handle: fileHandle,
                folderPath
            });
            return { ok: true, path: fullPath, finalName, size: file.size };
        } catch (e) {
            return { error: 'write_failed', message: e.message };
        }
    }

    // Helpers
    async _resolveDirHandle(folderPath) {
        if (!folderPath || folderPath === '') return this.root;
        const parts = folderPath.split('/').filter(Boolean);
        let cursor = this.root;
        for (const part of parts) {
            cursor = await cursor.getDirectoryHandle(part);
        }
        return cursor;
    }

    async _resolveUniqueName(dirHandle, desiredName) {
        // Check if exact name exists; if so, find next free _vN suffix
        const dotIdx = desiredName.lastIndexOf('.');
        const base = dotIdx > 0 ? desiredName.slice(0, dotIdx) : desiredName;
        const ext = dotIdx > 0 ? desiredName.slice(dotIdx) : '';
        let candidate = desiredName;
        let n = 2;
        // Try the original first
        try {
            await dirHandle.getFileHandle(candidate);
            // exists — try suffixed
            while (n < 100) {
                candidate = `${base}_v${n}${ext}`;
                try {
                    await dirHandle.getFileHandle(candidate);
                    n++;
                } catch {
                    return candidate; // doesn't exist
                }
            }
            throw new Error('Could not find unique name (tried _v2..v99)');
        } catch (e) {
            if (e.name === 'NotFoundError') return desiredName; // original is free
            throw e;
        }
    }

    // v1 write stubs that REMAIN blocked in v2 (folder operations, not file content)
    async deleteFile()  { return { error: 'read_only_backend', message: 'Local folder is read-only for this operation. Use save_file_to_folder for content updates.' }; }
    async clearFiles()  { return { error: 'read_only_backend', message: '...' }; }
    async createFolder() { return { error: 'read_only_backend', message: '...' }; }
    async renameFolder() { return { error: 'read_only_backend', message: '...' }; }
    async deleteFolder() { return { error: 'read_only_backend', message: '...' }; }
    async moveFile()    { return { error: 'read_only_backend', message: '...' }; }
}
```

### Save dialog component

New module `assets/js/common/save-to-folder-dialog.js` — reusable async modal returning user choice.

```js
window.BIMSaveToFolderDialog = {
    /**
     * @returns Promise<{ mode: 'overwrite'|'copy'|null, newName?: string }>
     */
    async open({ fileName, folderPath, contentSize, type }) {
        // Render modal, wait for user, resolve
    },

    /**
     * Specialized variant: external-change conflict.
     * @returns Promise<'overwrite' | 'copy' | null>
     */
    async openConflict({ fileName, currentMtime, knownMtime }) {
        // Three options: "Přesto přepsat", "Uložit jako kopii", "Cancel"
    }
};
```

DOM markup follows existing modal pattern (`.modal-overlay.show > .modal-container`). Mobile-friendly per Phase 12b mobile modals.

### Save helper (centralized save logic)

New module `assets/js/common/bim-save-file.js` — orchestrates backend-aware save flow. Called from IDS Editor and IFC Viewer.

```js
window.BIMSaveFile = {
    /**
     * Save edited file content. In folder mode, opens dialog. In IndexedDB
     * mode, saves directly (existing behavior — no dialog).
     *
     * @param {string} type - 'ifc' | 'ids'
     * @param {string} path - Original file path (id in IDB mode)
     * @param {string} name - Original file name
     * @param {string|ArrayBuffer} content
     * @param {string} folderPath - Parent folder path (for "save as copy" location)
     * @returns Promise<{ ok: true, mode, finalPath? } | { ok: false, reason }>
     */
    async save({ type, path, name, content, folderPath = '' }) {
        const backend = window.BIMStorage.backend;
        if (!backend) return { ok: false, reason: 'no_backend' };

        // IndexedDB mode: save directly via existing API
        if (backend.kind === 'indexedDB') {
            const blob = new Blob([content], { type: type === 'ifc' ? 'application/octet-stream' : 'application/xml' });
            const file = new File([blob], name, { type: blob.type });
            await window.BIMStorage.saveFile(type, file);
            return { ok: true, mode: 'overwrite' };
        }

        // Folder mode: dialog + backend write
        if (backend.kind !== 'localFolder') return { ok: false, reason: 'unsupported_backend' };

        const choice = await window.BIMSaveToFolderDialog.open({
            fileName: name,
            folderPath,
            contentSize: content.length || (content.byteLength || 0),
            type
        });
        if (!choice || choice.mode === null) return { ok: false, reason: 'user_cancelled' };

        if (choice.mode === 'overwrite') {
            let result = await backend.saveFileContent(type, path, content);
            if (result.error === 'conflict_external_change') {
                const resolution = await window.BIMSaveToFolderDialog.openConflict({
                    fileName: name,
                    currentMtime: result.currentMtime,
                    knownMtime: result.knownMtime
                });
                if (resolution === 'overwrite') {
                    result = await backend.saveFileContent(type, path, content, { force: true });
                } else if (resolution === 'copy') {
                    result = await backend.writeNewFile(type, folderPath, name, content);
                } else {
                    return { ok: false, reason: 'user_cancelled_conflict' };
                }
            }
            return result.ok ? { ok: true, mode: 'overwrite', finalPath: path } : { ok: false, reason: result.error };
        }

        if (choice.mode === 'copy') {
            const result = await backend.writeNewFile(type, folderPath, choice.newName, content);
            return result.ok ? { ok: true, mode: 'copy', finalPath: result.path, finalName: result.finalName } : { ok: false, reason: result.error };
        }

        return { ok: false, reason: 'unknown_mode' };
    }
};
```

### Wire-up in editors/viewer

**IDS Editor** (parser page): existing "Uložit" button. Currently saves to IndexedDB. Wrap call through `BIMSaveFile.save({ type: 'ids', ... })` which routes per backend.

**IFC Viewer edit panel** (viewer-ui.js): existing "Apply changes" / "Save" button. Same routing pattern through `BIMSaveFile.save({ type: 'ifc', ... })`.

For both: after successful save, refresh storage card folder stats + scan if save was a new file (so it appears in tree).

## AI tools

3 new tools registered in `tool-storage.js`:

```js
// save_file_to_folder
{
    name: 'save_file_to_folder',
    description: 'Save edited content back to a file in the connected local folder. Opens a save dialog where user picks overwrite vs save-as-copy. Requires localFolder backend active. Returns { ok, mode, finalPath } or { error }.',
    parameters: {
        type: 'object',
        properties: {
            fileType: { type: 'string', enum: ['ifc', 'ids'] },
            path: { type: 'string' },
            content: { type: 'string' },
            preferredMode: { type: 'string', enum: ['overwrite', 'copy'] },
            suggestedCopyName: { type: 'string' }
        },
        required: ['fileType', 'path', 'content']
    }
}

// check_folder_writable
{
    name: 'check_folder_writable',
    description: 'Returns whether the connected local folder is writable. Folder backend grants readwrite at connect; can return false if permission was revoked.',
    parameters: { type: 'object', properties: {}, required: [] }
}

// get_file_mtime
{
    name: 'get_file_mtime',
    description: 'Returns the last-modified timestamp of a file in the connected folder. Useful for AI to assess freshness or detect external changes.',
    parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, fileType: { type: 'string', enum: ['ifc', 'ids'] } },
        required: ['path', 'fileType']
    }
}
```

Update existing `get_storage_info` to return `isReadOnly: false` in v2 folder mode.

Existing read-only guards for delete/folder operations remain — those are blocked.

## Data flow

### Edit + save flow

```
1. User loads file from folder (v1 read flow) — backend tracks mtime
2. User edits in editor / viewer — content held in memory
3. User clicks Save
4. UI calls BIMSaveFile.save({ type, path, name, content, folderPath })
5. Helper detects backend.kind
   ├── 'indexedDB' → BIMStorage.saveFile() (existing flow, no dialog)
   └── 'localFolder' →
       6. Open BIMSaveToFolderDialog — wait for user
       7. If overwrite:
          a. backend.saveFileContent(type, path, content)
          b. If conflict_external_change → openConflict dialog
             ├── overwrite → saveFileContent({ force: true })
             ├── copy → writeNewFile
             └── cancel → return
       8. If copy:
          a. backend.writeNewFile(type, folderPath, newName, content)
          b. Auto-suffix if name collision
       9. On success: refresh storage card, dispatch save event
```

### Permission upgrade flow (returning v1 user with read-only handle)

```
1. v1 user has stored handle with 'read' permission only
2. After update to v2, restoreFromIndexedDB tries queryPermission({ mode: 'readwrite' })
3. Returns 'prompt' (since 'read' was the only previously granted level)
4. Storage card shows reconnect banner: "Folder requires write permission for new features"
5. User clicks reconnect → requestPermission({ mode: 'readwrite' }) → browser dialog
6. Granted → folder mode resumes with writable handle
7. Denied → fallback to read-only banner, AI Settings shows write toggle disabled
```

## Error handling

| Error | UI response |
|---|---|
| `conflict_external_change` | Conflict dialog: force overwrite / save as copy / cancel |
| `write_failed` | Toast: "Save failed: {message}". Original file unchanged |
| `file_not_found` (handle missing) | Toast: "File reference is stale. Click 🔄 to rescan folder" |
| Permission revoked mid-session | Toast: "Folder permission lost. Click reconnect" |
| Disk full / quota | Toast: "Save failed: out of disk space" |
| Filename invalid chars | Save dialog validates input, prevents submit until valid |

## Testing

### Automated (~12 new tests)

| Suite | Coverage |
|---|---|
| `local-folder-storage-write.test.js` | `saveFileContent` overwrite, mtime update, force flag bypasses conflict |
| `local-folder-conflict-detect.test.js` | mtime tracking on read; conflict triggers on mtime mismatch; force=true skips check |
| `local-folder-write-new-file.test.js` | `writeNewFile` creates new file, auto-suffix on collision, adds to cache |
| `save-to-folder-dialog.test.js` | Dialog open/close, mode selection state, name validation, cancel resolves null |
| `bim-save-file-helper.test.js` | Routing: IDB → BIMStorage.saveFile, folder → dialog + backend write; conflict resolution chain |
| `ai-tool-save-file-folder.test.js` | AI tool returns ok / error_backend / user_cancelled |
| `permission-upgrade.test.js` | restoreFromIndexedDB asks for readwrite, handles prompt/denied gracefully |

Existing 773 tests unchanged. Expected: 773 → 785.

### Manual QA

- [ ] Chrome + OneDrive folder: edit IDS in editor, overwrite original → verify mtime changes on disk
- [ ] Edit IFC properties in viewer → "Save as copy" → verify new file in folder with auto-suffix
- [ ] Modify file externally (text editor) while open in BIM_checker → save → conflict warning
- [ ] Force overwrite conflict → external change is lost (acknowledged)
- [ ] Save in IndexedDB mode → behaves as before, no dialog
- [ ] v1 user upgrade path: handle reconnects with readwrite permission prompt
- [ ] CDE-sync round-trip: pull → edit → save → cloud picks up change

## Scope boundaries

**In v2:**
- Save existing file (overwrite)
- Save as new file with auto-suffix (copy)
- mtime tracking + external change conflict detection
- IDS Editor + IFC Viewer wire-up
- 3 new AI tools
- Permission upgrade flow

**Still blocked (v3+ or never):**
- Delete file / delete folder
- Create folder
- Rename folder / file
- Move file between folders
- Batch save (save all open files at once)
- Auto-save / continuous sync
- Multiple folders simultaneously
- FileSystemObserver auto-rescan
- Undo history within app

## SW + i18n

- SW cache v48 → v49
- Add to `ASSETS_TO_CACHE`: `save-to-folder-dialog.js`, `bim-save-file.js`
- ~15 new i18n keys: `saveDialog.title`, `saveDialog.overwriteOption`, `saveDialog.copyOption`, `saveDialog.copyName`, `saveDialog.conflictTitle`, `saveDialog.conflictExplain`, `saveDialog.forceOverwrite`, `saveDialog.saveAsCopy`, `ai.tool.localFolder.savedAsCopy`, `ai.tool.localFolder.overwritten`, `ai.tool.localFolder.conflictDetected`, etc.

## Effort estimate

- LocalFolderStorageBackend write methods: 0.5 day
- Save dialog component: 0.5 day
- BIMSaveFile helper: 0.5 day
- Wire-up IDS Editor: 0.5 day
- Wire-up IFC Viewer: 0.5 day
- Permission upgrade flow: 0.25 day
- AI tools (3): 0.5 day
- Tests: 1 day
- i18n + SW bump + docs + PR: 0.25 day
- **Total: ~4 days**

## Acceptance criteria

- User in Chrome/Edge connects CDE-sync folder (write permission granted at connect)
- Opens IFC in viewer, edits property → Save → choses overwrite → original file replaced on disk → CDE picks up the change
- Opens IDS in editor, edits spec → Save → choses save-as-copy → new file appears in folder with `_v2` suffix
- External tool modifies same file while open → save shows conflict warning, user can choose force or copy
- IndexedDB mode users: unchanged behavior (no dialog, direct save)
- 785/785 tests pass
- Mobile / Firefox / Safari: no behavior change (folder backend not usable anyway)
