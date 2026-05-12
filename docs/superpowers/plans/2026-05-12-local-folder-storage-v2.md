# Local Folder Storage v2 (Write-back) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Enable write-back to disk in local folder mode. User edits IFC/IDS in viewer/editor → save → choose overwrite original or save as copy → file written via FS Access API. External-change conflict detection via mtime tracking.

**Architecture:** Extend `LocalFolderStorageBackend` (v1) with write methods (`saveFileContent`, `writeNewFile`), upgrade permission to `readwrite` at connect. New centralized `BIMSaveFile` helper routes save calls per backend (folder mode → dialog + backend write; IndexedDB → existing direct save). Reusable `BIMSaveToFolderDialog` modal. Wire-up in IDS Editor + IFC Viewer edit panel.

**Tech Stack:** Vanilla JS, File System Access API (`createWritable`, `getFileHandle({create:true})`, `lastModified`), existing custom test framework.

**Branch:** `local-folder-storage-v2` (already cut from `local-folder-storage-v1` HEAD).

**Spec:** `docs/superpowers/specs/2026-05-12-local-folder-storage-v2-design.md`.

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/common/local-folder-storage.js` | Modify | Add `saveFileContent`, `writeNewFile`, `_readMtimes`, `_resolveDirHandle`, `_resolveUniqueName`. Change `connect` + `restoreFromIndexedDB` to use `mode: 'readwrite'`. `isReadOnly()` returns `false`. Keep delete/rename/folder stubs blocked. |
| `assets/js/common/save-to-folder-dialog.js` | **Create** | `BIMSaveToFolderDialog.open()` + `.openConflict()` — reusable modal component |
| `assets/js/common/bim-save-file.js` | **Create** | `BIMSaveFile.save()` — centralized save flow, backend-aware routing |
| `assets/js/parser.js` | Modify | IDS Editor "Save" — route through `BIMSaveFile.save()` |
| `assets/js/ifc/viewer-ui.js` | Modify | IFC Viewer edit panel Save button — route through `BIMSaveFile.save()` |
| `assets/js/ai/tool-defs.js` | Modify | Add 3 new tool defs: `save_file_to_folder`, `check_folder_writable`, `get_file_mtime` |
| `assets/js/ai/tools/tool-storage.js` | Modify | Implement 3 new tools; update `get_storage_info` to return `isReadOnly: false` in folder mode |
| `assets/js/common/translations.js` | Modify | ~15 new keys for save dialog + AI tool messages |
| `assets/css/index.css` | Modify | CSS for save dialog modal |
| All 4 HTML files | Modify | Load new `save-to-folder-dialog.js` + `bim-save-file.js` scripts |
| `tests/test-suites/local-folder-storage-write.test.js` | **Create** | `saveFileContent` overwrite + mtime update |
| `tests/test-suites/local-folder-conflict-detect.test.js` | **Create** | mtime tracking, conflict triggers, force bypass |
| `tests/test-suites/local-folder-write-new-file.test.js` | **Create** | `writeNewFile` + auto-suffix |
| `tests/test-suites/save-to-folder-dialog.test.js` | **Create** | Dialog state machine + cancel/confirm |
| `tests/test-suites/bim-save-file-helper.test.js` | **Create** | Backend routing logic |
| `tests/test-runner.html` | Modify | Register 5 new test suites + load new JS modules |
| `dist/*` | Mirror | `cp` all changed files |
| `sw.js` + `dist/sw.js` | Modify | Bump v48 → v49 + add 2 new JS files to `ASSETS_TO_CACHE` |
| `PLAN.md` | Modify | Append "Local Folder Storage v2" entry |
| `CHANGELOG.md` | Modify | `[0.12.0]` entry |

---

## Cross-cutting conventions

- Test framework: no `.not` chaining; use `expect(x.includes(y)).toBe(false)` instead
- Async pattern: all storage operations await
- i18n: user-visible strings via `i18n.t('key', params)` or `data-i18n` attribute
- Mirror dist after every edit
- All write methods return `{ ok: true, ... }` or `{ error: '<code>', message: '...' }`
- Use `TextDecoder('utf-8')` when reading binary content for IFC/IDS (consistent with v1 fix `db97be5`)

---

## Task 1: Permission upgrade — readwrite at connect

**Files:**
- Modify: `assets/js/common/local-folder-storage.js`

**Goal:** Change `connect()` and `restoreFromIndexedDB()` to request `mode: 'readwrite'`. Change `isReadOnly()` to return `false`. No write methods implemented yet — those are Task 2-3.

- [ ] **Step 1: Modify `connect()` in `local-folder-storage.js`**

Read `/home/michal/work/BIM_checker/assets/js/common/local-folder-storage.js` line 35-45. Replace:

```js
    async connect() {
        if (!LocalFolderStorageBackend.isSupported()) {
            throw new Error('File System Access API not supported in this browser');
        }
        const handle = await window.showDirectoryPicker({ id: 'bim-checker-root', mode: 'read' });
```

with:

```js
    async connect() {
        if (!LocalFolderStorageBackend.isSupported()) {
            throw new Error('File System Access API not supported in this browser');
        }
        const handle = await window.showDirectoryPicker({ id: 'bim-checker-root', mode: 'readwrite' });
```

- [ ] **Step 2: Modify `restoreFromIndexedDB()` permission queries**

Find both `queryPermission({ mode: 'read' })` calls and change to `mode: 'readwrite'`. Same for `requestPermission` in `requestPermissionAgain`. Read the file around line 50-85, find each `mode: 'read'` and change to `mode: 'readwrite'`.

- [ ] **Step 3: Change `isReadOnly()` return value**

Find the line `isReadOnly() { return true; }` and change to:

```js
    isReadOnly() { return false; }
```

- [ ] **Step 4: Mirror dist + test**

```bash
cp /home/michal/work/BIM_checker/assets/js/common/local-folder-storage.js /home/michal/work/BIM_checker/dist/assets/js/common/local-folder-storage.js
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | grep "SUMMARY"
```

Expected: 773/773 — **BUT** the existing test `LocalFolderStorageBackend.isReadOnly returns true in v1` and the 7 read-only guard tests will now FAIL because `isReadOnly()` returns false.

Update those 8 tests:
- `tests/test-suites/local-folder-storage.test.js` — change `expect(backend.isReadOnly()).toBe(true)` to `toBe(false)`
- `tests/test-suites/local-folder-readonly.test.js` — these test that write methods return `read_only_backend`. They MUST keep passing for delete/rename/folder operations BUT we'll add write capability for save in next tasks. Verify the existing guard tests target operations that REMAIN blocked in v2:
  - `saveFile` (Task: this becomes a no-op alias to `saveFileContent` later — but for now leave the read-only stub in place; the test was using `saveFile` with `null` arg)
  - `deleteFile`, `createFolder`, `renameFolder`, `deleteFolder`, `moveFile`, `clearFiles` — all stay blocked
  
  Verify the `saveFile()` test still passes — it shouldn't conflict.

Run tests again:
```bash
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -10
```

Expected: 773/773.

- [ ] **Step 5: Commit**

```bash
cd /home/michal/work/BIM_checker
git add assets/js/common/local-folder-storage.js dist/assets/js/common/local-folder-storage.js tests/test-suites/local-folder-storage.test.js
git commit -m "feat(storage-v2): request readwrite permission at connect + isReadOnly returns false"
```

---

## Task 2: `saveFileContent` with mtime conflict detection

**Files:**
- Modify: `assets/js/common/local-folder-storage.js`
- Create: `tests/test-suites/local-folder-storage-write.test.js`
- Create: `tests/test-suites/local-folder-conflict-detect.test.js`
- Modify: `tests/test-runner.html`

**Goal:** Add `_readMtimes` field. Update `getFileContent` to record mtime. Add `saveFileContent` method that detects external changes via mtime mismatch.

- [ ] **Step 1: Write failing tests**

Create `/home/michal/work/BIM_checker/tests/test-suites/local-folder-storage-write.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend.saveFileContent', () => {
    let backend;
    let mockHandle;
    let writtenContent;
    let mtimeNow;

    beforeEach(() => {
        writtenContent = null;
        mtimeNow = 1000;
        const writable = {
            write: async (data) => { writtenContent = data; },
            close: async () => {}
        };
        const fileBlob = {
            arrayBuffer: async () => new TextEncoder().encode('initial content').buffer,
            size: 15,
            lastModified: mtimeNow,
            name: 'wall.ifc'
        };
        mockHandle = {
            kind: 'file',
            name: 'wall.ifc',
            getFile: async () => ({ ...fileBlob, lastModified: mtimeNow }),
            createWritable: async () => writable
        };
        backend = new window.LocalFolderStorageBackend({
            kind: 'directory',
            name: 'root',
            async *values() { yield mockHandle; }
        });
    });

    it('saveFileContent writes to file handle and returns ok', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new content');
        expect(result.ok).toBe(true);
        expect(writtenContent).toBe('new content');
    });

    it('saveFileContent returns file_not_found when path not in cache', async () => {
        const result = await backend.saveFileContent('ifc', 'missing.ifc', 'content');
        expect(result.error).toBe('file_not_found');
    });

    it('saveFileContent records new mtime after write', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        mtimeNow = 2000; // simulate disk timestamp after write
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new');
        expect(result.ok).toBe(true);
        expect(result.mtime).toBe(2000);
    });
});
```

Create `/home/michal/work/BIM_checker/tests/test-suites/local-folder-conflict-detect.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend mtime conflict detection', () => {
    let backend;
    let currentMtime;

    beforeEach(() => {
        currentMtime = 1000;
        const writable = {
            write: async () => {},
            close: async () => {}
        };
        const handle = {
            kind: 'file',
            name: 'wall.ifc',
            getFile: async () => ({
                arrayBuffer: async () => new ArrayBuffer(10),
                size: 10,
                lastModified: currentMtime,
                name: 'wall.ifc'
            }),
            createWritable: async () => writable
        };
        backend = new window.LocalFolderStorageBackend({
            kind: 'directory',
            name: 'root',
            async *values() { yield handle; }
        });
    });

    it('getFileContent records mtime', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        expect(backend._readMtimes.get('wall.ifc')).toBe(1000);
    });

    it('saveFileContent returns conflict_external_change when disk newer', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        currentMtime = 5000; // someone modified file externally
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new');
        expect(result.error).toBe('conflict_external_change');
        expect(result.currentMtime).toBe(5000);
        expect(result.knownMtime).toBe(1000);
    });

    it('saveFileContent with force=true bypasses conflict check', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        currentMtime = 5000;
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new', { force: true });
        expect(result.ok).toBe(true);
    });

    it('saveFileContent without prior read still works (no mtime to compare)', async () => {
        await backend.scan();
        // Skip getFileContent
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new');
        expect(result.ok).toBe(true);
    });
});
```

- [ ] **Step 2: Register tests in `tests/test-runner.html`**

After `<script src="test-suites/local-folder-readonly.test.js"></script>`, add:

```html
    <script src="test-suites/local-folder-storage-write.test.js"></script>
    <script src="test-suites/local-folder-conflict-detect.test.js"></script>
```

- [ ] **Step 3: Run tests to confirm failures**

```bash
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -15
```

Expected: 7 new FAIL cases.

- [ ] **Step 4: Add `_readMtimes` field + update `getFileContent`**

In `local-folder-storage.js`, find the constructor:

```js
    constructor(rootDirHandle = null) {
        this.kind = 'localFolder';
        this.root = rootDirHandle;
        this.rootName = rootDirHandle ? rootDirHandle.name : null;
        this._fileCache = new Map();
        this._initialized = !!rootDirHandle;
    }
```

Add `_readMtimes`:

```js
    constructor(rootDirHandle = null) {
        this.kind = 'localFolder';
        this.root = rootDirHandle;
        this.rootName = rootDirHandle ? rootDirHandle.name : null;
        this._fileCache = new Map();
        this._readMtimes = new Map();
        this._initialized = !!rootDirHandle;
    }
```

Find `getFileContent`:

```js
    async getFileContent(type, fileId) {
        const record = this._fileCache.get(fileId)
            || Array.from(this._fileCache.values()).find(r => r.name === fileId && r.type === type);
        if (!record) throw new Error(`File not found in local folder: ${fileId}`);
        const file = await record.handle.getFile();
        return await file.arrayBuffer();
    }
```

Update to record mtime:

```js
    async getFileContent(type, fileId) {
        const record = this._fileCache.get(fileId)
            || Array.from(this._fileCache.values()).find(r => r.name === fileId && r.type === type);
        if (!record) throw new Error(`File not found in local folder: ${fileId}`);
        const file = await record.handle.getFile();
        this._readMtimes.set(record.path, file.lastModified);
        return await file.arrayBuffer();
    }
```

- [ ] **Step 5: Add `saveFileContent` method**

In `local-folder-storage.js`, find the read-only error stubs section (`_readOnlyError`, `async saveFile`, etc.). Replace the existing `async saveFile() { return this._readOnlyError(); }` line with TWO methods — keep `saveFile` blocked for backward compat (used by AI tools as the metadata-style save), add NEW `saveFileContent`:

```js
    /**
     * Save edited content back to an existing file.
     * Detects external changes via mtime mismatch (unless force=true).
     */
    async saveFileContent(type, path, content, { force = false } = {}) {
        const record = this._fileCache.get(path)
            || Array.from(this._fileCache.values()).find(r => r.name === path && r.type === type);
        if (!record) return { error: 'file_not_found', message: 'File handle missing — rescan the folder' };

        if (!force && this._readMtimes.has(record.path)) {
            const currentFile = await record.handle.getFile();
            const knownMtime = this._readMtimes.get(record.path);
            if (currentFile.lastModified > knownMtime) {
                return {
                    error: 'conflict_external_change',
                    currentMtime: currentFile.lastModified,
                    knownMtime,
                    message: 'File was modified externally since you opened it'
                };
            }
        }

        try {
            const writable = await record.handle.createWritable();
            await writable.write(content);
            await writable.close();
            const newFile = await record.handle.getFile();
            this._readMtimes.set(record.path, newFile.lastModified);
            record.size = newFile.size;
            return { ok: true, mtime: newFile.lastModified, size: newFile.size };
        } catch (e) {
            return { error: 'write_failed', message: e.message };
        }
    }
```

The existing `saveFile` (file metadata API used by IndexedDB) stays as `_readOnlyError` for now — separate semantics.

- [ ] **Step 6: Mirror dist + run tests**

```bash
cp /home/michal/work/BIM_checker/assets/js/common/local-folder-storage.js /home/michal/work/BIM_checker/dist/assets/js/common/local-folder-storage.js
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

Expected: 780/780 (773 + 7 new).

- [ ] **Step 7: Commit**

```bash
cd /home/michal/work/BIM_checker
git add assets/js/common/local-folder-storage.js dist/assets/js/common/local-folder-storage.js tests/test-suites/local-folder-storage-write.test.js tests/test-suites/local-folder-conflict-detect.test.js tests/test-runner.html
git commit -m "feat(storage-v2): saveFileContent with mtime-based external change detection"
```

---

## Task 3: `writeNewFile` with auto-suffix

**Files:**
- Modify: `assets/js/common/local-folder-storage.js`
- Create: `tests/test-suites/local-folder-write-new-file.test.js`
- Modify: `tests/test-runner.html`

**Goal:** Add `writeNewFile(type, folderPath, fileName, content)` that creates a new file in the folder, auto-suffixing the name (`_v2`, `_v3`) on collision.

- [ ] **Step 1: Write failing tests**

Create `/home/michal/work/BIM_checker/tests/test-suites/local-folder-write-new-file.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend.writeNewFile', () => {
    let backend;
    let createdFiles;

    function makeDirHandle(name, existingFiles = []) {
        const existing = new Set(existingFiles);
        return {
            kind: 'directory',
            name,
            async *values() {
                for (const n of existingFiles) {
                    yield {
                        kind: 'file',
                        name: n,
                        getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0), size: 0, lastModified: 0, name: n })
                    };
                }
            },
            getFileHandle: async (n, opts) => {
                if (opts && opts.create) {
                    existing.add(n);
                    createdFiles.push(n);
                    return {
                        kind: 'file',
                        name: n,
                        getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0), size: 100, lastModified: 999, name: n }),
                        createWritable: async () => ({ write: async () => {}, close: async () => {} })
                    };
                }
                if (existing.has(n)) {
                    return { kind: 'file', name: n };
                }
                const err = new Error('not found');
                err.name = 'NotFoundError';
                throw err;
            },
            getDirectoryHandle: async () => { throw new Error('not implemented in test'); }
        };
    }

    beforeEach(() => {
        createdFiles = [];
        backend = new window.LocalFolderStorageBackend(makeDirHandle('root', []));
    });

    it('writeNewFile creates a new file at root', async () => {
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.ok).toBe(true);
        expect(result.finalName).toBe('wall.ifc');
        expect(createdFiles.includes('wall.ifc')).toBe(true);
    });

    it('writeNewFile auto-suffixes when name collides', async () => {
        backend.root = makeDirHandle('root', ['wall.ifc']);
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.ok).toBe(true);
        expect(result.finalName).toBe('wall_v2.ifc');
    });

    it('writeNewFile keeps suffixing _v3, _v4 on multiple collisions', async () => {
        backend.root = makeDirHandle('root', ['wall.ifc', 'wall_v2.ifc']);
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.ok).toBe(true);
        expect(result.finalName).toBe('wall_v3.ifc');
    });

    it('writeNewFile adds new file to internal cache', async () => {
        const result = await backend.writeNewFile('ifc', '', 'new.ifc', 'content');
        expect(result.ok).toBe(true);
        const ifcs = await backend.getFiles('ifc');
        const names = ifcs.map(f => f.name);
        expect(names.includes('new.ifc')).toBe(true);
    });

    it('writeNewFile returns write_failed on error', async () => {
        backend.root = {
            getFileHandle: async () => { throw new Error('disk full'); }
        };
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.error).toBe('write_failed');
    });
});
```

- [ ] **Step 2: Register test in `test-runner.html`**

After `<script src="test-suites/local-folder-conflict-detect.test.js"></script>`, add:

```html
    <script src="test-suites/local-folder-write-new-file.test.js"></script>
```

- [ ] **Step 3: Run tests to confirm failures**

```bash
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -10
```

Expected: 5 new FAILs.

- [ ] **Step 4: Implement `writeNewFile` + helpers**

In `local-folder-storage.js`, add right after `saveFileContent`:

```js
    /**
     * Write a NEW file (used for "Save as copy"). Auto-suffixes name on collision.
     */
    async writeNewFile(type, folderPath, fileName, content) {
        try {
            const dirHandle = await this._resolveDirHandle(folderPath);
            const finalName = await this._resolveUniqueName(dirHandle, fileName);
            const fileHandle = await dirHandle.getFileHandle(finalName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
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
            this._readMtimes.set(fullPath, file.lastModified);
            return { ok: true, path: fullPath, finalName, size: file.size };
        } catch (e) {
            return { error: 'write_failed', message: e.message };
        }
    }

    async _resolveDirHandle(folderPath) {
        if (!folderPath || folderPath === '' || folderPath === 'root') return this.root;
        const parts = folderPath.split('/').filter(Boolean);
        let cursor = this.root;
        for (const part of parts) {
            cursor = await cursor.getDirectoryHandle(part);
        }
        return cursor;
    }

    async _resolveUniqueName(dirHandle, desiredName) {
        const dotIdx = desiredName.lastIndexOf('.');
        const base = dotIdx > 0 ? desiredName.slice(0, dotIdx) : desiredName;
        const ext = dotIdx > 0 ? desiredName.slice(dotIdx) : '';
        // Check if exact name is free
        try {
            await dirHandle.getFileHandle(desiredName);
        } catch (e) {
            if (e.name === 'NotFoundError') return desiredName;
            throw e;
        }
        // Try _v2..v99
        for (let n = 2; n < 100; n++) {
            const candidate = `${base}_v${n}${ext}`;
            try {
                await dirHandle.getFileHandle(candidate);
            } catch (e) {
                if (e.name === 'NotFoundError') return candidate;
                throw e;
            }
        }
        throw new Error('Could not find unique name (tried _v2..v99)');
    }
```

- [ ] **Step 5: Mirror dist + test**

```bash
cp /home/michal/work/BIM_checker/assets/js/common/local-folder-storage.js /home/michal/work/BIM_checker/dist/assets/js/common/local-folder-storage.js
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

Expected: 785/785.

- [ ] **Step 6: Commit**

```bash
cd /home/michal/work/BIM_checker
git add assets/js/common/local-folder-storage.js dist/assets/js/common/local-folder-storage.js tests/test-suites/local-folder-write-new-file.test.js tests/test-runner.html
git commit -m "feat(storage-v2): writeNewFile with auto-suffix on name collision"
```

---

## Task 4: Save dialog component

**Files:**
- Create: `assets/js/common/save-to-folder-dialog.js`
- Create: `tests/test-suites/save-to-folder-dialog.test.js`
- Modify: `tests/test-runner.html`
- Modify: `assets/css/index.css`
- Modify: `assets/js/common/translations.js`
- Modify: all 4 HTML files (load new script)

**Goal:** Reusable modal that asks user how to save. Two modes: normal save (overwrite/copy/cancel) and conflict resolution (force/copy/cancel).

- [ ] **Step 1: Write tests**

Create `/home/michal/work/BIM_checker/tests/test-suites/save-to-folder-dialog.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('BIMSaveToFolderDialog', () => {
    afterEach(() => {
        document.querySelectorAll('.save-to-folder-dialog').forEach(el => el.remove());
    });

    it('open() returns Promise', () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        expect(p instanceof Promise).toBe(true);
        // Cancel via DOM
        const cancelBtn = document.querySelector('.save-to-folder-dialog__cancel');
        if (cancelBtn) cancelBtn.click();
        return p;
    });

    it('open() resolves null on cancel', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('.save-to-folder-dialog__cancel').click();
        const result = await p;
        expect(result).toBe(null);
    });

    it('open() resolves { mode: "overwrite" } when user confirms overwrite', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('input[name="saveDialogMode"][value="overwrite"]').click();
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await p;
        expect(result.mode).toBe('overwrite');
    });

    it('open() resolves { mode: "copy", newName } when user picks copy', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        // default is copy; just hit confirm
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await p;
        expect(result.mode).toBe('copy');
        expect(typeof result.newName).toBe('string');
        expect(result.newName.length > 0).toBe(true);
    });

    it('openConflict() resolves overwrite / copy / null', async () => {
        const p = window.BIMSaveToFolderDialog.openConflict({
            fileName: 'wall.ifc',
            currentMtime: 5000,
            knownMtime: 1000
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('.save-to-folder-dialog__force').click();
        const result = await p;
        expect(result).toBe('overwrite');
    });

    it('default save mode is copy (safe)', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        const copyRadio = document.querySelector('input[name="saveDialogMode"][value="copy"]');
        expect(copyRadio.checked).toBe(true);
        document.querySelector('.save-to-folder-dialog__cancel').click();
        await p;
    });
});
```

- [ ] **Step 2: Register test**

After `<script src="test-suites/local-folder-write-new-file.test.js"></script>` in `tests/test-runner.html`, add:

```html
    <script src="test-suites/save-to-folder-dialog.test.js"></script>
```

- [ ] **Step 3: Run tests — confirm 6 fails**

```bash
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -10
```

Expected: 6 new FAILs (dialog doesn't exist yet).

- [ ] **Step 4: Create `/home/michal/work/BIM_checker/assets/js/common/save-to-folder-dialog.js`**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Save-to-folder dialog component.
 * Reusable across IDS Editor + IFC Viewer when in local folder mode.
 */

(function () {
    'use strict';

    function tr(key, params) {
        return (window.i18n && window.i18n.t) ? window.i18n.t(key, params) : key;
    }

    function esc(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function formatBytes(b) {
        if (!b) return '0 KB';
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    }

    function suggestedCopyName(fileName) {
        const dot = fileName.lastIndexOf('.');
        const base = dot > 0 ? fileName.slice(0, dot) : fileName;
        const ext = dot > 0 ? fileName.slice(dot) : '';
        return `${base}_v2${ext}`;
    }

    function open({ fileName, folderPath, contentSize, type }) {
        return new Promise((resolve) => {
            const defaultCopyName = suggestedCopyName(fileName);
            const wrap = document.createElement('div');
            wrap.className = 'save-to-folder-dialog modal-overlay show';
            wrap.innerHTML = `
                <div class="modal-container save-to-folder-dialog__container">
                    <div class="modal-header">
                        <h2 data-i18n="saveDialog.title">Save changes?</h2>
                    </div>
                    <div class="modal-body">
                        <p class="save-to-folder-dialog__file">
                            <strong>${esc(fileName)}</strong>
                            <span class="save-to-folder-dialog__size">${formatBytes(contentSize)}</span>
                        </p>
                        <div class="save-to-folder-dialog__options">
                            <label class="save-to-folder-dialog__option">
                                <input type="radio" name="saveDialogMode" value="overwrite">
                                <span>
                                    <strong data-i18n="saveDialog.overwriteOption">Overwrite original</strong>
                                    <span class="save-to-folder-dialog__warn" data-i18n="saveDialog.overwriteWarn">⚠ Original will be replaced, cannot be undone</span>
                                </span>
                            </label>
                            <label class="save-to-folder-dialog__option">
                                <input type="radio" name="saveDialogMode" value="copy" checked>
                                <span>
                                    <strong data-i18n="saveDialog.copyOption">Save as copy</strong>
                                    <input type="text" class="save-to-folder-dialog__name" value="${esc(defaultCopyName)}">
                                    <span class="save-to-folder-dialog__folder">📁 ${esc(folderPath || '/')}</span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary save-to-folder-dialog__cancel" data-i18n="saveDialog.cancel">Cancel</button>
                        <button class="btn btn-primary save-to-folder-dialog__confirm" data-i18n="saveDialog.confirm">Save</button>
                    </div>
                </div>
            `;
            document.body.appendChild(wrap);
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();

            const cleanup = () => { wrap.remove(); };

            wrap.querySelector('.save-to-folder-dialog__cancel').addEventListener('click', () => {
                cleanup();
                resolve(null);
            });
            wrap.querySelector('.save-to-folder-dialog__confirm').addEventListener('click', () => {
                const mode = wrap.querySelector('input[name="saveDialogMode"]:checked').value;
                const newName = wrap.querySelector('.save-to-folder-dialog__name').value.trim();
                cleanup();
                if (mode === 'overwrite') {
                    resolve({ mode: 'overwrite' });
                } else {
                    resolve({ mode: 'copy', newName: newName || defaultCopyName });
                }
            });
        });
    }

    function openConflict({ fileName, currentMtime, knownMtime }) {
        return new Promise((resolve) => {
            const wrap = document.createElement('div');
            wrap.className = 'save-to-folder-dialog modal-overlay show';
            const ageMs = currentMtime - knownMtime;
            const ageDesc = ageMs > 60000 ? `${Math.round(ageMs / 60000)} min` : `${Math.round(ageMs / 1000)} s`;
            wrap.innerHTML = `
                <div class="modal-container save-to-folder-dialog__container">
                    <div class="modal-header">
                        <h2 data-i18n="saveDialog.conflictTitle">⚠ File changed externally</h2>
                    </div>
                    <div class="modal-body">
                        <p data-i18n="saveDialog.conflictExplain">The file on disk was modified after you opened it (probably by a CDE sync or another tool).</p>
                        <p><strong>${esc(fileName)}</strong> — ${esc(ageDesc)} <span data-i18n="saveDialog.conflictAge">newer on disk</span></p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary save-to-folder-dialog__cancel" data-i18n="saveDialog.cancel">Cancel</button>
                        <button class="btn btn-secondary save-to-folder-dialog__copyConflict" data-i18n="saveDialog.saveAsCopy">Save as copy</button>
                        <button class="btn btn-danger save-to-folder-dialog__force" data-i18n="saveDialog.forceOverwrite">Force overwrite</button>
                    </div>
                </div>
            `;
            document.body.appendChild(wrap);
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();

            const cleanup = () => { wrap.remove(); };

            wrap.querySelector('.save-to-folder-dialog__cancel').addEventListener('click', () => { cleanup(); resolve(null); });
            wrap.querySelector('.save-to-folder-dialog__copyConflict').addEventListener('click', () => { cleanup(); resolve('copy'); });
            wrap.querySelector('.save-to-folder-dialog__force').addEventListener('click', () => { cleanup(); resolve('overwrite'); });
        });
    }

    window.BIMSaveToFolderDialog = { open, openConflict };
})();
```

- [ ] **Step 5: Add CSS to end of `/home/michal/work/BIM_checker/assets/css/index.css`**

```css

/* === Save-to-folder dialog === */
.save-to-folder-dialog__container {
    max-width: 540px;
    width: 95%;
}
.save-to-folder-dialog__file {
    margin-bottom: 16px;
    color: var(--text-primary);
}
.save-to-folder-dialog__size {
    color: var(--text-tertiary);
    font-size: 0.9rem;
    margin-left: 8px;
}
.save-to-folder-dialog__options {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.save-to-folder-dialog__option {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid var(--border-primary);
}
.save-to-folder-dialog__option:has(input:checked) {
    border-color: var(--primary-color, #667eea);
    background: rgba(102, 126, 234, 0.06);
}
.save-to-folder-dialog__option input[type="radio"] {
    margin-top: 4px;
}
.save-to-folder-dialog__option > span {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
}
.save-to-folder-dialog__warn {
    color: var(--warning, #f59e0b);
    font-size: 0.85rem;
}
.save-to-folder-dialog__folder {
    color: var(--text-tertiary);
    font-size: 0.8rem;
}
.save-to-folder-dialog__name {
    margin-top: 6px;
    padding: 8px 12px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.95rem;
    width: 100%;
    box-sizing: border-box;
}
```

- [ ] **Step 6: Add i18n keys to `translations.js`**

In `cs:` section near other dialog keys:

```js
        'saveDialog.title': 'Uložit změny?',
        'saveDialog.overwriteOption': 'Přepsat originál',
        'saveDialog.overwriteWarn': '⚠ Originál bude nahrazen, nelze vrátit zpět',
        'saveDialog.copyOption': 'Uložit jako kopii',
        'saveDialog.cancel': 'Storno',
        'saveDialog.confirm': 'Uložit',
        'saveDialog.conflictTitle': '⚠ Soubor byl změněn externě',
        'saveDialog.conflictExplain': 'Soubor na disku byl změněn poté, co jsi ho otevřel (pravděpodobně CDE sync nebo jiný nástroj).',
        'saveDialog.conflictAge': 'novější na disku',
        'saveDialog.saveAsCopy': 'Uložit jako kopii',
        'saveDialog.forceOverwrite': 'Přesto přepsat',
```

In `en:`:

```js
        'saveDialog.title': 'Save changes?',
        'saveDialog.overwriteOption': 'Overwrite original',
        'saveDialog.overwriteWarn': '⚠ Original will be replaced, cannot be undone',
        'saveDialog.copyOption': 'Save as copy',
        'saveDialog.cancel': 'Cancel',
        'saveDialog.confirm': 'Save',
        'saveDialog.conflictTitle': '⚠ File changed externally',
        'saveDialog.conflictExplain': 'The file on disk was modified after you opened it (probably by a CDE sync or another tool).',
        'saveDialog.conflictAge': 'newer on disk',
        'saveDialog.saveAsCopy': 'Save as copy',
        'saveDialog.forceOverwrite': 'Force overwrite',
```

- [ ] **Step 7: Load script in 4 HTMLs**

For each of `index.html`, `pages/ids-ifc-validator.html`, `pages/ids-parser-visualizer.html`, `pages/ifc-viewer-multi-file.html`:

Find `<script src="...common/folder-file-autoload.js"></script>` and insert IMMEDIATELY AFTER:

```html
    <script src="assets/js/common/save-to-folder-dialog.js"></script>
```

(For pages/*.html use `../assets/js/common/save-to-folder-dialog.js`.)

ALSO add the test runner script — in `tests/test-runner.html`, find where `folder-file-autoload.js` or `local-folder-storage.js` is loaded and add immediately after:

```html
    <script src="../assets/js/common/save-to-folder-dialog.js"></script>
```

- [ ] **Step 8: Mirror dist + test**

```bash
cp /home/michal/work/BIM_checker/assets/js/common/save-to-folder-dialog.js /home/michal/work/BIM_checker/dist/assets/js/common/save-to-folder-dialog.js
cp /home/michal/work/BIM_checker/assets/css/index.css /home/michal/work/BIM_checker/dist/assets/css/index.css
cp /home/michal/work/BIM_checker/assets/js/common/translations.js /home/michal/work/BIM_checker/dist/assets/js/common/translations.js
cp /home/michal/work/BIM_checker/index.html /home/michal/work/BIM_checker/dist/index.html
cp /home/michal/work/BIM_checker/pages/ids-ifc-validator.html /home/michal/work/BIM_checker/dist/pages/ids-ifc-validator.html
cp /home/michal/work/BIM_checker/pages/ids-parser-visualizer.html /home/michal/work/BIM_checker/dist/pages/ids-parser-visualizer.html
cp /home/michal/work/BIM_checker/pages/ifc-viewer-multi-file.html /home/michal/work/BIM_checker/dist/pages/ifc-viewer-multi-file.html
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

Expected: 791/791 (785 + 6 new).

- [ ] **Step 9: Commit**

```bash
cd /home/michal/work/BIM_checker
git add assets/js/common/save-to-folder-dialog.js assets/css/index.css assets/js/common/translations.js index.html pages/ dist/ tests/test-suites/save-to-folder-dialog.test.js tests/test-runner.html
git commit -m "feat(storage-v2): save-to-folder dialog component (overwrite/copy + conflict variant)"
```

---

## Task 5: `BIMSaveFile` helper (centralized save routing)

**Files:**
- Create: `assets/js/common/bim-save-file.js`
- Create: `tests/test-suites/bim-save-file-helper.test.js`
- Modify: `tests/test-runner.html`
- Modify: all 4 HTMLs

**Goal:** Centralize the "save edited file" flow. In folder mode → dialog + backend write (with conflict resolution chain). In IndexedDB mode → existing direct save. Public API: `BIMSaveFile.save({ type, path, name, content, folderPath })`.

- [ ] **Step 1: Write tests**

Create `/home/michal/work/BIM_checker/tests/test-suites/bim-save-file-helper.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('BIMSaveFile helper', () => {
    let originalBackend;
    let savedFiles;

    beforeEach(() => {
        originalBackend = window.BIMStorage.backend;
        savedFiles = [];
        // Mock BIMStorage.saveFile for IDB-mode test
        window.BIMStorage._saveFileOrig = window.BIMStorage.saveFile;
        window.BIMStorage.saveFile = async (type, file) => {
            savedFiles.push({ type, name: file.name, size: file.size });
            return { ok: true };
        };
    });

    afterEach(() => {
        window.BIMStorage.setBackend(originalBackend);
        if (window.BIMStorage._saveFileOrig) {
            window.BIMStorage.saveFile = window.BIMStorage._saveFileOrig;
            delete window.BIMStorage._saveFileOrig;
        }
        document.querySelectorAll('.save-to-folder-dialog').forEach(el => el.remove());
    });

    it('saves directly via BIMStorage.saveFile in IndexedDB mode (no dialog)', async () => {
        // Backend is IndexedDB by default
        const result = await window.BIMSaveFile.save({
            type: 'ifc',
            path: 'wall.ifc',
            name: 'wall.ifc',
            content: 'new content',
            folderPath: ''
        });
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('overwrite');
        expect(savedFiles.length).toBe(1);
        expect(savedFiles[0].name).toBe('wall.ifc');
        // No dialog rendered
        expect(document.querySelector('.save-to-folder-dialog')).toBe(null);
    });

    it('opens dialog in folder mode', async () => {
        // Mock folder backend
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async () => ({ ok: true }),
            writeNewFile: async () => ({ ok: true, finalName: 'wall_v2.ifc', path: 'wall_v2.ifc' })
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc',
            path: 'wall.ifc',
            name: 'wall.ifc',
            content: 'content',
            folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        const dialog = document.querySelector('.save-to-folder-dialog');
        expect(dialog !== null).toBe(true);
        // Cancel
        document.querySelector('.save-to-folder-dialog__cancel').click();
        const result = await promise;
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('user_cancelled');
    });

    it('routes overwrite choice to saveFileContent', async () => {
        const calls = [];
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async (...args) => { calls.push(['save', ...args]); return { ok: true }; },
            writeNewFile: async () => ({ ok: true })
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'X', folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('input[name="saveDialogMode"][value="overwrite"]').click();
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await promise;
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('overwrite');
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe('save');
    });

    it('routes copy choice to writeNewFile', async () => {
        const calls = [];
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async () => ({ ok: true }),
            writeNewFile: async (...args) => { calls.push(['write', ...args]); return { ok: true, finalName: args[2], path: args[2] }; }
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'X', folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        // Default is copy
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await promise;
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('copy');
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe('write');
    });

    it('handles conflict_external_change by opening conflict dialog', async () => {
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async (_t, _p, _c, opts) => {
                if (opts && opts.force) return { ok: true };
                return { error: 'conflict_external_change', currentMtime: 5000, knownMtime: 1000 };
            },
            writeNewFile: async () => ({ ok: true, finalName: 'x', path: 'x' })
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'X', folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('input[name="saveDialogMode"][value="overwrite"]').click();
        document.querySelector('.save-to-folder-dialog__confirm').click();
        await new Promise(r => setTimeout(r, 80));
        // Conflict dialog now open — click Force overwrite
        document.querySelector('.save-to-folder-dialog__force').click();
        const result = await promise;
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('overwrite');
    });
});
```

- [ ] **Step 2: Register test**

After `<script src="test-suites/save-to-folder-dialog.test.js"></script>` in test-runner.html, add:

```html
    <script src="test-suites/bim-save-file-helper.test.js"></script>
```

- [ ] **Step 3: Run tests — confirm fails**

```bash
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -10
```

Expected: 5 new FAILs.

- [ ] **Step 4: Create `/home/michal/work/BIM_checker/assets/js/common/bim-save-file.js`**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Centralized save flow for edited file content.
 * Backend-aware: folder mode opens dialog + writes via FS API;
 * IndexedDB mode saves directly via existing BIMStorage.saveFile.
 */

(function () {
    'use strict';

    async function save({ type, path, name, content, folderPath = '' }) {
        const backend = window.BIMStorage && window.BIMStorage.backend;
        if (!backend) return { ok: false, reason: 'no_backend' };

        // IndexedDB mode: save directly, no dialog
        if (backend.kind === 'indexedDB') {
            const mime = type === 'ifc' ? 'application/octet-stream' : 'application/xml';
            const blob = new Blob([content], { type: mime });
            const file = new File([blob], name, { type: mime });
            try {
                await window.BIMStorage.saveFile(type, file);
                return { ok: true, mode: 'overwrite', finalPath: name };
            } catch (e) {
                return { ok: false, reason: 'save_failed', message: e.message };
            }
        }

        if (backend.kind !== 'localFolder') return { ok: false, reason: 'unsupported_backend' };

        // Folder mode: dialog + backend write
        const contentSize = (typeof content === 'string') ? content.length : (content.byteLength || 0);
        const choice = await window.BIMSaveToFolderDialog.open({
            fileName: name, folderPath, contentSize, type
        });
        if (!choice) return { ok: false, reason: 'user_cancelled' };

        if (choice.mode === 'overwrite') {
            let result = await backend.saveFileContent(type, path, content);
            if (result.error === 'conflict_external_change') {
                const resolution = await window.BIMSaveToFolderDialog.openConflict({
                    fileName: name,
                    currentMtime: result.currentMtime,
                    knownMtime: result.knownMtime
                });
                if (!resolution) return { ok: false, reason: 'user_cancelled_conflict' };
                if (resolution === 'overwrite') {
                    result = await backend.saveFileContent(type, path, content, { force: true });
                } else if (resolution === 'copy') {
                    result = await backend.writeNewFile(type, folderPath, name, content);
                }
            }
            if (result.error) return { ok: false, reason: result.error, message: result.message };
            return { ok: true, mode: 'overwrite', finalPath: path };
        }

        if (choice.mode === 'copy') {
            const result = await backend.writeNewFile(type, folderPath, choice.newName, content);
            if (result.error) return { ok: false, reason: result.error, message: result.message };
            return { ok: true, mode: 'copy', finalPath: result.path, finalName: result.finalName };
        }

        return { ok: false, reason: 'unknown_mode' };
    }

    window.BIMSaveFile = { save };
})();
```

- [ ] **Step 5: Load in 4 HTMLs + test runner**

In each HTML, immediately AFTER the `save-to-folder-dialog.js` script tag, add:

`index.html`:
```html
    <script src="assets/js/common/bim-save-file.js"></script>
```

Pages (3 files), use `../assets/...`:
```html
    <script src="../assets/js/common/bim-save-file.js"></script>
```

In `tests/test-runner.html`, after `save-to-folder-dialog.js` load:

```html
    <script src="../assets/js/common/bim-save-file.js"></script>
```

- [ ] **Step 6: Mirror dist + test**

```bash
cp /home/michal/work/BIM_checker/assets/js/common/bim-save-file.js /home/michal/work/BIM_checker/dist/assets/js/common/bim-save-file.js
cp /home/michal/work/BIM_checker/index.html /home/michal/work/BIM_checker/dist/index.html
cp /home/michal/work/BIM_checker/pages/ids-ifc-validator.html /home/michal/work/BIM_checker/dist/pages/ids-ifc-validator.html
cp /home/michal/work/BIM_checker/pages/ids-parser-visualizer.html /home/michal/work/BIM_checker/dist/pages/ids-parser-visualizer.html
cp /home/michal/work/BIM_checker/pages/ifc-viewer-multi-file.html /home/michal/work/BIM_checker/dist/pages/ifc-viewer-multi-file.html
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

Expected: 796/796 (791 + 5 new).

- [ ] **Step 7: Commit**

```bash
cd /home/michal/work/BIM_checker
git add assets/js/common/bim-save-file.js index.html pages/ dist/ tests/test-suites/bim-save-file-helper.test.js tests/test-runner.html
git commit -m "feat(storage-v2): BIMSaveFile helper — backend-aware save routing with conflict chain"
```

---

## Task 6: Wire up IDS Editor

**Files:**
- Modify: `assets/js/parser.js`

**Goal:** When user clicks "Save" in IDS editor (parser page), route through `BIMSaveFile.save()` instead of direct save logic.

- [ ] **Step 1: Find IDS Editor save handler**

```bash
grep -n "saveIDS\|generateIDS\|button.*save\|onclick.*save\|saveBtn\|exportIDS" /home/michal/work/BIM_checker/assets/js/parser.js | head -10
```

Identify the function that handles the IDS save click. It builds an XML string and exports/downloads/saves. We want to insert routing through `BIMSaveFile.save()` instead of (or before) the existing save action.

- [ ] **Step 2: Read the save handler**

Read 40 lines around the handler. Identify:
- Variable holding the XML content (e.g., `idsXml` or `currentIDSData.xml`)
- The filename being saved (e.g., `currentIDSData.info.title + '.ids'`)
- The folder path (in folder mode, file came from a specific subfolder; track or default to root)

- [ ] **Step 3: Wrap save handler with backend routing**

At the start of the save handler, add a check: if we have an active save target (file loaded from folder), call `BIMSaveFile.save()`. Otherwise, fall back to existing download flow.

Generic pattern (adapt to actual code structure):

```js
// At top of save handler:
const path = window._currentIDSPath || null;        // set when loaded from folder
const folderPath = window._currentIDSFolder || '';  // set when loaded from folder
const name = window._currentIDSName || 'output.ids';

if (path && window.BIMStorage && window.BIMStorage.backend && window.BIMStorage.backend.kind === 'localFolder' && window.BIMSaveFile) {
    const xml = /* existing logic that builds XML string */;
    const result = await window.BIMSaveFile.save({
        type: 'ids', path, name, content: xml, folderPath
    });
    if (result.ok) {
        // Toast: "Saved" or update UI
        if (window.BIMStorageCardFolderStates) window.BIMStorageCardFolderStates.refresh();
    } else if (result.reason !== 'user_cancelled') {
        console.warn('Save failed:', result);
    }
    return;
}

// Existing fallback save (download / IDB):
// ...existing code unchanged
```

- [ ] **Step 4: Set `_currentIDS*` globals when loading from folder**

In `folder-file-autoload.js`, when an IDS is loaded, set:

```js
window._currentIDSPath = req.path;
window._currentIDSFolder = req.path.includes('/') ? req.path.slice(0, req.path.lastIndexOf('/')) : '';
window._currentIDSName = req.name;
```

ALSO in the validator's IDS picker and parser's storage picker — when user picks an IDS file from folder, set these globals so subsequent saves know the target path.

Same pattern in `assets/js/common/folder-file-autoload.js`. Read the file, find the IDS branch:

```js
} else if (req.type === 'ids' && typeof window.handleFile === 'function') {
    window.handleFile(file);
}
```

Update:

```js
} else if (req.type === 'ids' && typeof window.handleFile === 'function') {
    window._currentIDSPath = req.path;
    window._currentIDSFolder = req.path.includes('/') ? req.path.slice(0, req.path.lastIndexOf('/')) : '';
    window._currentIDSName = req.name;
    window.handleFile(file);
}
```

- [ ] **Step 5: Mirror + test + commit**

```bash
cp /home/michal/work/BIM_checker/assets/js/parser.js /home/michal/work/BIM_checker/dist/assets/js/parser.js
cp /home/michal/work/BIM_checker/assets/js/common/folder-file-autoload.js /home/michal/work/BIM_checker/dist/assets/js/common/folder-file-autoload.js
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

Expected: 796/796 (no new tests).

```bash
cd /home/michal/work/BIM_checker
git add assets/js/parser.js assets/js/common/folder-file-autoload.js dist/
git commit -m "feat(storage-v2): IDS Editor save routes through BIMSaveFile in folder mode"
```

---

## Task 7: Wire up IFC Viewer edit panel

**Files:**
- Modify: `assets/js/ifc/viewer-ui.js`
- Modify: `assets/js/common/folder-file-autoload.js`

**Goal:** When user clicks "Apply changes" / "Save" in IFC Viewer edit panel, route the modified IFC content through `BIMSaveFile.save()`.

- [ ] **Step 1: Find IFC edit save handler**

```bash
grep -n "applyChanges\|saveIFC\|edit-panel-buttons\|saveModif\|exportIFC" /home/michal/work/BIM_checker/assets/js/ifc/viewer-ui.js | head -15
```

Identify the function that generates the modified IFC text and either downloads it or saves to IDB. Read context around it.

- [ ] **Step 2: Add backend routing branch**

Before the existing download/save flow, add a folder-mode branch:

```js
// At start of the save/apply function:
const path = window._currentIFCPath || null;
const folderPath = window._currentIFCFolder || '';
const name = window._currentIFCName || 'modified.ifc';
const ifcText = /* existing logic building IFC string */;

if (path && window.BIMStorage && window.BIMStorage.backend && window.BIMStorage.backend.kind === 'localFolder' && window.BIMSaveFile) {
    const result = await window.BIMSaveFile.save({
        type: 'ifc', path, name, content: ifcText, folderPath
    });
    if (result.ok) {
        if (window.BIMStorageCardFolderStates) window.BIMStorageCardFolderStates.refresh();
    } else if (result.reason !== 'user_cancelled') {
        console.warn('Save failed:', result);
    }
    return;
}

// Existing fallback (download / IDB save):
// ...
```

- [ ] **Step 3: Set `_currentIFC*` globals on folder file load**

In `folder-file-autoload.js`, find the IFC branch:

```js
if (req.type === 'ifc' && typeof window.handleFiles === 'function') {
    window.handleFiles([file]);
}
```

Update:

```js
if (req.type === 'ifc' && typeof window.handleFiles === 'function') {
    window._currentIFCPath = req.path;
    window._currentIFCFolder = req.path.includes('/') ? req.path.slice(0, req.path.lastIndexOf('/')) : '';
    window._currentIFCName = req.name;
    window.handleFiles([file]);
}
```

Also: when user picks IFC files from validator/viewer storage picker in folder mode, the same globals should be set. Locate `confirmIfcSelection` and `loadSelectedFilesFromStorage` (both have folder-mode branches from earlier) and set `window._currentIFCPath = fileId; window._currentIFCName = fileMetadata.name;` etc. for the FIRST selected file (single-file save target).

- [ ] **Step 4: Mirror + test + commit**

```bash
cp /home/michal/work/BIM_checker/assets/js/ifc/viewer-ui.js /home/michal/work/BIM_checker/dist/assets/js/ifc/viewer-ui.js
cp /home/michal/work/BIM_checker/assets/js/common/folder-file-autoload.js /home/michal/work/BIM_checker/dist/assets/js/common/folder-file-autoload.js
cp /home/michal/work/BIM_checker/assets/js/validator.js /home/michal/work/BIM_checker/dist/assets/js/validator.js
cp /home/michal/work/BIM_checker/assets/js/ifc/viewer-init.js /home/michal/work/BIM_checker/dist/assets/js/ifc/viewer-init.js
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

Expected: 796/796.

```bash
cd /home/michal/work/BIM_checker
git add assets/js/ifc/viewer-ui.js assets/js/common/folder-file-autoload.js assets/js/validator.js assets/js/ifc/viewer-init.js dist/
git commit -m "feat(storage-v2): IFC Viewer edit panel saves through BIMSaveFile in folder mode"
```

---

## Task 8: AI tools (save / check-writable / get-mtime)

**Files:**
- Modify: `assets/js/ai/tool-defs.js`
- Modify: `assets/js/ai/tools/tool-storage.js`
- Modify: `assets/js/ai/tool-catalog.js` (count bump)
- Modify: `assets/js/common/translations.js`

**Goal:** Add 3 new AI tools. Update `get_storage_info` to return `isReadOnly: false` in v2 folder mode.

- [ ] **Step 1: Add 3 tool defs in `tool-defs.js`**

After existing folder tools (`get_storage_info`, etc.), add:

```js
    {
        type: 'function',
        function: {
            name: 'save_file_to_folder',
            description: 'Save edited content back to a file in the connected local folder. Opens a save dialog; user picks overwrite vs save-as-copy. Requires localFolder backend. Returns { ok, mode, finalPath } or { error }.',
            parameters: {
                type: 'object',
                properties: {
                    fileType: { type: 'string', enum: ['ifc', 'ids'] },
                    path: { type: 'string', description: 'Original file path in the folder' },
                    name: { type: 'string', description: 'Original file name' },
                    content: { type: 'string', description: 'New content (UTF-8 string)' },
                    folderPath: { type: 'string', description: 'Parent folder path for the file' }
                },
                required: ['fileType', 'path', 'name', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_folder_writable',
            description: 'Returns whether the connected local folder is writable. Folder backend grants readwrite at connect; can return false if permission was revoked.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_file_mtime',
            description: 'Returns the last-modified timestamp (Unix ms) of a file in the connected folder. Useful to detect external changes.',
            parameters: {
                type: 'object',
                properties: {
                    fileType: { type: 'string', enum: ['ifc', 'ids'] },
                    path: { type: 'string' }
                },
                required: ['fileType', 'path']
            }
        }
    },
```

- [ ] **Step 2: Implement 3 tools in `tool-storage.js`**

Add at end of file (before the `register(registerFn)` block, OR find the existing storage-tool registration block):

```js
async function tool_save_file_to_folder(args) {
    const backend = window.BIMStorage.backend;
    if (!backend || backend.kind !== 'localFolder') {
        return { error: 'not_connected', message: t('ai.tool.localFolder.notConnected') };
    }
    if (!window.BIMSaveFile) {
        return { error: 'feature_unavailable', message: 'BIMSaveFile helper not loaded' };
    }
    const result = await window.BIMSaveFile.save({
        type: args.fileType,
        path: args.path,
        name: args.name,
        content: args.content,
        folderPath: args.folderPath || ''
    });
    if (result.ok) {
        return {
            ok: true,
            mode: result.mode,
            finalPath: result.finalPath,
            finalName: result.finalName || args.name
        };
    }
    return { error: result.reason || 'save_failed', message: result.message };
}

async function tool_check_folder_writable(_args) {
    const backend = window.BIMStorage.backend;
    if (!backend) return { writable: false, reason: 'no_backend' };
    if (backend.kind !== 'localFolder') return { writable: false, reason: 'not_folder_mode' };
    if (!backend.root) return { writable: false, reason: 'no_handle' };
    try {
        const perm = await backend.root.queryPermission({ mode: 'readwrite' });
        return { writable: perm === 'granted', permission: perm };
    } catch (e) {
        return { writable: false, reason: 'query_failed', message: e.message };
    }
}

async function tool_get_file_mtime(args) {
    const backend = window.BIMStorage.backend;
    if (!backend || backend.kind !== 'localFolder') {
        return { error: 'not_connected', message: t('ai.tool.localFolder.notConnected') };
    }
    const record = backend._fileCache && backend._fileCache.get(args.path);
    if (!record) return { error: 'file_not_found', message: 'File not in cache — rescan' };
    try {
        const file = await record.handle.getFile();
        return { mtime: file.lastModified, size: file.size, name: record.name };
    } catch (e) {
        return { error: 'read_failed', message: e.message };
    }
}
```

Register in the existing `export function register(registerFn)` block — add 3 new lines:

```js
    registerFn('save_file_to_folder', tool_save_file_to_folder);
    registerFn('check_folder_writable', tool_check_folder_writable);
    registerFn('get_file_mtime', tool_get_file_mtime);
```

- [ ] **Step 3: Update `get_storage_info` for v2**

In `tool-storage.js`, find `tool_get_storage_info`. The folder-mode branch returns `isReadOnly: b.isReadOnly()` which now naturally returns false (Task 1). No change needed beyond what Task 1 already does.

- [ ] **Step 4: Update `tool-catalog.js` count**

```bash
grep -n "'save_file_to_folder'\|TOTAL_TOOLS\|'storage'" /home/michal/work/BIM_checker/assets/js/ai/tool-catalog.js | head -5
```

Find the storage category in `tool-catalog.js`. Add 3 new tool names to the array. Update the count if hardcoded (it auto-sums in most cases).

- [ ] **Step 5: i18n keys**

In `translations.js` cs:
```js
        'ai.tool.localFolder.saved': 'Soubor uložen.',
        'ai.tool.localFolder.savedAsCopy': 'Soubor uložen jako kopie: {name}',
        'ai.tool.localFolder.overwritten': 'Soubor přepsán: {path}',
        'ai.tool.localFolder.conflictDetected': 'Soubor byl externě změněn. Použij Save as copy nebo Force overwrite.',
```

en:
```js
        'ai.tool.localFolder.saved': 'File saved.',
        'ai.tool.localFolder.savedAsCopy': 'File saved as copy: {name}',
        'ai.tool.localFolder.overwritten': 'File overwritten: {path}',
        'ai.tool.localFolder.conflictDetected': 'File was externally modified. Use Save as copy or Force overwrite.',
```

- [ ] **Step 6: Mirror + test + commit**

```bash
cp /home/michal/work/BIM_checker/assets/js/ai/tool-defs.js /home/michal/work/BIM_checker/dist/assets/js/ai/tool-defs.js
cp /home/michal/work/BIM_checker/assets/js/ai/tools/tool-storage.js /home/michal/work/BIM_checker/dist/assets/js/ai/tools/tool-storage.js
cp /home/michal/work/BIM_checker/assets/js/ai/tool-catalog.js /home/michal/work/BIM_checker/dist/assets/js/ai/tool-catalog.js
cp /home/michal/work/BIM_checker/assets/js/common/translations.js /home/michal/work/BIM_checker/dist/assets/js/common/translations.js
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

If any existing test (storage-tool-count or similar) hardcodes a 60 count, update to 63.

Expected: 796/796.

```bash
cd /home/michal/work/BIM_checker
git add assets/js/ai/tool-defs.js assets/js/ai/tools/tool-storage.js assets/js/ai/tool-catalog.js assets/js/common/translations.js dist/
git commit -m "feat(storage-v2): AI tools save_file_to_folder + check_folder_writable + get_file_mtime"
```

---

## Task 9: SW bump + PLAN/CHANGELOG + PR

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump SW v48 → v49 + add new files**

In `sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v48';` to `'bim-checker-v49'`
- In `ASSETS_TO_CACHE`, after `'./assets/js/common/folder-file-autoload.js',` add:
  ```js
      './assets/js/common/save-to-folder-dialog.js',
      './assets/js/common/bim-save-file.js',
  ```

Apply identical change to `dist/sw.js`.

- [ ] **Step 2: Append Phase 12 polish summary to PLAN.md**

After existing "Local Folder Storage v1" section:

```markdown
## Local Folder Storage v2 (Write-back) ✅
- [x] LocalFolderStorageBackend: readwrite permission at connect, saveFileContent + writeNewFile
- [x] mtime tracking on read, external change detection at save with force-bypass option
- [x] Auto-suffix on filename collision (`_v2`, `_v3`...)
- [x] `BIMSaveToFolderDialog` component (overwrite/copy variant + conflict variant)
- [x] `BIMSaveFile` helper — centralized save routing per backend
- [x] IDS Editor save routed through helper in folder mode
- [x] IFC Viewer edit panel save routed through helper in folder mode
- [x] 3 new AI tools (`save_file_to_folder`, `check_folder_writable`, `get_file_mtime`) — 63 total
- [x] Delete/rename/create-folder remain blocked (read-only guards from v1 preserved)
- [x] +23 new tests (773 → 796)

Branch: local-folder-storage-v2 (cut from local-folder-storage-v1 HEAD).

PR combines v1 + v2 in one merge to master.
```

- [ ] **Step 3: Add CHANGELOG entry — `[0.12.0]`**

Before `[0.11.0]`:

```markdown
## [0.12.0] - 2026-05-12

### Added
- **Local folder write-back (v2)** — desktop Chromium users can save edited IFC/IDS files directly to the connected folder
- `LocalFolderStorageBackend.saveFileContent` — overwrite existing file with mtime conflict detection
- `LocalFolderStorageBackend.writeNewFile` — create new file with auto-suffix on name collision
- `BIMSaveToFolderDialog` — reusable save dialog with overwrite/copy choices and conflict-resolution variant
- `BIMSaveFile` — centralized save helper routing per active backend
- 3 new AI tools: `save_file_to_folder`, `check_folder_writable`, `get_file_mtime` (60 → 63 total)
- IDS Editor + IFC Viewer save buttons route through BIMSaveFile in folder mode
- mtime tracking on file read; external change detection at save with force-bypass and copy-instead options
- +23 regression tests (773 → 796)

### Changed
- `showDirectoryPicker` now requests `mode: 'readwrite'` (was `'read'` in v1)
- `LocalFolderStorageBackend.isReadOnly()` returns `false` (was `true` in v1)
- v1 read-only guards preserved for delete/rename/create-folder operations
- SW cache bumped v48 → v49

### Notes
- v2 ships together with v1 in a single combined merge to master (PR #18 + v2 branch).
- CDE workflow now end-to-end: pull from cloud → edit in BIM_checker → save back → cloud picks up the change.
```

- [ ] **Step 4: Final test pass**

```bash
cd /home/michal/work/BIM_checker && node tests/run-tests.js 2>&1 | tail -5
```

Expected: 796/796.

- [ ] **Step 5: Commit + push + PR**

```bash
cd /home/michal/work/BIM_checker
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(storage-v2): SW v48→v49 + PLAN/CHANGELOG for Local Folder Storage v2"
git push -u origin local-folder-storage-v2
gh pr create --title "Local PC folder storage v1 + v2 (read + write-back)" --body "..."
```

PR body should:
- Summarize that this PR combines BOTH v1 (read-only) and v2 (write-back)
- List key capabilities
- Mention PR #18 can be closed (superseded by this combined PR)
- Test plan covering both v1 reads and v2 writes

Capture PR URL.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `mode: 'readwrite'` at connect | Task 1 ✓ |
| `isReadOnly()` returns false | Task 1 ✓ |
| `saveFileContent` with mtime conflict | Task 2 ✓ |
| `writeNewFile` with auto-suffix | Task 3 ✓ |
| Save dialog (overwrite / copy / cancel) | Task 4 ✓ |
| Conflict dialog (force / copy / cancel) | Task 4 ✓ |
| `BIMSaveFile.save()` helper | Task 5 ✓ |
| IDS Editor wire-up | Task 6 ✓ |
| IFC Viewer wire-up | Task 7 ✓ |
| 3 new AI tools | Task 8 ✓ |
| Update `get_storage_info` for v2 | Task 8 ✓ (via Task 1) |
| Tests: write + conflict + new-file + dialog + helper | Tasks 2, 3, 4, 5 ✓ |
| SW v48 → v49 + PLAN + CHANGELOG | Task 9 ✓ |
| Permission upgrade flow (v1 users) | Task 1 (readwrite at restore) ✓ |

**Placeholder scan:** No TBD/TODO/vague. Every step has concrete code or commands.

**Type consistency:**
- `BIMSaveFile.save({ type, path, name, content, folderPath })` signature consistent across Task 5, 6, 7, 8 ✓
- `BIMSaveToFolderDialog.open()` returns `{ mode, newName? } | null` consistent ✓
- `BIMSaveToFolderDialog.openConflict()` returns `'overwrite' | 'copy' | null` consistent ✓
- Backend write methods return `{ ok: true, ... } | { error, message }` consistent ✓
- `kind: 'localFolder'` check consistent across all consumers ✓
- `_readMtimes` field naming consistent (Task 2 defines, Task 3+ uses) ✓

**Test count progression:**
- Baseline: 773
- After T1: 773 (no new tests, may update 1 existing)
- After T2: 780 (+7 write + conflict)
- After T3: 785 (+5 write-new-file)
- After T4: 791 (+6 dialog)
- After T5: 796 (+5 helper)
- After T6-T9: 796 (integration tasks, no new automated tests)

**Risks:**
- Test count goal: spec said ~785, plan actually delivers 796 (more granular tests than originally estimated) — actually better coverage
- IDS Editor + IFC Viewer wire-up tasks are integration-heavy and depend on existing code structure that subagent must discover via grep. The plan instructs subagent to investigate first then adapt patterns.
- Path tracking globals (`window._currentIDS*`, `window._currentIFC*`) are a pragmatic shortcut. Cleaner would be per-instance state, but matches existing window-globals pattern in the codebase.

**Out of scope (deferred to v3):**
- Delete file / folder operations (read-only guards stay)
- Rename / move
- Batch save (multiple open files)
- Per-folder save preferences (always-overwrite mode)
- FileSystemObserver auto-rescan
- Undo history

**Final state:** 796/796 tests pass, v1 + v2 combined in one PR to master, CDE-sync workflow end-to-end functional on desktop Chromium, mobile/Firefox/Safari unaffected.
