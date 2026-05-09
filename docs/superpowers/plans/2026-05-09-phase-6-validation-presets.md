# Phase 6 — Validation Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist validation group configuration in localStorage with named presets and auto-restored last session.

**Architecture:** New `ValidationPresets` singleton owns localStorage CRUD + debounced last-session save + BIMStorage-backed hydration. Validator panel adds a static presets bar above groups; in-memory group shape extended with `missingIfcNames`/`missingIdsName` so hydration can mark unresolved file references for visual indication.

**Tech Stack:** Vanilla JS (no build), localStorage (sync), IndexedDB via existing `BIMStorage`, custom Jasmine-like tests run by `node tests/run-tests.js` (Puppeteer headless Chromium).

**Spec:** `docs/superpowers/specs/2026-05-09-phase-6-validation-presets-design.md`

---

## File Structure

### Created

| File | Responsibility |
|------|----------------|
| `assets/js/common/validation-presets.js` | Singleton `window.ValidationPresets`. Owns localStorage CRUD (presets, last-session), debounce, hydration glue to BIMStorage |
| `tests/test-suites/validation-presets.test.js` | Unit tests for ValidationPresets module |
| `tests/test-suites/validation-presets-integration.test.js` | End-to-end tests covering preset save → reload → restore, missing-file rendering, auto-resolve |

### Modified

| File | What changes |
|------|--------------|
| `pages/ids-ifc-validator.html` | Add static presets panel + lazy save-modal placeholder location |
| `assets/js/validator.js` | Wire panel events, extend group shape, render missing pills, hook last-session save, beforeunload flush, auto-restore |
| `assets/css/ids-validator.css` | New `.presets-panel` + `.file-pill--missing` rules |
| `assets/js/common/translations.js` | 20 new keys (CZ + EN) under `presets.*` namespace |
| `tests/test-runner.html` | Register two new test suites + load new module |
| `eslint.config.js` | Add `ValidationPresets: 'readonly'` global |
| `sw.js` | Add `validation-presets.js` to `ASSETS_TO_CACHE`, bump `CACHE_VERSION` v12 → v13 |
| `PLAN.md` | Mark Phase 6 done |
| `CHANGELOG.md` | New `[0.2.6]` entry |
| All of the above mirrored to `dist/` per project convention |

---

## Implementation tasks

### Task 1: Bootstrap module + register in test runner

**Goal:** Empty module file exists, is loaded in tests, and an empty test suite passes — establishing the framework for TDD on subsequent tasks.

**Files:**
- Create: `assets/js/common/validation-presets.js`
- Create: `dist/assets/js/common/validation-presets.js`
- Create: `tests/test-suites/validation-presets.test.js`
- Modify: `tests/test-runner.html`
- Modify: `eslint.config.js`

- [ ] **Step 1: Create the module skeleton**

`assets/js/common/validation-presets.js`:
```js
/* ===========================================
   BIM CHECKER - VALIDATION PRESETS
   Persistent named presets + last-session auto-restore
   for the IDS-IFC validator.

   Storage: localStorage (sync, small payloads).
   Hydration: hits BIMStorage to resolve filenames -> file content.
   =========================================== */

(function () {
    'use strict';

    const PRESETS_KEY = 'bim_validation_presets';
    const LAST_SESSION_KEY = 'bim_validation_last_session';
    const DEBOUNCE_MS = 500;

    let _lastSessionTimer = null;
    let _lastSessionPending = null;
    let _disabled = false;

    function _safeParse(raw, fallback) {
        if (raw == null) return fallback;
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[ValidationPresets] corrupted JSON, ignoring:', e);
            return fallback;
        }
    }

    function _readPresets() {
        return _safeParse(localStorage.getItem(PRESETS_KEY), []);
    }

    function _writePresets(arr) {
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(arr));
            return true;
        } catch (e) {
            if (e && e.name === 'QuotaExceededError') {
                if (typeof ErrorHandler !== 'undefined') {
                    ErrorHandler.error(typeof t === 'function' ? t('presets.quotaExceeded') : 'Storage quota exceeded');
                }
                return false;
            }
            _disabled = true;
            return false;
        }
    }

    window.ValidationPresets = {
        // Public API surface — implemented in subsequent tasks
        list() { return _readPresets(); },
        get() { return null; },
        save() { return null; },
        delete() { return false; },
        saveLastSession() {},
        loadLastSession() { return null; },
        flushLastSession() {},
        toPresetGroups() { return []; },
        async fromPresetGroups() { return []; }
    };
})();
```

- [ ] **Step 2: Mirror to dist/**

```bash
cp assets/js/common/validation-presets.js dist/assets/js/common/validation-presets.js
```

- [ ] **Step 3: Add ESLint global**

In `eslint.config.js`, append after the `IFCParserCore: 'readonly'` line:
```js
                // Phase 6: validation presets
                ValidationPresets: 'readonly'
```
(Mind the existing trailing-comma style: previous line gets a comma added.)

- [ ] **Step 4: Create the test file with one smoke test**

`tests/test-suites/validation-presets.test.js`:
```js
describe('ValidationPresets — bootstrap', () => {
    beforeEach(() => {
        localStorage.removeItem('bim_validation_presets');
        localStorage.removeItem('bim_validation_last_session');
    });

    it('exposes the module on window with the expected API surface', () => {
        expect(typeof window.ValidationPresets).toBe('object');
        const expected = ['list', 'get', 'save', 'delete', 'saveLastSession',
            'loadLastSession', 'flushLastSession', 'toPresetGroups', 'fromPresetGroups'];
        for (const fn of expected) {
            expect(typeof window.ValidationPresets[fn]).toBe('function');
        }
    });

    it('list() returns [] when localStorage is empty', () => {
        expect(Array.isArray(ValidationPresets.list())).toBe(true);
        expect(ValidationPresets.list().length).toBe(0);
    });
});
```

- [ ] **Step 5: Register module + test suite in test-runner.html**

In `tests/test-runner.html`, after the line `<script src="../assets/js/common/ifc-parser-core.js"></script>` (around line 341), add:
```html
    <script src="../assets/js/common/validation-presets.js"></script>
```

In the test-suites block (after the last `<script src="test-suites/...">` line), add:
```html
    <script src="test-suites/validation-presets.test.js"></script>
```

- [ ] **Step 6: Run tests and verify the bootstrap suite passes**

```bash
node tests/run-tests.js
```
Expected: previous test count (444) + 2 new tests = 446 tests, all pass.

- [ ] **Step 7: Commit**

```bash
git add assets/js/common/validation-presets.js \
        dist/assets/js/common/validation-presets.js \
        tests/test-suites/validation-presets.test.js \
        tests/test-runner.html \
        eslint.config.js
git commit -m "feat(presets): bootstrap ValidationPresets module + test harness"
```

---

### Task 2: `list()` returns presets, `save()` creates new

**Goal:** TDD-implement `save(name, groups)` for the new-preset path. Verify with `list()`.

**Files:**
- Modify: `assets/js/common/validation-presets.js` + dist mirror
- Modify: `tests/test-suites/validation-presets.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/test-suites/validation-presets.test.js`:
```js
describe('ValidationPresets.save (create)', () => {
    beforeEach(() => {
        localStorage.removeItem('bim_validation_presets');
    });

    it('save() returns a string id', () => {
        const id = ValidationPresets.save('Project A', []);
        expect(typeof id).toBe('string');
        expect(id.length > 0).toBe(true);
    });

    it('save() persists preset; list() returns it', () => {
        ValidationPresets.save('Project A', [
            { ifcFileNames: ['a.ifc'], idsFileName: 'spec.ids' }
        ]);
        const list = ValidationPresets.list();
        expect(list.length).toBe(1);
        expect(list[0].name).toBe('Project A');
        expect(list[0].groups.length).toBe(1);
        expect(list[0].groups[0].ifcFileNames[0]).toBe('a.ifc');
        expect(list[0].groups[0].idsFileName).toBe('spec.ids');
    });

    it('save() sets createdAt and updatedAt to the same value on create', () => {
        const id = ValidationPresets.save('P', []);
        const preset = ValidationPresets.list().find(p => p.id === id);
        expect(typeof preset.createdAt).toBe('number');
        expect(preset.createdAt).toBe(preset.updatedAt);
    });

    it('save() preserves multiple distinct presets', () => {
        ValidationPresets.save('A', []);
        ValidationPresets.save('B', []);
        ValidationPresets.save('C', []);
        const names = ValidationPresets.list().map(p => p.name).sort();
        expect(names.join(',')).toBe('A,B,C');
    });
});
```

- [ ] **Step 2: Run tests; verify they fail**

```bash
node tests/run-tests.js
```
Expected: 4 new failures (`save() returns null`).

- [ ] **Step 3: Implement save() and update list()**

In `assets/js/common/validation-presets.js`, replace the placeholder `save()` and `list()` definitions inside `window.ValidationPresets`:

```js
        list() {
            const arr = _readPresets();
            return Array.isArray(arr) ? arr : [];
        },

        save(name, presetGroups) {
            const trimmed = String(name || '').trim();
            if (trimmed.length === 0) {
                throw new Error('Preset name is required');
            }
            const presets = this.list();
            const existing = presets.find(p => p.name === trimmed);
            const now = Date.now();
            if (existing) {
                existing.groups = presetGroups || [];
                existing.updatedAt = now;
                _writePresets(presets);
                return existing.id;
            }
            const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
            presets.push({
                id,
                name: trimmed,
                createdAt: now,
                updatedAt: now,
                groups: presetGroups || []
            });
            _writePresets(presets);
            return id;
        },
```

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: 446 + 4 = 450 tests, all pass.

- [ ] **Step 5: Mirror to dist + commit**

```bash
cp assets/js/common/validation-presets.js dist/assets/js/common/validation-presets.js
git add assets/js/common/validation-presets.js \
        dist/assets/js/common/validation-presets.js \
        tests/test-suites/validation-presets.test.js
git commit -m "feat(presets): implement save() create + list() reads"
```

---

### Task 3: `get()`, `delete()`, and `save()` upsert by name

**Goal:** TDD-implement remaining single-preset CRUD plus the upsert path.

**Files:**
- Modify: `assets/js/common/validation-presets.js` + dist mirror
- Modify: `tests/test-suites/validation-presets.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/test-suites/validation-presets.test.js`:
```js
describe('ValidationPresets.save (upsert)', () => {
    beforeEach(() => { localStorage.removeItem('bim_validation_presets'); });

    it('saving same name twice does not duplicate', () => {
        ValidationPresets.save('A', [{ ifcFileNames: ['a.ifc'], idsFileName: null }]);
        ValidationPresets.save('A', [{ ifcFileNames: ['b.ifc'], idsFileName: null }]);
        const list = ValidationPresets.list();
        expect(list.length).toBe(1);
        expect(list[0].groups[0].ifcFileNames[0]).toBe('b.ifc');
    });

    it('saving same name preserves the original id', () => {
        const id1 = ValidationPresets.save('A', []);
        const id2 = ValidationPresets.save('A', [{ ifcFileNames: ['x.ifc'], idsFileName: null }]);
        expect(id1).toBe(id2);
    });

    it('saving same name updates updatedAt but preserves createdAt', async () => {
        const id = ValidationPresets.save('A', []);
        const created = ValidationPresets.list().find(p => p.id === id).createdAt;
        await new Promise(r => setTimeout(r, 10));
        ValidationPresets.save('A', [{ ifcFileNames: ['x.ifc'], idsFileName: null }]);
        const after = ValidationPresets.list().find(p => p.id === id);
        expect(after.createdAt).toBe(created);
        expect(after.updatedAt > created).toBe(true);
    });

    it('save() throws on empty/whitespace name', () => {
        let threw = false;
        try { ValidationPresets.save('   ', []); } catch { threw = true; }
        expect(threw).toBe(true);
        threw = false;
        try { ValidationPresets.save('', []); } catch { threw = true; }
        expect(threw).toBe(true);
    });
});

describe('ValidationPresets.get', () => {
    beforeEach(() => { localStorage.removeItem('bim_validation_presets'); });

    it('returns the preset by id', () => {
        const id = ValidationPresets.save('A', [{ ifcFileNames: ['a.ifc'], idsFileName: null }]);
        const preset = ValidationPresets.get(id);
        expect(preset).not.toBe(null);
        expect(preset.name).toBe('A');
    });

    it('returns null for unknown id', () => {
        expect(ValidationPresets.get('nope')).toBe(null);
    });
});

describe('ValidationPresets.delete', () => {
    beforeEach(() => { localStorage.removeItem('bim_validation_presets'); });

    it('removes the preset; list no longer contains it', () => {
        const id = ValidationPresets.save('A', []);
        ValidationPresets.save('B', []);
        const ok = ValidationPresets.delete(id);
        expect(ok).toBe(true);
        const names = ValidationPresets.list().map(p => p.name);
        expect(names.length).toBe(1);
        expect(names[0]).toBe('B');
    });

    it('returns false for unknown id', () => {
        expect(ValidationPresets.delete('nope')).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests; verify they fail**

```bash
node tests/run-tests.js
```
Expected: ~9 new failures.

- [ ] **Step 3: Implement get() and delete()**

In `assets/js/common/validation-presets.js`, replace the placeholder `get()` and `delete()`:

```js
        get(id) {
            return this.list().find(p => p.id === id) || null;
        },

        delete(id) {
            const presets = this.list();
            const idx = presets.findIndex(p => p.id === id);
            if (idx === -1) return false;
            presets.splice(idx, 1);
            _writePresets(presets);
            return true;
        },
```

(`save()` already handles upsert correctly via the `existing` branch — confirmed by the new tests.)

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: 459 tests, all pass.

- [ ] **Step 5: Mirror + commit**

```bash
cp assets/js/common/validation-presets.js dist/assets/js/common/validation-presets.js
git add assets/js/common/validation-presets.js \
        dist/assets/js/common/validation-presets.js \
        tests/test-suites/validation-presets.test.js
git commit -m "feat(presets): get/delete + upsert-by-name semantics"
```

---

### Task 4: Last-session save (debounced) + load + flush

**Goal:** TDD-implement auto-restore persistence with debounced writes and synchronous flush for `beforeunload`.

**Files:**
- Modify: `assets/js/common/validation-presets.js` + dist mirror
- Modify: `tests/test-suites/validation-presets.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/test-suites/validation-presets.test.js`:
```js
describe('ValidationPresets.saveLastSession + loadLastSession', () => {
    beforeEach(() => {
        localStorage.removeItem('bim_validation_last_session');
    });

    it('loadLastSession() returns null when nothing has been saved', () => {
        expect(ValidationPresets.loadLastSession()).toBe(null);
    });

    it('flushLastSession() persists the most recent saveLastSession() call', () => {
        const groups = [{ ifcFileNames: ['a.ifc'], idsFileName: 'spec.ids' }];
        ValidationPresets.saveLastSession(groups);
        ValidationPresets.flushLastSession();
        const loaded = ValidationPresets.loadLastSession();
        expect(loaded).not.toBe(null);
        expect(loaded.groups[0].ifcFileNames[0]).toBe('a.ifc');
        expect(typeof loaded.savedAt).toBe('number');
    });

    it('saveLastSession() debounces — multiple calls coalesce', async () => {
        ValidationPresets.saveLastSession([{ ifcFileNames: ['a.ifc'], idsFileName: null }]);
        ValidationPresets.saveLastSession([{ ifcFileNames: ['b.ifc'], idsFileName: null }]);
        ValidationPresets.saveLastSession([{ ifcFileNames: ['c.ifc'], idsFileName: null }]);
        // Before debounce settles, last-session is unwritten
        expect(localStorage.getItem('bim_validation_last_session')).toBe(null);
        // Wait past debounce window
        await new Promise(r => setTimeout(r, 600));
        const loaded = ValidationPresets.loadLastSession();
        expect(loaded.groups[0].ifcFileNames[0]).toBe('c.ifc');
    });

    it('flushLastSession() with no pending data is a no-op', () => {
        // Should not throw
        ValidationPresets.flushLastSession();
        expect(ValidationPresets.loadLastSession()).toBe(null);
    });

    it('flushLastSession() cancels the pending debounce', async () => {
        ValidationPresets.saveLastSession([{ ifcFileNames: ['x.ifc'], idsFileName: null }]);
        ValidationPresets.flushLastSession();
        // Mutate again, do NOT flush
        ValidationPresets.saveLastSession([{ ifcFileNames: ['y.ifc'], idsFileName: null }]);
        // Immediately after the second call, value is still 'x.ifc' (flushed earlier)
        const immediate = ValidationPresets.loadLastSession();
        expect(immediate.groups[0].ifcFileNames[0]).toBe('x.ifc');
        // After debounce, becomes 'y.ifc'
        await new Promise(r => setTimeout(r, 600));
        const eventual = ValidationPresets.loadLastSession();
        expect(eventual.groups[0].ifcFileNames[0]).toBe('y.ifc');
    });
});
```

- [ ] **Step 2: Run tests; verify they fail**

```bash
node tests/run-tests.js
```

- [ ] **Step 3: Implement debounced last-session API**

In `assets/js/common/validation-presets.js`, replace the placeholder `saveLastSession`/`loadLastSession`/`flushLastSession`:

```js
        saveLastSession(groups) {
            _lastSessionPending = {
                groups: Array.isArray(groups) ? groups : [],
                savedAt: Date.now()
            };
            if (_lastSessionTimer) clearTimeout(_lastSessionTimer);
            _lastSessionTimer = setTimeout(() => {
                try {
                    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(_lastSessionPending));
                } catch (e) {
                    if (e && e.name !== 'QuotaExceededError') _disabled = true;
                }
                _lastSessionTimer = null;
                _lastSessionPending = null;
            }, DEBOUNCE_MS);
        },

        loadLastSession() {
            return _safeParse(localStorage.getItem(LAST_SESSION_KEY), null);
        },

        flushLastSession() {
            if (_lastSessionTimer) {
                clearTimeout(_lastSessionTimer);
                _lastSessionTimer = null;
            }
            if (_lastSessionPending) {
                try {
                    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(_lastSessionPending));
                } catch (e) {
                    if (e && e.name !== 'QuotaExceededError') _disabled = true;
                }
                _lastSessionPending = null;
            }
        },
```

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: 464 tests, all pass.

- [ ] **Step 5: Mirror + commit**

```bash
cp assets/js/common/validation-presets.js dist/assets/js/common/validation-presets.js
git add assets/js/common/validation-presets.js \
        dist/assets/js/common/validation-presets.js \
        tests/test-suites/validation-presets.test.js
git commit -m "feat(presets): debounced last-session persistence + flush"
```

---

### Task 5: `toPresetGroups()` extracts filenames

**Goal:** Synchronous conversion of in-memory `validationGroups` to preset shape, including merging unresolved missing names.

**Files:**
- Modify: `assets/js/common/validation-presets.js` + dist mirror
- Modify: `tests/test-suites/validation-presets.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/test-suites/validation-presets.test.js`:
```js
describe('ValidationPresets.toPresetGroups', () => {
    it('extracts only filenames from in-memory groups (no content/id)', () => {
        const groups = [{
            id: 12345,
            ifcFiles: [
                { id: 'file_1', name: 'building.ifc', size: 100, content: 'huge string' },
                { id: 'file_2', name: 'site.ifc',     size: 200, content: 'other huge string' }
            ],
            idsFile: { id: 'file_3', name: 'spec.ids', size: 50, content: '<xml/>' },
            missingIfcNames: [],
            missingIdsName: null
        }];
        const out = ValidationPresets.toPresetGroups(groups);
        expect(out.length).toBe(1);
        expect(out[0].ifcFileNames.join(',')).toBe('building.ifc,site.ifc');
        expect(out[0].idsFileName).toBe('spec.ids');
        // None of the content/id fields leak through
        expect(JSON.stringify(out).indexOf('huge string')).toBe(-1);
        expect(JSON.stringify(out).indexOf('file_1')).toBe(-1);
    });

    it('merges missingIfcNames + ifcFiles names into ifcFileNames', () => {
        const groups = [{
            id: 1,
            ifcFiles: [{ id: 'f1', name: 'a.ifc', size: 1, content: '' }],
            idsFile: null,
            missingIfcNames: ['b.ifc', 'c.ifc'],
            missingIdsName: null
        }];
        const out = ValidationPresets.toPresetGroups(groups);
        expect(out[0].ifcFileNames.sort().join(',')).toBe('a.ifc,b.ifc,c.ifc');
    });

    it('uses missingIdsName when idsFile is null', () => {
        const groups = [{
            id: 1, ifcFiles: [], idsFile: null,
            missingIfcNames: [], missingIdsName: 'lost.ids'
        }];
        const out = ValidationPresets.toPresetGroups(groups);
        expect(out[0].idsFileName).toBe('lost.ids');
    });

    it('idsFileName is null when both idsFile and missingIdsName are absent', () => {
        const groups = [{ id: 1, ifcFiles: [], idsFile: null, missingIfcNames: [], missingIdsName: null }];
        const out = ValidationPresets.toPresetGroups(groups);
        expect(out[0].idsFileName).toBe(null);
    });

    it('handles legacy in-memory groups without missingIfcNames/missingIdsName fields', () => {
        const groups = [{ id: 1, ifcFiles: [], idsFile: null }];
        const out = ValidationPresets.toPresetGroups(groups);
        expect(out[0].ifcFileNames.length).toBe(0);
        expect(out[0].idsFileName).toBe(null);
    });
});
```

- [ ] **Step 2: Run tests; verify they fail**

```bash
node tests/run-tests.js
```

- [ ] **Step 3: Implement toPresetGroups()**

In `assets/js/common/validation-presets.js`, replace the placeholder `toPresetGroups()`:

```js
        toPresetGroups(validationGroups) {
            return (validationGroups || []).map(g => ({
                ifcFileNames: [
                    ...(g.ifcFiles || []).map(f => f.name),
                    ...(g.missingIfcNames || [])
                ],
                idsFileName: g.idsFile ? g.idsFile.name : (g.missingIdsName || null)
            }));
        },
```

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: 469 tests, all pass.

- [ ] **Step 5: Mirror + commit**

```bash
cp assets/js/common/validation-presets.js dist/assets/js/common/validation-presets.js
git add assets/js/common/validation-presets.js \
        dist/assets/js/common/validation-presets.js \
        tests/test-suites/validation-presets.test.js
git commit -m "feat(presets): toPresetGroups() — extract filenames including missing"
```

---

### Task 6: `fromPresetGroups()` hydrates against BIMStorage

**Goal:** Async hydration that resolves filenames against `BIMStorage`, returning in-memory groups with missing markers for unresolved references. This is an integration test — it touches IndexedDB.

**Files:**
- Modify: `assets/js/common/validation-presets.js` + dist mirror
- Modify: `tests/test-suites/validation-presets.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/test-suites/validation-presets.test.js`:
```js
describe('ValidationPresets.fromPresetGroups (BIMStorage hydration)', () => {
    async function clearStorage() {
        await BIMStorage.init();
        // Hard reset of both file types
        const ifcFiles = await BIMStorage.getFiles('ifc');
        for (const f of ifcFiles) await BIMStorage.ifcStorage.deleteFile(f.id);
        const idsFiles = await BIMStorage.getFiles('ids');
        for (const f of idsFiles) await BIMStorage.idsStorage.deleteFile(f.id);
    }

    function makeFile(name, content) {
        return new File([content], name, { type: 'text/plain' });
    }

    beforeEach(async () => {
        await clearStorage();
    });

    it('resolves an existing IFC file with content from BIMStorage', async () => {
        await BIMStorage.saveFile('ifc', makeFile('alpha.ifc', 'IFC-CONTENT-1'));
        const result = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: ['alpha.ifc'], idsFileName: null }
        ]);
        expect(result.length).toBe(1);
        expect(result[0].ifcFiles.length).toBe(1);
        expect(result[0].ifcFiles[0].name).toBe('alpha.ifc');
        expect(result[0].ifcFiles[0].content).toBe('IFC-CONTENT-1');
        expect(result[0].missingIfcNames.length).toBe(0);
    });

    it('records missing names when filenames are not in BIMStorage', async () => {
        const result = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: ['nope.ifc'], idsFileName: 'gone.ids' }
        ]);
        expect(result[0].ifcFiles.length).toBe(0);
        expect(result[0].missingIfcNames.join(',')).toBe('nope.ifc');
        expect(result[0].idsFile).toBe(null);
        expect(result[0].missingIdsName).toBe('gone.ids');
    });

    it('mixes resolved and missing in the same group', async () => {
        await BIMStorage.saveFile('ifc', makeFile('present.ifc', 'OK'));
        const result = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: ['present.ifc', 'absent.ifc'], idsFileName: null }
        ]);
        expect(result[0].ifcFiles.length).toBe(1);
        expect(result[0].ifcFiles[0].name).toBe('present.ifc');
        expect(result[0].missingIfcNames.length).toBe(1);
        expect(result[0].missingIfcNames[0]).toBe('absent.ifc');
    });

    it('every returned group has a non-zero in-memory id', async () => {
        const result = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: [], idsFileName: null },
            { ifcFileNames: [], idsFileName: null }
        ]);
        expect(typeof result[0].id).toBe('number');
        expect(typeof result[1].id).toBe('number');
        expect(result[0].id !== result[1].id).toBe(true);
    });

    it('returns [] for empty input', async () => {
        const result = await ValidationPresets.fromPresetGroups([]);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });
});
```

- [ ] **Step 2: Run tests; verify they fail**

```bash
node tests/run-tests.js
```

- [ ] **Step 3: Implement fromPresetGroups()**

In `assets/js/common/validation-presets.js`, replace the placeholder `fromPresetGroups()`:

```js
        async fromPresetGroups(presetGroups) {
            if (typeof BIMStorage === 'undefined') return [];
            await BIMStorage.init();
            const result = [];
            for (const pg of (presetGroups || [])) {
                const ifcFiles = [];
                const missingIfcNames = [];
                for (const name of (pg.ifcFileNames || [])) {
                    try {
                        const meta = await BIMStorage.getFile('ifc', name);
                        if (meta) {
                            const content = await BIMStorage.getFileContent('ifc', meta.id);
                            ifcFiles.push({ id: meta.id, name: meta.name, size: meta.size, content });
                        } else {
                            missingIfcNames.push(name);
                        }
                    } catch (e) {
                        console.warn('[ValidationPresets] hydration failed for', name, e);
                        missingIfcNames.push(name);
                    }
                }
                let idsFile = null, missingIdsName = null;
                if (pg.idsFileName) {
                    try {
                        const meta = await BIMStorage.getFile('ids', pg.idsFileName);
                        if (meta) {
                            const content = await BIMStorage.getFileContent('ids', meta.id);
                            idsFile = { id: meta.id, name: meta.name, size: meta.size, content };
                        } else {
                            missingIdsName = pg.idsFileName;
                        }
                    } catch (e) {
                        console.warn('[ValidationPresets] hydration failed for', pg.idsFileName, e);
                        missingIdsName = pg.idsFileName;
                    }
                }
                result.push({
                    id: Date.now() + Math.floor(Math.random() * 1000000),
                    ifcFiles, idsFile,
                    missingIfcNames, missingIdsName
                });
            }
            return result;
        }
```

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: 474 tests, all pass.

- [ ] **Step 5: Mirror + commit**

```bash
cp assets/js/common/validation-presets.js dist/assets/js/common/validation-presets.js
git add assets/js/common/validation-presets.js \
        dist/assets/js/common/validation-presets.js \
        tests/test-suites/validation-presets.test.js
git commit -m "feat(presets): fromPresetGroups() — async hydration via BIMStorage"
```

---

### Task 7: Robustness — corrupted JSON + quota errors

**Goal:** Ensure module is bulletproof against the two practical localStorage failure modes.

**Files:**
- Modify: `tests/test-suites/validation-presets.test.js`
- (Implementation already in place from Task 1; this task verifies behaviour and adds a quota-error test.)

- [ ] **Step 1: Write failing/proving tests**

Append to `tests/test-suites/validation-presets.test.js`:
```js
describe('ValidationPresets robustness', () => {
    beforeEach(() => {
        localStorage.removeItem('bim_validation_presets');
        localStorage.removeItem('bim_validation_last_session');
    });

    it('list() returns [] when bim_validation_presets contains corrupted JSON', () => {
        localStorage.setItem('bim_validation_presets', 'this is not json {{{');
        expect(ValidationPresets.list().length).toBe(0);
    });

    it('loadLastSession() returns null when last-session is corrupted JSON', () => {
        localStorage.setItem('bim_validation_last_session', '<<<broken>>>');
        expect(ValidationPresets.loadLastSession()).toBe(null);
    });

    it('save() returns the new id even when localStorage.setItem throws QuotaExceededError', () => {
        const original = localStorage.setItem.bind(localStorage);
        let thrown = false;
        localStorage.setItem = function (k, v) {
            if (k === 'bim_validation_presets') {
                const err = new Error('Quota exceeded');
                err.name = 'QuotaExceededError';
                thrown = true;
                throw err;
            }
            return original(k, v);
        };
        try {
            const id = ValidationPresets.save('Quota test', []);
            expect(typeof id).toBe('string');  // function still returns id even if persistence failed
            expect(thrown).toBe(true);
        } finally {
            localStorage.setItem = original;
        }
    });
});
```

- [ ] **Step 2: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: 477 tests, all pass. The corrupted-JSON tests pass because `_safeParse` was implemented in Task 1; the quota test passes because `_writePresets` already catches `QuotaExceededError`.

- [ ] **Step 3: Commit**

```bash
git add tests/test-suites/validation-presets.test.js
git commit -m "test(presets): cover corrupted JSON + QuotaExceededError paths"
```

---

### Task 8: Translation keys + CSS + presets panel HTML

**Goal:** All static UI assets in place — translations, CSS rules, and the panel markup in the validator page.

**Files:**
- Modify: `assets/js/common/translations.js` + dist mirror
- Modify: `assets/css/ids-validator.css` + dist mirror
- Modify: `pages/ids-ifc-validator.html` + dist mirror

- [ ] **Step 1: Add Czech translation keys**

Open `assets/js/common/translations.js`. Find the existing CZ block (root contains `cs:` or `'cs'` key). Locate a logical spot among existing `validator.*` keys and append before the block closes:

```js
        // Phase 6: validation presets
        'presets.title': '📁 Presety',
        'presets.placeholder': '— Vyberte preset —',
        'presets.load': '📂 Načíst',
        'presets.saveAs': '💾 Uložit jako',
        'presets.delete': '🗑️ Smazat',
        'presets.empty': 'Není co uložit',
        'presets.saveModal.title': 'Uložit preset',
        'presets.saveModal.namePlaceholder': 'Jméno presetu',
        'presets.saveModal.cancel': 'Zrušit',
        'presets.saveModal.save': 'Uložit',
        'presets.saveModal.overwriteConfirm': "Preset '{name}' už existuje. Přepsat?",
        'presets.deleteConfirm': "Smazat preset '{name}'?",
        'presets.loadConfirm': "Načíst preset '{name}'? Aktuální skupiny budou nahrazeny.",
        'presets.fileMissing': '(chybí v úložišti)',
        'presets.loaded': "Preset '{name}' načten",
        'presets.loadedWithMissing': "Preset '{name}' načten — některé soubory chybí v úložišti",
        'presets.saved': "Preset '{name}' uložen",
        'presets.deleted': "Preset '{name}' smazán",
        'presets.quotaExceeded': 'Paměť prohlížeče je plná. Smažte staré presety.',
        'presets.disabled': 'Presety nelze ukládat (privátní režim prohlížeče)',
```

- [ ] **Step 2: Add English translation keys**

In the EN block of `assets/js/common/translations.js`, mirror with the same keys:

```js
        // Phase 6: validation presets
        'presets.title': '📁 Presets',
        'presets.placeholder': '— Select preset —',
        'presets.load': '📂 Load',
        'presets.saveAs': '💾 Save as',
        'presets.delete': '🗑️ Delete',
        'presets.empty': 'Nothing to save',
        'presets.saveModal.title': 'Save preset',
        'presets.saveModal.namePlaceholder': 'Preset name',
        'presets.saveModal.cancel': 'Cancel',
        'presets.saveModal.save': 'Save',
        'presets.saveModal.overwriteConfirm': "Preset '{name}' already exists. Overwrite?",
        'presets.deleteConfirm': "Delete preset '{name}'?",
        'presets.loadConfirm': "Load preset '{name}'? Current groups will be replaced.",
        'presets.fileMissing': '(missing from storage)',
        'presets.loaded': "Preset '{name}' loaded",
        'presets.loadedWithMissing': "Preset '{name}' loaded — some files missing from storage",
        'presets.saved': "Preset '{name}' saved",
        'presets.deleted': "Preset '{name}' deleted",
        'presets.quotaExceeded': 'Browser storage is full. Delete old presets.',
        'presets.disabled': 'Presets cannot be saved (browser private mode)',
```

- [ ] **Step 3: Add CSS for panel + missing pill**

Append to `assets/css/ids-validator.css`:

```css
/* ===========================================
   Phase 6: Presets panel + missing-file pill
   =========================================== */
.presets-panel {
    background: var(--bg-secondary, #f8f9fa);
    border: 1px solid var(--border-primary, #e5e7eb);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
}

.presets-panel__header {
    margin-bottom: 12px;
}

.presets-panel__title {
    font-weight: 600;
    color: var(--text-primary, #1f2937);
    font-size: 1em;
}

.presets-panel__controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
}

.presets-panel__select {
    flex: 1 1 200px;
    min-width: 160px;
    padding: 8px 12px;
    border: 1px solid var(--border-primary, #d1d5db);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #1f2937);
    font-size: 0.95em;
}

.presets-panel__controls .btn {
    flex: 0 0 auto;
}

/* Missing file pill — shown when a preset references a file no longer in storage */
.file-pill--missing {
    border: 1px dashed var(--warning, #f59e0b) !important;
    background: rgba(245, 158, 11, 0.08) !important;
    color: var(--warning, #f59e0b) !important;
    font-style: italic;
    opacity: 0.85;
}

.file-pill--missing::before {
    content: '⚠️ ';
}

.file-pill__missing-note {
    margin-left: 6px;
    font-size: 0.85em;
    color: var(--text-tertiary, #6b7280);
}
```

- [ ] **Step 4: Add the static panel HTML to the validator page**

In `pages/ids-ifc-validator.html`, find the `.upload-section` block. Locate the heading row that contains `data-i18n="validator.groups"` and the `addValidationGroup` button (around line 113-120). After the `xsdSummaryBanner` div (around line 121-126) and BEFORE `<div id="validationGroups">`, insert:

```html
                <!-- Phase 6: Validation presets panel -->
                <div class="presets-panel" id="presetsPanel">
                    <div class="presets-panel__header">
                        <span class="presets-panel__title" data-i18n="presets.title">📁 Presety</span>
                    </div>
                    <div class="presets-panel__controls">
                        <select id="presetSelect" class="presets-panel__select">
                            <option value="" data-i18n="presets.placeholder">— Vyberte preset —</option>
                        </select>
                        <button id="loadPresetBtn" class="btn btn-secondary" disabled data-i18n="presets.load">📂 Načíst</button>
                        <button id="savePresetBtn" class="btn btn-primary" data-i18n="presets.saveAs">💾 Uložit jako</button>
                        <button id="deletePresetBtn" class="btn btn-danger" disabled data-i18n="presets.delete">🗑️ Smazat</button>
                    </div>
                </div>
```

- [ ] **Step 5: Mirror to dist and run tests**

```bash
cp assets/js/common/translations.js dist/assets/js/common/translations.js
cp assets/css/ids-validator.css     dist/assets/css/ids-validator.css
cp pages/ids-ifc-validator.html     dist/pages/ids-ifc-validator.html
node tests/run-tests.js
```
Expected: 477 tests still passing (no behavioural changes from this task).

- [ ] **Step 6: Verify CLS is still ≤ 0.05 on the validator page**

```bash
node tests/cls-debug.js /pages/ids-ifc-validator.html
```
Expected: `Total CLS (no-input shifts):` reports 0.05 or less. The newly-inserted static panel adds ~80 px of height to initial paint but does not move on load.

- [ ] **Step 7: Commit**

```bash
git add assets/js/common/translations.js dist/assets/js/common/translations.js \
        assets/css/ids-validator.css     dist/assets/css/ids-validator.css \
        pages/ids-ifc-validator.html     dist/pages/ids-ifc-validator.html
git commit -m "feat(presets): static panel HTML + CSS + translation keys"
```

---

### Task 9: Validator integration — wire dropdown, extend group shape, debounced save

**Goal:** The presets panel is functional for **populating the dropdown** and **debouncing last-session writes** on every group mutation. Save/Load/Delete handlers come in Task 10. This task also extends `addValidationGroup()` to initialise the new missing-* fields.

**Files:**
- Modify: `assets/js/validator.js` + dist mirror

- [ ] **Step 1: Extend `addValidationGroup()` with missing fields**

In `assets/js/validator.js`, locate `function addValidationGroup()` (around line 1313). Replace:

```js
function addValidationGroup() {
    validationGroups.push({
        id: Date.now(),
        ifcFiles: [],
        idsFile: null
    });
    renderValidationGroups();
}
```

with:

```js
function addValidationGroup() {
    validationGroups.push({
        id: Date.now(),
        ifcFiles: [],
        idsFile: null,
        missingIfcNames: [],
        missingIdsName: null
    });
    renderValidationGroups();
}
```

- [ ] **Step 2: Add `_repopulatePresetSelect()` helper**

Append after the `addValidationGroup` function (or near the end of the file, before the `window.addValidationGroup = ...` exports block):

```js
function _repopulatePresetSelect() {
    const select = document.getElementById('presetSelect');
    if (!select) return;
    const previous = select.value;
    const presets = ValidationPresets.list().sort((a, b) => b.updatedAt - a.updatedAt);
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.setAttribute('data-i18n', 'presets.placeholder');
    placeholder.textContent = t('presets.placeholder');
    select.appendChild(placeholder);
    for (const p of presets) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    }
    if (previous && presets.some(p => p.id === previous)) {
        select.value = previous;
    }
    _updatePresetButtonState();
}

function _updatePresetButtonState() {
    const select = document.getElementById('presetSelect');
    const loadBtn = document.getElementById('loadPresetBtn');
    const deleteBtn = document.getElementById('deletePresetBtn');
    if (!select || !loadBtn || !deleteBtn) return;
    const hasSelection = select.value !== '';
    loadBtn.disabled = !hasSelection;
    deleteBtn.disabled = !hasSelection;
}
```

- [ ] **Step 3: Hook last-session save into `renderValidationGroups`**

Locate `function renderValidationGroups()` (around line 1336). At the very end of the function, just before its closing `}`, add:

```js
    if (typeof ValidationPresets !== 'undefined') {
        ValidationPresets.saveLastSession(ValidationPresets.toPresetGroups(validationGroups));
    }
```

- [ ] **Step 4: Wire panel events on DOMContentLoaded**

Locate the existing DOMContentLoaded handler (around line 2660):

```js
document.addEventListener('DOMContentLoaded', () => {
    renderValidationGroups();
    updateValidateButton();
});
```

Replace with:

```js
document.addEventListener('DOMContentLoaded', () => {
    renderValidationGroups();
    updateValidateButton();

    // Phase 6: presets panel
    _repopulatePresetSelect();
    const select = document.getElementById('presetSelect');
    if (select) {
        select.addEventListener('change', _updatePresetButtonState);
    }
});

window.addEventListener('beforeunload', () => {
    if (typeof ValidationPresets !== 'undefined') {
        ValidationPresets.flushLastSession();
    }
});
```

- [ ] **Step 5: Add the validation-presets script tag to the validator HTML**

In `pages/ids-ifc-validator.html`, in the script-tag block near the bottom, after `<script src="../assets/js/common/ifc-parser-core.js"></script>` (around line 264), add:

```html
    <script src="../assets/js/common/validation-presets.js"></script>
```

- [ ] **Step 6: Mirror to dist + run tests**

```bash
cp assets/js/validator.js          dist/assets/js/validator.js
cp pages/ids-ifc-validator.html    dist/pages/ids-ifc-validator.html
node tests/run-tests.js
```
Expected: 477 tests passing.

- [ ] **Step 7: Manual smoke-test in headless browser**

```bash
node -e "
const puppeteer = require('puppeteer');
const { createServer } = require('http');
const { readFileSync, existsSync } = require('fs');
const { join, extname } = require('path');
const root = process.cwd();
const mt = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const srv = createServer((req, res) => {
    const fp = join(root, req.url === '/' ? 'index.html' : req.url).split('?')[0];
    if (!existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mt[extname(fp)] || 'application/octet-stream' });
    res.end(readFileSync(fp));
});
srv.listen(8767, async () => {
    const browser = await puppeteer.launch({ headless: true, executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:8767/pages/ids-ifc-validator.html', { waitUntil: 'networkidle0' });
    const probe = await page.evaluate(() => ({
        panelExists: !!document.getElementById('presetsPanel'),
        selectExists: !!document.getElementById('presetSelect'),
        loadDisabled: document.getElementById('loadPresetBtn').disabled,
        deleteDisabled: document.getElementById('deletePresetBtn').disabled,
        saveExists: !!document.getElementById('savePresetBtn'),
        moduleLoaded: typeof window.ValidationPresets === 'object'
    }));
    console.log(probe);
    await browser.close();
    srv.close();
});
"
```
Expected output: `{ panelExists: true, selectExists: true, loadDisabled: true, deleteDisabled: true, saveExists: true, moduleLoaded: true }`.

- [ ] **Step 8: Commit**

```bash
git add assets/js/validator.js dist/assets/js/validator.js \
        pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
git commit -m "feat(presets): wire panel population + debounced last-session save"
```

---

### Task 10: Save modal + Save handler

**Goal:** Clicking "Uložit jako" opens a modal, accepts a name, validates, handles overwrite, saves, refreshes dropdown, toasts feedback.

**Files:**
- Modify: `assets/js/validator.js` + dist mirror

- [ ] **Step 1: Implement the save modal injection helper**

Append to `assets/js/validator.js`, before the `window.addValidationGroup = ...` exports block:

```js
function _ensureSavePresetModal() {
    if (document.getElementById('savePresetModal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div id="savePresetModal" class="modal-overlay">
            <div class="modal-container" style="max-width: 420px;">
                <div class="modal-header">
                    <h2 data-i18n="presets.saveModal.title">Uložit preset</h2>
                    <button class="modal-close" id="savePresetModalClose">&times;</button>
                </div>
                <div class="modal-body">
                    <input type="text" id="savePresetNameInput" maxlength="80"
                           class="filter-input" style="width:100%; padding:10px 12px; font-size:1em;"
                           data-i18n-placeholder="presets.saveModal.namePlaceholder">
                    <div id="savePresetError" style="color: var(--danger,#dc2626); font-size: 0.9em; margin-top: 8px; display:none;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="savePresetCancel" data-i18n="presets.saveModal.cancel">Zrušit</button>
                    <button class="btn btn-primary" id="savePresetConfirm" data-i18n="presets.saveModal.save">Uložit</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper.firstElementChild);
    if (typeof i18n !== 'undefined' && typeof i18n.translateElement === 'function') {
        i18n.translateElement(document.getElementById('savePresetModal'));
    }
    const modal = document.getElementById('savePresetModal');
    const input = document.getElementById('savePresetNameInput');
    const errEl = document.getElementById('savePresetError');
    const close = () => modal.classList.remove('active');
    document.getElementById('savePresetModalClose').addEventListener('click', close);
    document.getElementById('savePresetCancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target.id === 'savePresetModal') close(); });
    document.getElementById('savePresetConfirm').addEventListener('click', _confirmSavePreset);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _confirmSavePreset();
        else if (e.key === 'Escape') close();
        errEl.style.display = 'none';
    });
}

function _openSavePresetModal() {
    if (validationGroups.length === 0) {
        ErrorHandler.warning(t('presets.empty'));
        return;
    }
    _ensureSavePresetModal();
    const modal = document.getElementById('savePresetModal');
    const input = document.getElementById('savePresetNameInput');
    const errEl = document.getElementById('savePresetError');
    errEl.style.display = 'none';
    const select = document.getElementById('presetSelect');
    const currentPreset = select && select.value ? ValidationPresets.get(select.value) : null;
    input.value = currentPreset ? currentPreset.name : '';
    modal.classList.add('active');
    setTimeout(() => input.focus(), 50);
}

function _confirmSavePreset() {
    const input = document.getElementById('savePresetNameInput');
    const errEl = document.getElementById('savePresetError');
    const name = input.value.trim();
    if (name.length === 0) {
        errEl.textContent = t('presets.saveModal.namePlaceholder');
        errEl.style.display = 'block';
        return;
    }
    const existing = ValidationPresets.list().find(p => p.name === name);
    if (existing) {
        const msg = t('presets.saveModal.overwriteConfirm').replace('{name}', name);
        if (!confirm(msg)) return;
    }
    const id = ValidationPresets.save(name, ValidationPresets.toPresetGroups(validationGroups));
    document.getElementById('savePresetModal').classList.remove('active');
    _repopulatePresetSelect();
    const select = document.getElementById('presetSelect');
    if (select) { select.value = id; _updatePresetButtonState(); }
    ErrorHandler.success(t('presets.saved').replace('{name}', name));
}
```

- [ ] **Step 2: Wire the save button**

In the DOMContentLoaded handler (added in Task 9), inside the `if (select)` block, add:

```js
        const saveBtn = document.getElementById('savePresetBtn');
        if (saveBtn) saveBtn.addEventListener('click', _openSavePresetModal);
```

- [ ] **Step 3: Mirror to dist + run tests**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
node tests/run-tests.js
```
Expected: 477 tests passing.

- [ ] **Step 4: Manual smoke-test save flow**

```bash
node -e "
const puppeteer = require('puppeteer');
const { createServer } = require('http');
const { readFileSync, existsSync } = require('fs');
const { join, extname } = require('path');
const mt = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const srv = createServer((req, res) => {
    const fp = join(process.cwd(), req.url === '/' ? 'index.html' : req.url).split('?')[0];
    if (!existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mt[extname(fp)] || 'application/octet-stream' });
    res.end(readFileSync(fp));
});
srv.listen(8767, async () => {
    const browser = await puppeteer.launch({ headless: true, executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('dialog', d => d.accept());
    await page.goto('http://localhost:8767/pages/ids-ifc-validator.html', { waitUntil: 'networkidle0' });
    // Add a group with no files (Save will reject), then add one with a phantom group
    await page.evaluate(() => {
        addValidationGroup();
        validationGroups[0].ifcFiles = [{ id: 'x', name: 'phantom.ifc', size: 1, content: 'X' }];
        renderValidationGroups();
    });
    // Open modal, enter name, click save
    await page.click('#savePresetBtn');
    await new Promise(r => setTimeout(r, 100));
    await page.type('#savePresetNameInput', 'Test Preset');
    await page.click('#savePresetConfirm');
    await new Promise(r => setTimeout(r, 200));
    const result = await page.evaluate(() => ({
        modalClosed: !document.getElementById('savePresetModal').classList.contains('active'),
        presetCount: ValidationPresets.list().length,
        firstPresetName: ValidationPresets.list()[0].name
    }));
    console.log(result);
    await browser.close();
    srv.close();
});
"
```
Expected: `{ modalClosed: true, presetCount: 1, firstPresetName: 'Test Preset' }`.

- [ ] **Step 5: Commit**

```bash
git add assets/js/validator.js dist/assets/js/validator.js
git commit -m "feat(presets): save modal + Save-as handler with overwrite confirm"
```

---

### Task 11: Load handler + Delete handler

**Goal:** "Načíst" hydrates the selected preset (with confirmation if current is non-empty); "Smazat" deletes (with confirmation).

**Files:**
- Modify: `assets/js/validator.js` + dist mirror

- [ ] **Step 1: Add Load and Delete handlers**

Append to `assets/js/validator.js` near the other preset helpers:

```js
async function _onLoadPresetClick() {
    const select = document.getElementById('presetSelect');
    if (!select || !select.value) return;
    const preset = ValidationPresets.get(select.value);
    if (!preset) return;
    if (validationGroups.length > 0) {
        const msg = t('presets.loadConfirm').replace('{name}', preset.name);
        if (!confirm(msg)) return;
    }
    const hydrated = await ValidationPresets.fromPresetGroups(preset.groups);
    validationGroups.length = 0;
    for (const g of hydrated) validationGroups.push(g);
    renderValidationGroups();
    updateValidateButton();
    const hasMissing = hydrated.some(g =>
        (g.missingIfcNames && g.missingIfcNames.length > 0) || g.missingIdsName);
    const key = hasMissing ? 'presets.loadedWithMissing' : 'presets.loaded';
    if (hasMissing) {
        ErrorHandler.warning(t(key).replace('{name}', preset.name));
    } else {
        ErrorHandler.success(t(key).replace('{name}', preset.name));
    }
}

function _onDeletePresetClick() {
    const select = document.getElementById('presetSelect');
    if (!select || !select.value) return;
    const preset = ValidationPresets.get(select.value);
    if (!preset) return;
    const msg = t('presets.deleteConfirm').replace('{name}', preset.name);
    if (!confirm(msg)) return;
    const name = preset.name;
    ValidationPresets.delete(preset.id);
    _repopulatePresetSelect();
    select.value = '';
    _updatePresetButtonState();
    ErrorHandler.success(t('presets.deleted').replace('{name}', name));
}
```

- [ ] **Step 2: Wire the Load and Delete buttons**

In the DOMContentLoaded handler, inside the `if (select)` block (next to the saveBtn wiring from Task 10), add:

```js
        const loadBtn = document.getElementById('loadPresetBtn');
        if (loadBtn) loadBtn.addEventListener('click', _onLoadPresetClick);
        const deleteBtn = document.getElementById('deletePresetBtn');
        if (deleteBtn) deleteBtn.addEventListener('click', _onDeletePresetClick);
```

- [ ] **Step 3: Mirror to dist + run tests**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
node tests/run-tests.js
```

- [ ] **Step 4: Commit**

```bash
git add assets/js/validator.js dist/assets/js/validator.js
git commit -m "feat(presets): load + delete handlers with confirm dialogs"
```

---

### Task 12: Auto-restore last session on page load + CLS mitigation

**Goal:** When the page loads and a non-empty last session exists in localStorage, hydrate from BIMStorage and replace the empty state. A small `min-height` reservation on `#validationGroups` keeps CLS near zero during the async hydration window.

**Files:**
- Modify: `assets/js/validator.js` + dist mirror

- [ ] **Step 1: Replace the DOMContentLoaded handler with the restore-aware version**

Locate the existing DOMContentLoaded handler (modified in Tasks 9 and 10). Replace its body with this complete version:

```js
document.addEventListener('DOMContentLoaded', async () => {
    // Phase 6: presets panel wiring (synchronous)
    _repopulatePresetSelect();
    const select = document.getElementById('presetSelect');
    if (select) {
        select.addEventListener('change', _updatePresetButtonState);
        const saveBtn = document.getElementById('savePresetBtn');
        if (saveBtn) saveBtn.addEventListener('click', _openSavePresetModal);
        const loadBtn = document.getElementById('loadPresetBtn');
        if (loadBtn) loadBtn.addEventListener('click', _onLoadPresetClick);
        const deleteBtn = document.getElementById('deletePresetBtn');
        if (deleteBtn) deleteBtn.addEventListener('click', _onDeletePresetClick);
    }

    // Initial render shows static empty-state (zero CLS)
    renderValidationGroups();
    updateValidateButton();

    // Phase 6: auto-restore last session (async)
    if (typeof ValidationPresets !== 'undefined') {
        const last = ValidationPresets.loadLastSession();
        if (last && Array.isArray(last.groups) && last.groups.length > 0) {
            // Reserve approximate vertical space to avoid CLS during hydration
            const groupsContainer = document.getElementById('validationGroups');
            if (groupsContainer) {
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
    }
});
```

- [ ] **Step 2: Mirror to dist + run tests**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
node tests/run-tests.js
```

- [ ] **Step 3: Verify CLS still ≤ 0.05**

```bash
node tests/cls-debug.js /pages/ids-ifc-validator.html
```
Expected: `Total CLS (no-input shifts):` 0.05 or less. If it exceeds 0.05, increase the per-group height estimate from 160 to a value that better matches the actual rendered group height; document the change in the commit message.

- [ ] **Step 4: Manual smoke-test auto-restore**

```bash
node -e "
const puppeteer = require('puppeteer');
const { createServer } = require('http');
const { readFileSync, existsSync } = require('fs');
const { join, extname } = require('path');
const mt = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const srv = createServer((req, res) => {
    const fp = join(process.cwd(), req.url === '/' ? 'index.html' : req.url).split('?')[0];
    if (!existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mt[extname(fp)] || 'application/octet-stream' });
    res.end(readFileSync(fp));
});
srv.listen(8767, async () => {
    const browser = await puppeteer.launch({ headless: true, executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:8767/pages/ids-ifc-validator.html', { waitUntil: 'networkidle0' });
    // Seed last-session with one group
    await page.evaluate(() => {
        ValidationPresets.saveLastSession([{ ifcFileNames: ['nonexistent.ifc'], idsFileName: null }]);
        ValidationPresets.flushLastSession();
    });
    // Reload — auto-restore should kick in
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    const result = await page.evaluate(() => ({
        groupCount: validationGroups.length,
        firstGroupMissing: validationGroups[0] ? validationGroups[0].missingIfcNames : null
    }));
    console.log(result);
    await browser.close();
    srv.close();
});
"
```
Expected: `{ groupCount: 1, firstGroupMissing: ['nonexistent.ifc'] }`.

- [ ] **Step 5: Commit**

```bash
git add assets/js/validator.js dist/assets/js/validator.js
git commit -m "feat(presets): auto-restore last session on page load with CLS mitigation"
```

---

### Task 13: Missing-pill rendering + auto-resolve on file add

**Goal:** When a group has unresolved file references, render dashed warning pills next to real ones. When the user uploads a file with a name matching a missing slot, the slot resolves automatically.

**Files:**
- Modify: `assets/js/validator.js` + dist mirror

- [ ] **Step 1: Find the IFC files-list rendering section**

In `assets/js/validator.js`, in `renderValidationGroups()`, locate where IFC files are rendered into `ifcFilesList` (around line 1414-1450). The existing code iterates `group.ifcFiles` and creates pills. We need to extend this to also render `group.missingIfcNames`.

Identify the loop body that creates a pill for a file. After that loop completes, add a missing-pill loop. Find the block that looks like:

```js
        if (group.ifcFiles.length === 0) {
            const noFilesP = document.createElement('p');
            // ...
            ifcFilesList.appendChild(noFilesP);
        } else {
            group.ifcFiles.forEach(file => {
                // ... build pill ...
            });
        }
```

Replace with:

```js
        if (group.ifcFiles.length === 0 && (!group.missingIfcNames || group.missingIfcNames.length === 0)) {
            const noFilesP = document.createElement('p');
            noFilesP.style.cssText = 'color: #a0aec0; text-align: center; padding: 20px;';
            noFilesP.textContent = t('validator.group.noFiles');
            ifcFilesList.appendChild(noFilesP);
        } else {
            group.ifcFiles.forEach(file => {
                // ... existing pill-building code stays the same ...
            });
            // Phase 6: render missing-file pills
            (group.missingIfcNames || []).forEach(name => {
                const pill = document.createElement('div');
                pill.className = 'file-item file-pill--missing';
                pill.textContent = name;
                const note = document.createElement('span');
                note.className = 'file-pill__missing-note';
                note.textContent = t('presets.fileMissing');
                pill.appendChild(note);
                ifcFilesList.appendChild(pill);
            });
        }
```

(Where `// ... existing pill-building code stays the same ...` means: leave the file-pill creation logic as it currently is — only the empty-state condition and the missing-pill loop are new.)

- [ ] **Step 2: Same treatment for IDS section**

In the same `renderValidationGroups()`, find the IDS file rendering block. It probably has shape like `if (group.idsFile) { ...render pill... } else { ...empty state... }`. Replace with:

```js
        if (group.idsFile) {
            // ... existing IDS pill rendering ...
        } else if (group.missingIdsName) {
            const pill = document.createElement('div');
            pill.className = 'file-item file-pill--missing';
            pill.textContent = group.missingIdsName;
            const note = document.createElement('span');
            note.className = 'file-pill__missing-note';
            note.textContent = t('presets.fileMissing');
            pill.appendChild(note);
            idsFilesList.appendChild(pill);   // confirm the existing variable name
        } else {
            // ... existing empty state ...
        }
```

(Read the current code to confirm the IDS files-list variable name; the existing flow likely uses `idsFilesList` or similar.)

- [ ] **Step 3: Auto-resolve in `handleIfcDrop`**

Locate `async function handleIfcDrop(files, groupIndex)` (around line 1609). After the `for (const file of ifcFiles)` loop body where files are pushed into `group.ifcFiles`, immediately after `group.ifcFiles.push({ ... })`, add a missing-resolve check. Replace:

```js
    for (const file of ifcFiles) {
        const content = await readFileAsText(file);
        group.ifcFiles.push({
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            content: content
        });
    }
```

with:

```js
    for (const file of ifcFiles) {
        const content = await readFileAsText(file);
        group.ifcFiles.push({
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            content: content
        });
        if (group.missingIfcNames && group.missingIfcNames.includes(file.name)) {
            group.missingIfcNames = group.missingIfcNames.filter(n => n !== file.name);
        }
    }
```

- [ ] **Step 4: Auto-resolve in `handleIdsDrop`**

Locate `async function handleIdsDrop(files, groupIndex)` (around line 1637). Find the `group.idsFile = { ... }` assignment. Immediately after it, add:

```js
    if (group.missingIdsName === file.name) {
        group.missingIdsName = null;
    }
```

- [ ] **Step 5: Auto-resolve in storage-picker confirmation paths**

Locate `async function confirmIfcSelection()`. Find the line `validationGroups[currentGroupIndex].ifcFiles = files;`. Replace with:

```js
            const targetGroup = validationGroups[currentGroupIndex];
            targetGroup.ifcFiles = files;
            if (targetGroup.missingIfcNames && targetGroup.missingIfcNames.length > 0) {
                const newNames = new Set(files.map(f => f.name));
                targetGroup.missingIfcNames = targetGroup.missingIfcNames.filter(n => !newNames.has(n));
            }
```

For the IDS storage picker, locate the equivalent function (search `confirmIdsSelection` or `selectIdsFile`) and after the `idsFile` assignment, add:

```js
        if (group.missingIdsName === group.idsFile.name) {
            group.missingIdsName = null;
        }
```

- [ ] **Step 6: Mirror to dist + run tests**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
node tests/run-tests.js
```
Expected: 477 tests still passing (no behavioural change to existing tests).

- [ ] **Step 7: Manual smoke-test missing-pill rendering**

```bash
node -e "
const puppeteer = require('puppeteer');
const { createServer } = require('http');
const { readFileSync, existsSync } = require('fs');
const { join, extname } = require('path');
const mt = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const srv = createServer((req, res) => {
    const fp = join(process.cwd(), req.url === '/' ? 'index.html' : req.url).split('?')[0];
    if (!existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mt[extname(fp)] || 'application/octet-stream' });
    res.end(readFileSync(fp));
});
srv.listen(8767, async () => {
    const browser = await puppeteer.launch({ headless: true, executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:8767/pages/ids-ifc-validator.html', { waitUntil: 'networkidle0' });
    const result = await page.evaluate(() => {
        addValidationGroup();
        const g = validationGroups[0];
        g.missingIfcNames = ['lost.ifc', 'gone.ifc'];
        g.missingIdsName = 'broken.ids';
        renderValidationGroups();
        return {
            missingPills: document.querySelectorAll('.file-pill--missing').length,
            firstPillText: document.querySelector('.file-pill--missing').textContent
        };
    });
    console.log(result);
    await browser.close();
    srv.close();
});
"
```
Expected: `{ missingPills: 3, firstPillText: 'lost.ifc(chybí v úložišti)' }` (text concatenated, that's correct).

- [ ] **Step 8: Commit**

```bash
git add assets/js/validator.js dist/assets/js/validator.js
git commit -m "feat(presets): missing-file pills + auto-resolve on file add"
```

---

### Task 14: Integration tests

**Goal:** End-to-end coverage for the full save → reload → restore flow and missing-file UX.

**Files:**
- Create: `tests/test-suites/validation-presets-integration.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create the integration test suite**

`tests/test-suites/validation-presets-integration.test.js`:
```js
describe('ValidationPresets integration — full save/load roundtrip', () => {
    async function clearAll() {
        localStorage.removeItem('bim_validation_presets');
        localStorage.removeItem('bim_validation_last_session');
        await BIMStorage.init();
        const ifcFiles = await BIMStorage.getFiles('ifc');
        for (const f of ifcFiles) await BIMStorage.ifcStorage.deleteFile(f.id);
        const idsFiles = await BIMStorage.getFiles('ids');
        for (const f of idsFiles) await BIMStorage.idsStorage.deleteFile(f.id);
    }

    function makeFile(name, content) {
        return new File([content], name, { type: 'text/plain' });
    }

    beforeEach(async () => { await clearAll(); });

    it('save preset from filenames, reload via fromPresetGroups, content matches', async () => {
        await BIMStorage.saveFile('ifc', makeFile('roundtrip.ifc', 'IFC-DATA'));
        await BIMStorage.saveFile('ids', makeFile('roundtrip.ids', '<ids/>'));

        const id = ValidationPresets.save('Roundtrip', [
            { ifcFileNames: ['roundtrip.ifc'], idsFileName: 'roundtrip.ids' }
        ]);
        const preset = ValidationPresets.get(id);
        const hydrated = await ValidationPresets.fromPresetGroups(preset.groups);
        expect(hydrated.length).toBe(1);
        expect(hydrated[0].ifcFiles[0].content).toBe('IFC-DATA');
        expect(hydrated[0].idsFile.content).toBe('<ids/>');
    });

    it('saving preset that references resolved files survives a list-reload', async () => {
        await BIMStorage.saveFile('ifc', makeFile('keep.ifc', 'X'));
        const presetGroups = ValidationPresets.toPresetGroups([{
            id: 1,
            ifcFiles: [{ id: 'mem1', name: 'keep.ifc', size: 1, content: 'X' }],
            idsFile: null,
            missingIfcNames: [],
            missingIdsName: null
        }]);
        ValidationPresets.save('SurvivorTest', presetGroups);
        const list = ValidationPresets.list();
        expect(list.length).toBe(1);
        expect(list[0].groups[0].ifcFileNames[0]).toBe('keep.ifc');
    });

    it('saving preset that has unresolved missing names preserves them', () => {
        const presetGroups = ValidationPresets.toPresetGroups([{
            id: 1,
            ifcFiles: [{ id: 'mem1', name: 'real.ifc', size: 1, content: 'X' }],
            idsFile: null,
            missingIfcNames: ['ghost.ifc'],
            missingIdsName: 'ghost.ids'
        }]);
        ValidationPresets.save('WithMissing', presetGroups);
        const reloaded = ValidationPresets.list()[0];
        expect(reloaded.groups[0].ifcFileNames.sort().join(',')).toBe('ghost.ifc,real.ifc');
        expect(reloaded.groups[0].idsFileName).toBe('ghost.ids');
    });

    it('last-session save followed by flush is loadable as in-memory state', async () => {
        await BIMStorage.saveFile('ifc', makeFile('session.ifc', 'S'));
        ValidationPresets.saveLastSession([
            { ifcFileNames: ['session.ifc'], idsFileName: null }
        ]);
        ValidationPresets.flushLastSession();
        const last = ValidationPresets.loadLastSession();
        expect(last).not.toBe(null);
        const hydrated = await ValidationPresets.fromPresetGroups(last.groups);
        expect(hydrated[0].ifcFiles[0].name).toBe('session.ifc');
        expect(hydrated[0].ifcFiles[0].content).toBe('S');
    });

    it('resolves a missing slot when a file with that name is added to BIMStorage and re-hydrated', async () => {
        // First load: file is missing
        const before = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: ['lazy.ifc'], idsFileName: null }
        ]);
        expect(before[0].missingIfcNames[0]).toBe('lazy.ifc');
        // Now add the file and re-hydrate
        await BIMStorage.saveFile('ifc', makeFile('lazy.ifc', 'NOW-EXISTS'));
        const after = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: ['lazy.ifc'], idsFileName: null }
        ]);
        expect(after[0].missingIfcNames.length).toBe(0);
        expect(after[0].ifcFiles[0].content).toBe('NOW-EXISTS');
    });
});
```

- [ ] **Step 2: Register the new suite in test-runner.html**

In `tests/test-runner.html`, after the `validation-presets.test.js` line, add:

```html
    <script src="test-suites/validation-presets-integration.test.js"></script>
```

- [ ] **Step 3: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: 482 tests, all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/test-suites/validation-presets-integration.test.js tests/test-runner.html
git commit -m "test(presets): integration tests — full roundtrip + missing-resolve"
```

---

### Task 15: PWA cache + sw.js bump + PLAN/CHANGELOG

**Goal:** Final wiring so the new module ships, existing PWA installs pick up the update, and project docs reflect the new feature.

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add validation-presets.js to ASSETS_TO_CACHE**

In `sw.js`, find the `ASSETS_TO_CACHE` array. Locate the line containing `'./assets/js/common/ifc-parser-core.js'` and add right after it:

```js
    './assets/js/common/validation-presets.js',
```

- [ ] **Step 2: Bump CACHE_VERSION**

In `sw.js` line 1, change:
```js
const CACHE_VERSION = 'bim-checker-v12';
```
to:
```js
const CACHE_VERSION = 'bim-checker-v13';
```

- [ ] **Step 3: Mirror to dist**

```bash
cp sw.js dist/sw.js
```

- [ ] **Step 4: Update PLAN.md**

In `PLAN.md`, after the "CLS hotfix" block (around line 81), add a new entry before the `---` divider:

```markdown
### Validation Presety (Phase 6, 2026-05-09)
- [x] `ValidationPresets` modul (localStorage CRUD + debounced last-session)
- [x] Pojmenované presety: save / load / delete + překryv konfirmace
- [x] Auto-restore last session na DOMContentLoaded (s CLS mitigací přes minHeight)
- [x] Reference podle jména souboru (verzování zadarmo via BIMStorage dedup)
- [x] Missing-file pily se ⚠️ markrem; auto-resolve při dodání souboru
- [x] +20 unit testů + 5 integračních testů
```

- [ ] **Step 5: Update CHANGELOG.md**

In `CHANGELOG.md`, insert a new entry above `## [0.2.5]`:

```markdown
## [0.2.6] — 2026-05-09

### Added
- Validation presets — validator now persists group configurations as named presets in localStorage. Save/Load/Delete UI in a new panel above validation groups; presets reference files by name so newer file versions are picked up automatically.
- Auto-restore last session — opening the validator restores the most recent group configuration from a debounced last-session slot. CLS impact mitigated via reserved `min-height` during async hydration.
- Missing-file indicator — when a preset references a file that's no longer in IndexedDB storage, the group renders a dashed warning pill. Re-uploading the file (drop or storage picker) resolves the slot automatically.

### Changed
- `assets/js/common/validation-presets.js` (new) — singleton owning preset CRUD, debounced last-session save (500 ms), and BIMStorage-backed hydration.
- In-memory validation group shape extended with `missingIfcNames` and `missingIdsName` fields. Groups created via "Přidat skupinu" initialise these to empty; no regression for existing flows.

### Internal
- 25 new tests (20 unit + 5 integration). Total suite at 502 tests.
```

(Adjust the test count to match the actual final number reported by `node tests/run-tests.js`.)

- [ ] **Step 6: Final test run + CLS check**

```bash
node tests/run-tests.js
node tests/cls-debug.js /pages/ids-ifc-validator.html
```
Expected: all tests pass; validator CLS ≤ 0.05.

- [ ] **Step 7: Commit**

```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(presets): cache bump v12->v13 + PLAN/CHANGELOG entries"
```

- [ ] **Step 8: Push the branch**

```bash
git push -u origin phase-6-validation-presets
```

After this commit, all Phase 6 tasks are done. Merge to master with `--no-ff` follows the same pattern as Phases 1–5 and the CLS hotfix; that step is owned by the human reviewing the branch, not by this plan.
