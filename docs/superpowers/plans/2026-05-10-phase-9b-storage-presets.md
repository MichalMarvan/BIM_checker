# Phase 9b: Storage + Presets + File Ops — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 15 AI tools covering folder CRUD, file move/download/snippet/summary/replace, validation preset CRUD + apply, and a `request_user_attention` toast tool.

**Architecture:** Extends Phase 8/9a tool-module pattern (`assets/js/ai/tools/tool-*.js` with `register(registerFn)` hook). Two new files: `tool-presets.js` for preset CRUD; everything else extends existing modules. Tools resolve user-friendly names (folder names, preset names) to ids inside the handler — same pattern as Phase 9a's `_resolveAgentId` helper.

**Tech Stack:** Vanilla JS ES6 modules, IndexedDB (via existing `BIMStorage` and `ValidationPresets`), Blob + ObjectURL for downloads, native `confirm()` for destructive ops, Puppeteer test runner via `node tests/run-tests.js`.

**Branch:** `phase-9b-storage-presets` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-10-phase-9-comprehensive-ai-tools-design.md` (Tier B sections).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/ai/tools/tool-storage.js` | Modify | Add 9 tools: create/rename/delete folder, move_file, move_files_batch, download_file, get_file_snippet, get_file_summary, replace_file_content |
| `assets/js/ai/tools/tool-presets.js` | **Create** | 5 tools: list/save/delete/load/apply preset |
| `assets/js/ai/tools/tool-ui.js` | Modify | Add 1 tool: `request_user_attention` |
| `assets/js/ai/tool-defs.js` | Modify | Add 15 OpenAI-format definitions in Czech (29 → 44) |
| `assets/js/ai/tool-executor.js` | Modify | Import `tool-presets.js` + add to `_bootstrap()` |
| `dist/...` | Mirror | Each modified file copied via `cp` |
| `sw.js` + `dist/sw.js` | Modify | Bump v28 → v29; add `tool-presets.js` to `ASSETS_TO_CACHE` |
| `tests/test-suites/tools-storage.test.js` | Modify | Add ~22 tests (folders 6, move 4, content 6, replace 3, summary 3) |
| `tests/test-suites/tools-presets.test.js` | **Create** | ~10 tests |
| `tests/test-suites/tools-ui.test.js` | Modify | Add 2 tests for `request_user_attention` |
| `tests/test-suites/chat-panel-tool-loop.test.js` | Modify | Update count assertions: 29 → 44 |
| `tests/test-suites/ai-bootstrap.test.js` | Modify | Update count assertion: 29 → 44 |
| `tests/test-runner.html` | Modify | Add `<script src="test-suites/tools-presets.test.js"></script>` |
| `PLAN.md` | Modify | Append Phase 9b section |
| `CHANGELOG.md` | Modify | Add `[0.6.0]` entry at top |

---

## Cross-cutting conventions (carried from Phase 8/9a)

- All tool handlers `async`, return plain objects, never throw on missing data — return `{ error: 'code', message: 'cs' }`.
- Throw only for truly missing required globals (`BIMStorage`, `ValidationPresets`).
- Native `window.confirm()` for destructive ops; on dismiss return `{ cancelled: true }`.
- Tests use `expect(arr.includes(x)).toBe(false)` — no `.not` chaining.
- After every code change: mirror to `dist/` via `cp <src> <dst>`.
- Helper pattern for name→id resolution mirrors `_resolveAgentId` from `tool-agents.js`.
- Czech tool descriptions in `tool-defs.js`; internal error codes are English snake_case.
- Final test count after Phase 9b: 621 + ~34 = **655 tests minimum**.

### BIMStorage primer (read this once)

- `window.BIMStorage` exposes `init()`, `getFiles(type)`, `getFile(type, name)`, `getFileContent(type, fileId)`, `saveFile(type, file, folderId)`.
- Per-type StorageManager at `BIMStorage.ifcStorage` and `BIMStorage.idsStorage` exposes `createFolder(name, parentId)`, `renameFolder(folderId, newName)`, `deleteFolder(folderId)`, `moveFile(fileId, targetFolderId)`.
- The folder tree lives at `sm.data.folders` — `{ [folderId]: { id, name, parent, children: [], files: [], expanded } }`. Root folder has id `'root'`.
- `sm.data.files` — `{ [fileId]: { id, name, size, folder: folderId, uploadDate } }`.
- Phase 8 hotfix added a `_buildFolderPath` helper inside `tool-storage.js` — it returns paths like `'root/Projekty/2024'` (root literal). Reuse it.
- Phase 8 hotfix's `list_storage_folders` returns `[{ name: path, fileCount, files: [...] }]` — keep that shape consistent.

### ValidationPresets primer

- `window.ValidationPresets` exposes `list()`, `get(id)`, `save(name, presetGroups) -> id`, `delete(id) -> bool`, `saveLastSession(groups)`, `loadLastSession() -> { groups, savedAt }`, `flushLastSession()`, `toPresetGroups(validationGroups)`, `fromPresetGroups(presetGroups) -> hydrated`.
- Each preset record: `{ id, name, createdAt, updatedAt, groups: [{ ifcFileNames: [], idsFileName }] }`.
- The validator page listens to `ai:applyLastSession` event to re-hydrate from last-session preset. Phase 8 added `localStorage.bim_validator_autorun = '1'` flag; the validator's `_applyLastSession()` checks it and auto-runs.

---

## Task 1: Folder CRUD tools (create/rename/delete)

**Files:**
- Modify: `assets/js/ai/tools/tool-storage.js` — add 3 tools + `_resolveFolderId` helper
- Modify: `tests/test-suites/tools-storage.test.js` — add 6 tests

- [ ] **Step 1: Add `_resolveFolderId` helper at the top of tool-storage.js**

Open `assets/js/ai/tools/tool-storage.js`. Find the existing `_buildFolderPath` helper. AFTER it, add:
```js
function _resolveFolderId(foldersMap, nameOrPath) {
    if (!nameOrPath || nameOrPath === 'root') return { id: 'root' };
    const needle = String(nameOrPath).toLowerCase();
    const matches = Object.values(foldersMap).filter(f => {
        if (f.id === 'root') return false;
        if (f.name.toLowerCase() === needle) return true;
        const path = _buildFolderPath(foldersMap, f.id).toLowerCase();
        return path === needle || path.endsWith('/' + needle);
    });
    if (matches.length === 0) return { error: 'not_found', message: `Složka "${nameOrPath}" neexistuje.` };
    if (matches.length > 1) {
        return {
            error: 'ambiguous_folder',
            message: `Více složek odpovídá "${nameOrPath}". Zadej úplnou cestu.`,
            candidates: matches.map(f => ({ id: f.id, path: _buildFolderPath(foldersMap, f.id) }))
        };
    }
    return { id: matches[0].id };
}
```

- [ ] **Step 2: Add `create_folder` export**

In `tool-storage.js`, BEFORE the existing `register()` function, append:
```js
export async function create_folder(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const folders = sm.data.folders;
    const parentResolution = _resolveFolderId(folders, args.parentName || 'root');
    if (parentResolution.error) return parentResolution;
    const folderId = await sm.createFolder(args.name.trim(), parentResolution.id);
    return { folderId, path: _buildFolderPath(folders, folderId) };
}
```

- [ ] **Step 3: Add `rename_folder` export**

In `tool-storage.js`, after `create_folder`:
```js
export async function rename_folder(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        folderName: { required: true },
        newName: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const resolved = _resolveFolderId(sm.data.folders, args.folderName);
    if (resolved.error) return resolved;
    if (resolved.id === 'root') return { error: 'cannot_modify_root', message: 'Kořenovou složku nelze přejmenovat.' };
    const ok = await sm.renameFolder(resolved.id, args.newName.trim());
    return { renamed: ok, folderId: resolved.id };
}
```

- [ ] **Step 4: Add `delete_folder` export**

In `tool-storage.js`, after `rename_folder`:
```js
export async function delete_folder(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        folderName: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const resolved = _resolveFolderId(sm.data.folders, args.folderName);
    if (resolved.error) return resolved;
    if (resolved.id === 'root') return { error: 'cannot_modify_root', message: 'Kořenovou složku nelze smazat.' };
    const folder = sm.data.folders[resolved.id];
    const fileCount = (folder.files || []).length;
    if (!confirm(`Smazat složku '${folder.name}' (${fileCount} souborů + podsložky)?`)) {
        return { cancelled: true };
    }
    const ok = await sm.deleteFolder(resolved.id);
    return { deleted: ok };
}
```

- [ ] **Step 5: Update `register()` to expose 3 new tools**

Find the existing `register()` in `tool-storage.js`. ADD these lines before its closing `}`:
```js
    registerFn('create_folder', create_folder);
    registerFn('rename_folder', rename_folder);
    registerFn('delete_folder', delete_folder);
```

- [ ] **Step 6: Add tests to tools-storage.test.js**

In `tests/test-suites/tools-storage.test.js`, find the last `it(...)` test block. AFTER it (still inside the `describe`), add:
```js
    it('create_folder creates a folder under root', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.create_folder({ type: 'ifc', name: 'TestFolderA' });
        try {
            expect(typeof r.folderId).toBe('string');
            expect(r.path.includes('TestFolderA')).toBe(true);
        } finally {
            await window.BIMStorage.ifcStorage.deleteFolder(r.folderId).catch(() => {});
        }
    });

    it('create_folder returns not_found for missing parent', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.create_folder({ type: 'ifc', name: 'X', parentName: 'NonexistentParent_zzz' });
        expect(r.error).toBe('not_found');
    });

    it('rename_folder renames an existing folder', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const created = await tools.create_folder({ type: 'ifc', name: 'OldName_rt' });
        try {
            const r = await tools.rename_folder({ type: 'ifc', folderName: 'OldName_rt', newName: 'NewName_rt' });
            expect(r.renamed).toBe(true);
            const folders = window.BIMStorage.ifcStorage.data.folders;
            expect(folders[created.folderId].name).toBe('NewName_rt');
        } finally {
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });

    it('rename_folder refuses on root', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.rename_folder({ type: 'ifc', folderName: 'root', newName: 'X' });
        expect(r.error).toBe('cannot_modify_root');
    });

    it('delete_folder asks confirm and deletes on accept', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const created = await tools.create_folder({ type: 'ifc', name: 'ToDelete_dt' });
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await tools.delete_folder({ type: 'ifc', folderName: 'ToDelete_dt' });
            expect(r.deleted).toBe(true);
            expect(!!window.BIMStorage.ifcStorage.data.folders[created.folderId]).toBe(false);
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_folder returns cancelled when confirm dismissed', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const created = await tools.create_folder({ type: 'ifc', name: 'KeepMe_kt' });
        const orig = window.confirm;
        window.confirm = () => false;
        try {
            const r = await tools.delete_folder({ type: 'ifc', folderName: 'KeepMe_kt' });
            expect(r.cancelled).toBe(true);
            expect(!!window.BIMStorage.ifcStorage.data.folders[created.folderId]).toBe(true);
        } finally {
            window.confirm = orig;
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });
```

- [ ] **Step 7: Mirror + run tests**
```bash
cd /home/michal/work/BIM_checker
cp assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `627/627` (621 baseline + 6 new). Tools won't be discoverable to LLM until Task 7 wires them in tool-defs.js — that's intentional.

- [ ] **Step 8: Commit**
```bash
git checkout -b phase-9b-storage-presets
git add assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js \
        tests/test-suites/tools-storage.test.js
git commit -m "feat(ai-tools-9b): folder CRUD (create/rename/delete)"
```

---

## Task 2: File move tools (move_file + move_files_batch)

**Files:**
- Modify: `assets/js/ai/tools/tool-storage.js`
- Modify: `tests/test-suites/tools-storage.test.js`

- [ ] **Step 1: Add `move_file` export**

In `tool-storage.js`, before `register()`, append:
```js
export async function move_file(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        fileName: { required: true },
        targetFolderName: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const file = await window.BIMStorage.getFile(args.type, args.fileName);
    if (!file) return { error: 'not_found', message: `Soubor "${args.fileName}" neexistuje.` };
    const folderResolved = _resolveFolderId(sm.data.folders, args.targetFolderName);
    if (folderResolved.error) return folderResolved;
    const ok = await sm.moveFile(file.id, folderResolved.id);
    return { moved: ok, fileId: file.id, targetFolderId: folderResolved.id };
}
```

- [ ] **Step 2: Add `move_files_batch` export**

In `tool-storage.js`, after `move_file`:
```js
export async function move_files_batch(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        fileNames: { required: true },
        targetFolderName: { required: true }
    });
    if (!Array.isArray(args.fileNames)) {
        throw new Error('fileNames must be an array of strings');
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const folderResolved = _resolveFolderId(sm.data.folders, args.targetFolderName);
    if (folderResolved.error) return folderResolved;
    const moved = [];
    const skipped = [];
    for (const name of args.fileNames) {
        const file = await window.BIMStorage.getFile(args.type, name);
        if (!file) {
            skipped.push({ name, reason: 'not_found' });
            continue;
        }
        const ok = await sm.moveFile(file.id, folderResolved.id);
        if (ok) moved.push(name); else skipped.push({ name, reason: 'move_failed' });
    }
    return { moved, skipped, targetFolderId: folderResolved.id };
}
```

- [ ] **Step 3: Update register()**

Add inside `register()` body:
```js
    registerFn('move_file', move_file);
    registerFn('move_files_batch', move_files_batch);
```

- [ ] **Step 4: Add tests**

In `tests/test-suites/tools-storage.test.js`, append inside the `describe`:
```js
    it('move_file resolves filename and target folder, then moves', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'mv_a.ifc', size: 10, content: 'AAA' });
        const created = await tools.create_folder({ type: 'ifc', name: 'MoveTarget_mv' });
        try {
            const r = await tools.move_file({ type: 'ifc', fileName: 'mv_a.ifc', targetFolderName: 'MoveTarget_mv' });
            expect(r.moved).toBe(true);
            const file = await window.BIMStorage.getFile('ifc', 'mv_a.ifc');
            expect(file.folder).toBe(created.folderId);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'mv_a.ifc').catch(() => {});
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });

    it('move_file returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.move_file({ type: 'ifc', fileName: 'nonexistent_x.ifc', targetFolderName: 'root' });
        expect(r.error).toBe('not_found');
    });

    it('move_files_batch reports moved + skipped', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'b1.ifc', size: 10, content: 'X' });
        await window.BIMStorage.saveFile('ifc', { name: 'b2.ifc', size: 10, content: 'X' });
        const created = await tools.create_folder({ type: 'ifc', name: 'BatchTarget_b' });
        try {
            const r = await tools.move_files_batch({
                type: 'ifc',
                fileNames: ['b1.ifc', 'b2.ifc', 'nope.ifc'],
                targetFolderName: 'BatchTarget_b'
            });
            expect(r.moved.length).toBe(2);
            expect(r.skipped.length).toBe(1);
            expect(r.skipped[0].name).toBe('nope.ifc');
            expect(r.skipped[0].reason).toBe('not_found');
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'b1.ifc').catch(() => {});
            await window.BIMStorage.deleteFile('ifc', 'b2.ifc').catch(() => {});
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });

    it('move_files_batch rejects non-array fileNames', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        let threw = false;
        try {
            await tools.move_files_batch({ type: 'ifc', fileNames: 'not_array', targetFolderName: 'root' });
        } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });
```

- [ ] **Step 5: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `631/631` (627 + 4 new).

- [ ] **Step 6: Commit**
```bash
git add assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js \
        tests/test-suites/tools-storage.test.js
git commit -m "feat(ai-tools-9b): move_file + move_files_batch"
```

---

## Task 3: File content tools (download/snippet/summary)

**Files:**
- Modify: `assets/js/ai/tools/tool-storage.js`
- Modify: `tests/test-suites/tools-storage.test.js`

- [ ] **Step 1: Add `download_file` export**

In `tool-storage.js`, before `register()`, append:
```js
export async function download_file(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent(args.type, file.id);
    const blob = new Blob([content], { type: args.type === 'ifc' ? 'text/plain' : 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = args.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { downloaded: true, name: args.name, size: file.size };
}
```

- [ ] **Step 2: Add `get_file_snippet` export**

In `tool-storage.js`, after `download_file`:
```js
export async function get_file_snippet(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    const maxBytes = typeof args.maxBytes === 'number' && args.maxBytes > 0
        ? Math.min(args.maxBytes, 50000)
        : 8000;
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent(args.type, file.id);
    const truncated = content.length > maxBytes;
    return {
        name: args.name,
        snippet: truncated ? content.slice(0, maxBytes) : content,
        truncated,
        totalBytes: content.length
    };
}
```

- [ ] **Step 3: Add `get_file_summary` export**

In `tool-storage.js`, after `get_file_snippet`:
```js
export async function get_file_summary(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent(args.type, file.id);
    const out = {
        name: args.name,
        size: file.size,
        modifiedAt: file.modifiedAt || file.uploadDate || null
    };
    if (args.type === 'ifc') {
        if (typeof window.IFCParserCore === 'undefined') {
            out.warning = 'IFCParserCore not available — entity counts skipped';
            return out;
        }
        const entities = window.IFCParserCore.parseIFCContent(content, args.name) || [];
        const counts = {};
        for (const e of entities) {
            const t = (e.entity || '').toUpperCase();
            counts[t] = (counts[t] || 0) + 1;
        }
        out.entityCount = entities.length;
        out.topTypes = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => ({ name: n, count: c }));
    } else {
        if (typeof window.parseIDS === 'undefined') {
            out.warning = 'parseIDS not available — spec count skipped';
            return out;
        }
        const ids = window.parseIDS(content, args.name);
        out.specCount = ids?.specifications?.length || 0;
        out.title = ids?.info?.title || null;
        out.ifcVersion = ids?.info?.ifcVersion || null;
    }
    return out;
}
```

- [ ] **Step 4: Update register()**

Add inside `register()`:
```js
    registerFn('download_file', download_file);
    registerFn('get_file_snippet', get_file_snippet);
    registerFn('get_file_summary', get_file_summary);
```

- [ ] **Step 5: Add tests**

In `tests/test-suites/tools-storage.test.js`, append:
```js
    it('download_file triggers a click on a download anchor', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'dl_test.ifc', size: 5, content: 'HELLO' });
        const origCreate = URL.createObjectURL;
        const origRevoke = URL.revokeObjectURL;
        let createUrlCalled = false;
        URL.createObjectURL = () => { createUrlCalled = true; return 'blob:fake'; };
        URL.revokeObjectURL = () => {};
        try {
            const r = await tools.download_file({ type: 'ifc', name: 'dl_test.ifc' });
            expect(r.downloaded).toBe(true);
            expect(r.name).toBe('dl_test.ifc');
            expect(createUrlCalled).toBe(true);
        } finally {
            URL.createObjectURL = origCreate;
            URL.revokeObjectURL = origRevoke;
            await window.BIMStorage.deleteFile('ifc', 'dl_test.ifc').catch(() => {});
        }
    });

    it('download_file returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.download_file({ type: 'ifc', name: 'never_existed.ifc' });
        expect(r.error).toBe('not_found');
    });

    it('get_file_snippet returns content under maxBytes', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'snippet1.ifc', size: 5, content: 'HELLO' });
        try {
            const r = await tools.get_file_snippet({ type: 'ifc', name: 'snippet1.ifc' });
            expect(r.snippet).toBe('HELLO');
            expect(r.truncated).toBe(false);
            expect(r.totalBytes).toBe(5);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'snippet1.ifc').catch(() => {});
        }
    });

    it('get_file_snippet truncates long content', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const big = 'x'.repeat(20000);
        await window.BIMStorage.saveFile('ifc', { name: 'big.ifc', size: big.length, content: big });
        try {
            const r = await tools.get_file_snippet({ type: 'ifc', name: 'big.ifc', maxBytes: 100 });
            expect(r.snippet.length).toBe(100);
            expect(r.truncated).toBe(true);
            expect(r.totalBytes).toBe(20000);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'big.ifc').catch(() => {});
        }
    });

    it('get_file_summary returns ifc entity counts', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const tinyIfc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('test'),'2;1');
FILE_NAME('t.ifc','',(),(), '', '', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('GUID',$,'Wall1',$,$,$,$,$,$);
#2=IFCWALL('GUID2',$,'Wall2',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
        await window.BIMStorage.saveFile('ifc', { name: 'sum1.ifc', size: tinyIfc.length, content: tinyIfc });
        try {
            const r = await tools.get_file_summary({ type: 'ifc', name: 'sum1.ifc' });
            expect(r.name).toBe('sum1.ifc');
            expect(typeof r.entityCount).toBe('number');
            expect(Array.isArray(r.topTypes)).toBe(true);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'sum1.ifc').catch(() => {});
        }
    });

    it('get_file_summary returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.get_file_summary({ type: 'ifc', name: 'nope_summary.ifc' });
        expect(r.error).toBe('not_found');
    });
```

- [ ] **Step 6: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `637/637` (631 + 6 new).

- [ ] **Step 7: Commit**
```bash
git add assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js \
        tests/test-suites/tools-storage.test.js
git commit -m "feat(ai-tools-9b): download_file + get_file_snippet + get_file_summary"
```

---

## Task 4: replace_file_content

**Files:**
- Modify: `assets/js/ai/tools/tool-storage.js`
- Modify: `tests/test-suites/tools-storage.test.js`

- [ ] **Step 1: Add `replace_file_content` export**

In `tool-storage.js`, before `register()`, append:
```js
export async function replace_file_content(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true },
        content: { required: true }
    });
    if (typeof args.content !== 'string') {
        throw new Error('content must be a string');
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const oldSize = file.size || 0;
    const newSize = args.content.length;
    const sizeDeltaPercent = oldSize > 0 ? Math.abs(newSize - oldSize) / oldSize * 100 : 0;
    const warning = sizeDeltaPercent > 50
        ? ` POZOR: nová velikost se liší o ${sizeDeltaPercent.toFixed(0)}%.`
        : '';
    if (!confirm(`Přepsat obsah '${args.name}'?${warning}`)) {
        return { cancelled: true };
    }
    await window.BIMStorage.saveFile(args.type, { name: args.name, size: newSize, content: args.content }, file.folder);
    return { replaced: true, oldSize, newSize };
}
```

Note: `BIMStorage.saveFile` already overwrites by name (`existingFile` check + delete inside). The `file.folder` arg preserves the original folder.

- [ ] **Step 2: Update register()**

Add inside `register()`:
```js
    registerFn('replace_file_content', replace_file_content);
```

- [ ] **Step 3: Add tests**

In `tests/test-suites/tools-storage.test.js`, append:
```js
    it('replace_file_content overwrites file with confirm', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'rep.ifc', size: 3, content: 'OLD' });
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await tools.replace_file_content({ type: 'ifc', name: 'rep.ifc', content: 'NEW_CONTENT' });
            expect(r.replaced).toBe(true);
            expect(r.oldSize).toBe(3);
            expect(r.newSize).toBe(11);
            const after = await window.BIMStorage.getFileContent('ifc', (await window.BIMStorage.getFile('ifc', 'rep.ifc')).id);
            expect(after).toBe('NEW_CONTENT');
        } finally {
            window.confirm = orig;
            await window.BIMStorage.deleteFile('ifc', 'rep.ifc').catch(() => {});
        }
    });

    it('replace_file_content returns cancelled when confirm dismissed', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'cancel.ifc', size: 3, content: 'OLD' });
        const orig = window.confirm;
        window.confirm = () => false;
        try {
            const r = await tools.replace_file_content({ type: 'ifc', name: 'cancel.ifc', content: 'NEW' });
            expect(r.cancelled).toBe(true);
            const file = await window.BIMStorage.getFile('ifc', 'cancel.ifc');
            const content = await window.BIMStorage.getFileContent('ifc', file.id);
            expect(content).toBe('OLD');
        } finally {
            window.confirm = orig;
            await window.BIMStorage.deleteFile('ifc', 'cancel.ifc').catch(() => {});
        }
    });

    it('replace_file_content returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.replace_file_content({ type: 'ifc', name: 'gone.ifc', content: 'X' });
        expect(r.error).toBe('not_found');
    });
```

- [ ] **Step 4: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `640/640` (637 + 3 new).

- [ ] **Step 5: Commit**
```bash
git add assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js \
        tests/test-suites/tools-storage.test.js
git commit -m "feat(ai-tools-9b): replace_file_content with confirm + size warning"
```

---

## Task 5: Presets module (list/save/delete/load/apply)

**Files:**
- Create: `assets/js/ai/tools/tool-presets.js`
- Create: `tests/test-suites/tools-presets.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create tool-presets.js**

```js
import * as helpers from './_helpers.js';

function _resolvePresetId(args) {
    if (args && args.id) return { id: args.id };
    if (args && args.name) {
        const matches = window.ValidationPresets.list().filter(p => p.name.trim() === args.name.trim());
        if (matches.length === 0) return { error: 'not_found', message: `Preset "${args.name}" neexistuje.` };
        if (matches.length > 1) {
            return {
                error: 'ambiguous_name',
                candidates: matches.map(p => ({ id: p.id, name: p.name }))
            };
        }
        return { id: matches[0].id };
    }
    return { error: 'missing_identifier', message: 'Zadej id nebo name presetu.' };
}

export async function list_presets() {
    if (typeof window.ValidationPresets === 'undefined') throw new Error('ValidationPresets not available');
    return window.ValidationPresets.list().map(p => ({
        id: p.id,
        name: p.name,
        groupCount: (p.groups || []).length,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt
    }));
}

export async function save_preset(args) {
    helpers.validateArgs(args, { name: { required: true } });
    if (typeof window.ValidationPresets === 'undefined') throw new Error('ValidationPresets not available');
    let groups;
    if (args.useCurrentGroups && Array.isArray(window.validationGroups)) {
        groups = window.ValidationPresets.toPresetGroups(window.validationGroups);
    } else {
        const last = window.ValidationPresets.loadLastSession();
        groups = (last && Array.isArray(last.groups)) ? last.groups : [];
    }
    if (groups.length === 0) {
        return { error: 'no_groups', message: 'Nejsou žádné skupiny k uložení (validator je prázdný a žádný last-session preset).' };
    }
    const id = window.ValidationPresets.save(args.name.trim(), groups);
    return { presetId: id, groupCount: groups.length };
}

export async function delete_preset(args) {
    const resolved = _resolvePresetId(args);
    if (resolved.error) return resolved;
    const preset = window.ValidationPresets.get(resolved.id);
    if (!preset) return { error: 'not_found' };
    if (!confirm(`Smazat preset '${preset.name}'?`)) return { cancelled: true };
    const ok = window.ValidationPresets.delete(resolved.id);
    return { deleted: ok };
}

async function _applyPresetToLastSession(presetId, andNavigate) {
    const preset = window.ValidationPresets.get(presetId);
    if (!preset) return { error: 'not_found' };
    window.ValidationPresets.saveLastSession(preset.groups || []);
    window.ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    const onValidator = helpers.getCurrentPageId() === 'validator';
    if (!onValidator && andNavigate) {
        try { localStorage.setItem('bim_validator_autorun', '1'); } catch (e) {}
        const targetUrl = (location.pathname.includes('/pages/'))
            ? './ids-ifc-validator.html'
            : './pages/ids-ifc-validator.html';
        load_preset._timer = setTimeout(() => { window.location.href = targetUrl; }, 150);
        return { applied: true, navigating: true, presetId };
    }
    return { applied: true, presetId, appliedTo: onValidator ? 'live UI' : 'last-session preset' };
}

export async function load_preset(args) {
    const resolved = _resolvePresetId(args);
    if (resolved.error) return resolved;
    return _applyPresetToLastSession(resolved.id, !!args.andNavigate);
}

export async function apply_preset(args) {
    helpers.validateArgs(args, { presetName: { required: true } });
    const resolved = _resolvePresetId({ name: args.presetName });
    if (resolved.error) return resolved;
    return _applyPresetToLastSession(resolved.id, true);
}

export function register(registerFn) {
    registerFn('list_presets', list_presets);
    registerFn('save_preset', save_preset);
    registerFn('delete_preset', delete_preset);
    registerFn('load_preset', load_preset);
    registerFn('apply_preset', apply_preset);
}
```

- [ ] **Step 2: Create tests/test-suites/tools-presets.test.js**

```js
describe('tool-presets', () => {
    let presetTools;
    let savedPresets;

    beforeEach(async () => {
        presetTools = await import('../../assets/js/ai/tools/tool-presets.js');
        savedPresets = window.ValidationPresets.list().slice();
    });

    afterEach(() => {
        for (const p of window.ValidationPresets.list()) {
            window.ValidationPresets.delete(p.id);
        }
        for (const p of savedPresets) {
            window.ValidationPresets.save(p.name, p.groups);
        }
        try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
    });

    it('list_presets returns array with groupCount', async () => {
        const id = window.ValidationPresets.save('TestPreset', [{ ifcFileNames: ['x.ifc'], idsFileName: 'y.ids' }]);
        try {
            const list = await presetTools.list_presets({});
            const me = list.find(p => p.id === id);
            expect(!!me).toBe(true);
            expect(me.groupCount).toBe(1);
        } finally {
            window.ValidationPresets.delete(id);
        }
    });

    it('save_preset uses current validationGroups when useCurrentGroups=true', async () => {
        const orig = window.validationGroups;
        window.validationGroups = [{
            ifcFiles: [{ name: 'a.ifc' }],
            idsFile: { name: 'b.ids' },
            missingIfcNames: [],
            missingIdsName: null
        }];
        try {
            const r = await presetTools.save_preset({ name: 'CurrentSnap_t', useCurrentGroups: true });
            expect(typeof r.presetId).toBe('string');
            expect(r.groupCount).toBe(1);
            const stored = window.ValidationPresets.get(r.presetId);
            expect(stored.groups[0].ifcFileNames[0]).toBe('a.ifc');
        } finally {
            window.validationGroups = orig;
        }
    });

    it('save_preset uses last-session when useCurrentGroups=false', async () => {
        window.ValidationPresets.saveLastSession([{ ifcFileNames: ['ls.ifc'], idsFileName: 'ls.ids' }]);
        window.ValidationPresets.flushLastSession();
        const r = await presetTools.save_preset({ name: 'FromLastSession_t' });
        expect(r.groupCount).toBe(1);
    });

    it('save_preset returns no_groups when nothing to snapshot', async () => {
        try { localStorage.removeItem('bim_validation_last_session'); } catch (e) {}
        const r = await presetTools.save_preset({ name: 'Empty_t' });
        expect(r.error).toBe('no_groups');
    });

    it('delete_preset uses confirm and removes', async () => {
        const id = window.ValidationPresets.save('ToDelete_t', []);
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await presetTools.delete_preset({ id });
            expect(r.deleted).toBe(true);
            expect(window.ValidationPresets.get(id)).toBe(null);
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_preset accepts name', async () => {
        const id = window.ValidationPresets.save('DelByName_t', []);
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await presetTools.delete_preset({ name: 'DelByName_t' });
            expect(r.deleted).toBe(true);
            expect(window.ValidationPresets.get(id)).toBe(null);
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_preset returns missing_identifier without id or name', async () => {
        const r = await presetTools.delete_preset({});
        expect(r.error).toBe('missing_identifier');
    });

    it('load_preset writes last-session and dispatches event', async () => {
        const id = window.ValidationPresets.save('LoadMe_t', [{ ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' }]);
        let dispatched = false;
        const handler = () => { dispatched = true; };
        window.addEventListener('ai:applyLastSession', handler);
        try {
            const r = await presetTools.load_preset({ id });
            expect(r.applied).toBe(true);
            expect(dispatched).toBe(true);
            const last = window.ValidationPresets.loadLastSession();
            expect(last.groups[0].ifcFileNames[0]).toBe('a.ifc');
        } finally {
            window.removeEventListener('ai:applyLastSession', handler);
            window.ValidationPresets.delete(id);
        }
    });

    it('apply_preset finds by name and triggers navigation timer when not on validator', async () => {
        const helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('parser');
        const id = window.ValidationPresets.save('ApplyByName_t', [{ ifcFileNames: ['z.ifc'], idsFileName: 'w.ids' }]);
        try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
        try {
            const r = await presetTools.apply_preset({ presetName: 'ApplyByName_t' });
            expect(r.applied).toBe(true);
            expect(r.navigating).toBe(true);
            if (presetTools.apply_preset._timer) clearTimeout(presetTools.apply_preset._timer);
        } finally {
            window.ValidationPresets.delete(id);
            helpers._setCurrentPageForTest(null);
            try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
        }
    });

    it('register adds 5 tools', async () => {
        let count = 0;
        presetTools.register(() => { count++; });
        expect(count).toBe(5);
    });
});
```

Note: the timer escape hatch is on `load_preset._timer` per the implementation (`apply_preset` calls into `_applyPresetToLastSession` which sets `load_preset._timer`). Adjust the test to clear `presetTools.load_preset._timer` if `apply_preset._timer` is undefined — the helper assigns to `load_preset._timer` to keep one canonical place.

- [ ] **Step 3: Add test runner script tag**

In `tests/test-runner.html`, after `<script src="test-suites/tools-agents.test.js"></script>`, add:
```html
    <script src="test-suites/tools-presets.test.js"></script>
```

- [ ] **Step 4: Mirror + run tests**
```bash
mkdir -p dist/assets/js/ai/tools
cp assets/js/ai/tools/tool-presets.js dist/assets/js/ai/tools/tool-presets.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `650/650` (640 + 10 new).

- [ ] **Step 5: Commit**
```bash
git add assets/js/ai/tools/tool-presets.js dist/assets/js/ai/tools/tool-presets.js \
        tests/test-suites/tools-presets.test.js tests/test-runner.html
git commit -m "feat(ai-tools-9b): tool-presets — list/save/delete/load/apply"
```

---

## Task 6: request_user_attention tool

**Files:**
- Modify: `assets/js/ai/tools/tool-ui.js`
- Modify: `tests/test-suites/tools-ui.test.js`

- [ ] **Step 1: Add `request_user_attention` to tool-ui.js**

Open `assets/js/ai/tools/tool-ui.js`. Read the current state. Append BEFORE the existing `register()`:
```js
export async function request_user_attention(args) {
    helpers.validateArgs(args, { message: { required: true } });
    const kind = (args && args.kind) || 'info';
    if (typeof window.ErrorHandler === 'undefined') {
        return { error: 'error_handler_not_available' };
    }
    const fn = window.ErrorHandler[kind];
    if (typeof fn !== 'function') return { error: 'invalid_kind', message: `Unknown kind '${kind}'. Použij info|warning|success|error.` };
    fn.call(window.ErrorHandler, String(args.message));
    return { shown: true, kind };
}
```

- [ ] **Step 2: Update register() in tool-ui.js**

In the existing `register()` body, add:
```js
    registerFn('request_user_attention', request_user_attention);
```

- [ ] **Step 3: Add tests to tools-ui.test.js**

In `tests/test-suites/tools-ui.test.js`, append inside the `describe`:
```js
    it('request_user_attention calls ErrorHandler.info by default', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ui.js');
        const orig = window.ErrorHandler;
        let called = null;
        window.ErrorHandler = {
            info: (msg) => { called = { kind: 'info', msg }; },
            warning: () => {},
            error: () => {},
            success: () => {}
        };
        try {
            const r = await tools.request_user_attention({ message: 'hello' });
            expect(r.shown).toBe(true);
            expect(r.kind).toBe('info');
            expect(called.msg).toBe('hello');
        } finally {
            window.ErrorHandler = orig;
        }
    });

    it('request_user_attention returns invalid_kind for unknown kind', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ui.js');
        const orig = window.ErrorHandler;
        window.ErrorHandler = { info: () => {}, error: () => {} };
        try {
            const r = await tools.request_user_attention({ message: 'x', kind: 'rainbow' });
            expect(r.error).toBe('invalid_kind');
        } finally {
            window.ErrorHandler = orig;
        }
    });
```

- [ ] **Step 4: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-ui.js dist/assets/js/ai/tools/tool-ui.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `652/652` (650 + 2 new).

- [ ] **Step 5: Commit**
```bash
git add assets/js/ai/tools/tool-ui.js dist/assets/js/ai/tools/tool-ui.js \
        tests/test-suites/tools-ui.test.js
git commit -m "feat(ai-tools-9b): request_user_attention toast tool"
```

---

## Task 7: Wire-up — tool-defs (15 entries) + executor + count assertions + sw cache + docs + push

**Files:**
- Modify: `assets/js/ai/tool-defs.js` — add 15 entries
- Modify: `assets/js/ai/tool-executor.js` — import + register `tool-presets`
- Modify: `tests/test-suites/chat-panel-tool-loop.test.js` — count 29 → 44
- Modify: `tests/test-suites/ai-bootstrap.test.js` — count 29 → 44
- Modify: `sw.js` + `dist/sw.js` — bump v28 → v29 + add `tool-presets.js`
- Modify: `PLAN.md` — append Phase 9b section
- Modify: `CHANGELOG.md` — add `[0.6.0]` entry

- [ ] **Step 1: Add 15 entries to tool-defs.js**

In `assets/js/ai/tool-defs.js`, find the closing `];` of `TOOL_DEFINITIONS`. Insert these entries BEFORE the closing `];` (preserve trailing comma on the previous entry):
```js
    {
        type: 'function',
        function: {
            name: 'create_folder',
            description: 'Vytvoří novou složku v úložišti pro daný typ. Volitelně lze zadat parentName (jméno nebo cesta nadřazené složky).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' },
                    parentName: { type: 'string', description: 'Volitelné, default root.' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'rename_folder',
            description: 'Přejmenuje složku. Identifikuj přes folderName (jméno nebo cesta).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    folderName: { type: 'string' },
                    newName: { type: 'string' }
                },
                required: ['type', 'folderName', 'newName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_folder',
            description: 'Smaže složku včetně všech souborů a podsložek. Před smazáním otevře potvrzovací dialog.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    folderName: { type: 'string' }
                },
                required: ['type', 'folderName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'move_file',
            description: 'Přesune soubor do jiné složky. Soubor i složku identifikuj podle jména.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    fileName: { type: 'string' },
                    targetFolderName: { type: 'string' }
                },
                required: ['type', 'fileName', 'targetFolderName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'move_files_batch',
            description: 'Přesune více souborů do stejné složky najednou. Vrátí seznam moved a skipped (s důvodem).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    fileNames: { type: 'array', items: { type: 'string' } },
                    targetFolderName: { type: 'string' }
                },
                required: ['type', 'fileNames', 'targetFolderName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'download_file',
            description: 'Spustí download souboru z úložiště do uživatelova OS (přes browser).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_file_snippet',
            description: 'Vrátí prvních N bytů obsahu souboru jako text (default 8000, max 50000). Nastav truncated:true pokud soubor delší.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' },
                    maxBytes: { type: 'integer', minimum: 100, maximum: 50000 }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_file_summary',
            description: 'Souhrn souboru: pro IFC top 10 typů + počet entit, pro IDS počet specifikací + info, plus size a modifiedAt.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'replace_file_content',
            description: 'Přepíše obsah existujícího souboru novým textem. Před zápisem otevře potvrzovací dialog (s varováním pokud rozdíl velikostí >50%).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' },
                    content: { type: 'string' }
                },
                required: ['type', 'name', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_presets',
            description: 'Vypíše všechny uložené validační presety.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'save_preset',
            description: 'Uloží nový preset. useCurrentGroups:true vezme aktuální skupiny z UI validatoru, jinak použije last-session preset.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    useCurrentGroups: { type: 'boolean' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_preset',
            description: 'Smaže preset podle id NEBO name. Před smazáním otevře potvrzovací dialog.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'load_preset',
            description: 'Načte preset jako last-session (validator UI se aktualizuje). andNavigate:true přepne na Validator stránku pokud nejsi na ní.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    andNavigate: { type: 'boolean' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'apply_preset',
            description: 'Najde preset podle jména a aplikuje ho. Pokud nejsi na Validator stránce, automaticky tam přepne.',
            parameters: {
                type: 'object',
                properties: { presetName: { type: 'string' } },
                required: ['presetName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'request_user_attention',
            description: 'Zobrazí toast notifikaci uživateli — info/warning/success/error. Použij když chceš upozornit na něco mimo chat panel.',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string' },
                    kind: { type: 'string', enum: ['info', 'warning', 'success', 'error'] }
                },
                required: ['message']
            }
        }
    }
```

- [ ] **Step 2: Wire executor bootstrap to import tool-presets**

Open `assets/js/ai/tool-executor.js`. After existing imports (Phase 9a added `tool-settings` and `tool-agents`), add:
```js
import * as presetTools from './tools/tool-presets.js';
```

In `_bootstrap()`, after `agentTools.register(_registerTool);`, add:
```js
    presetTools.register(_registerTool);
```

- [ ] **Step 3: Update count assertions**

In `tests/test-suites/chat-panel-tool-loop.test.js`, locate the `'all 29 tools registered after module load'` test and update:
```js
    it('all 44 tools registered after module load', async () => {
        const executor = await import('../../assets/js/ai/tool-executor.js');
        executor._reinitializeForTest();
        expect(executor._registrySizeForTest()).toBe(44);
    });
```
And the `'TOOL_DEFINITIONS contains 29 entries'`:
```js
    it('TOOL_DEFINITIONS contains 44 entries', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        expect(TOOL_DEFINITIONS.length).toBe(44);
    });
```

In `tests/test-suites/ai-bootstrap.test.js`, run:
```bash
grep -n "29\b" tests/test-suites/ai-bootstrap.test.js
```
Change any `29` count assertion to `44` and update the test name accordingly.

- [ ] **Step 4: Bump SW cache + add tool-presets.js**

In `sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v28';` to `const CACHE_VERSION = 'bim-checker-v29';`
- In `ASSETS_TO_CACHE`, find the existing line `'./assets/js/ai/tools/tool-agents.js',` and AFTER it add:
```js
    './assets/js/ai/tools/tool-presets.js',
```

Mirror to `dist/sw.js`.

- [ ] **Step 5: Update PLAN.md**

Open `PLAN.md`. After the existing `## Phase 9a` section, append:
```markdown
## Phase 9b: Storage + presets + file ops ✅
- [x] 15 tools (folder CRUD 3, move 2, content 3, replace 1, presets 5, ui 1)
- [x] Folder name → id resolution with `ambiguous_folder` error on collisions
- [x] Native confirm() on destructive ops (delete folder, replace content, delete preset)
- [x] download_file uses Blob + ObjectURL, no LLM payload
- [x] apply_preset / load_preset cross-page via autorun flag (Phase 8 hotfix pattern)
- [x] ~34 new tests (621 → ~655)

Branch: phase-9b-storage-presets
```

- [ ] **Step 6: Update CHANGELOG.md**

Insert at the top of entries (after the header, before the first existing version):
```markdown
## [0.6.0] - 2026-05-10

### Added
- AI tools (Phase 9b, 15 new): folder CRUD, file move/download/snippet/summary/replace, preset CRUD + apply, request_user_attention
- `tool-presets.js` module wraps `ValidationPresets` for chat-driven preset management
- Folder operations resolve user-friendly names; ambiguous matches return `ambiguous_folder` with candidates
- `download_file` triggers a real browser download via Blob + ObjectURL (no LLM payload bloat)
- `apply_preset` / `load_preset` integrate with Phase 8 cross-page autorun flag

### Changed
- `tool-executor.js` `_bootstrap()` now also registers `tool-presets`
- SW cache bumped v28 → v29
```

- [ ] **Step 7: Mirror everything + final test pass**
```bash
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
cp assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js
cp sw.js dist/sw.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `652/652` (no new tests in this task — the `29 → 44` count assertions are bumps not new tests).

- [ ] **Step 8: Commit + push**
```bash
git add assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js \
        sw.js dist/sw.js \
        PLAN.md CHANGELOG.md
git commit -m "feat(ai-tools-9b): wire defs + executor bootstrap + cache bump + docs"
git push -u origin phase-9b-storage-presets
```

Capture and report the GitHub PR URL printed by `git push`.

---

## Self-Review Notes

**Spec coverage:**
- Tier B "Folders & files" 10 tools → Tasks 1-4 ✓ (3 folder + 2 move + 3 content + 1 replace + apply_preset which is Tier B presets but logically pairs with file ops; delivered in Task 5)
- Tier B "Presets" 4 tools → Task 5 (5 tools delivered: list, save, delete, load, plus apply_preset which the spec lists with Tier B file ops)
- Tier C misc `request_user_attention` → Task 6 ✓
- Total 15 tools across the catalog ✓

**Type consistency:**
- `_resolveFolderId` mirrors `_resolveAgentId` (Phase 9a) shape: `{ id }` on success, `{ error, message, candidates? }` on failure. Used by Tasks 1, 2.
- `_resolvePresetId` (Task 5) follows same pattern.
- `_buildFolderPath` is reused from Phase 8 — no redefinition.
- All `register(registerFn)` follow `(name, fn) => void` signature consistent with Phase 8/9a.
- Final tool count: 29 (Phase 9a) + 15 (Phase 9b) = 44, matches Step 3 of Task 7 assertions.

**Test count progression:**
- Baseline: 621
- After Task 1: 627 (+6)
- After Task 2: 631 (+4)
- After Task 3: 637 (+6)
- After Task 4: 640 (+3)
- After Task 5: 650 (+10)
- After Task 6: 652 (+2)
- After Task 7: 652 (no new tests, just count-bump assertions)

**Risks & mitigations:**
- `download_file` calls `a.click()` — in Puppeteer this won't actually download but will trigger the click event. Tests stub `URL.createObjectURL` to verify the call happened.
- `replace_file_content` uses `BIMStorage.saveFile` which deletes-then-writes. The folder is preserved by passing `file.folder` after lookup.
- `apply_preset` and `load_preset(andNavigate=true)` set `bim_validator_autorun = '1'` so the validator auto-runs after applying — matches the spec's "Tier B apply = navigate + run" behaviour and Phase 8 hotfix's `run_validation` flow.
- Tests for batch move use `BIMStorage.deleteFile(type, name)` cleanup — verify this exists (it does in `storage.js:570`).
