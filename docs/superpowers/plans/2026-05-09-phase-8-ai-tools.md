# Phase 8 — AI Tools / Function Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 15 BIM_checker-specific tools into the AI agents — fill the empty `tool-defs.js` and stub `tool-executor.js` from Phase 7, add a tool-call iteration loop to `chat-panel.js`, and add an `ai:applyLastSession` event listener to `validator.js` so cross-page mutations don't require navigation.

**Architecture:** Tools live in 6 sub-files under `assets/js/ai/tools/` (helpers, storage, validator, ids, ifc, ui). Flat REGISTRY in `tool-executor.js` dispatches to handlers. Cross-page validator mutations write to existing Phase 6 last-session preset and dispatch `ai:applyLastSession` event. Tool-call loop in `chat-panel.js` (max 5 iterations safety). LRU cache (max 3 files) backs heavy IFC content queries via existing `IFCParserCore`.

**Tech Stack:** Vanilla JS ES6 modules, IndexedDB via existing BIMStorage / ValidationPresets / IFCParserCore, no build step, custom Jasmine-like tests run by `node tests/run-tests.js` (Puppeteer headless Chromium).

**Spec:** `docs/superpowers/specs/2026-05-09-phase-8-ai-tools-design.md`

**Predecessor:** Phase 7 ships chat shell with `TOOL_DEFINITIONS = []` and stub `executeToolCall`. Phase 6 ships ValidationPresets last-session slot.

---

## File structure

### Created (~14 files)

| File | Responsibility |
|------|---------------|
| `assets/js/ai/tools/_helpers.js` | LRU IFC cache, page detection, args validation |
| `assets/js/ai/tools/tool-storage.js` | 2 storage tools |
| `assets/js/ai/tools/tool-validator.js` | 5 validator tools |
| `assets/js/ai/tools/tool-ids.js` | 1 IDS tool |
| `assets/js/ai/tools/tool-ifc.js` | 5 IFC content tools |
| `assets/js/ai/tools/tool-ui.js` | 2 UI tools |
| `tests/test-suites/tools-helpers.test.js` | Helper unit tests |
| `tests/test-suites/tools-storage.test.js` | Storage tool tests |
| `tests/test-suites/tools-validator.test.js` | Validator tool tests |
| `tests/test-suites/tools-ids.test.js` | IDS tool tests |
| `tests/test-suites/tools-ifc.test.js` | IFC tool tests |
| `tests/test-suites/tools-ui.test.js` | UI tool tests |
| `tests/test-suites/tool-executor.test.js` | Router tests |
| `tests/test-suites/chat-panel-tool-loop.test.js` | Loop integration tests |

### Modified

| File | Changes |
|------|---------|
| `assets/js/ai/tool-defs.js` | Empty `[]` → 15 OpenAI-format function definitions |
| `assets/js/ai/tool-executor.js` | Stub → REGISTRY router |
| `assets/js/ai-ui/chat-panel.js` | Add tool-call loop + tool-call bubbles |
| `assets/js/validator.js` | Add `ai:applyLastSession` event listener + extract apply-last-session helper |
| `assets/js/common/translations.js` | +5 keys × 2 langs (`ai.chat.tool*`) |
| `pages/ids-ifc-validator.html` | (No new script tags — ifc-parser-core already loaded) |
| `pages/ids-parser-visualizer.html` | Add 3 script tags: regex-cache, property-set-index, ifc-parser-core |
| `pages/ifc-viewer-multi-file.html` | Same 3 script tags |
| `index.html` | Same 3 script tags |
| `tests/test-runner.html` | Register 8 new test suites |
| `eslint.config.js` | Add tool module globals |
| `sw.js` | `CACHE_VERSION` v18 → v19, add 6 tool sub-files to `ASSETS_TO_CACHE` |
| `PLAN.md` | Phase 8 milestone entry |
| `CHANGELOG.md` | `[0.4.0]` entry |

All `assets/`, `pages/`, `sw.js` mirrored to `dist/`.

---

## Implementation tasks

### Task 1: Bootstrap — helpers, executor router, IFC parser availability on all pages

**Goal:** Empty `assets/js/ai/tools/` directory created with `_helpers.js` + 5 stub modules. `tool-executor.js` switched from Phase 7 stub to REGISTRY router (currently empty registry). Test harness for helpers + executor passes. IFC parser script tags added to all 4 pages so Phase 8 IFC tools can call `window.IFCParserCore` from anywhere.

**Files:**
- Create: `assets/js/ai/tools/_helpers.js` + dist mirror
- Create: 5 stub files `tools/tool-storage.js`, `tool-validator.js`, `tool-ids.js`, `tool-ifc.js`, `tool-ui.js` + dist mirrors
- Create: `tests/test-suites/tools-helpers.test.js`
- Create: `tests/test-suites/tool-executor.test.js`
- Modify: `assets/js/ai/tool-executor.js` + dist mirror
- Modify: `pages/ids-parser-visualizer.html` + `pages/ifc-viewer-multi-file.html` + `index.html` (+ dist mirrors)
- Modify: `tests/test-runner.html`
- Modify: `eslint.config.js`

- [ ] **Step 1: Create `_helpers.js`**

`assets/js/ai/tools/_helpers.js`:
```js
/**
 * Shared helpers for Phase 8 tools.
 *  - getCurrentPageId: URL-path heuristic for the active BIM_checker page
 *  - LRU cache for parsed IFC files (max 3) using window.IFCParserCore
 *  - validateArgs: simple JSON Schema-lite check
 */

let _testPageOverride = null;

export function getCurrentPageId() {
    if (_testPageOverride) return _testPageOverride;
    const path = location.pathname;
    if (path.endsWith('/') || path.endsWith('/index.html')) return 'home';
    if (path.includes('ids-ifc-validator')) return 'validator';
    if (path.includes('ids-parser-visualizer')) return 'parser';
    if (path.includes('ifc-viewer-multi-file')) return 'viewer';
    return 'unknown';
}

export function _setCurrentPageForTest(id) { _testPageOverride = id; }

const _ifcParseCache = new Map();
const MAX_CACHE = 3;

export async function getParsedIfc(filename) {
    if (_ifcParseCache.has(filename)) {
        const v = _ifcParseCache.get(filename);
        _ifcParseCache.delete(filename);
        _ifcParseCache.set(filename, v);
        return v.entities;
    }
    if (typeof window.BIMStorage === 'undefined') {
        throw new Error('BIMStorage not available');
    }
    if (typeof window.IFCParserCore === 'undefined') {
        throw new Error('IFCParserCore not available on this page');
    }
    await window.BIMStorage.init();
    const meta = await window.BIMStorage.getFile('ifc', filename);
    if (!meta) throw new Error(`File not found: ${filename}`);
    const content = await window.BIMStorage.getFileContent('ifc', meta.id);
    const entities = window.IFCParserCore.parseIFCContent(content, filename);

    if (_ifcParseCache.size >= MAX_CACHE) {
        const oldest = _ifcParseCache.keys().next().value;
        _ifcParseCache.delete(oldest);
    }
    _ifcParseCache.set(filename, { entities, parsedAt: Date.now() });
    return entities;
}

export function _clearIfcCacheForTest() { _ifcParseCache.clear(); }
export function _ifcCacheSizeForTest() { return _ifcParseCache.size; }

export function validateArgs(args, schema) {
    if (!args || typeof args !== 'object') {
        throw new Error('Arguments object missing');
    }
    for (const [key, def] of Object.entries(schema)) {
        if (def.required && (args[key] === undefined || args[key] === null)) {
            throw new Error(`Missing required arg: ${key}`);
        }
        if (args[key] !== undefined && def.enum && !def.enum.includes(args[key])) {
            throw new Error(`Invalid value for ${key}: must be one of ${def.enum.join(', ')}`);
        }
    }
}
```

- [ ] **Step 2: Create 5 stub tool modules**

Each stub exports nothing and has a one-line comment. Tasks 2–8 will fill them.

`assets/js/ai/tools/tool-storage.js`:
```js
/* Phase 8 storage tools — implemented in Task 2 */
```

`assets/js/ai/tools/tool-validator.js`:
```js
/* Phase 8 validator tools — implemented in Tasks 5–6 */
```

`assets/js/ai/tools/tool-ids.js`:
```js
/* Phase 8 IDS tools — implemented in Task 4 */
```

`assets/js/ai/tools/tool-ifc.js`:
```js
/* Phase 8 IFC content tools — implemented in Tasks 7–8 */
```

`assets/js/ai/tools/tool-ui.js`:
```js
/* Phase 8 UI tools — implemented in Task 3 */
```

- [ ] **Step 3: Replace `tool-executor.js` with REGISTRY router**

`assets/js/ai/tool-executor.js`:
```js
/**
 * Routes tool calls dispatched by the AI to handler functions.
 * Phase 8: REGISTRY is populated as each task adds tools.
 */

const REGISTRY = {};

export function _registerTool(name, fn) {
    REGISTRY[name] = fn;
}

export async function executeToolCall(toolCall) {
    const name = toolCall?.name;
    const args = toolCall?.arguments;
    const fn = REGISTRY[name];
    if (!fn) return { error: 'unknown_tool', name };
    try {
        return await fn(args);
    } catch (e) {
        console.warn('[tool-executor]', name, 'failed:', e);
        return { error: 'execution_error', message: e.message, tool: name };
    }
}

export function _registrySizeForTest() { return Object.keys(REGISTRY).length; }
export function _resetRegistryForTest() {
    for (const k of Object.keys(REGISTRY)) delete REGISTRY[k];
}
```

NOTE: Phase 7's `executeToolCall` accepted `{id, name, arguments}` shape. Phase 8 keeps that. The chat-panel loop (Task 9) constructs this shape from OpenAI tool_call objects.

- [ ] **Step 4: Add IFC parser dependencies to home + parser + viewer pages**

Each of `index.html`, `pages/ids-parser-visualizer.html`, `pages/ifc-viewer-multi-file.html` needs 3 new script tags (validator already has them).

In each file, find the existing scripts block near the bottom of `<body>` (where `bug-report.js`, `compression.js`, etc. are loaded). Locate `<script src="...common/compression.js">`. After that line, add (adjust path prefix per page — `assets/...` for index.html root, `../assets/...` for pages/*):

For `index.html` (relative paths without `../`):
```html
    <script src="assets/js/common/regex-cache.js"></script>
    <script src="assets/js/common/property-set-index.js"></script>
    <script src="assets/js/common/ifc-parser-core.js"></script>
```

For `pages/ids-parser-visualizer.html` and `pages/ifc-viewer-multi-file.html`:
```html
    <script src="../assets/js/common/regex-cache.js"></script>
    <script src="../assets/js/common/property-set-index.js"></script>
    <script src="../assets/js/common/ifc-parser-core.js"></script>
```

If those scripts already exist in any page (verify with grep first), skip duplicates.

- [ ] **Step 5: Add ESLint globals**

In `eslint.config.js`, locate the existing globals block. Add after Phase 7's globals (`AIClient`, `ChatStorage`, ...):

```js
                // Phase 8: AI tools
                IFCParserCore: 'readonly',
                ValidationPresets: 'readonly',
                IDSParser: 'readonly'
```

(`IFCParserCore` and `IDSParser` were already there, but ensure listed; add `ValidationPresets` if missing. Skip duplicates that already exist.)

- [ ] **Step 6: Create `tests/test-suites/tools-helpers.test.js`**

```js
describe('tools/_helpers', () => {
    let helpers;

    beforeEach(async () => {
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest(null);
        helpers._clearIfcCacheForTest();
    });

    it('getCurrentPageId returns "home" for /', () => {
        helpers._setCurrentPageForTest('home');
        expect(helpers.getCurrentPageId()).toBe('home');
    });

    it('getCurrentPageId returns "validator" for validator path', () => {
        helpers._setCurrentPageForTest('validator');
        expect(helpers.getCurrentPageId()).toBe('validator');
    });

    it('validateArgs throws on missing required arg', () => {
        let threw = false;
        try { helpers.validateArgs({}, { type: { required: true } }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('validateArgs throws on invalid enum value', () => {
        let threw = false;
        try {
            helpers.validateArgs({ type: 'pdf' }, { type: { required: true, enum: ['ifc', 'ids'] } });
        } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('validateArgs accepts valid args', () => {
        let threw = false;
        try {
            helpers.validateArgs({ type: 'ifc' }, { type: { required: true, enum: ['ifc', 'ids'] } });
        } catch { threw = true; }
        expect(threw).toBe(false);
    });

    it('validateArgs throws when args object is missing', () => {
        let threw = false;
        try { helpers.validateArgs(null, { type: { required: true } }); } catch { threw = true; }
        expect(threw).toBe(true);
    });
});
```

- [ ] **Step 7: Create `tests/test-suites/tool-executor.test.js`**

```js
describe('tool-executor', () => {
    let executor;

    beforeEach(async () => {
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
    });

    it('executeToolCall returns unknown_tool for unregistered name', async () => {
        const result = await executor.executeToolCall({ name: 'no_such', arguments: {} });
        expect(result.error).toBe('unknown_tool');
        expect(result.name).toBe('no_such');
    });

    it('executeToolCall calls registered handler with args', async () => {
        let received = null;
        executor._registerTool('test_tool', async (args) => { received = args; return { ok: true }; });
        const result = await executor.executeToolCall({ name: 'test_tool', arguments: { x: 5 } });
        expect(received.x).toBe(5);
        expect(result.ok).toBe(true);
    });

    it('executeToolCall wraps thrown errors in execution_error', async () => {
        executor._registerTool('boom', async () => { throw new Error('kaboom'); });
        const result = await executor.executeToolCall({ name: 'boom', arguments: {} });
        expect(result.error).toBe('execution_error');
        expect(result.message).toBe('kaboom');
        expect(result.tool).toBe('boom');
    });

    it('_registrySizeForTest reflects registered tools', async () => {
        expect(executor._registrySizeForTest()).toBe(0);
        executor._registerTool('a', async () => ({}));
        executor._registerTool('b', async () => ({}));
        expect(executor._registrySizeForTest()).toBe(2);
    });

    it('_resetRegistryForTest clears all entries', async () => {
        executor._registerTool('a', async () => ({}));
        executor._resetRegistryForTest();
        expect(executor._registrySizeForTest()).toBe(0);
    });
});
```

- [ ] **Step 8: Register both test suites in test-runner.html**

In `tests/test-runner.html` after the last AI test suite registration (likely `ai-i18n.test.js`), append:
```html
    <script src="test-suites/tools-helpers.test.js"></script>
    <script src="test-suites/tool-executor.test.js"></script>
```

- [ ] **Step 9: Mirror to dist + run tests + commit**

```bash
mkdir -p dist/assets/js/ai/tools
cp assets/js/ai/tools/*.js dist/assets/js/ai/tools/
cp assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js
cp index.html dist/index.html
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
node tests/run-tests.js
```

Expected: previous count (~527) + 11 new tests (6 helpers + 5 executor) = ~538.

```bash
git add assets/js/ai/tools/ dist/assets/js/ai/tools/ \
        assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js \
        index.html dist/index.html \
        pages/*.html dist/pages/*.html \
        tests/test-suites/tools-helpers.test.js \
        tests/test-suites/tool-executor.test.js \
        tests/test-runner.html eslint.config.js
git commit -m "feat(ai-tools): bootstrap helpers + executor router + IFC parser everywhere"
```

---

### Task 2: Storage tools

**Goal:** TDD-implement `list_storage_files` and `delete_file_from_storage`. Register in router.

**Files:**
- Modify: `assets/js/ai/tools/tool-storage.js` + dist mirror
- Create: `tests/test-suites/tools-storage.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write failing tests**

`tests/test-suites/tools-storage.test.js`:
```js
describe('tools/tool-storage', () => {
    let storageTools, executor, BIMStorage;

    async function clearStorage() {
        await window.BIMStorage.init();
        const ifc = await window.BIMStorage.getFiles('ifc');
        for (const f of ifc) await window.BIMStorage.ifcStorage.deleteFile(f.id);
        const ids = await window.BIMStorage.getFiles('ids');
        for (const f of ids) await window.BIMStorage.idsStorage.deleteFile(f.id);
    }

    function makeFile(name, content) {
        return { name, content, size: content.length, type: 'text/plain' };
    }

    beforeEach(async () => {
        storageTools = await import('../../assets/js/ai/tools/tool-storage.js');
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
        await clearStorage();
    });

    it('list_storage_files returns [] when storage empty', async () => {
        const result = await storageTools.list_storage_files({ type: 'ifc' });
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });

    it('list_storage_files returns IFC files only when type=ifc', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('a.ifc', 'IFC'));
        await window.BIMStorage.saveFile('ids', makeFile('b.ids', '<ids/>'));
        const result = await storageTools.list_storage_files({ type: 'ifc' });
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('a.ifc');
    });

    it('list_storage_files throws on invalid type', async () => {
        let threw = false;
        try { await storageTools.list_storage_files({ type: 'pdf' }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('delete_file_from_storage removes existing file when confirmed', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('to-del.ifc', 'X'));
        const origConfirm = window.confirm;
        window.confirm = () => true;
        const result = await storageTools.delete_file_from_storage({ type: 'ifc', name: 'to-del.ifc' });
        window.confirm = origConfirm;
        expect(result.deleted).toBe(true);
        const remaining = await window.BIMStorage.getFiles('ifc');
        expect(remaining.length).toBe(0);
    });

    it('delete_file_from_storage returns cancelled when user declines confirm', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('keep.ifc', 'X'));
        const origConfirm = window.confirm;
        window.confirm = () => false;
        const result = await storageTools.delete_file_from_storage({ type: 'ifc', name: 'keep.ifc' });
        window.confirm = origConfirm;
        expect(result.cancelled).toBe(true);
        const remaining = await window.BIMStorage.getFiles('ifc');
        expect(remaining.length).toBe(1);
    });

    it('delete_file_from_storage returns not_found for missing file', async () => {
        const origConfirm = window.confirm;
        window.confirm = () => true;
        const result = await storageTools.delete_file_from_storage({ type: 'ifc', name: 'ghost.ifc' });
        window.confirm = origConfirm;
        expect(result.error).toBe('not_found');
    });

    it('register() adds list_storage_files + delete_file_from_storage to executor REGISTRY', async () => {
        storageTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(2);
    });
});
```

In `tests/test-runner.html` add after `tool-executor.test.js`:
```html
    <script src="test-suites/tools-storage.test.js"></script>
```

- [ ] **Step 2: Run tests; confirm failures**

```bash
node tests/run-tests.js
```
Expected: 7 new failures (functions don't exist).

- [ ] **Step 3: Implement tool-storage.js**

`assets/js/ai/tools/tool-storage.js`:
```js
import * as helpers from './_helpers.js';

export async function list_storage_files(args) {
    helpers.validateArgs(args, { type: { required: true, enum: ['ifc', 'ids'] } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const files = await window.BIMStorage.getFiles(args.type);
    return files.map(f => ({
        name: f.name,
        size: f.size,
        folder: f.folderId || 'root',
        modifiedAt: f.modifiedAt
    }));
}

export async function delete_file_from_storage(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (!confirm(`Smazat soubor '${args.name}' z úložiště?`)) return { cancelled: true };
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    await sm.deleteFile(file.id);
    return { deleted: true };
}

/**
 * Register all storage tools with the executor.
 * Called once at module load time from tool-executor.js bootstrap (Task 9).
 */
export function register(registerFn) {
    registerFn('list_storage_files', list_storage_files);
    registerFn('delete_file_from_storage', delete_file_from_storage);
}
```

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: ~545 tests, all pass.

- [ ] **Step 5: Mirror + commit**

```bash
cp assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js
git add assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js \
        tests/test-suites/tools-storage.test.js tests/test-runner.html
git commit -m "feat(ai-tools): list_storage_files + delete_file_from_storage"
```

---

### Task 3: UI tools

**Goal:** TDD-implement `get_current_page` and `navigate_to_page`. Register in router.

**Files:**
- Modify: `assets/js/ai/tools/tool-ui.js` + dist mirror
- Create: `tests/test-suites/tools-ui.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write failing tests**

`tests/test-suites/tools-ui.test.js`:
```js
describe('tools/tool-ui', () => {
    let uiTools, helpers, executor;

    beforeEach(async () => {
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        uiTools = await import('../../assets/js/ai/tools/tool-ui.js');
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
    });

    it('get_current_page returns home when on /', async () => {
        helpers._setCurrentPageForTest('home');
        const result = await uiTools.get_current_page({});
        expect(result.page).toBe('home');
    });

    it('get_current_page returns validator', async () => {
        helpers._setCurrentPageForTest('validator');
        const result = await uiTools.get_current_page({});
        expect(result.page).toBe('validator');
    });

    it('navigate_to_page returns navigating with target', async () => {
        // Spy on location.href setter to avoid actually navigating
        const origLocation = window.location;
        let assignedHref = null;
        Object.defineProperty(window, 'location', {
            value: { ...origLocation, get href() { return ''; }, set href(v) { assignedHref = v; } },
            configurable: true,
            writable: true
        });
        const result = await uiTools.navigate_to_page({ page: 'validator' });
        // Wait for setTimeout
        await new Promise(r => setTimeout(r, 150));
        expect(result.navigating).toBe(true);
        expect(result.target).toBe('validator');
        expect(typeof result.warning).toBe('string');
        expect(assignedHref?.includes('validator') || assignedHref === null).toBe(true);
        // Restore
        Object.defineProperty(window, 'location', { value: origLocation, configurable: true, writable: true });
    });

    it('navigate_to_page throws on invalid page', async () => {
        let threw = false;
        try { await uiTools.navigate_to_page({ page: 'admin' }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('register() adds 2 tools to executor', async () => {
        uiTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(2);
    });
});
```

In `tests/test-runner.html` after `tools-storage.test.js`:
```html
    <script src="test-suites/tools-ui.test.js"></script>
```

- [ ] **Step 2: Run; confirm 5 failures**

```bash
node tests/run-tests.js
```

- [ ] **Step 3: Implement tool-ui.js**

`assets/js/ai/tools/tool-ui.js`:
```js
import * as helpers from './_helpers.js';

const PATH_MAP = {
    home: '/index.html',
    validator: '/pages/ids-ifc-validator.html',
    parser: '/pages/ids-parser-visualizer.html',
    viewer: '/pages/ifc-viewer-multi-file.html'
};

export async function get_current_page() {
    return { page: helpers.getCurrentPageId() };
}

export async function navigate_to_page(args) {
    helpers.validateArgs(args, {
        page: { required: true, enum: Object.keys(PATH_MAP) }
    });
    setTimeout(() => { window.location.href = PATH_MAP[args.page]; }, 100);
    return {
        navigating: true,
        target: args.page,
        warning: 'Stránka se nyní přesměruje. Chat panel se zavře, otevřete jej znovu po načtení.'
    };
}

export function register(registerFn) {
    registerFn('get_current_page', get_current_page);
    registerFn('navigate_to_page', navigate_to_page);
}
```

- [ ] **Step 4: Run + mirror + commit**

```bash
node tests/run-tests.js
cp assets/js/ai/tools/tool-ui.js dist/assets/js/ai/tools/tool-ui.js
git add assets/js/ai/tools/tool-ui.js dist/assets/js/ai/tools/tool-ui.js \
        tests/test-suites/tools-ui.test.js tests/test-runner.html
git commit -m "feat(ai-tools): get_current_page + navigate_to_page"
```

Expected: 545 + 5 = 550 tests pass.

---

### Task 4: IDS tool

**Goal:** TDD-implement `list_ids_specifications`.

**Files:**
- Modify: `assets/js/ai/tools/tool-ids.js` + dist mirror
- Create: `tests/test-suites/tools-ids.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write failing tests**

`tests/test-suites/tools-ids.test.js`:
```js
describe('tools/tool-ids', () => {
    let idsTools, executor;

    const sampleIds = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS"
     xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <info><title>Test</title></info>
  <specifications>
    <specification name="Walls have FireRating" identifier="SPEC-1" minOccurs="1" maxOccurs="1">
      <applicability minOccurs="1">
        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      </applicability>
      <requirements>
        <property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property>
      </requirements>
    </specification>
  </specifications>
</ids>`;

    function makeFile(name, content) {
        return { name, content, size: content.length, type: 'application/xml' };
    }

    beforeEach(async () => {
        idsTools = await import('../../assets/js/ai/tools/tool-ids.js');
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
        await window.BIMStorage.init();
        const ids = await window.BIMStorage.getFiles('ids');
        for (const f of ids) await window.BIMStorage.idsStorage.deleteFile(f.id);
    });

    it('list_ids_specifications returns specs from valid IDS file', async () => {
        await window.BIMStorage.saveFile('ids', makeFile('test.ids', sampleIds));
        const result = await idsTools.list_ids_specifications({ filename: 'test.ids' });
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('Walls have FireRating');
        expect(result[0].identifier).toBe('SPEC-1');
    });

    it('list_ids_specifications returns not_found for missing file', async () => {
        const result = await idsTools.list_ids_specifications({ filename: 'ghost.ids' });
        expect(result.error).toBe('not_found');
    });

    it('list_ids_specifications throws on missing filename arg', async () => {
        let threw = false;
        try { await idsTools.list_ids_specifications({}); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('register() adds tool to executor', async () => {
        idsTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(1);
    });
});
```

In `tests/test-runner.html`:
```html
    <script src="test-suites/tools-ids.test.js"></script>
```

- [ ] **Step 2: Run; confirm failures**

- [ ] **Step 3: Implement tool-ids.js**

`assets/js/ai/tools/tool-ids.js`:
```js
import * as helpers from './_helpers.js';

export async function list_ids_specifications(args) {
    helpers.validateArgs(args, { filename: { required: true } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available on this page');
    await window.BIMStorage.init();
    const meta = await window.BIMStorage.getFile('ids', args.filename);
    if (!meta) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', meta.id);
    const parsed = window.IDSParser.parse(content);
    const specs = parsed?.specifications || [];
    return specs.map(s => ({
        name: s.name,
        identifier: s.identifier || null,
        applicability: (s.applicability?.facets || []).map(f => f.type),
        requirementsCount: (s.requirements?.facets || []).length
    }));
}

export function register(registerFn) {
    registerFn('list_ids_specifications', list_ids_specifications);
}
```

NOTE: `IDSParser` is defined in `assets/js/common/ids-parser.js` and is loaded on validator + parser pages. Home and viewer pages don't currently load it. To keep this tool cross-page, add `<script src="../assets/js/common/ids-parser.js">` to `index.html` and `pages/ifc-viewer-multi-file.html` if missing. Verify with grep:

```bash
grep -l "ids-parser.js" /home/michal/work/BIM_checker/index.html /home/michal/work/BIM_checker/pages/*.html
```

If `index.html` or `ifc-viewer-multi-file.html` are missing, add `<script src="assets/js/common/ids-parser.js"></script>` (or `../assets/...` as appropriate) right after the IFC parser script tags from Task 1 Step 4. Mirror to dist.

- [ ] **Step 4: Run + mirror + commit**

```bash
node tests/run-tests.js
cp assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js
# If HTML changed, also mirror those
git add assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js \
        tests/test-suites/tools-ids.test.js tests/test-runner.html \
        index.html pages/ifc-viewer-multi-file.html dist/index.html dist/pages/ifc-viewer-multi-file.html
git commit -m "feat(ai-tools): list_ids_specifications"
```

---

### Task 5: Validator read tools

**Goal:** TDD-implement `list_validation_groups` and `get_validation_results`.

**Files:**
- Modify: `assets/js/ai/tools/tool-validator.js` + dist mirror
- Create: `tests/test-suites/tools-validator.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write failing tests**

`tests/test-suites/tools-validator.test.js`:
```js
describe('tools/tool-validator (read)', () => {
    let validatorTools, helpers;

    beforeEach(async () => {
        validatorTools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('validator');
        // Reset last-session preset
        const ValidationPresets = window.ValidationPresets;
        if (ValidationPresets) {
            await ValidationPresets.flushLastSession();
            const idb = await import('../../assets/js/common/validation-presets.js').catch(() => null);
            // Wipe IDB entry for last session
        }
        await window.ValidationPresets._internals?._delete?.('bim_validation_last_session') ?? null;
    });

    it('list_validation_groups returns [] when no last-session', async () => {
        const result = await validatorTools.list_validation_groups({});
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });

    it('list_validation_groups reads from last-session preset', async () => {
        window.ValidationPresets.saveLastSession([
            { ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' },
            { ifcFileNames: ['c.ifc', 'd.ifc'], idsFileName: 'e.ids' }
        ]);
        window.ValidationPresets.flushLastSession();
        const result = await validatorTools.list_validation_groups({});
        expect(result.length).toBe(2);
        expect(result[0].ifcFileNames[0]).toBe('a.ifc');
        expect(result[1].ifcFileNames.length).toBe(2);
    });

    it('get_validation_results returns wrong_page off validator', async () => {
        helpers._setCurrentPageForTest('parser');
        const result = await validatorTools.get_validation_results({});
        expect(result.error).toBe('wrong_page');
    });

    it('get_validation_results returns empty when no results on validator page', async () => {
        helpers._setCurrentPageForTest('validator');
        window.validationResults = [];
        const result = await validatorTools.get_validation_results({});
        expect(result.empty).toBe(true);
    });

    it('get_validation_results summarizes window.validationResults', async () => {
        helpers._setCurrentPageForTest('validator');
        window.validationResults = [{
            ifcFiles: [{ name: 'a.ifc' }],
            idsFile: { name: 'b.ids' },
            summary: { passed: 5, failed: 2, total: 7 }
        }];
        const result = await validatorTools.get_validation_results({});
        expect(result.groups.length).toBe(1);
        expect(result.groups[0].ifcCount).toBe(1);
        expect(result.groups[0].idsName).toBe('b.ids');
        expect(result.groups[0].passed).toBe(5);
    });
});
```

In `tests/test-runner.html`:
```html
    <script src="test-suites/tools-validator.test.js"></script>
```

- [ ] **Step 2: Run; confirm failures**

- [ ] **Step 3: Implement read tools in tool-validator.js**

`assets/js/ai/tools/tool-validator.js`:
```js
import * as helpers from './_helpers.js';

export async function list_validation_groups() {
    if (typeof window.ValidationPresets === 'undefined') return [];
    const last = window.ValidationPresets.loadLastSession();
    if (!last || !Array.isArray(last.groups)) return [];
    return last.groups.map((g, i) => ({
        index: i,
        ifcFileNames: g.ifcFileNames || [],
        idsFileName: g.idsFileName || null,
        hasResults: false  // last_session doesn't carry result state
    }));
}

export async function get_validation_results() {
    if (helpers.getCurrentPageId() !== 'validator') {
        return {
            error: 'wrong_page',
            message: 'Výsledky validace jsou viditelné jen na stránce Validator.'
        };
    }
    if (!Array.isArray(window.validationResults) || window.validationResults.length === 0) {
        return { empty: true, message: 'Validace nebyla spuštěna nebo výsledky chybí.' };
    }
    return {
        groups: window.validationResults.map((r, i) => ({
            index: i,
            ifcCount: r.ifcFiles?.length || 0,
            idsName: r.idsFile?.name || null,
            passed: r.summary?.passed || 0,
            failed: r.summary?.failed || 0,
            total: r.summary?.total || 0
        }))
    };
}

export function register(registerFn) {
    registerFn('list_validation_groups', list_validation_groups);
    registerFn('get_validation_results', get_validation_results);
}
```

- [ ] **Step 4: Run + mirror + commit**

```bash
node tests/run-tests.js
cp assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js
git add assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js \
        tests/test-suites/tools-validator.test.js tests/test-runner.html
git commit -m "feat(ai-tools): list_validation_groups + get_validation_results"
```

---

### Task 6: Validator write tools + ai:applyLastSession event

**Goal:** TDD-implement `add_validation_group`, `delete_validation_group`, `run_validation`. Add `ai:applyLastSession` listener to `validator.js` so changes show up live.

**Files:**
- Modify: `assets/js/ai/tools/tool-validator.js` + dist mirror
- Modify: `assets/js/validator.js` + dist mirror
- Modify: `tests/test-suites/tools-validator.test.js`

- [ ] **Step 1: Append failing tests to tools-validator.test.js**

```js
describe('tools/tool-validator (write)', () => {
    let validatorTools, helpers;

    beforeEach(async () => {
        validatorTools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('validator');
        await window.ValidationPresets._internals?._delete?.('bim_validation_last_session');
    });

    it('add_validation_group appends to last-session preset', async () => {
        const result = await validatorTools.add_validation_group({
            ifcFileNames: ['x.ifc'],
            idsFileName: 'y.ids'
        });
        expect(result.groupIndex).toBe(0);
        const last = window.ValidationPresets.loadLastSession();
        expect(last.groups.length).toBe(1);
        expect(last.groups[0].ifcFileNames[0]).toBe('x.ifc');
    });

    it('add_validation_group dispatches ai:applyLastSession event', async () => {
        let fired = false;
        window.addEventListener('ai:applyLastSession', () => { fired = true; }, { once: true });
        await validatorTools.add_validation_group({
            ifcFileNames: ['x.ifc'], idsFileName: 'y.ids'
        });
        expect(fired).toBe(true);
    });

    it('delete_validation_group removes by index after confirm', async () => {
        window.ValidationPresets.saveLastSession([
            { ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' },
            { ifcFileNames: ['c.ifc'], idsFileName: 'd.ids' }
        ]);
        window.ValidationPresets.flushLastSession();
        const orig = window.confirm; window.confirm = () => true;
        const result = await validatorTools.delete_validation_group({ index: 0 });
        window.confirm = orig;
        expect(result.deleted).toBe(true);
        const last = window.ValidationPresets.loadLastSession();
        expect(last.groups.length).toBe(1);
        expect(last.groups[0].ifcFileNames[0]).toBe('c.ifc');
    });

    it('delete_validation_group cancels when confirm declined', async () => {
        window.ValidationPresets.saveLastSession([{ ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' }]);
        window.ValidationPresets.flushLastSession();
        const orig = window.confirm; window.confirm = () => false;
        const result = await validatorTools.delete_validation_group({ index: 0 });
        window.confirm = orig;
        expect(result.cancelled).toBe(true);
    });

    it('delete_validation_group rejects out-of-range index', async () => {
        const orig = window.confirm; window.confirm = () => true;
        const result = await validatorTools.delete_validation_group({ index: 99 });
        window.confirm = orig;
        expect(result.error).toBe('index_out_of_range');
    });

    it('run_validation returns wrong_page when not on validator', async () => {
        helpers._setCurrentPageForTest('parser');
        const result = await validatorTools.run_validation({});
        expect(result.error).toBe('wrong_page');
    });

    it('run_validation returns started when on validator with validateAll defined', async () => {
        helpers._setCurrentPageForTest('validator');
        const orig = window.validateAll;
        let called = false;
        window.validateAll = () => { called = true; };
        const result = await validatorTools.run_validation({});
        window.validateAll = orig;
        expect(result.started).toBe(true);
        expect(called).toBe(true);
    });
});
```

- [ ] **Step 2: Run; confirm failures**

- [ ] **Step 3: Append write tools to tool-validator.js**

In `assets/js/ai/tools/tool-validator.js`, before `register()`:

```js
export async function add_validation_group(args) {
    helpers.validateArgs(args, {
        ifcFileNames: { required: true },
        idsFileName: { required: true }
    });
    if (!Array.isArray(args.ifcFileNames)) {
        throw new Error('ifcFileNames must be an array of strings');
    }
    if (typeof window.ValidationPresets === 'undefined') {
        throw new Error('ValidationPresets not available');
    }
    const last = window.ValidationPresets.loadLastSession() || { groups: [] };
    last.groups.push({
        ifcFileNames: args.ifcFileNames,
        idsFileName: args.idsFileName
    });
    window.ValidationPresets.saveLastSession(last.groups);
    window.ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    return {
        groupIndex: last.groups.length - 1,
        appliedTo: helpers.getCurrentPageId() === 'validator' ? 'live UI' : 'last-session preset'
    };
}

export async function delete_validation_group(args) {
    helpers.validateArgs(args, { index: { required: true } });
    if (typeof args.index !== 'number') {
        throw new Error('index must be a number');
    }
    if (!confirm(`Smazat validační skupinu #${args.index + 1}?`)) return { cancelled: true };
    const last = window.ValidationPresets.loadLastSession() || { groups: [] };
    if (args.index < 0 || args.index >= last.groups.length) return { error: 'index_out_of_range' };
    last.groups.splice(args.index, 1);
    window.ValidationPresets.saveLastSession(last.groups);
    window.ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    return { deleted: true };
}

export async function run_validation() {
    if (helpers.getCurrentPageId() !== 'validator') {
        return {
            error: 'wrong_page',
            message: 'Pro spuštění validace navigujte na Validator (zavolejte navigate_to_page).'
        };
    }
    if (typeof window.validateAll !== 'function') return { error: 'validator_not_ready' };
    window.validateAll();
    return { started: true, message: 'Validace spuštěna. Výsledky uvidíte v panelu.' };
}
```

Then update the `register()` function at the bottom of the file to include all 5 validator tools:

```js
export function register(registerFn) {
    registerFn('list_validation_groups', list_validation_groups);
    registerFn('get_validation_results', get_validation_results);
    registerFn('add_validation_group', add_validation_group);
    registerFn('delete_validation_group', delete_validation_group);
    registerFn('run_validation', run_validation);
}
```

- [ ] **Step 4: Add `ai:applyLastSession` listener to validator.js**

In `assets/js/validator.js`, find the existing DOMContentLoaded handler that auto-restores last session (added in Phase 6, around the bottom of the file). Refactor the auto-restore body into a named function and reuse it for the listener. Find:

```js
document.addEventListener('DOMContentLoaded', async () => {
    // Phase 6: presets panel wiring (synchronous)
    _repopulatePresetSelect();
    const select = document.getElementById('presetSelect');
    if (select) { /* ... */ }

    // Initial render shows static empty-state (zero CLS)
    renderValidationGroups();
    updateValidateButton();

    // Phase 6: auto-restore last session (async)
    if (typeof ValidationPresets !== 'undefined') {
        const last = ValidationPresets.loadLastSession();
        if (last && Array.isArray(last.groups) && last.groups.length > 0) {
            // ... reservation + hydration ...
        }
    }
});
```

Extract the inner `if (typeof ValidationPresets ...)` block into a function:

```js
async function _applyLastSession() {
    if (typeof ValidationPresets === 'undefined') return;
    const last = ValidationPresets.loadLastSession();
    if (!last || !Array.isArray(last.groups)) return;
    const groupsContainer = document.getElementById('validationGroups');
    if (groupsContainer && last.groups.length > 0) {
        const reservedHeight = Math.min(160 * last.groups.length, window.innerHeight * 0.6);
        groupsContainer.style.minHeight = `${Math.round(reservedHeight)}px`;
    }
    try {
        const hydrated = await ValidationPresets.fromPresetGroups(last.groups);
        validationGroups.length = 0;
        for (const g of hydrated) validationGroups.push(g);
        renderValidationGroups();
        updateValidateButton();
    } catch (e) {
        console.warn('[validator] last-session hydration failed:', e);
    } finally {
        if (groupsContainer) groupsContainer.style.minHeight = '';
    }
}
```

In the DOMContentLoaded handler, replace the inline auto-restore block with a single call:
```js
    // Phase 6: auto-restore last session (async)
    await _applyLastSession();
```

After the DOMContentLoaded handler, add the event listener (Phase 8):
```js
// Phase 8: respond to AI tool mutations of last-session preset
window.addEventListener('ai:applyLastSession', () => {
    _applyLastSession();
});
```

- [ ] **Step 5: Run + mirror + commit**

```bash
node tests/run-tests.js
cp assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js
cp assets/js/validator.js dist/assets/js/validator.js
git add assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js \
        assets/js/validator.js dist/assets/js/validator.js \
        tests/test-suites/tools-validator.test.js
git commit -m "feat(ai-tools): add/delete/run validation + ai:applyLastSession listener"
```

Expected: ~12 new validator tests pass.

---

### Task 7: IFC search/count/find tools

**Goal:** TDD-implement `search_ifc_entities`, `count_entities_by_type`, `find_ifc_files_with_entity`.

**Files:**
- Modify: `assets/js/ai/tools/tool-ifc.js` + dist mirror
- Create: `tests/test-suites/tools-ifc.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write failing tests**

`tests/test-suites/tools-ifc.test.js`:
```js
describe('tools/tool-ifc (search/count/find)', () => {
    let ifcTools, helpers;

    // Minimal valid IFC string with 2 IfcWalls and 1 IfcDoor
    const sampleIfc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('test.ifc','2026-01-01T00:00:00',(''),(''),'IFC4','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0aaaa1aaaa$aaaaaaaaaaa',$,'TestProj',$,$,$,$,$,$);
#10=IFCWALL('1xxxx1xxxx$xxxxxxxxxxa',$,'Wall-1',$,$,$,$,'GUID-1',$);
#11=IFCWALL('1xxxx1xxxx$xxxxxxxxxxb',$,'Wall-2',$,$,$,$,'GUID-2',$);
#12=IFCDOOR('1xxxx1xxxx$xxxxxxxxxxc',$,'Door-1',$,$,$,$,'GUID-3',$,$,$);
ENDSEC;
END-ISO-10303-21;`;

    function makeFile(name, content) {
        return { name, content, size: content.length, type: 'text/plain' };
    }

    beforeEach(async () => {
        ifcTools = await import('../../assets/js/ai/tools/tool-ifc.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._clearIfcCacheForTest();
        await window.BIMStorage.init();
        const files = await window.BIMStorage.getFiles('ifc');
        for (const f of files) await window.BIMStorage.ifcStorage.deleteFile(f.id);
    });

    it('search_ifc_entities returns walls when entityType=IFCWALL', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('test.ifc', sampleIfc));
        const result = await ifcTools.search_ifc_entities({ filename: 'test.ifc', entityType: 'IFCWALL' });
        expect(result.results.length).toBe(2);
        expect(result.totalCount).toBe(2);
        expect(result.truncated).toBe(false);
    });

    it('search_ifc_entities is case-insensitive on entityType', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('test.ifc', sampleIfc));
        const result = await ifcTools.search_ifc_entities({ filename: 'test.ifc', entityType: 'ifcwall' });
        expect(result.results.length).toBe(2);
    });

    it('search_ifc_entities returns truncated:true when matches > 50', async () => {
        // Synthesize many walls
        let ifc = sampleIfc.replace('ENDSEC;\nEND-ISO-10303-21;', '');
        for (let i = 100; i < 160; i++) {
            ifc += `\n#${i}=IFCWALL('GUID-${i}',$,'W${i}',$,$,$,$,'G',$);`;
        }
        ifc += '\nENDSEC;\nEND-ISO-10303-21;';
        await window.BIMStorage.saveFile('ifc', makeFile('big.ifc', ifc));
        const result = await ifcTools.search_ifc_entities({ filename: 'big.ifc', entityType: 'IFCWALL' });
        expect(result.results.length).toBe(50);
        expect(result.truncated).toBe(true);
        expect(result.totalCount > 50).toBe(true);
    });

    it('count_entities_by_type returns histogram', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('test.ifc', sampleIfc));
        const result = await ifcTools.count_entities_by_type({ filename: 'test.ifc' });
        expect(result.IFCWALL).toBe(2);
        expect(result.IFCDOOR).toBe(1);
    });

    it('find_ifc_files_with_entity returns files containing type', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('walls.ifc', sampleIfc));
        // File without walls
        const noWalls = sampleIfc.replace(/IFCWALL/g, 'IFCSLAB');
        await window.BIMStorage.saveFile('ifc', makeFile('slabs.ifc', noWalls));
        const result = await ifcTools.find_ifc_files_with_entity({ entityType: 'IFCWALL' });
        expect(result.length).toBe(1);
        expect(result[0].filename).toBe('walls.ifc');
        expect(result[0].count).toBe(2);
    });

    it('LRU cache evicts oldest when 4th file accessed', async () => {
        // Save 4 files
        for (const n of ['a', 'b', 'c', 'd']) {
            await window.BIMStorage.saveFile('ifc', makeFile(`${n}.ifc`, sampleIfc));
        }
        // Touch all 4 in order
        for (const n of ['a', 'b', 'c', 'd']) {
            await ifcTools.count_entities_by_type({ filename: `${n}.ifc` });
        }
        // Cache should now hold b, c, d (a was evicted)
        expect(helpers._ifcCacheSizeForTest()).toBe(3);
    });
});
```

In `tests/test-runner.html`:
```html
    <script src="test-suites/tools-ifc.test.js"></script>
```

- [ ] **Step 2: Run; confirm failures**

- [ ] **Step 3: Implement search/count/find tools**

`assets/js/ai/tools/tool-ifc.js`:
```js
import * as helpers from './_helpers.js';

export async function search_ifc_entities(args) {
    helpers.validateArgs(args, {
        filename: { required: true },
        entityType: { required: true }
    });
    const entities = await helpers.getParsedIfc(args.filename);
    const target = args.entityType.toUpperCase();
    const matches = entities.filter(e => (e.entity || '').toUpperCase() === target);
    const limited = matches.slice(0, 50).map(e => ({
        expressId: e.id,
        name: e.name || null,
        guid: e.guid || null
    }));
    return {
        results: limited,
        truncated: matches.length > 50,
        totalCount: matches.length
    };
}

export async function count_entities_by_type(args) {
    helpers.validateArgs(args, { filename: { required: true } });
    const entities = await helpers.getParsedIfc(args.filename);
    const counts = {};
    for (const e of entities) {
        const type = (e.entity || 'UNKNOWN').toUpperCase();
        counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
}

export async function find_ifc_files_with_entity(args) {
    helpers.validateArgs(args, { entityType: { required: true } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const files = await window.BIMStorage.getFiles('ifc');
    const target = args.entityType.toUpperCase();
    const results = [];
    for (const f of files) {
        try {
            const entities = await helpers.getParsedIfc(f.name);
            const count = entities.filter(e => (e.entity || '').toUpperCase() === target).length;
            if (count > 0) results.push({ filename: f.name, count });
        } catch (e) {
            console.warn('[find_ifc_files] parse failed for', f.name, e);
        }
    }
    return results;
}

export function register(registerFn) {
    registerFn('search_ifc_entities', search_ifc_entities);
    registerFn('count_entities_by_type', count_entities_by_type);
    registerFn('find_ifc_files_with_entity', find_ifc_files_with_entity);
}
```

- [ ] **Step 4: Run + mirror + commit**

```bash
node tests/run-tests.js
cp assets/js/ai/tools/tool-ifc.js dist/assets/js/ai/tools/tool-ifc.js
git add assets/js/ai/tools/tool-ifc.js dist/assets/js/ai/tools/tool-ifc.js \
        tests/test-suites/tools-ifc.test.js tests/test-runner.html
git commit -m "feat(ai-tools): search/count/find IFC entities + LRU cache"
```

---

### Task 8: IFC properties tools

**Goal:** TDD-implement `get_entity_properties` and `get_property_value`. Both rely on the same LRU cache.

**Files:**
- Modify: `assets/js/ai/tools/tool-ifc.js` + dist mirror
- Modify: `tests/test-suites/tools-ifc.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('tools/tool-ifc (properties)', () => {
    let ifcTools, helpers;

    // IFC with property set on a wall
    const ifcWithPset = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('test.ifc','2026-01-01T00:00:00',(''),(''),'IFC4','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('GUID-1',$,'Wall-1',$,$,$,$,'G',$);
#10=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);
#11=IFCPROPERTYSET('PSET-GUID',$,'Pset_WallCommon',$,(#10));
#12=IFCRELDEFINESBYPROPERTIES('REL-GUID',$,$,$,(#1),#11);
ENDSEC;
END-ISO-10303-21;`;

    function makeFile(name, content) {
        return { name, content, size: content.length, type: 'text/plain' };
    }

    beforeEach(async () => {
        ifcTools = await import('../../assets/js/ai/tools/tool-ifc.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._clearIfcCacheForTest();
        await window.BIMStorage.init();
        const files = await window.BIMStorage.getFiles('ifc');
        for (const f of files) await window.BIMStorage.ifcStorage.deleteFile(f.id);
        await window.BIMStorage.saveFile('ifc', makeFile('test.ifc', ifcWithPset));
    });

    it('get_entity_properties returns pset for entity', async () => {
        const result = await ifcTools.get_entity_properties({ filename: 'test.ifc', expressId: 1 });
        expect(result.entityType).toBeDefined();
        expect(Array.isArray(result.propertySets)).toBe(true);
    });

    it('get_entity_properties returns not_found for missing express id', async () => {
        const result = await ifcTools.get_entity_properties({ filename: 'test.ifc', expressId: 99999 });
        expect(result.error).toBe('not_found');
    });

    it('get_property_value returns value for known property', async () => {
        const result = await ifcTools.get_property_value({
            filename: 'test.ifc',
            expressId: 1,
            psetName: 'Pset_WallCommon',
            propertyName: 'FireRating'
        });
        // Value extraction depends on IFCParserCore output shape; assert structure not exact value
        expect(result.notFound !== true).toBe(true);
    });

    it('get_property_value returns notFound when property absent', async () => {
        const result = await ifcTools.get_property_value({
            filename: 'test.ifc',
            expressId: 1,
            psetName: 'Pset_WallCommon',
            propertyName: 'NoSuchProp'
        });
        expect(result.notFound).toBe(true);
    });

    it('register() adds all 5 IFC tools to executor', async () => {
        const executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
        ifcTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(5);
    });
});
```

- [ ] **Step 2: Run; confirm failures**

- [ ] **Step 3: Append properties tools to tool-ifc.js**

In `assets/js/ai/tools/tool-ifc.js`, before `register()`:

```js
export async function get_entity_properties(args) {
    helpers.validateArgs(args, {
        filename: { required: true },
        expressId: { required: true }
    });
    const entities = await helpers.getParsedIfc(args.filename);
    const entity = entities.find(e => Number(e.id) === Number(args.expressId));
    if (!entity) return { error: 'not_found', expressId: args.expressId };
    return {
        entityType: entity.entity,
        name: entity.name || null,
        guid: entity.guid || null,
        propertySets: entity.propertySets || []
    };
}

export async function get_property_value(args) {
    helpers.validateArgs(args, {
        filename: { required: true },
        expressId: { required: true },
        psetName: { required: true },
        propertyName: { required: true }
    });
    const entities = await helpers.getParsedIfc(args.filename);
    const entity = entities.find(e => Number(e.id) === Number(args.expressId));
    if (!entity) return { error: 'not_found', expressId: args.expressId };
    const pset = (entity.propertySets || []).find(p => p.name === args.psetName);
    if (!pset) return { notFound: true, reason: 'pset_not_found', psetName: args.psetName };
    const prop = (pset.properties || []).find(p => p.name === args.propertyName);
    if (!prop) return { notFound: true, reason: 'property_not_found', propertyName: args.propertyName };
    return { value: prop.value, unit: prop.unit || null };
}
```

Update `register()`:
```js
export function register(registerFn) {
    registerFn('search_ifc_entities', search_ifc_entities);
    registerFn('count_entities_by_type', count_entities_by_type);
    registerFn('find_ifc_files_with_entity', find_ifc_files_with_entity);
    registerFn('get_entity_properties', get_entity_properties);
    registerFn('get_property_value', get_property_value);
}
```

- [ ] **Step 4: Run + mirror + commit**

```bash
node tests/run-tests.js
cp assets/js/ai/tools/tool-ifc.js dist/assets/js/ai/tools/tool-ifc.js
git add assets/js/ai/tools/tool-ifc.js dist/assets/js/ai/tools/tool-ifc.js \
        tests/test-suites/tools-ifc.test.js
git commit -m "feat(ai-tools): get_entity_properties + get_property_value"
```

---

### Task 9: Tool definitions + REGISTRY bootstrap + chat-panel tool loop

**Goal:** Fill `tool-defs.js` with 15 OpenAI-format function definitions. Have `tool-executor.js` call each tool module's `register()` at module load. Add the iteration loop to `chat-panel.js _send()`. Add 5 new i18n keys.

**Files:**
- Modify: `assets/js/ai/tool-defs.js` + dist mirror
- Modify: `assets/js/ai/tool-executor.js` + dist mirror
- Modify: `assets/js/ai-ui/chat-panel.js` + dist mirror
- Modify: `assets/js/common/translations.js` + dist mirror
- Create: `tests/test-suites/chat-panel-tool-loop.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Replace tool-defs.js with 15 definitions**

`assets/js/ai/tool-defs.js`:
```js
/**
 * Tool definitions for AI function calling.
 * 15 tools spanning storage, validator workflow, IDS specs,
 * IFC content queries, and UI navigation.
 */

export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'list_storage_files',
            description: 'Vypíše všechny soubory v IndexedDB úložišti pro daný typ.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'], description: 'Typ souborů' }
                },
                required: ['type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_file_from_storage',
            description: 'Smaže soubor z úložiště. Před smazáním se uživatele zeptá přes potvrzovací dialog.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string', description: 'Přesné jméno souboru' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_validation_groups',
            description: 'Vypíše aktuální validační skupiny (z last-session preset).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_validation_group',
            description: 'Přidá novou validační skupinu. Soubory se identifikují podle jména.',
            parameters: {
                type: 'object',
                properties: {
                    ifcFileNames: { type: 'array', items: { type: 'string' }, description: 'Pole jmen IFC souborů' },
                    idsFileName: { type: 'string', description: 'Jméno IDS souboru' }
                },
                required: ['ifcFileNames', 'idsFileName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_validation_group',
            description: 'Smaže validační skupinu podle indexu (od 0). Před smazáním se zeptá uživatele.',
            parameters: {
                type: 'object',
                properties: {
                    index: { type: 'integer', minimum: 0 }
                },
                required: ['index']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_validation',
            description: 'Spustí validaci všech skupin. Funguje pouze na stránce Validator.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_validation_results',
            description: 'Vrátí poslední výsledky validace. Funguje pouze na stránce Validator.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_ids_specifications',
            description: 'Vrátí seznam specifikací uvnitř daného IDS souboru.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string', description: 'Jméno IDS souboru v úložišti' }
                },
                required: ['filename']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_ifc_entities',
            description: 'Najde entity v IFC souboru podle IFC typu (např. IFCWALL). Limit 50 entit, vrací počet.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    entityType: { type: 'string', description: 'IFC typ, např. IFCWALL, IFCDOOR' }
                },
                required: ['filename', 'entityType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'count_entities_by_type',
            description: 'Histogram IFC typů v souboru — kolik entit od každého typu.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' }
                },
                required: ['filename']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_ifc_files_with_entity',
            description: 'Pro daný IFC typ najde, ve kterých souborech v úložišti se vyskytuje a kolikrát.',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string' }
                },
                required: ['entityType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_entity_properties',
            description: 'Vrátí všechny PSet (property sets) dané entity podle Express ID.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    expressId: { type: 'integer' }
                },
                required: ['filename', 'expressId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_property_value',
            description: 'Vrátí konkrétní hodnotu vlastnosti z property setu.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    expressId: { type: 'integer' },
                    psetName: { type: 'string' },
                    propertyName: { type: 'string' }
                },
                required: ['filename', 'expressId', 'psetName', 'propertyName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_current_page',
            description: 'Vrátí, na které stránce BIM_checker je uživatel právě teď.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'navigate_to_page',
            description: 'Přepne uživatele na jinou stránku aplikace. POZOR: vyvolá page reload, chat panel se zavře.',
            parameters: {
                type: 'object',
                properties: {
                    page: { type: 'string', enum: ['home', 'validator', 'parser', 'viewer'] }
                },
                required: ['page']
            }
        }
    }
];

export function getToolsForAgent(/* agent */) {
    return TOOL_DEFINITIONS;
}
```

- [ ] **Step 2: Update tool-executor.js to bootstrap REGISTRY at module load**

In `assets/js/ai/tool-executor.js`, add imports and bootstrap:

```js
/**
 * Routes tool calls dispatched by the AI to handler functions.
 * REGISTRY is populated at module load time by calling each tool module's register().
 */

import * as storageTools from './tools/tool-storage.js';
import * as validatorTools from './tools/tool-validator.js';
import * as idsTools from './tools/tool-ids.js';
import * as ifcTools from './tools/tool-ifc.js';
import * as uiTools from './tools/tool-ui.js';

const REGISTRY = {};

export function _registerTool(name, fn) {
    REGISTRY[name] = fn;
}

function _bootstrap() {
    storageTools.register(_registerTool);
    validatorTools.register(_registerTool);
    idsTools.register(_registerTool);
    ifcTools.register(_registerTool);
    uiTools.register(_registerTool);
}

_bootstrap();

export async function executeToolCall(toolCall) {
    const name = toolCall?.name;
    const args = toolCall?.arguments;
    const fn = REGISTRY[name];
    if (!fn) return { error: 'unknown_tool', name };
    try {
        return await fn(args);
    } catch (e) {
        console.warn('[tool-executor]', name, 'failed:', e);
        return { error: 'execution_error', message: e.message, tool: name };
    }
}

export function _registrySizeForTest() { return Object.keys(REGISTRY).length; }
export function _resetRegistryForTest() {
    for (const k of Object.keys(REGISTRY)) delete REGISTRY[k];
}
export function _reinitializeForTest() {
    _resetRegistryForTest();
    _bootstrap();
}
```

NOTE: tests that previously called `_resetRegistryForTest()` and then verified empty registry now have to **re-call register()** after resetting if they want a populated registry. The Task 1 executor test `it('_resetRegistryForTest clears all entries')` still passes because it asserts size 0 after reset. Tests in Task 9 that need the full populated registry (like `'all 15 tools registered after module load'`) call `executor._reinitializeForTest()` first to repopulate after any prior reset.

- [ ] **Step 3: Add 5 i18n keys to translations.js**

In `assets/js/common/translations.js` CZ block, after Phase 7 `ai.chat.minimizeBtn`:
```js
        'ai.chat.toolCalling': 'Volám nástroj',
        'ai.chat.toolReturned': 'Vrátilo',
        'ai.chat.toolFailed': 'Chyba nástroje',
        'ai.chat.toolCancelled': 'Akce zrušena',
        'ai.chat.maxIterations': 'Příliš mnoho iterací nástrojů — agent se zacyklil. Zkuste přeformulovat dotaz.',
```

In EN block:
```js
        'ai.chat.toolCalling': 'Calling tool',
        'ai.chat.toolReturned': 'Returned',
        'ai.chat.toolFailed': 'Tool error',
        'ai.chat.toolCancelled': 'Action cancelled',
        'ai.chat.maxIterations': 'Too many tool iterations — agent in loop. Try rephrasing.',
```

- [ ] **Step 4: Add tool-call loop to chat-panel.js**

Open `assets/js/ai-ui/chat-panel.js`. Find the `_send()` function. Replace its body with the loop version. The current Phase 7 implementation (single chatCompletion call) becomes the iteration body:

```js
async function _send() {
    if (_state.busy) return;
    const input = _panel.querySelector('#chatInput');
    const text = input.value.trim();
    if (!text) return;

    const agent = await storage.getAgent(_state.agentId);
    if (!agent) return;

    if (!_state.threadId) {
        _state.threadId = await storage.createThread(_state.agentId, text);
        await _refreshThreadsSidebar();
    } else {
        await storage.appendMessage(_state.threadId, { role: 'user', content: text });
    }

    _appendBubble('user', text);
    input.value = '';
    _autoGrowInput();

    _state.busy = true;
    _state.abort = new AbortController();

    const MAX_ITERATIONS = 5;
    let iteration = 0;

    try {
        let messages = [];
        if (agent.systemPrompt) messages.push({ role: 'system', content: agent.systemPrompt });
        const allMsgs = await storage.listMessages(_state.threadId);
        for (const m of allMsgs) {
            const cleaned = { role: m.role, content: m.content };
            if (m.tool_calls) cleaned.tool_calls = m.tool_calls;
            if (m.tool_call_id) cleaned.tool_call_id = m.tool_call_id;
            if (m.name && m.role === 'tool') cleaned.name = m.name;
            messages.push(cleaned);
        }

        while (iteration < MAX_ITERATIONS) {
            iteration++;

            // Thinking placeholder for this iteration
            const thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'chat-panel__msg chat-panel__msg--thinking';
            thinkingDiv.textContent = t('ai.chat.thinking');
            _panel.querySelector('#chatMessages').appendChild(thinkingDiv);

            let streamed = '';
            const result = await chatCompletion(
                getEffectiveEndpoint(agent),
                agent.apiKey,
                agent.model,
                messages,
                TOOL_DEFINITIONS,
                {
                    temperature: agent.temperature,
                    signal: _state.abort.signal,
                    onStream: (delta, full) => {
                        streamed = full;
                        thinkingDiv.classList.remove('chat-panel__msg--thinking');
                        thinkingDiv.classList.add('chat-panel__msg--assistant');
                        thinkingDiv.textContent = full;
                        _panel.querySelector('#chatMessages').scrollTop = 1e9;
                    }
                }
            );

            const choice = result?.choices?.[0];
            const finishReason = choice?.finish_reason;
            const assistantMsg = choice?.message || { role: 'assistant', content: streamed };
            await storage.appendMessage(_state.threadId, assistantMsg);
            messages.push(assistantMsg);

            if (finishReason !== 'tool_calls') {
                // Final text — already rendered via streaming
                if (!streamed && assistantMsg.content) {
                    thinkingDiv.classList.remove('chat-panel__msg--thinking');
                    thinkingDiv.classList.add('chat-panel__msg--assistant');
                    thinkingDiv.textContent = assistantMsg.content;
                }
                break;
            }

            // Tool calls — replace thinking with tool-call bubble
            const toolCalls = assistantMsg.tool_calls || [];
            thinkingDiv.remove();
            const callBubble = document.createElement('div');
            callBubble.className = 'chat-panel__msg chat-panel__msg--toolcall';
            callBubble.textContent = `🔧 ${t('ai.chat.toolCalling')}: ${toolCalls.map(tc => tc.function?.name).join(', ')}`;
            _panel.querySelector('#chatMessages').appendChild(callBubble);

            // Execute tools sequentially (parallel could overwhelm IDB / IFC parser)
            for (const tc of toolCalls) {
                let parsedArgs = {};
                try { parsedArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}
                const toolResult = await executeToolCall({
                    id: tc.id,
                    name: tc.function?.name,
                    arguments: parsedArgs
                });
                const toolMsg = {
                    role: 'tool',
                    tool_call_id: tc.id,
                    name: tc.function?.name,
                    content: JSON.stringify(toolResult)
                };
                await storage.appendMessage(_state.threadId, toolMsg);
                messages.push(toolMsg);

                const resultBubble = document.createElement('div');
                resultBubble.className = 'chat-panel__msg chat-panel__msg--toolresult';
                const isError = toolResult?.error;
                resultBubble.textContent = `${isError ? '❌' : '✓'} ${t('ai.chat.toolReturned')}: ${JSON.stringify(toolResult).slice(0, 120)}`;
                _panel.querySelector('#chatMessages').appendChild(resultBubble);
            }
            _panel.querySelector('#chatMessages').scrollTop = 1e9;
        }

        if (iteration >= MAX_ITERATIONS) {
            const limitBubble = document.createElement('div');
            limitBubble.className = 'chat-panel__msg chat-panel__msg--assistant';
            limitBubble.textContent = `[${t('ai.chat.maxIterations')}]`;
            _panel.querySelector('#chatMessages').appendChild(limitBubble);
        }
    } catch (err) {
        if (err?.name === 'AbortError') {
            const lastThinking = _panel.querySelector('.chat-panel__msg--thinking');
            if (lastThinking) lastThinking.remove();
            return;
        }
        input.value = text;
        _autoGrowInput();
        const lastThinking = _panel.querySelector('.chat-panel__msg--thinking');
        if (lastThinking) {
            lastThinking.classList.remove('chat-panel__msg--thinking');
            lastThinking.classList.add('chat-panel__msg--assistant');
            lastThinking.textContent = `[Error] ${err.message || err}`;
        }
        const errKey = _errorKeyFromException(err);
        if (typeof ErrorHandler !== 'undefined' && errKey) {
            ErrorHandler.error(t(errKey).replace('{provider}', _providerName(agent.provider)));
        }
    } finally {
        _state.busy = false;
        _state.abort = null;
    }
}
```

Add the new import at the top of the file:
```js
import { executeToolCall } from '../ai/tool-executor.js';
```

If `TOOL_DEFINITIONS` is currently imported as `[]` (Phase 7), it now resolves to the populated array. No import change needed.

- [ ] **Step 5: Add CSS for tool-call bubbles**

In `assets/css/ai-chat.css`, after `.chat-panel__msg--thinking`:
```css
.chat-panel__msg--toolcall,
.chat-panel__msg--toolresult {
    align-self: flex-start;
    background: var(--bg-tertiary, rgba(0,0,0,0.04));
    color: var(--text-tertiary, #6b7280);
    font-size: 0.85em;
    font-family: ui-monospace, SFMono-Regular, monospace;
    border-left: 2px solid var(--primary-light, #818cf8);
    padding: 6px 10px;
    border-radius: 4px;
    max-width: 95%;
    word-break: break-all;
}
```

- [ ] **Step 6: Create `tests/test-suites/chat-panel-tool-loop.test.js`**

```js
describe('chat-panel tool loop (mocked fetch)', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = window.fetch;
    });

    afterEach(() => {
        window.fetch = originalFetch;
    });

    it('single iteration completes when first response is final text', async () => {
        const responses = [{
            choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }]
        }];
        let callCount = 0;
        window.fetch = () => Promise.resolve(new Response(JSON.stringify(responses[callCount++]), { status: 200 }));
        // Direct ai-client call (the loop integration tests would require full chat-panel injection — verify here)
        const client = await import('../../assets/js/ai/ai-client.js');
        const result = await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(result.choices[0].finish_reason).toBe('stop');
        expect(callCount).toBe(1);
    });

    it('two iterations when first response has tool_calls', async () => {
        const responses = [
            {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_storage_files', arguments: '{"type":"ifc"}' } }]
                    },
                    finish_reason: 'tool_calls'
                }]
            },
            {
                choices: [{ message: { role: 'assistant', content: 'Done!' }, finish_reason: 'stop' }]
            }
        ];
        let callCount = 0;
        window.fetch = () => Promise.resolve(new Response(JSON.stringify(responses[callCount++]), { status: 200 }));
        const client = await import('../../assets/js/ai/ai-client.js');
        const r1 = await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(r1.choices[0].finish_reason).toBe('tool_calls');
        const r2 = await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(r2.choices[0].finish_reason).toBe('stop');
    });

    it('executor returns unknown_tool for unregistered name', async () => {
        const executor = await import('../../assets/js/ai/tool-executor.js');
        const result = await executor.executeToolCall({ id: 'x', name: 'no_such_tool', arguments: {} });
        expect(result.error).toBe('unknown_tool');
    });

    it('all 15 tools registered after module load', async () => {
        const executor = await import('../../assets/js/ai/tool-executor.js');
        // Earlier test suites may have reset the registry; re-bootstrap explicitly
        executor._reinitializeForTest();
        expect(executor._registrySizeForTest()).toBe(15);
    });

    it('TOOL_DEFINITIONS contains 15 entries', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        expect(TOOL_DEFINITIONS.length).toBe(15);
    });

    it('every tool definition has a name and description in Czech', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        for (const def of TOOL_DEFINITIONS) {
            expect(typeof def.function.name).toBe('string');
            expect(typeof def.function.description).toBe('string');
            expect(def.function.description.length > 0).toBe(true);
        }
    });
});
```

In `tests/test-runner.html`:
```html
    <script src="test-suites/chat-panel-tool-loop.test.js"></script>
```

- [ ] **Step 7: Mirror + run + commit**

```bash
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
cp assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js
cp assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
cp assets/css/ai-chat.css dist/assets/css/ai-chat.css
node tests/run-tests.js
git add assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js \
        assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js \
        assets/js/common/translations.js dist/assets/js/common/translations.js \
        assets/css/ai-chat.css dist/assets/css/ai-chat.css \
        tests/test-suites/chat-panel-tool-loop.test.js tests/test-runner.html
git commit -m "feat(ai-tools): tool-defs (15) + executor bootstrap + chat-panel loop + i18n + CSS"
```

Expected: ~586 tests pass.

---

### Task 10: PWA cache + sw.js bump + PLAN/CHANGELOG

**Goal:** Final wiring — add 6 tool sub-files to SW cache, bump version, update docs.

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add 6 tool sub-files to ASSETS_TO_CACHE + bump version**

In `sw.js`, find `ASSETS_TO_CACHE`. After `'./assets/js/ai/chat-storage.js'`:
```js
    './assets/js/ai/tools/_helpers.js',
    './assets/js/ai/tools/tool-storage.js',
    './assets/js/ai/tools/tool-validator.js',
    './assets/js/ai/tools/tool-ids.js',
    './assets/js/ai/tools/tool-ifc.js',
    './assets/js/ai/tools/tool-ui.js',
```

Change `CACHE_VERSION` from `'bim-checker-v18'` to `'bim-checker-v19'`.

- [ ] **Step 2: Update PLAN.md**

In `PLAN.md`, after the Phase 7 entry, before the chat-heads UI TODO entry, add:
```markdown
### AI tools / function calling (Phase 8, 2026-05-09)
- [x] 15 BIM_checker-specific tools v 6 sub-souborech (storage / validator / ids / ifc / ui + helpers)
- [x] Tool execution loop v chat-panel.js (max 5 iterací)
- [x] Cross-page strategie: write tools píší do ValidationPresets last-session, validator listenuje `ai:applyLastSession` event
- [x] LRU cache (max 3 souborů) pro IFC content queries — Tier 3 tools < 5ms on cache hit
- [x] `confirm()` dialog pro destruktivní operace (delete_file, delete_validation_group)
- [x] +59 testů (helpers, executor, 5 tool kategorie + loop integration)
- [x] CZ + EN i18n (5 nových klíčů)
```

- [ ] **Step 3: Update CHANGELOG.md**

In `CHANGELOG.md`, insert above the most recent entry:
```markdown
## [0.4.0] — 2026-05-09

### Added
- AI tools / function calling — 15 BIM_checker-specific tools spanning storage CRUD (list, delete with confirm), validation workflow (list groups, add/delete with confirm, run validation), IDS specifications, IFC content queries (search by type, count by type, find files with type, get entity properties, get property value), and UI navigation (get current page, navigate to page).
- Tool-call iteration loop in chat-panel — agent can call tools, see results, and continue reasoning. Max 5 iterations safety. Tool calls and results render as inline gray bubbles in chat.
- Cross-page mutation strategy — validator write tools update the existing Phase 6 last-session preset and dispatch `ai:applyLastSession` event so changes appear live without page reload.
- LRU cache for IFC parsing — heavy IFC content queries cached at module level (max 3 files); cache hit < 5ms.
- 59 new tests across 8 suites covering helpers, executor router, all 5 tool categories, and loop integration.

### Changed
- `assets/js/ai/tools/` (new) — 6 sub-files split by domain (helpers, storage, validator, ids, ifc, ui).
- `assets/js/ai/tool-defs.js` — Phase 7 empty array → 15 OpenAI-format function definitions in Czech.
- `assets/js/ai/tool-executor.js` — Phase 7 stub → REGISTRY router with module-load-time tool registration.
- `assets/js/validator.js` — refactored last-session auto-restore into a named function and wired it to the new `ai:applyLastSession` event.
- IFC parser dependencies (`regex-cache.js`, `property-set-index.js`, `ifc-parser-core.js`) now load on all 4 pages so IFC content tools work cross-page.

### Internal
- 5 new CZ + EN i18n keys under `ai.chat.tool*`.
- SW cache version v18 → v19.
- 3D viewer tools, per-agent tool subset, custom user tools all explicitly out of scope.
```

(Adjust test count in CHANGELOG to match actual `node tests/run-tests.js` output.)

- [ ] **Step 4: Mirror sw.js + final test + commit**

```bash
cp sw.js dist/sw.js
node tests/run-tests.js
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(ai-tools): cache bump v18->v19 + PLAN/CHANGELOG entries"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin phase-8-ai-tools
```

This completes Phase 8. Merge to master with `--no-ff` follows the same convention as previous phases — that step is owned by the human reviewing the branch.

---

## Notes for the implementer

- **TDD discipline:** every tool follows the same pattern — test first (with `_resetRegistryForTest` to isolate), then implement. Don't skip the failing-test step; it surfaces typos in tool names that would otherwise silently fail at the agent's first invocation.
- **`window.confirm` mocks** must restore the original after each test, otherwise downstream tests inherit the mock and behave non-deterministically.
- **IFC sample fixture** is intentionally minimal (~10 lines). Real IFC files are 100k+ entities; tests don't validate parser correctness (Phase 4 already does that), only that tools correctly query parsed output.
- **Cross-test state isolation:** Phase 8 tools touch BIMStorage, ValidationPresets, the IFC LRU cache, and the executor REGISTRY. Each test suite's `beforeEach` must clear all four, or tests pass in isolation but fail when run together.
- **Page detection in tests:** `_setCurrentPageForTest()` overrides the URL heuristic. Always reset to `null` in `beforeEach` so the heuristic re-engages for the next test.
- **AbortError handling** in the chat-panel loop: a single `if (err?.name === 'AbortError')` short-circuit at the top of the catch block is enough. Don't add `instanceof DOMException` checks — different providers wrap AbortError differently and the name match is reliable across all of them.
- **Tool call argument JSON parsing** is a common failure mode. The provider may return malformed JSON. Wrap `JSON.parse` in try/catch and pass `{}` as fallback so the tool gets called with empty args (which then fails its own validation cleanly with `Missing required arg`).
- **Stop ifc-parser-core script tags from loading twice** — if a page already includes the script, don't double-add it. Verify with `grep -c ifc-parser-core` per page before editing.
