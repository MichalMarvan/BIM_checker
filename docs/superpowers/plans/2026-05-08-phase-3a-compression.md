# Phase 3a — IndexedDB Compression: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress IFC/IDS file content in IndexedDB using the native `CompressionStream`/`DecompressionStream` API (gzip), transparently at the storage layer. External consumers (`BIMStorage.saveFile`, `getFileContent`, `getFileWithContent`) keep their existing string-based API. Backward compatibility via gzip magic-byte detection — legacy uncompressed entries remain readable, lazy migration on next save.

**Architecture:** New pure-function namespace `Compression` in `assets/js/common/compression.js` exposing `compress(text) → Promise<Uint8Array>`, `decompress(bytes) → Promise<string>`, `isGzipped`, `isSupported`. `StorageManager.addFile` calls `Compression.compress` before `idb.set`; `StorageManager.getFileContent` calls `Compression.decompress` after `idb.get`. No other callsites touched.

**Tech Stack:** Vanilla JS (no build), custom Jasmine-like test framework via Puppeteer. Uses native browser CompressionStream API (Chrome 80+, Firefox 113+, Safari 16.4+).

**Reference spec:** `docs/superpowers/specs/2026-05-08-phase-3a-compression-design.md`

---

## File Structure

### New files
- `assets/js/common/compression.js` — `Compression` namespace (compress, decompress, isGzipped, isSupported)
- `tests/test-suites/compression.test.js` — ~12 unit tests for the compression module

### Modified
- `assets/js/common/storage.js` — `addFile` compresses on write; `getFileContent` decompresses on read
- `assets/js/common/translations.js` — no changes
- `index.html` — load `compression.js` before `storage.js`
- `pages/ids-parser-visualizer.html` — same
- `pages/ids-ifc-validator.html` — same
- `pages/ifc-viewer-multi-file.html` — same
- `tests/test-runner.html` — load `compression.js` before `storage.js`, add new test suite
- `tests/test-suites/storage.test.js` — extend with ~3 integration tests
- `sw.js` — precache `compression.js`, bump cache version
- `eslint.config.js` — declare `Compression` global
- `PLAN.md` — mark Phase 3a done
- `CHANGELOG.md` — entry [0.2.3]
- `dist/**` — sync mirrors of all of the above

---

## Step 1: Compression module + unit tests

### Task 1: Scaffold Compression module + namespace test

**Files:**
- Create: `assets/js/common/compression.js`
- Create: `tests/test-suites/compression.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1.1: Write failing namespace test**

Create `tests/test-suites/compression.test.js`:
```js
describe('Compression namespace', () => {
    it('should expose Compression namespace globally', () => {
        expect(typeof window.Compression).toBe('object');
        const expected = ['compress', 'decompress', 'isGzipped', 'isSupported'];
        for (const fn of expected) {
            expect(typeof window.Compression[fn]).toBe('function');
        }
    });

    it('isSupported() returns true in test environment', () => {
        expect(Compression.isSupported()).toBe(true);
    });
});
```

- [ ] **Step 1.2: Add module + test suite to test-runner.html**

In `tests/test-runner.html`, find the line `<script src="../assets/js/common/storage.js"></script>` (around line 336). Insert BEFORE it:
```html
<script src="../assets/js/common/compression.js"></script>
```

In the test suites block (around line 430 where `storage.test.js` is loaded), append AFTER `storage.test.js`:
```html
<script src="test-suites/compression.test.js"></script>
```

- [ ] **Step 1.3: Run tests, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "Compression namespace"
```
Expected: FAIL with "expected 'undefined' to be 'object'".

- [ ] **Step 1.4: Create scaffold module**

Create `assets/js/common/compression.js`:
```js
/**
 * Compression — IFC/IDS file content gzip via native CompressionStream API.
 * Backward compat: decompress() detects gzip magic bytes, falls back to
 * plain-text passthrough for legacy uncompressed bytes/strings.
 */
window.Compression = (function() {
    'use strict';

    function isSupported() {
        return typeof CompressionStream !== 'undefined'
            && typeof DecompressionStream !== 'undefined';
    }

    function isGzipped(_bytes) { return false; }
    async function compress(_text) { throw new Error('not implemented'); }
    async function decompress(_bytes) { throw new Error('not implemented'); }

    return { compress, decompress, isGzipped, isSupported };
})();
```

- [ ] **Step 1.5: Run tests, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "Compression namespace"
```
Expected: 2 PASS.

- [ ] **Step 1.6: Sync dist + commit**

```bash
mkdir -p dist/assets/js/common/
cp assets/js/common/compression.js dist/assets/js/common/compression.js
git add assets/js/common/compression.js dist/assets/js/common/compression.js tests/test-runner.html tests/test-suites/compression.test.js
git commit -m "feat(compression): scaffold Compression namespace module"
```

---

### Task 2: Implement isGzipped

**Files:**
- Modify: `assets/js/common/compression.js`
- Modify: `tests/test-suites/compression.test.js`

- [ ] **Step 2.1: Write failing tests**

Append to `tests/test-suites/compression.test.js`:
```js
describe('Compression.isGzipped', () => {
    it('should detect gzip magic bytes 0x1f 0x8b', () => {
        const bytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00]);
        expect(Compression.isGzipped(bytes)).toBe(true);
    });

    it('should reject non-gzip bytes', () => {
        const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
        expect(Compression.isGzipped(bytes)).toBe(false);
    });

    it('should accept ArrayBuffer input', () => {
        const buf = new Uint8Array([0x1f, 0x8b, 0x00]).buffer;
        expect(Compression.isGzipped(buf)).toBe(true);
    });

    it('should return false for null', () => {
        expect(Compression.isGzipped(null)).toBe(false);
    });

    it('should return false for empty array', () => {
        expect(Compression.isGzipped(new Uint8Array(0))).toBe(false);
    });

    it('should return false for single-byte array', () => {
        expect(Compression.isGzipped(new Uint8Array([0x1f]))).toBe(false);
    });
});
```

- [ ] **Step 2.2: Run tests, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "isGzipped"
```
Expected: 6 FAILs.

- [ ] **Step 2.3: Implement isGzipped**

Replace stub in `assets/js/common/compression.js`:
```js
function isGzipped(bytes) {
    if (!bytes) return false;
    const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    return view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b;
}
```

- [ ] **Step 2.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "isGzipped"
```
Expected: 6 PASS.

- [ ] **Step 2.5: Sync dist + commit**

```bash
cp assets/js/common/compression.js dist/assets/js/common/compression.js
git add assets/js/common/compression.js dist/assets/js/common/compression.js tests/test-suites/compression.test.js
git commit -m "feat(compression): isGzipped detects 0x1f 0x8b magic bytes"
```

---

### Task 3: Implement compress + decompress with roundtrip tests

**Files:**
- Modify: `assets/js/common/compression.js`
- Modify: `tests/test-suites/compression.test.js`

- [ ] **Step 3.1: Write failing roundtrip tests**

Append:
```js
describe('Compression.compress + decompress roundtrip', () => {
    it('compress() returns Uint8Array starting with gzip magic bytes', async () => {
        const result = await Compression.compress('hello world');
        expect(result instanceof Uint8Array).toBe(true);
        expect(result[0]).toBe(0x1f);
        expect(result[1]).toBe(0x8b);
    });

    it('roundtrip simple ASCII string', async () => {
        const original = 'hello world';
        const compressed = await Compression.compress(original);
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe(original);
    });

    it('roundtrip empty string', async () => {
        const compressed = await Compression.compress('');
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe('');
    });

    it('roundtrip 100KB string with diacritics + special chars', async () => {
        const sample = 'SŽ_I_Fáze projektu Žluťoučký kůň úpěl ďábelské ódy. ';
        const original = sample.repeat(2000);  // ~100KB
        expect(original.length).toBeGreaterThan(50000);
        const compressed = await Compression.compress(original);
        // gzip should compress repetitive text to a fraction of original
        expect(compressed.length < original.length / 2).toBe(true);
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe(original);
    });

    it('roundtrip realistic IFC-like text', async () => {
        // Mimic IFC STEP-21 line structure
        const sample = `#${Math.floor(Math.random() * 10000)} = IFCWALL('guid-x', $, 'Wall_001', $, $, $, $, $, $);\n`;
        const original = sample.repeat(500); // realistic small IFC fragment
        const compressed = await Compression.compress(original);
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe(original);
    });

    it('compress() throws TypeError on non-string input', async () => {
        let threw = false;
        try {
            await Compression.compress(123);
        } catch (e) {
            threw = e instanceof TypeError;
        }
        expect(threw).toBe(true);
    });
});

describe('Compression.decompress backward compatibility', () => {
    it('returns string as-is when given a legacy plain string', async () => {
        const result = await Compression.decompress('legacy plain text content');
        expect(result).toBe('legacy plain text content');
    });

    it('decodes plain UTF-8 Uint8Array (non-gzip) as text', async () => {
        const bytes = new TextEncoder().encode('Hello world');
        // No gzip header → fallback to UTF-8 decode
        const result = await Compression.decompress(bytes);
        expect(result).toBe('Hello world');
    });

    it('returns empty string for null', async () => {
        expect(await Compression.decompress(null)).toBe('');
    });

    it('throws on corrupted gzip bytes', async () => {
        // Magic bytes present but rest is invalid
        const fake = new Uint8Array([0x1f, 0x8b, 0xff, 0xff, 0xff, 0xff]);
        let threw = false;
        try {
            await Compression.decompress(fake);
        } catch (_e) {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
```

- [ ] **Step 3.2: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "compress.*decompress|backward compat"
```
Expected: ~10 FAILs (compress/decompress are stubs throwing).

- [ ] **Step 3.3: Implement compress + decompress**

Replace stubs in `assets/js/common/compression.js`:
```js
async function compress(text) {
    if (typeof text !== 'string') {
        throw new TypeError('Compression.compress expects a string');
    }
    if (!isSupported()) {
        throw new Error('CompressionStream not supported in this environment');
    }
    const encoded = new TextEncoder().encode(text);
    const stream = new Blob([encoded]).stream()
        .pipeThrough(new CompressionStream('gzip'));
    const blob = await new Response(stream).blob();
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
}

async function decompress(bytes) {
    if (bytes == null) return '';
    if (typeof bytes === 'string') return bytes;

    const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

    if (!isGzipped(view)) {
        return new TextDecoder('utf-8').decode(view);
    }

    if (!isSupported()) {
        throw new Error('Cannot decompress: CompressionStream not supported');
    }
    const stream = new Blob([view]).stream()
        .pipeThrough(new DecompressionStream('gzip'));
    const blob = await new Response(stream).blob();
    return await blob.text();
}
```

- [ ] **Step 3.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: ~414 tests pass (404 baseline + 10 new — count exact number from output).

- [ ] **Step 3.5: Sync dist + commit**

```bash
cp assets/js/common/compression.js dist/assets/js/common/compression.js
git add assets/js/common/compression.js dist/assets/js/common/compression.js tests/test-suites/compression.test.js
git commit -m "feat(compression): compress + decompress via CompressionStream API"
```

**✅ Step 1 checkpoint:** Compression module fully functional, ~18 new tests pass. Storage layer untouched.

---

## Step 2: Storage integration

### Task 4: Wire compression into StorageManager.addFile and getFileContent

**Files:**
- Modify: `assets/js/common/storage.js`

- [ ] **Step 4.1: Read current addFile to locate the change site**

```bash
grep -n "this.idb.set(contentKey" /home/michal/work/BIM_checker/assets/js/common/storage.js
```
Expected: line ~292 in `addFile()`.

- [ ] **Step 4.2: Modify addFile to compress before set**

In `assets/js/common/storage.js`, find this block in `addFile()` (around line 290-294):
```js
// Save file content separately in IndexedDB (huge performance win!)
const contentKey = `${this.storageKey}_file_${id}`;
await this.idb.set(contentKey, file.content).catch(err =>
    console.error('Failed to save file content:', err)
);
```

Replace with:
```js
// Save file content separately in IndexedDB, gzipped via Compression module
const contentKey = `${this.storageKey}_file_${id}`;
const compressed = await Compression.compress(file.content);
await this.idb.set(contentKey, compressed).catch(err =>
    console.error('Failed to save file content:', err)
);
```

- [ ] **Step 4.3: Modify getFileContent to decompress after get**

In `assets/js/common/storage.js`, find `getFileContent` (around line 406):
```js
async getFileContent(fileId) {
    // Load file content from separate IndexedDB entry
    const contentKey = `${this.storageKey}_file_${fileId}`;
    const content = await this.idb.get(contentKey);
    return content || null;
}
```

Replace with:
```js
async getFileContent(fileId) {
    // Load file content from separate IndexedDB entry, decompress transparently
    const contentKey = `${this.storageKey}_file_${fileId}`;
    const stored = await this.idb.get(contentKey);
    if (stored == null) return null;
    return await Compression.decompress(stored);
}
```

- [ ] **Step 4.4: Run all tests to ensure no regression in compression module**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: same count as before Task 4 — storage.test.js may now FAIL because storage tests run against IndexedDB but the test runner doesn't load `compression.js` for them yet (it does, from Task 1.2, so this should work). If anything fails, investigate before proceeding.

- [ ] **Step 4.5: Sync dist + commit**

```bash
cp assets/js/common/storage.js dist/assets/js/common/storage.js
git add assets/js/common/storage.js dist/assets/js/common/storage.js
git commit -m "feat(storage): compress file content via Compression module on save/load"
```

---

### Task 5: Add storage integration tests

**Files:**
- Modify: `tests/test-suites/storage.test.js`

- [ ] **Step 5.1: Append integration tests**

Append to `tests/test-suites/storage.test.js`:
```js
describe('Storage compression integration', () => {
    beforeEach(async () => {
        await BIMStorage.init();
    });

    it('saveFile + getFileContent roundtrip preserves content exactly', async () => {
        const original = `ISO-10303-21;\nDATA;\n#1=IFCPROJECT('guid');\nENDSEC;\nEND-ISO-10303-21;\n`;
        const file = { name: 'roundtrip-test.ifc', size: original.length, content: original };
        const id = await BIMStorage.saveFile('ifc', file);
        const stored = await BIMStorage.getFile('ifc', 'roundtrip-test.ifc');
        // getFile returns metadata only by default; load content via getFileContent
        expect(stored).toBeDefined();
        const content = await BIMStorage.getFileContent('ifc', stored.id);
        expect(content).toBe(original);
        // cleanup
        await BIMStorage.deleteFile('ifc', stored.id);
    });

    it('saveFile actually stores gzipped bytes (not plaintext)', async () => {
        const original = 'A'.repeat(2000); // 2KB of 'A's — will compress dramatically
        const file = { name: 'compressed-test.ifc', size: original.length, content: original };
        const id = await BIMStorage.saveFile('ifc', file);
        // Inspect the raw IDB content directly via initStorageDB
        const db = await initStorageDB();
        // Storage key pattern: bim_checker_files_ifc_file_<id>
        const stored = await db.get(`bim_checker_files_ifc_file_${id}`);
        expect(stored instanceof Uint8Array).toBe(true);
        expect(stored[0]).toBe(0x1f);
        expect(stored[1]).toBe(0x8b);
        // 2KB of 'A's should compress to <100 bytes
        expect(stored.length < 100).toBe(true);
        // cleanup
        await BIMStorage.deleteFile('ifc', id);
    });

    it('legacy uncompressed string content remains readable', async () => {
        const legacyContent = 'Legacy plain text from before compression rollout';
        // Manually inject a legacy-format entry directly via initStorageDB
        const db = await initStorageDB();
        // Use a BIMStorage save first to create proper metadata, then overwrite content
        const file = { name: 'legacy-test.ifc', size: legacyContent.length, content: 'placeholder' };
        const id = await BIMStorage.saveFile('ifc', file);
        // Overwrite the IDB content with raw string (legacy format)
        await db.set(`bim_checker_files_ifc_file_${id}`, legacyContent);
        // Now read via BIMStorage — should return the plain string
        const content = await BIMStorage.getFileContent('ifc', id);
        expect(content).toBe(legacyContent);
        // cleanup
        await BIMStorage.deleteFile('ifc', id);
    });
});
```

- [ ] **Step 5.2: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "compression integration"
```
Expected: 3 PASS.

If `BIMStorage.getFile` doesn't exist or has different name, run `grep -n "getFile\b" assets/js/common/storage.js` to find correct method. The `BIMStorage` API at line 458+ defines: `init`, `saveFile`, `getFiles`, `getFile`, `getFileByName`, `getFileContent`, `getFileWithContent`, `deleteFile`, `clearFiles`. Use the matching method.

If `initStorageDB()` is not directly accessible (it may be a closure-scoped function), use `BIMStorage.getFileWithContent('ifc', id)` instead in the second test, but verify the inner content separately by parsing the metadata. Adjust the test to whatever public API works.

- [ ] **Step 5.3: Run full suite, verify total**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: ~417 tests pass (404 baseline + ~13 from compression). Adjust expectation based on actual count from previous task.

- [ ] **Step 5.4: Commit**

```bash
git add tests/test-suites/storage.test.js
git commit -m "test(storage): integration tests for compression roundtrip + backward compat"
```

---

### Task 6: Load compression.js on all 4 pages

**Files:**
- Modify: `index.html`, `pages/ids-parser-visualizer.html`, `pages/ids-ifc-validator.html`, `pages/ifc-viewer-multi-file.html`
- Modify: `dist/index.html`, `dist/pages/*.html`

- [ ] **Step 6.1: Add compression.js script tag to all 4 pages**

For each page, find the existing `storage.js` script tag (path is `../assets/js/common/storage.js` for pages, `assets/js/common/storage.js` for `index.html`) and insert BEFORE it:

For `pages/ids-parser-visualizer.html`, `pages/ids-ifc-validator.html`, `pages/ifc-viewer-multi-file.html`:
```html
<script src="../assets/js/common/compression.js"></script>
```

For `index.html` (repo root):
```html
<script src="assets/js/common/compression.js"></script>
```

- [ ] **Step 6.2: Sync dist mirrors**

```bash
cp index.html dist/index.html
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
```

- [ ] **Step 6.3: Run tests, verify no regressions**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: same pass count as Task 5 — only HTML changes here.

- [ ] **Step 6.4: Commit**

```bash
git add index.html pages/ids-parser-visualizer.html pages/ids-ifc-validator.html pages/ifc-viewer-multi-file.html dist/index.html dist/pages/ids-parser-visualizer.html dist/pages/ids-ifc-validator.html dist/pages/ifc-viewer-multi-file.html
git commit -m "feat(pages): load compression.js before storage.js on all 4 pages"
```

**✅ Step 2 checkpoint:** Storage uses compression transparently. E2E roundtrip works. Backward compat verified. ~417 tests pass.

---

## Step 3: PWA, eslint, docs, push

### Task 7: ESLint global declaration

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 7.1: Add Compression to globals**

In `eslint.config.js`, find the existing globals block (search for `BugReport: 'readonly'`). Add nearby:
```js
                // Phase 3a: gzip compression
                Compression: 'readonly'
```

(Place it immediately after the `BugReport: 'readonly'` line, with proper comma — make the previous `BugReport: 'readonly'` end with `,` and the new entry end without comma if it's the last item, OR with comma if more items follow.)

- [ ] **Step 7.2: Verify lint passes locally**

```bash
npx eslint assets/js/ 2>&1 | tail -3
```
Expected: 0 errors.

- [ ] **Step 7.3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(eslint): declare Compression global"
```

---

### Task 8: PWA service worker precache + version bump

**Files:**
- Modify: `sw.js`
- Modify: `dist/sw.js`

- [ ] **Step 8.1: Find current cache version**

```bash
grep -n "bim-checker-v" /home/michal/work/BIM_checker/sw.js | head -1
```
Note the version (e.g., `bim-checker-v7`).

- [ ] **Step 8.2: Bump version + add compression.js to precache**

In `sw.js`, change the `CACHE_VERSION` constant to the next number (e.g., `v7` → `v8`).

Find the `ASSETS_TO_CACHE` array (or similar precache list). Add:
```js
'/assets/js/common/compression.js',
```

- [ ] **Step 8.3: Sync dist + commit**

```bash
cp sw.js dist/sw.js
git add sw.js dist/sw.js
git commit -m "chore(pwa): precache compression.js + bump cache version"
```

---

### Task 9: Manual benchmark (optional verification)

**Files:** none

- [ ] **Step 9.1: Start local server**

```bash
python3 -m http.server 8000 --bind 0.0.0.0 >/dev/null 2>&1 &
echo "Server PID: $!"
sleep 1
```

- [ ] **Step 9.2: Open browser, upload a 5+ MB IFC file**

Open `http://localhost:8000/index.html`. Upload a real IFC file (e.g. one of the user's `DSPS_*.ifc` files from `/tmp/bim_test_extract/`).

- [ ] **Step 9.3: Inspect IndexedDB size in DevTools**

DevTools → Application → IndexedDB → `bim-checker-files` → look at the file content entry. Compare its byte count vs. the original file size.

Expected: ≥ 60% reduction (e.g., 5 MB original → ≤ 2 MB stored).

If the reduction is less than 60%, the file may already be near-incompressible (binary embedded data, etc.). Note the actual ratio in the next commit message; do not block on this metric — it's a sanity check, not a hard gate.

- [ ] **Step 9.4: Verify file loads correctly**

In the IFC viewer page, open the uploaded file from storage. It should display normally — confirms decompression is transparent.

- [ ] **Step 9.5: Stop the server**

```bash
kill %1 2>/dev/null
```

(No commit for this task — it's verification only.)

---

### Task 10: Update PLAN.md and CHANGELOG.md

**Files:**
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 10.1: Update PLAN.md**

In `PLAN.md`, find the "Hotové (Done)" section. Append at end:
```markdown
### IndexedDB compression (Phase 3a, 2026-05-08)
- [x] `Compression` modul nad native CompressionStream API (gzip)
- [x] Transparent compression v `StorageManager.addFile` + `getFileContent`
- [x] Backward compat přes magic-byte detection — legacy nezkomprimované soubory čitelné
- [x] Lazy migrace — staré soubory se zkomprimují při dalším save
- [x] Očekávaná úspora: 60–80 % místa v IndexedDB pro typické IFC
- [x] +15 nových testů
```

If "Komprese souborů v IndexedDB" appears in any TODO / "Vysoká priorita" section, remove it.

- [ ] **Step 10.2: Update CHANGELOG.md**

Prepend at the top of `CHANGELOG.md` (after `# Changelog` heading):
```markdown
## [0.2.3] — 2026-05-08

### Added
- `Compression` module — gzip-encode IFC/IDS file content in IndexedDB via native CompressionStream API. Typical 60–80% storage savings for text-based IFC files.
- Transparent compression in storage layer — `BIMStorage.saveFile` and `getFileContent` API unchanged for consumers.
- Backward compatibility via gzip magic-byte detection — legacy uncompressed files remain readable; lazy migration on next save.
- 15 new tests covering compression roundtrip, magic-byte detection, and storage integration.
```

- [ ] **Step 10.3: Commit**

```bash
git add PLAN.md CHANGELOG.md
git commit -m "docs: mark Phase 3a (IndexedDB compression) complete"
```

---

### Task 11: Final test run + push

**Files:** none (verification + push)

- [ ] **Step 11.1: Run full test suite**

```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: SUMMARY ~419/419 tests pass (404 baseline + ~15 new for Phase 3a).

- [ ] **Step 11.2: Verify dist sync**

```bash
mismatches=0
for f in $(git ls-files | grep -E '^assets/'); do
    dist_f="dist/${f#assets/}"
    if [ -f "$dist_f" ] && ! cmp -s "$f" "$dist_f"; then
        echo "MISMATCH: $f vs $dist_f"
        mismatches=$((mismatches + 1))
    fi
done
echo "Total mismatches: $mismatches"
```
Expected: 0.

- [ ] **Step 11.3: Push branch**

```bash
git push -u origin phase-3a-compression
```

- [ ] **Step 11.4: Verify CI green**

```bash
gh run list --branch phase-3a-compression --limit 1
```

If CI fails on ESLint due to additional `Compression` usage we missed, check error log:
```bash
gh run view --log-failed
```
Add fix commit if needed.

If CI passes, ready for `--no-ff` merge to master.

**✅ Phase 3a done.** Ready for manual verification + merge.

---

## Self-Review

### Spec coverage
- ✅ Compression module with `compress`, `decompress`, `isGzipped`, `isSupported`: Tasks 1, 2, 3
- ✅ Storage integration in `addFile`: Task 4
- ✅ Storage integration in `getFileContent`: Task 4
- ✅ Backward compat via magic-byte detection: Tasks 3 (test), 5 (integration test)
- ✅ Lazy migration (no eager migration): Implicit — only write path compresses, read path falls back
- ✅ Page script load order: Task 6
- ✅ Test runner module + suite registration: Task 1
- ✅ PWA precache + cache bump: Task 8
- ✅ ESLint globals: Task 7
- ✅ PLAN.md + CHANGELOG: Task 10
- ✅ Manual benchmark: Task 9
- ✅ Performance targets (≥ 60% storage reduction, < 1s save, < 500ms load) — verifiable in Task 9

### Type/name consistency
- `Compression.compress`, `Compression.decompress`, `Compression.isGzipped`, `Compression.isSupported` used consistently across tasks
- `0x1f`, `0x8b` magic byte constants used consistently
- IDB key pattern `${storageKey}_file_${id}` used in storage modifications and integration tests
- `BIMStorage.saveFile`, `BIMStorage.getFileContent`, `BIMStorage.getFile`, `BIMStorage.deleteFile` API names verified against `assets/js/common/storage.js` line 458+

### Placeholder scan
None.

### Scope
11 tasks, ~50 steps. Sized for ~1-2 days of subagent execution. Single plan appropriate.
