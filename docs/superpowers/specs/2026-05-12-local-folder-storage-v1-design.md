# Local PC Folder Storage (Read-only v1) — Design

**Status:** Approved by user, ready for implementation plan
**Date:** 2026-05-12
**Source:** User idea (2026-05-12) — bridge BIM_checker storage with real folder on PC for CDE-sync workflow
**Memory file (background):** `~/.claude/projects/-home-michal-work-BIM-checker/memory/project_local_folder_storage.md`

## Goal

Allow desktop Chromium users to connect BIM_checker to a real folder on their PC and **browse** IFC/IDS files directly from disk (recursive scan), without uploading them to IndexedDB. Mobile / Firefox / Safari users continue to use the IndexedDB-backed storage (unchanged). Write-back to disk is **deferred to v2** — v1 is read-only.

## User direction (brainstorm answers)

| Topic | Decision |
|---|---|
| v1 scope | **Read-only** — connect folder + browse files; no write-back |
| Folder structure | **Single root folder** — recursive scan, split by extension `.ifc` → IFC card, `.ids/.xml` → IDS card |
| IndexedDB files when folder connected | **Just switch view** — IndexedDB stays untouched, folder browses independently |
| Onboarding for Chromium users | **First-launch popup** — banner offers to try with [Try now / Maybe later / Don't show again] |
| External change detection | **Manual rescan button** — no polling, no auto-rescan |
| Re-permission flow on session restore | **Banner in storage card** — user clicks to reconnect; defaults to IndexedDB until clicked |
| Large folders | **Hard limit 2000 files** + warning at 500 |
| Settings UI | **Inside AI Settings ⚙️ modal** — new "Úložiště souborů" section above AI Agents |

## Architecture

### Storage backend abstraction

Refactor `BIMStorage` (currently in `assets/js/common/storage.js`, IndexedDB-only) into an abstract interface with two implementations:

```js
class StorageBackend {
    async listAllFiles({ type })       // 'ifc' | 'ids'
    async listFolders()
    async getFileContent(filePath)     // returns ArrayBuffer
    async getStats({ type })           // { count, totalBytes }
    async deleteFile(filePath)
    async deleteFolder(path)
    async createFolder(parentPath, name)
    async renameFolder(path, newName)
    async moveFile(filePath, newFolder)
    async addFile(file, folder, type)
    isReadOnly()                       // false for IndexedDB, true for LocalFolder v1
}

class IndexedDBStorage extends StorageBackend { /* existing logic, unchanged */ }
class LocalFolderStorage extends StorageBackend {
    constructor(rootDirHandle) { this.root = rootDirHandle; }
    // FS Access API operations
    // Write methods throw / return { error: 'read_only_backend' }
}
```

`BIMStorage.current` is the active backend. UI code and AI tools call abstract methods — backend is transparent.

**Backend switching:** `BIMStorage.setBackend(backend)` swaps `current` and dispatches `storage:backendChanged` event. UI components listen and re-render.

### FS Access API wrapper

New module: `assets/js/common/local-folder-storage.js` (~150 LOC).

Key operations:

```js
export class LocalFolderStorage {
    #root = null;            // FileSystemDirectoryHandle
    #fileCache = new Map();  // path → FileSystemFileHandle (built during scan)

    static isSupported() { return 'showDirectoryPicker' in window; }

    async connect() {
        this.#root = await window.showDirectoryPicker({ id: 'bim-checker-root', mode: 'read' });
        await persistHandle(this.#root);
        return this.#root.name;
    }

    async restoreFromIndexedDB() {
        const handle = await loadHandleFromIDB();
        if (!handle) return { state: 'no_handle' };
        const perm = await handle.queryPermission({ mode: 'read' });
        if (perm === 'granted') { this.#root = handle; return { state: 'connected' }; }
        if (perm === 'prompt')  return { state: 'needs_permission', handle };
        return { state: 'denied' };
    }

    async requestPermissionAgain(handle) { /* requestPermission, set root */ }

    async scan({ maxFiles = 2000 } = {}) {
        const files = [];
        let scanned = 0, limited = false;
        const walk = async (dirHandle, prefix) => {
            for await (const entry of dirHandle.values()) {
                if (scanned >= maxFiles) { limited = true; return; }
                const path = prefix + entry.name;
                if (entry.kind === 'file') {
                    const ext = entry.name.toLowerCase().split('.').pop();
                    if (['ifc', 'ids', 'xml'].includes(ext)) {
                        files.push({ path, name: entry.name, type: ext === 'ifc' ? 'ifc' : 'ids', handle: entry });
                        this.#fileCache.set(path, entry);
                        scanned++;
                    }
                } else if (entry.kind === 'directory') {
                    await walk(entry, path + '/');
                }
            }
        };
        await walk(this.#root, '');
        return { files, scanned, limited, warning: scanned > 500 };
    }

    async getFileContent(path) {
        const handle = this.#fileCache.get(path);
        if (!handle) throw new Error('File handle not found — rescan needed');
        const file = await handle.getFile();
        return await file.arrayBuffer();
    }

    // Write methods all return read-only error
    async deleteFile() { return { error: 'read_only_backend', message: 'Local folder is read-only in v1' }; }
    async addFile()    { return { error: 'read_only_backend', message: 'Local folder is read-only in v1' }; }
    // ... etc.

    isReadOnly() { return true; }
}

// Persistence helpers
async function persistHandle(handle) { /* save to IndexedDB store 'fs-handles', key 'root' */ }
async function loadHandleFromIDB() { /* load from same store */ }
```

The `FileSystemDirectoryHandle` is serializable via `structuredClone` so IndexedDB can store it directly.

## UI components

### First-launch popup

Trigger:
- `localStorage.localFolderOnboarding === null` (never shown)
- `LocalFolderStorage.isSupported() === true`
- Re-trigger after `dismissed` state every 7 days, max 3 times

Content (Czech UI; EN translations needed too):
```
🖥️ Nová funkce: místní složka

Tvůj prohlížeč podporuje propojení s místní složkou na disku.
Můžeš BIM_checker připojit ke složce na PC (např. CDE-sync) a
procházet IFC/IDS soubory přímo z disku bez nahrávání.

v1 = read-only (zápis přijde později)

[Zkusit teď]  [Možná později]  [✕ Neukazovat znovu]
```

State machine in `localStorage.localFolderOnboarding`:
- `null` (default) → show on next page load
- `dismissed_2026-05-12` → wait 7 days, then can show again (max 3 shows total)
- `accepted` → never show again (user already used feature at least once)
- `disabled` → never show again (user explicit opt-out)

### AI Settings modal — Storage Backend section

Position: top of modal, before AI Agents section.

```
📁 Úložiště souborů
┌─────────────────────────────────────┐
│ ( ) V prohlížeči (default, vždy)    │
│ (•) Místní složka                   │
│                                     │
│ Připojeno: /Users/.../CDE-Mirror    │
│ [📂 Změnit složku] [✕ Odpojit]      │
│                                     │
│ 245 IFC, 12 IDS souborů             │
│ ⚠ Read-only mode (v2 přidá zápis)   │
└─────────────────────────────────────┘
```

If browser doesn't support FS Access API: radio "Místní složka" is disabled with tooltip "Vyžaduje Chrome / Edge na desktop".

If folder mode active but permission lost: shows "⚠ Složka nedostupná — [Znovu připojit]" instead of file count.

### Storage cards (homepage) — 4 states

**State A: IndexedDB mode (default)**
- Existing drop zone + file tree, unchanged.

**State B: Folder mode, permission granted**
- Header replaced: `📁 /CDE-Mirror/projects/2026-tower` with `[🔄 Obnovit]` and `[📂 Změnit]` buttons
- Read-only notice: `⚠ Read-only — úpravy budou zatím v prohlížeči`
- Drop zone hidden
- File tree shows scanned files (filtered by type per card — IFC card shows only `.ifc`, IDS card shows `.ids`/`.xml`)
- Destructive actions (delete, rename) hidden / disabled

**State C: Folder mode, permission "prompt" (returning session)**
- Header replaced: `📁 Připojit složku /CDE-Mirror/...?` with `[📂 Připojit]` and `[💾 Použít prohlížeč]` buttons
- File tree empty
- Drop zone hidden

**State D: Folder mode, permission denied / drive disconnected / handle invalid**
- Header replaced: `⚠ Složka nedostupná`
- `[📂 Znovu připojit]` and `[💾 Použít prohlížeč]` buttons
- File tree empty

### Scan warning UI

When scan returns `{ limited: true }`:
```
⚠ Složka má víc než 2000 souborů.
   Naskenováno prvních 2000, ostatní nejsou viditelné.
   Zkus použít podsložku s mensi obsahem.
```

When scan returns `{ warning: true, limited: false }` (500-2000 files):
```
ℹ️ Složka má {count} souborů. Renderování může být pomalejší.
```

## Data flow

### Initial page load

```
1. App starts → BIMStorage init
2. Check localStorage.activeBackend ('indexedDB' | 'localFolder')
3. If 'localFolder':
   3a. LocalFolderStorage.restoreFromIndexedDB()
       - 'connected' → BIMStorage.setBackend(localFolderInstance)
       - 'needs_permission' → BIMStorage.setBackend(indexedDB), show banner state C in storage cards
       - 'denied' / 'no_handle' → BIMStorage.setBackend(indexedDB), show banner state D
4. If 'indexedDB' (default):
   - BIMStorage.setBackend(indexedDB)
   - Check first-launch popup conditions
5. UI renders based on current backend
```

### Connect new folder

```
1. User clicks "Místní složka" in AI Settings OR "Connect folder" in first-launch popup
2. LocalFolderStorage.connect() → showDirectoryPicker
3. User picks folder → handle returned
4. persistHandle(handle) → IndexedDB
5. localFolderStorage.scan() → list of files with handles
6. BIMStorage.setBackend(localFolderStorage)
7. localStorage.activeBackend = 'localFolder'
8. localStorage.localFolderOnboarding = 'accepted'
9. UI re-renders → storage cards switch to State B
```

### Switch back to IndexedDB

```
1. User clicks "V prohlížeči" radio in AI Settings
2. BIMStorage.setBackend(indexedDB)
3. localStorage.activeBackend = 'indexedDB'
4. UI re-renders → storage cards switch to State A
5. (Folder handle remains in IndexedDB store — can switch back later without re-picking)
```

### Manual rescan

```
1. User clicks 🔄 button in storage card
2. localFolderStorage.scan()
3. UI re-renders file tree
4. Toast: "Naskenováno {count} souborů"
```

## Error handling

| Error | UI response |
|---|---|
| Browser doesn't support FS Access API | Radio disabled in Settings; no first-launch popup |
| User cancels showDirectoryPicker | Silent — no state change |
| Permission denied during connect | Toast: "Přístup ke složce byl odmítnut" |
| Permission revoked during session | Banner state D appears; reads to disk start failing → toast warns; backend auto-falls-back to IndexedDB if user requests files |
| Drive disconnected (USB / network) | Same as permission revoked |
| Folder deleted externally | Same as permission revoked |
| File handle becomes stale after rescan | `getFileContent` throws; UI says "Soubor zmizel, proveď rescan" |
| Read-only write attempt (delete, etc.) | `{ error: 'read_only_backend' }` returned; UI shows "V folder mode je read-only" toast |

## AI tools

Existing AI tools (`list_files`, `get_file_content`, etc.) work transparently — they call `BIMStorage.current.*` methods which dispatch to either backend.

**New AI tools for v1:**
- `connect_local_folder()` — prompts user to pick folder (requires user gesture, so may fail if not invoked via user action; returns `{ error: 'requires_user_gesture' }` in that case)
- `disconnect_local_folder()` — switches back to IndexedDB
- `get_storage_info()` — returns `{ backend: 'indexedDB' | 'localFolder', folderPath?, fileCount?, isReadOnly }`
- `rescan_local_folder()` — triggers rescan, returns `{ files, scanned, limited, warning }`

**Write-blocking tools in folder mode:**
- `delete_file`, `delete_folder`, `create_folder`, `rename_folder`, `move_file`, `replace_file_content` → return `{ error: 'read_only_backend', message: 'Lokální složka je read-only ve v1.' }` when current backend is LocalFolder.

## Testing

### Automated (~10 new tests)

| Suite | Coverage |
|---|---|
| `local-folder-storage.test.js` | `LocalFolderStorage.isSupported()`, `scan()`, `getFileContent()`, `isReadOnly()` (with mock handles) |
| `storage-backend-abstraction.test.js` | Both backends implement full interface; switching dispatches event |
| `local-folder-scan.test.js` | Recursive scan with mock dir tree; hard limit 2000; warning 500; extension filter |
| `local-folder-readonly.test.js` | Write methods return `{ error: 'read_only_backend' }` |
| `permission-flow.test.js` | Mock `queryPermission` returning 'granted' / 'prompt' / 'denied' → correct UI state |
| `first-launch-popup.test.js` | Popup renders when Chromium + null; doesn't render when Firefox; respects `disabled` state |
| `storage-backend-switch.test.js` | Switching IndexedDB ↔ LocalFolder; IndexedDB files preserved when not active |
| `ai-tool-storage-backend.test.js` | `list_files` works with both backends; write tools blocked in folder mode |
| `local-folder-detection.test.js` | `isSupported()` true in puppeteer Chromium, exhaustive feature detection |

### Manual QA (post-merge)

- [ ] Chrome + OneDrive synced folder: connect, scan, browse files
- [ ] Edge + Box folder: same
- [ ] Brave (privacy-hardened): test FS Access API works
- [ ] Firefox: radio disabled with tooltip; no popup
- [ ] Safari: same
- [ ] Mobile Chrome: same (FS Access API unavailable on Android Chrome for directories)
- [ ] iOS Safari: same
- [ ] Folder with 500+ files: warning shown
- [ ] Folder with 2000+ files: hard limit, warning shown
- [ ] Close tab + reopen: permission re-prompt banner
- [ ] Revoke permission in browser settings: state D appears
- [ ] Disconnect USB drive while connected: state D appears

## Scope boundaries (out of scope for v1)

- Write-back to disk (overwrite / copy / new file)
- Conflict detection (external file changes during session)
- Auto-rescan (visibility change, periodic)
- Multiple folders simultaneously
- Per-type folders (IFC folder + IDS folder separate)
- Migration UI (copy IndexedDB files to folder, or vice versa)
- Folder watching with FileSystemObserver API (experimental, not widely supported)
- Sharing handles between PWA install and tab session

## SW cache + i18n

- SW bump v46 → v47 (CSS + new JS file `local-folder-storage.js` added to `ASSETS_TO_CACHE`)
- New i18n keys CS + EN under namespaces: `storage.folder.*`, `storage.popup.*`, `settings.storage.*`, `ai.tool.localFolder.*`
- Regression test from i18n cleanup will catch any hardcoded CS

## Effort estimate

- StorageBackend abstraction refactor: 0.5 day
- LocalFolderStorage module: 1 day
- UI: AI Settings section + 4 storage card states: 1 day
- First-launch popup + onboarding state machine: 0.5 day
- AI tools (connect/disconnect/rescan/get_storage_info + read-only blocks): 0.5 day
- Tests: 1 day
- i18n keys + SW bump + docs + PR: 0.5 day
- **Total: ~5 days** (read-only v1 only)
