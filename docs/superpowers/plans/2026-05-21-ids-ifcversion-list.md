# IDS `ifcVersion` Multi-Version Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse and round-trip `ifcVersion` as the XSD-defined `xs:list`, apply specifications only to IFC files whose schema is in the list (buildingSMART semantics), surface unsupported versions to the user, update editor + parser view + validator Excel report, and fix the latent crash from GitHub issue #21.

**Architecture:** Additive data model — `spec.ifcVersion` remains the canonical space-separated string; `spec.ifcVersions` is a derived array re-computed by the parser on every read. IFC schema is detected via a new `IFCParserCore.detectSchema(content)` helper (no return-shape change to existing `parseIFCContent`). Validator gates spec applicability against the IFC file's schema. Editor uses 3 checkboxes; parser view renders one badge per version.

**Tech Stack:** Vanilla JS (no build step), custom Jasmine-like test framework (`tests/test-framework.js`), Puppeteer headless runner (`node tests/run-tests.js`), xlsx-js for Excel I/O, IDS 1.0 schema.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-21-ids-ifcversion-list-design.md`.

**Branch:** `ids-ifcversion-list` (branched from `master`).

---

## Per-task conventions

- **Test framework:** uses `describe`/`it`/`expect`. Does NOT support `.not` chaining — use `expect(x.includes(y)).toBe(false)` style. Suite names show as "Unknown" in output (cosmetic).
- **Run tests:** `node tests/run-tests.js` for full suite. Single-suite filter is not supported — read the output for your new test names.
- **dist/ mirror:** every source file under `assets/` and `sw.js` has a parallel copy under `dist/`. After each task's source change, sync the changed files to `dist/`.
- **SW cache bump:** the final task increments `CACHE_VERSION` in `sw.js`. Do not bump per-task.
- **Commit cadence:** one commit per task (test + impl + dist mirror together).

---

## Task 1: Parser derives `ifcVersions` array

**Files:**
- Modify: `assets/js/common/ids-parser.js:38-57` (extractSpecifications)
- Modify: `assets/js/common/ids-parser.js` (top of file, add helper)
- Test: `tests/test-suites/ids-parser-unified.test.js` (add new `describe` block)
- Mirror: `dist/assets/js/common/ids-parser.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-suites/ids-parser-unified.test.js`:

```js
describe('IDSParser.extractSpecifications — ifcVersion list', () => {
    function parseSpec(ifcVersionAttr) {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <specifications>
                    <specification name="S1" ifcVersion="${ifcVersionAttr}">
                        <applicability/>
                        <requirements/>
                    </specification>
                </specifications>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        return IDSParser.extractSpecifications(doc)[0];
    }

    it('derives ifcVersions=["IFC4"] from single value', () => {
        const spec = parseSpec('IFC4');
        expect(spec.ifcVersion).toBe('IFC4');
        expect(Array.isArray(spec.ifcVersions)).toBe(true);
        expect(spec.ifcVersions.length).toBe(1);
        expect(spec.ifcVersions[0]).toBe('IFC4');
    });

    it('derives ifcVersions=["IFC4","IFC4X3_ADD2"] from space-separated list', () => {
        const spec = parseSpec('IFC4 IFC4X3_ADD2');
        expect(spec.ifcVersion).toBe('IFC4 IFC4X3_ADD2');
        expect(spec.ifcVersions.length).toBe(2);
        expect(spec.ifcVersions[0]).toBe('IFC4');
        expect(spec.ifcVersions[1]).toBe('IFC4X3_ADD2');
    });

    it('handles multiple internal spaces and tabs', () => {
        const spec = parseSpec('IFC4  \t IFC4X3_ADD2');
        expect(spec.ifcVersions.length).toBe(2);
        expect(spec.ifcVersions[0]).toBe('IFC4');
        expect(spec.ifcVersions[1]).toBe('IFC4X3_ADD2');
    });

    it('returns empty array for missing/empty attribute', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <specifications><specification name="S1"><applicability/><requirements/></specification></specifications>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const spec = IDSParser.extractSpecifications(doc)[0];
        expect(spec.ifcVersion).toBe('');
        expect(Array.isArray(spec.ifcVersions)).toBe(true);
        expect(spec.ifcVersions.length).toBe(0);
    });

    it('keeps unknown values verbatim (parser does not filter)', () => {
        const spec = parseSpec('IFC4X3');
        expect(spec.ifcVersions.length).toBe(1);
        expect(spec.ifcVersions[0]).toBe('IFC4X3');
    });
});

describe('IDSParser.parseIfcVersionList helper', () => {
    it('is exposed on the IDSParser namespace', () => {
        expect(typeof window.IDSParser.parseIfcVersionList).toBe('function');
    });

    it('splits on any whitespace and drops empties', () => {
        expect(IDSParser.parseIfcVersionList('IFC4  IFC4X3_ADD2 ')).toEqual(['IFC4', 'IFC4X3_ADD2']);
    });

    it('returns [] for null/undefined/empty', () => {
        expect(IDSParser.parseIfcVersionList(null).length).toBe(0);
        expect(IDSParser.parseIfcVersionList(undefined).length).toBe(0);
        expect(IDSParser.parseIfcVersionList('').length).toBe(0);
        expect(IDSParser.parseIfcVersionList('   ').length).toBe(0);
    });
});
```

- [ ] **Step 2: Run the tests, expect FAIL**

```bash
node tests/run-tests.js 2>&1 | tail -40
```

Expected: new tests fail because `parseIfcVersionList` doesn't exist and `ifcVersions` is undefined on parsed specs.

- [ ] **Step 3: Implement**

Edit `assets/js/common/ids-parser.js`. Add the helper inside the IIFE (near the top, before `parse`):

```js
function parseIfcVersionList(str) {
    if (!str || typeof str !== 'string') return [];
    return str.trim().split(/\s+/).filter(Boolean);
}
```

Modify `extractSpecifications` at line 38-57 — add the derived `ifcVersions` field:

```js
function extractSpecifications(xmlDoc) {
    const result = [];
    const specEls = xmlDoc.querySelectorAll('specification');
    specEls.forEach((spec, index) => {
        const applicabilityEl = spec.querySelector(':scope > applicability');
        const requirementsEl = spec.querySelector(':scope > requirements');
        const ifcVersion = spec.getAttribute('ifcVersion') || '';
        result.push({
            name: spec.getAttribute('name') || `Specification ${index + 1}`,
            ifcVersion,
            ifcVersions: parseIfcVersionList(ifcVersion),
            identifier: spec.getAttribute('identifier') || '',
            description: spec.getAttribute('description') || '',
            instructions: spec.getAttribute('instructions') || '',
            minOccurs: applicabilityEl?.getAttribute('minOccurs') ?? undefined,
            maxOccurs: applicabilityEl?.getAttribute('maxOccurs') ?? undefined,
            applicability: extractFacets(applicabilityEl),
            requirements: extractFacets(requirementsEl)
        });
    });
    return result;
}
```

Expose the helper in the module's return statement (bottom of IIFE). Find the existing `return {` block and add `parseIfcVersionList,` to the list of exports.

- [ ] **Step 4: Run tests, expect PASS**

```bash
node tests/run-tests.js 2>&1 | grep -E "ifcVersion|parseIfcVersionList|✓|✗|FAIL|pass|fail" | tail -30
```

Expected: all 7 new tests pass; existing tests still pass.

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/common/ids-parser.js dist/assets/js/common/ids-parser.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/common/ids-parser.js dist/assets/js/common/ids-parser.js tests/test-suites/ids-parser-unified.test.js
git commit -m "$(cat <<'EOF'
feat(ids-parser): derive ifcVersions array from xs:list attribute

Per IDS 1.0 XSD, ifcVersion on <specification> is an xs:list. The parser
now exposes both spec.ifcVersion (canonical space-separated string) and
spec.ifcVersions (derived array). New helper IDSParser.parseIfcVersionList
is exported for consumers that need the array immediately after writing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `IFCParserCore.detectSchema` helper

**Files:**
- Modify: `assets/js/common/ifc-parser-core.js` (add `detectSchema` function + expose)
- Test: `tests/test-suites/ifc-parser-core.test.js` (append new `describe` block)
- Mirror: `dist/assets/js/common/ifc-parser-core.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-suites/ifc-parser-core.test.js`:

```js
describe('IFCParserCore.detectSchema', () => {
    it('is exposed', () => {
        expect(typeof window.IFCParserCore.detectSchema).toBe('function');
    });

    it('extracts IFC4 schema from header', () => {
        const content = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [...]'),'2;1');
FILE_NAME('test.ifc','2026-01-01',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
ENDSEC;
END-ISO-10303-21;`;
        expect(IFCParserCore.detectSchema(content)).toBe('IFC4');
    });

    it('extracts IFC4X3_ADD2 schema', () => {
        const content = `HEADER; FILE_SCHEMA(('IFC4X3_ADD2')); ENDSEC;`;
        expect(IFCParserCore.detectSchema(content)).toBe('IFC4X3_ADD2');
    });

    it('extracts IFC2X3 schema', () => {
        const content = `HEADER; FILE_SCHEMA (('IFC2X3')); ENDSEC;`;
        expect(IFCParserCore.detectSchema(content)).toBe('IFC2X3');
    });

    it('returns UNKNOWN when no FILE_SCHEMA present', () => {
        expect(IFCParserCore.detectSchema('HEADER; ENDSEC;')).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for empty/null content', () => {
        expect(IFCParserCore.detectSchema('')).toBe('UNKNOWN');
        expect(IFCParserCore.detectSchema(null)).toBe('UNKNOWN');
        expect(IFCParserCore.detectSchema(undefined)).toBe('UNKNOWN');
    });

    it('tolerates extra whitespace inside parentheses', () => {
        const content = `FILE_SCHEMA  (  (  'IFC4'  )  );`;
        expect(IFCParserCore.detectSchema(content)).toBe('IFC4');
    });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

```bash
node tests/run-tests.js 2>&1 | grep -E "detectSchema|✓|✗" | tail -20
```

Expected: all 7 new tests fail (function undefined).

- [ ] **Step 3: Implement**

Open `assets/js/common/ifc-parser-core.js`. Add the function inside the IIFE, near other helpers (e.g., before `parseIFCContent`):

```js
const SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/;

function detectSchema(content) {
    if (!content || typeof content !== 'string') return 'UNKNOWN';
    const m = content.match(SCHEMA_RE);
    return m ? m[1] : 'UNKNOWN';
}
```

Then expose it. Find the `global.IFCParserCore = { ... }` export block and add `detectSchema,` to the listed members.

- [ ] **Step 4: Run tests, expect PASS**

```bash
node tests/run-tests.js 2>&1 | grep -E "detectSchema|FAIL|passed|failed" | tail -15
```

Expected: 7 new tests pass; existing IFCParserCore tests still pass.

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js tests/test-suites/ifc-parser-core.test.js
git commit -m "$(cat <<'EOF'
feat(ifc-parser): add detectSchema helper for FILE_SCHEMA extraction

Returns the schema string from the IFC HEADER's FILE_SCHEMA(('...'))
directive, or 'UNKNOWN' when absent. Validator will use this to gate
spec applicability against the IFC file's actual schema.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Defensive `r.json()` in `ifc-hierarchy.js`

**Files:**
- Modify: `assets/js/common/ifc-hierarchy.js:32-46` (replace `.then(r => ...)` chain)
- Test: `tests/test-suites/ifc-hierarchy.test.js` (append `describe` block)
- Mirror: `dist/assets/js/common/ifc-hierarchy.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/test-suites/ifc-hierarchy.test.js`:

```js
describe('IFCHierarchy — defensive non-JSON response', () => {
    it('throws a useful error when the hierarchy URL returns HTML', async () => {
        const origFetch = window.fetch;
        window.fetch = () => Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<!DOCTYPE html><html><body>404</body></html>'),
            json: () => Promise.reject(new SyntaxError("Unexpected token '<'"))
        });
        try {
            let err = null;
            try { await IFCHierarchy.load('__nonexistent_version__'); }
            catch (e) { err = e; }
            expect(err !== null).toBe(true);
            // Error message must mention non-JSON and the URL — not just '<!DOCTYPE'
            const msg = String(err && err.message || '');
            expect(msg.includes('non-JSON')).toBe(true);
            expect(msg.includes('__nonexistent_version__')).toBe(true);
        } finally {
            window.fetch = origFetch;
        }
    });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
node tests/run-tests.js 2>&1 | grep -E "non-JSON|defensive|✓|✗" | tail -10
```

Expected: test fails — current `r.json()` lets the raw SyntaxError bubble.

- [ ] **Step 3: Implement**

Open `assets/js/common/ifc-hierarchy.js`. Locate lines 32-46 (the `fetch(dataUrl(version)).then(r => { ... }).then(data => { ... })` chain) and rewrite the first `.then` to text-first parsing:

```js
const promise = fetch(dataUrl(version))
    .then(async r => {
        if (!r.ok) throw new Error(`Failed to load hierarchy for ${version}: HTTP ${r.status}`);
        const text = await r.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error(`Hierarchy fetch returned non-JSON for ${version} (${dataUrl(version)})`);
        }
    })
    .then(data => {
        cache.set(version, {
            classes: data.classes,
            childrenIndex: buildChildrenIndex(data.classes),
            subtypeCache: new Map()
        });
    });
```

Note: keep the existing second `.then` block unchanged.

- [ ] **Step 4: Run test, expect PASS**

```bash
node tests/run-tests.js 2>&1 | grep -E "non-JSON|defensive|FAIL|passed|failed" | tail -10
```

Expected: new test passes; existing IFCHierarchy tests still pass.

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/common/ifc-hierarchy.js dist/assets/js/common/ifc-hierarchy.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/common/ifc-hierarchy.js dist/assets/js/common/ifc-hierarchy.js tests/test-suites/ifc-hierarchy.test.js
git commit -m "$(cat <<'EOF'
fix(ifc-hierarchy): surface clear error when fetch returns non-JSON

Hosting / service-worker fallbacks can return HTML with HTTP 200 for a
missing hierarchy file. Catch the JSON.parse failure and rethrow with a
message naming the URL, instead of letting the raw '<!DOCTYPE'
SyntaxError bubble to the user (GitHub issue #21).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Validator schema-aware spec applicability (validator.js)

**Files:**
- Modify: `assets/js/validator.js` — `parseIFCFile`, `parseIFCFileAsync`, the validate functions (`validateEntitiesAgainstIDS` and `validateEntitiesAgainstIDSAsync`), and the call sites at lines ~313, 342, 2695, 2720.
- Test: `tests/test-suites/tools-validator.test.js` (extend with new `describe`)
- Mirror: `dist/assets/js/validator.js`

This task introduces an `ifcFile.schema` field plumbed from ingestion to validation, and adds the spec-applies-to-this-IFC gate.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-suites/tools-validator.test.js`:

```js
describe('validateEntitiesAgainstIDS — schema-aware applicability', () => {
    const sampleEntities = [
        { id: '1', guid: 'guid-1', entity: 'IFCWALL', name: 'W1', propertySets: {}, fileName: 'a.ifc', attributes: {} }
    ];

    function specWithVersions(versions) {
        return {
            name: 'S1',
            ifcVersion: versions.join(' '),
            ifcVersions: versions,
            applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
            requirements: []
        };
    }

    it('runs validation when IFC schema is in spec.ifcVersions', async () => {
        const spec = specWithVersions(['IFC4']);
        const results = await window.validateEntitiesAgainstIDSAsync(sampleEntities, [spec], { ifcSchema: 'IFC4' });
        expect(results.length).toBe(1);
        expect(results[0].status === 'pass' || results[0].status === 'fail').toBe(true);
    });

    it('skips spec when IFC schema is NOT in spec.ifcVersions', async () => {
        const spec = specWithVersions(['IFC2X3']);
        const results = await window.validateEntitiesAgainstIDSAsync(sampleEntities, [spec], { ifcSchema: 'IFC4' });
        expect(results.length).toBe(1);
        expect(results[0].status).toBe('skipped');
        expect(results[0].skipReason).toBe('ifc-version-mismatch');
    });

    it('uses the IFC file schema (not first list item) for hierarchy load', async () => {
        const spec = specWithVersions(['IFC4', 'IFC4X3_ADD2']);
        const results = await window.validateEntitiesAgainstIDSAsync(sampleEntities, [spec], { ifcSchema: 'IFC4X3_ADD2' });
        expect(results.length).toBe(1);
        expect(results[0].status === 'pass' || results[0].status === 'fail').toBe(true);
        // No hard error; hierarchy load succeeded for IFC4X3_ADD2 (which we ship).
    });

    it('marks spec as error when no declared version is supported (all unknown)', async () => {
        const spec = specWithVersions(['IFC4X3', 'IFC4X3_TC1']);
        const results = await window.validateEntitiesAgainstIDSAsync(sampleEntities, [spec], { ifcSchema: 'IFC4' });
        expect(results.length).toBe(1);
        expect(results[0].status).toBe('error');
        expect(String(results[0].errorMessage || '').includes('IFC4X3')).toBe(true);
    });

    it('warns about unsupported entries when at least one supported (hybrid)', async () => {
        const spec = specWithVersions(['IFC4', 'IFC4X3']);
        const results = await window.validateEntitiesAgainstIDSAsync(sampleEntities, [spec], { ifcSchema: 'IFC4' });
        expect(results.length).toBe(1);
        expect(Array.isArray(results[0].warnings)).toBe(true);
        expect(results[0].warnings.length > 0).toBe(true);
        expect(String(results[0].warnings[0] || '').includes('IFC4X3')).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

```bash
node tests/run-tests.js 2>&1 | grep -E "schema-aware|skipReason|ifc-version-mismatch|✓|✗" | tail -15
```

Expected: all 5 tests fail — the signature does not yet accept an options object and skipped/error/warnings are not produced.

- [ ] **Step 3: Implement — schema plumbing through ingestion**

In `assets/js/validator.js`, modify the IFC ingestion to attach `schema`:

Find `validator.js:2695` (in the async validation orchestration). Currently:

```js
const entities = await parseIFCFileAsync(ifcFile.content, ifcFile.name);
```

Replace with:

```js
const entities = await parseIFCFileAsync(ifcFile.content, ifcFile.name);
const ifcSchema = IFCParserCore.detectSchema(ifcFile.content);
ifcFile.schema = ifcSchema;
```

And find the call site at line ~342 (`specificationResults: validateEntitiesAgainstIDS(ifcFile.entities, idsFile.data.specifications)`). Update both validate call sites to pass an options object containing the schema:

```js
specificationResults: validateEntitiesAgainstIDS(ifcFile.entities, idsFile.data.specifications, { ifcSchema: ifcFile.schema })
```

…and similarly for any `validateEntitiesAgainstIDSAsync` invocation around line ~2720.

For the sync version called at `validator.js:313` path (`parseIFCFile` returns entities only), the schema can be derived at the same line:

```js
const entities = parseIFCFile(content, file.name);
const schema = IFCParserCore.detectSchema(content);
// store both on the file record consistently with the async path
```

- [ ] **Step 4: Implement — applicability gate inside the validate function**

Modify `validateEntitiesAgainstIDS` (sync, ~line 394) and `validateEntitiesAgainstIDSAsync` (async, ~line 443) signatures to accept an options object:

```js
function validateEntitiesAgainstIDS(entities, specifications, options) {
    options = options || {};
    const ifcSchema = options.ifcSchema || 'UNKNOWN';
    const SUPPORTED = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];
    const results = [];
    for (const spec of specifications) {
        const declared = Array.isArray(spec.ifcVersions) ? spec.ifcVersions : [];
        const supported = declared.filter(v => SUPPORTED.includes(v));
        const unsupported = declared.filter(v => !SUPPORTED.includes(v));

        // Hybrid behavior: no supported versions at all → spec is an error
        if (declared.length > 0 && supported.length === 0) {
            results.push({
                specification: spec.name,
                status: 'error',
                errorMessage: `No supported IFC version in spec.ifcVersions (declared: ${declared.join(', ')}). Allowed: ${SUPPORTED.join(', ')}.`,
                passCount: 0,
                failCount: 0,
                entityResults: []
            });
            continue;
        }

        // Spec doesn't apply to this IFC file
        if (declared.length > 0 && !declared.includes(ifcSchema)) {
            results.push({
                specification: spec.name,
                status: 'skipped',
                skipReason: 'ifc-version-mismatch',
                ifcSchema,
                declaredVersions: declared,
                passCount: 0,
                failCount: 0,
                entityResults: []
            });
            continue;
        }

        // ... existing per-entity validation logic continues here, with:
        const ifcVersion = ifcSchema !== 'UNKNOWN' && supported.includes(ifcSchema) ? ifcSchema : (supported[0] || 'IFC4');
        // (replacing the prior `const ifcVersion = spec.ifcVersion || 'IFC4';`)

        // Attach warnings about unsupported entries when at least one supported version exists
        const warnings = unsupported.length > 0
            ? [`Unsupported ifcVersion entries ignored: ${unsupported.join(', ')}`]
            : [];

        // ... build specResult as before, then:
        specResult.warnings = warnings;
        // ... continue per-entity loop, push specResult, etc.
    }
    return results;
}
```

Apply the same shape changes to `validateEntitiesAgainstIDSAsync`. Keep both functions in sync.

Expose `validateEntitiesAgainstIDSAsync` on `window` for the tests (top-level functions in `validator.js` are already attached to `window` in this codebase; verify and add `window.validateEntitiesAgainstIDSAsync = validateEntitiesAgainstIDSAsync;` near the end of file if missing).

- [ ] **Step 5: Run tests, expect PASS**

```bash
node tests/run-tests.js 2>&1 | grep -E "schema-aware|skipReason|ifc-version-mismatch|FAIL|passed|failed" | tail -20
```

Expected: 5 new tests pass; existing validator tests still pass.

- [ ] **Step 6: Mirror to dist/**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
```

- [ ] **Step 7: Commit**

```bash
git add assets/js/validator.js dist/assets/js/validator.js tests/test-suites/tools-validator.test.js
git commit -m "$(cat <<'EOF'
feat(validator): schema-aware spec applicability via spec.ifcVersions

A spec now applies only to IFC files whose FILE_SCHEMA is in the spec's
ifcVersions list (buildingSMART semantics). Mismatch produces a
'skipped' result with skipReason='ifc-version-mismatch'. All-unsupported
versions produce 'error'. Partial mismatch attaches warnings.

The hierarchy load uses the IFC file's actual schema, not an arbitrary
first item from the spec's list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Parallel changes in `validation-engine.js` (`validateBatch`)

**Files:**
- Modify: `assets/js/common/validation-engine.js` — function `validateBatch` (currently around line 292)
- Test: append to `tests/test-suites/mobile-validator-parser.test.js`
- Mirror: `dist/assets/js/common/validation-engine.js`

`validation-engine.js` is the worker-pool / mobile validation helper. The per-spec hierarchy load lives inside `validateBatch(entities, spec)`. It is called once per spec by `validator.js:2751` and `validation-orchestrator.js:300` (and inside the validation worker). Extend it with an options object so the orchestrator can pass `ifcSchema`.

- [ ] **Step 1: Write a failing integration test**

Append to `tests/test-suites/mobile-validator-parser.test.js`:

```js
describe('ValidationEngine.validateBatch — schema-aware applicability', () => {
    const sample = [{ id: '1', guid: 'g1', entity: 'IFCWALL', name: 'W', propertySets: {}, fileName: 'a.ifc', attributes: {} }];
    const baseSpec = {
        name: 'S1',
        applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
        requirements: []
    };

    it('skips when ifcVersions excludes the IFC schema', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC2X3', ifcVersions: ['IFC2X3'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec, { ifcSchema: 'IFC4' });
        expect(result.status).toBe('skipped');
        expect(result.skipReason).toBe('ifc-version-mismatch');
    });

    it('errors when all declared versions are unsupported', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC4X3 IFC4X3_TC1', ifcVersions: ['IFC4X3', 'IFC4X3_TC1'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec, { ifcSchema: 'IFC4' });
        expect(result.status).toBe('error');
        expect(String(result.errorMessage || '').includes('IFC4X3')).toBe(true);
    });

    it('validates and warns on partial mismatch', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC4 IFC4X3', ifcVersions: ['IFC4', 'IFC4X3'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec, { ifcSchema: 'IFC4' });
        expect(result.status === 'pass' || result.status === 'fail').toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(result.warnings.length > 0).toBe(true);
    });

    it('preserves legacy behavior when options.ifcSchema is absent', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC4', ifcVersions: ['IFC4'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec); // no options
        expect(result.status === 'pass' || result.status === 'fail').toBe(true);
    });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

```bash
node tests/run-tests.js 2>&1 | grep -E "validateBatch.*schema|✓|✗" | tail -15
```

- [ ] **Step 3: Implement**

Open `assets/js/common/validation-engine.js`. Replace the existing `validateBatch` function (around line 292) with:

```js
async function validateBatch(entities, spec, options) {
    options = options || {};
    const ifcSchema = options.ifcSchema || null;
    const SUPPORTED = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];

    const declared = Array.isArray(spec.ifcVersions)
        ? spec.ifcVersions
        : (spec.ifcVersion ? spec.ifcVersion.trim().split(/\s+/).filter(Boolean) : []);
    const supported = declared.filter(v => SUPPORTED.includes(v));
    const unsupported = declared.filter(v => !SUPPORTED.includes(v));

    if (declared.length > 0 && supported.length === 0) {
        return {
            specification: spec.name,
            status: 'error',
            errorMessage: `No supported IFC version in spec.ifcVersions (declared: ${declared.join(', ')}). Allowed: ${SUPPORTED.join(', ')}.`,
            passCount: 0,
            failCount: 0,
            entityResults: []
        };
    }

    if (ifcSchema && declared.length > 0 && !declared.includes(ifcSchema)) {
        return {
            specification: spec.name,
            status: 'skipped',
            skipReason: 'ifc-version-mismatch',
            ifcSchema,
            declaredVersions: declared,
            passCount: 0,
            failCount: 0,
            entityResults: []
        };
    }

    // Choose the version to drive hierarchy load:
    //   1) IFC file's schema, if known and supported by the spec
    //   2) Otherwise the first supported declared version
    //   3) Fallback to IFC4
    const ifcVersion = (ifcSchema && supported.includes(ifcSchema))
        ? ifcSchema
        : (supported[0] || 'IFC4');

    if (typeof window !== 'undefined' && window.IFCHierarchy) {
        await window.IFCHierarchy.load(ifcVersion);
    }
    const ctx = (typeof window !== 'undefined' && window.IFCHierarchy && window.IfcParams) ? {
        ifcVersion,
        isSubtypeOf: (c, a) => window.IFCHierarchy.isSubtypeOf(ifcVersion, c, a),
        getPredefinedTypeIndex: (cls) => window.IFCHierarchy.getPredefinedTypeIndex(ifcVersion, cls),
        getObjectTypeIndex: (cls) => window.IFCHierarchy.getObjectTypeIndex(ifcVersion, cls),
        splitParams: window.IfcParams.splitIfcParams,
        unwrapEnumValue: window.IfcParams.unwrapEnumValue,
        unwrapString: window.IfcParams.unwrapString
    } : null;

    const result = {
        specification: spec.name,
        status: 'pass',
        passCount: 0,
        failCount: 0,
        entityResults: [],
        warnings: unsupported.length > 0
            ? [`Unsupported ifcVersion entries ignored: ${unsupported.join(', ')}`]
            : []
    };

    const applicableEntities = filterByApplicability(entities, spec.applicability, ctx);

    for (const entity of applicableEntities) {
        const entityResult = validateEntity(entity, spec.requirements || [], spec.name);
        result.entityResults.push(entityResult);
        if (entityResult.status === 'pass') {
            result.passCount++;
        } else {
            result.failCount++;
            result.status = 'fail';
        }
    }

    return result;
}
```

Also propagate `ifcSchema` from callers:
- `validator.js:2751` — pass `{ ifcSchema: ifcFile.schema }` as third arg.
- `validation-orchestrator.js:300` — same.
- `assets/js/workers/validation.worker.js:56` — pass through any `ifcSchema` from the message envelope. Search for the worker's message handler and add `ifcSchema` to the destructured `data` and forward it to `validateBatch`.

- [ ] **Step 4: Run test, expect PASS**

```bash
node tests/run-tests.js 2>&1 | grep -E "ValidationEngine|schema-aware|FAIL|passed|failed" | tail -10
```

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/common/validation-engine.js dist/assets/js/common/validation-engine.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/common/validation-engine.js dist/assets/js/common/validation-engine.js tests/test-suites/mobile-validator-parser.test.js
git commit -m "$(cat <<'EOF'
feat(validation-engine): mirror schema-aware applicability from validator.js

Worker-pool / mobile validation path now applies the same buildingSMART
hybrid semantics as the desktop validator: skip on schema mismatch,
error on all-unsupported, warn on partial mismatch, load hierarchy for
the IFC file's actual schema.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Editor UI — 3 checkboxes

**Files:**
- Modify: `assets/js/ids/ids-editor-modals.js:1052-1060` and the save handler (search for `specIfcVersion`)
- Modify: `assets/css/ids-editor-styles.css` (add `.ifc-version-checkboxes` rule)
- Mirror: `dist/assets/js/ids/ids-editor-modals.js`, `dist/assets/css/ids-editor-styles.css`

The custom test framework cannot exercise modal DOM end-to-end. We verify by reading the rendered HTML string from the modal builder if it's pure-function, otherwise we skip automated tests and rely on manual verification.

- [ ] **Step 1: Locate save handler**

```bash
grep -n "specIfcVersion\|specIfcVersions" assets/js/ids/ids-editor-modals.js assets/js/ids/ids-editor-core.js 2>/dev/null
```

Note the line numbers — the save handler reads `document.getElementById('specIfcVersion').value` and assigns it to the spec object on save. Both files may have references.

- [ ] **Step 2: Replace `<select>` with checkboxes**

In `assets/js/ids/ids-editor-modals.js` around lines 1052-1060, replace:

```html
<div class="form-group">
    <label>${t('editor.ifcVersion')}</label>
    <select id="specIfcVersion">
        <option value="IFC2X3" ${specData.ifcVersion === 'IFC2X3' ? 'selected' : ''}>IFC2X3</option>
        <option value="IFC4" ${!specData.ifcVersion || specData.ifcVersion === 'IFC4' ? 'selected' : ''}>IFC4</option>
        <option value="IFC4X3_ADD2" ${specData.ifcVersion === 'IFC4X3_ADD2' ? 'selected' : ''}>IFC4X3_ADD2</option>
    </select>
    <small>${t('editor.ifcVersionDesc')}</small>
</div>
```

…with (compute the checked array once before the template literal):

```js
const checkedVersions = (specData.ifcVersions && specData.ifcVersions.length)
    ? specData.ifcVersions
    : (specData.ifcVersion ? specData.ifcVersion.trim().split(/\s+/).filter(Boolean) : ['IFC4']);
const isChecked = v => checkedVersions.includes(v) ? 'checked' : '';
```

And in the template:

```html
<div class="form-group">
    <label>${t('editor.ifcVersion')}</label>
    <div class="ifc-version-checkboxes" id="specIfcVersionCheckboxes">
        <label><input type="checkbox" name="ifcVersion" value="IFC2X3" ${isChecked('IFC2X3')}> IFC2X3</label>
        <label><input type="checkbox" name="ifcVersion" value="IFC4" ${isChecked('IFC4')}> IFC4</label>
        <label><input type="checkbox" name="ifcVersion" value="IFC4X3_ADD2" ${isChecked('IFC4X3_ADD2')}> IFC4X3_ADD2</label>
    </div>
    <small>${t('editor.ifcVersionDesc')}</small>
</div>
```

- [ ] **Step 3: Update save handler**

Find the save handler that reads `document.getElementById('specIfcVersion').value`. Replace it with:

```js
const checked = [...document.querySelectorAll('#specIfcVersionCheckboxes input[name="ifcVersion"]:checked')]
    .map(el => el.value);
if (checked.length === 0) {
    // Block save and surface inline error — XSD requires minLength=1
    alert(t('editor.ifcVersion.required') || 'Vyberte alespoň jednu IFC verzi.');
    return;
}
specData.ifcVersion = checked.join(' ');
specData.ifcVersions = checked;  // keep in sync immediately; next parse re-derives anyway
```

- [ ] **Step 4: Add CSS**

Open `assets/css/ids-editor-styles.css`. Append:

```css
.ifc-version-checkboxes {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
}

.ifc-version-checkboxes label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    cursor: pointer;
    user-select: none;
}
```

- [ ] **Step 5: Add translation key (if used above)**

Open `assets/js/common/translations.js`. Add to the Czech block:

```js
'editor.ifcVersion.required': 'Vyberte alespoň jednu IFC verzi.',
```

And to the English block:

```js
'editor.ifcVersion.required': 'Select at least one IFC version.',
```

- [ ] **Step 6: Manual verification**

Open the IDS editor in a browser at `pages/ids-parser-visualizer.html` or wherever the editor modal opens. Confirm:
- Three checkboxes render.
- An existing single-version spec shows the right box checked.
- Save with all unchecked → blocked with alert.
- Save with two checked → reload the file (or inspect via DevTools) and confirm the saved `ifcVersion` is `"IFC4 IFC4X3_ADD2"` (space-separated, no commas).

This is a UI change without automated coverage in the existing test framework — manual verification is the test.

- [ ] **Step 7: Mirror to dist/**

```bash
cp assets/js/ids/ids-editor-modals.js dist/assets/js/ids/ids-editor-modals.js
cp assets/css/ids-editor-styles.css dist/assets/css/ids-editor-styles.css
cp assets/js/common/translations.js dist/assets/js/common/translations.js
```

- [ ] **Step 8: Commit**

```bash
git add assets/js/ids/ids-editor-modals.js assets/css/ids-editor-styles.css assets/js/common/translations.js dist/assets/js/ids/ids-editor-modals.js dist/assets/css/ids-editor-styles.css dist/assets/js/common/translations.js
git commit -m "$(cat <<'EOF'
feat(editor): IFC version picker as 3 checkboxes (multi-select)

Replaces the single-value <select> with three checkboxes — one per IDS
1.0 enum value. Save handler concatenates checked values with a space
and writes the canonical string to spec.ifcVersion. At least one box
must be checked (XSD minLength=1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Parser view badge — one badge per version

**Files:**
- Modify: `assets/js/parser.js:278-281` (the `.spec-badges` container)
- Mirror: `dist/assets/js/parser.js`

- [ ] **Step 1: Read current rendering**

```bash
sed -n '275,285p' assets/js/parser.js
```

Confirm the current `<span class="spec-badge">IFC ${escapeHtml(spec.ifcVersion)}</span>` line.

- [ ] **Step 2: Update template**

Replace the single badge line with a loop:

```js
${(spec.ifcVersions && spec.ifcVersions.length
    ? spec.ifcVersions
    : (spec.ifcVersion ? [spec.ifcVersion] : [])
).map(v => `<span class="spec-badge">${escapeHtml(v)}</span>`).join('')}
```

The conditional fallback handles older parsed objects that may not have `ifcVersions` yet (e.g., from cached storage). Once the parser change from Task 1 has run, `ifcVersions` is always populated.

- [ ] **Step 3: Manual verification**

Open an IDS file in the parser visualizer page with a spec whose `ifcVersion="IFC4 IFC4X3_ADD2"`. Confirm two badges appear side by side. Open a single-version spec — confirm one badge appears, identical to today.

- [ ] **Step 4: Mirror to dist/**

```bash
cp assets/js/parser.js dist/assets/js/parser.js
```

- [ ] **Step 5: Commit**

```bash
git add assets/js/parser.js dist/assets/js/parser.js
git commit -m "$(cat <<'EOF'
feat(parser-view): render one badge per ifcVersion entry

Single-version specs render identically to before. Multi-version specs
get one badge per declared version side by side in the existing
.spec-badges flex container. Initial design — iterate if real data
looks awkward.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: XML generator — defensive array coerce

**Files:**
- Modify: `assets/js/ids/ids-xml-generator.js:74`
- Test: `tests/test-suites/ids-xml-generator.test.js` (append)
- Mirror: `dist/assets/js/ids/ids-xml-generator.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-suites/ids-xml-generator.test.js`:

```js
describe('IDSXmlGenerator — ifcVersion serialization', () => {
    function generate(specData) {
        return window.IDSXmlGenerator.generate({
            info: { title: 't', author: 'a@b.cd' },
            specifications: [{
                name: 'S1',
                applicability: [],
                requirements: [],
                ...specData
            }]
        });
    }

    it('preserves a space-separated string verbatim', () => {
        const xml = generate({ ifcVersion: 'IFC4 IFC4X3_ADD2' });
        expect(xml.includes('ifcVersion="IFC4 IFC4X3_ADD2"')).toBe(true);
    });

    it('serializes an array as space-separated, not comma-separated', () => {
        const xml = generate({ ifcVersion: ['IFC4', 'IFC4X3_ADD2'] });
        expect(xml.includes('ifcVersion="IFC4 IFC4X3_ADD2"')).toBe(true);
        expect(xml.includes('ifcVersion="IFC4,IFC4X3_ADD2"')).toBe(false);
    });

    it('falls back to IFC4 when value is missing', () => {
        const xml = generate({});
        expect(xml.includes('ifcVersion="IFC4"')).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests, expect FAIL (only the array case)**

```bash
node tests/run-tests.js 2>&1 | grep -E "ifcVersion serialization|✓|✗" | tail -10
```

Expected: the array test fails (`[].toString()` produces `IFC4,IFC4X3_ADD2`); the other two pass.

- [ ] **Step 3: Implement**

Open `assets/js/ids/ids-xml-generator.js`. Locate line 74:

```js
xml += ` ifcVersion="${this.escapeXml(specData.ifcVersion || 'IFC4')}"`;
```

Replace with:

```js
const versionStr = Array.isArray(specData.ifcVersion)
    ? specData.ifcVersion.join(' ')
    : (specData.ifcVersion || 'IFC4');
xml += ` ifcVersion="${this.escapeXml(versionStr)}"`;
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
node tests/run-tests.js 2>&1 | grep -E "ifcVersion serialization|FAIL|passed|failed" | tail -10
```

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/ids/ids-xml-generator.js dist/assets/js/ids/ids-xml-generator.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/ids/ids-xml-generator.js dist/assets/js/ids/ids-xml-generator.js tests/test-suites/ids-xml-generator.test.js
git commit -m "$(cat <<'EOF'
fix(ids-xml): coerce ifcVersion array to space-separated string

Defensive guard: if a caller (AI tools, future code) accidentally passes
an array, serialize as space-separated per xs:list semantics rather than
defaulting to Array.toString() which produces commas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: AI tool defaults

**Files:**
- Modify: `assets/js/ai/tools/tool-ids.js:105` and `:151`
- Test: extend an existing AI tool test or add a small block in `tests/test-suites/ai-client.test.js` if appropriate
- Mirror: `dist/assets/js/ai/tools/tool-ids.js`

- [ ] **Step 1: Read current defaults**

```bash
sed -n '100,160p' assets/js/ai/tools/tool-ids.js
```

Confirm the literal `'IFC4X3_ADD2'` appears as fallback for `args.ifcVersion`.

- [ ] **Step 2: Replace defaults**

In both locations, change:

```js
ifcVersion: args.ifcVersion || 'IFC4X3_ADD2',
```

…to:

```js
ifcVersion: (Array.isArray(args.ifcVersion) ? args.ifcVersion.join(' ') : args.ifcVersion) || 'IFC4 IFC4X3_ADD2',
```

For line 151 (`tool-ids.js:151`), preserve the cascading fallback:

```js
ifcVersion: (Array.isArray(args.ifcVersion) ? args.ifcVersion.join(' ') : args.ifcVersion)
    || idsData.specifications[0]?.ifcVersion
    || 'IFC4 IFC4X3_ADD2',
```

- [ ] **Step 3: Update tool schema description**

Search for `args.ifcVersion`'s JSON schema entry in `tool-ids.js` (look for the tool's input schema near the function definition). Update the description to mention that a space-separated list is accepted, e.g.:

```js
ifcVersion: {
    type: 'string',
    description: 'IFC schema version(s) the spec targets. Single value (e.g. "IFC4") or space-separated list (e.g. "IFC4 IFC4X3_ADD2"). Allowed values: IFC2X3, IFC4, IFC4X3_ADD2.'
}
```

- [ ] **Step 4: Manual verification**

Spawn a fresh chat with the AI agent (in the running app), ask it to create a new IDS specification without specifying a version. Inspect the generated XML — `ifcVersion="IFC4 IFC4X3_ADD2"` should appear.

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js
git commit -m "$(cat <<'EOF'
feat(ai-tools): default new specs to 'IFC4 IFC4X3_ADD2'

Aligns AI-generated IDS files with the most common real-world targeting
(both IFC4 and IFC4X3_ADD2). Tool input accepts string or array; both
normalize to a space-separated string on intake.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Storage aggregation fix (`tool-storage.js`)

**Files:**
- Modify: `assets/js/ai/tools/tool-storage.js:319-325`
- Test: append a `describe` block to an existing tool-storage or AI test file (e.g., `tests/test-suites/ai-bootstrap.test.js`, or create `tests/test-suites/tool-storage-versions.test.js`)
- Mirror: `dist/assets/js/ai/tools/tool-storage.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test-suites/tool-storage-versions.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
describe('tool-storage — IDS version aggregation', () => {
    it('aggregates ifcVersions across specs without duplicates', () => {
        const ids = {
            info: { title: 't' },
            specifications: [
                { ifcVersion: 'IFC4',                ifcVersions: ['IFC4'] },
                { ifcVersion: 'IFC4 IFC4X3_ADD2',    ifcVersions: ['IFC4', 'IFC4X3_ADD2'] },
                { ifcVersion: 'IFC2X3',              ifcVersions: ['IFC2X3'] }
            ]
        };
        const out = window.ToolStorage.summarizeIDS(ids);
        expect(Array.isArray(out.ifcVersions)).toBe(true);
        expect(out.ifcVersions.length).toBe(3);
        expect(out.ifcVersions.includes('IFC4')).toBe(true);
        expect(out.ifcVersions.includes('IFC4X3_ADD2')).toBe(true);
        expect(out.ifcVersions.includes('IFC2X3')).toBe(true);
        expect(typeof out.ifcVersion).toBe('string');
        expect(out.ifcVersion.includes('IFC4')).toBe(true);
        expect(out.ifcVersion.includes('IFC4X3_ADD2')).toBe(true);
    });

    it('returns empty array and null string when no versions present', () => {
        const ids = { info: {}, specifications: [] };
        const out = window.ToolStorage.summarizeIDS(ids);
        expect(out.ifcVersions.length).toBe(0);
        expect(out.ifcVersion).toBe(null);
    });
});
```

This assumes a top-level helper `window.ToolStorage.summarizeIDS(ids)` extracted from the function that today writes into `out` at line 325. If the surrounding function isn't easily exportable, refactor minimally during implementation to expose this helper.

- [ ] **Step 2: Run test, expect FAIL**

```bash
node tests/run-tests.js 2>&1 | grep -E "tool-storage|aggregation|✓|✗" | tail -10
```

- [ ] **Step 3: Implement**

Open `assets/js/ai/tools/tool-storage.js`. Around line 319-325, find the block that writes `out.title` and `out.ifcVersion`. Refactor to extract the IDS summarization into a named function and update the version aggregation:

```js
function summarizeIDS(ids) {
    const out = {};
    out.specCount = ids?.specifications?.length || 0;
    out.title = ids?.info?.title || null;
    const set = new Set();
    for (const spec of ids?.specifications || []) {
        for (const v of (spec.ifcVersions || [])) set.add(v);
    }
    out.ifcVersions = [...set];
    out.ifcVersion  = out.ifcVersions.length ? out.ifcVersions.join(' ') : null;
    return out;
}
```

Replace the inline lines 323-325 with `Object.assign(out, summarizeIDS(ids));`. Expose the helper at module level via `window.ToolStorage = window.ToolStorage || {}; window.ToolStorage.summarizeIDS = summarizeIDS;` so tests can call it.

- [ ] **Step 4: Run test, expect PASS**

```bash
node tests/run-tests.js 2>&1 | grep -E "tool-storage|aggregation|FAIL|passed|failed" | tail -10
```

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/ai/tools/tool-storage.js dist/assets/js/ai/tools/tool-storage.js tests/test-suites/tool-storage-versions.test.js
git commit -m "$(cat <<'EOF'
fix(tool-storage): aggregate ifcVersions across all specs

Previously read ids.info.ifcVersion which doesn't exist (the attribute
lives on each <specification>); the call returned null for every IDS
file. Now collects a deduplicated set of versions across all specs and
emits both an array (ifcVersions) and the canonical string form
(ifcVersion).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Validator Excel report — AutoFilter and freeze pane

**Files:**
- Modify: `assets/js/validator.js:1185-1197` and `:1249-1257`
- Mirror: `dist/assets/js/validator.js`

No automated test — manual verification by opening the exported file.

- [ ] **Step 1: Identify per-sheet headers**

The header row for per-sheet results has 8 columns (Specification → Details). The Summary sheet has a title row in row 1 and the header row in row 3. Read the surrounding code to confirm.

```bash
sed -n '1130,1260p' assets/js/validator.js
```

- [ ] **Step 2: Add AutoFilter + freeze to per-sheet (line ~1185)**

After `const ws = XLSX.utils.aoa_to_sheet(sheetData);` and the `ws['!cols']` assignment, add:

```js
const lastCol = String.fromCharCode(64 + 8); // 8 columns → 'H'
ws['!autofilter'] = { ref: `A1:${lastCol}${sheetData.length}` };
ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
```

- [ ] **Step 3: Add to Summary sheet (line ~1249)**

The summary has a title in row 1, blank row 2, header in row 3. Apply autofilter starting at row 3:

```js
const summaryLastCol = String.fromCharCode(64 + 6); // 6 columns → 'F'
summaryWs['!autofilter'] = { ref: `A3:${summaryLastCol}${summaryData.length}` };
summaryWs['!views'] = [{ state: 'frozen', ySplit: 3 }];
```

- [ ] **Step 4: Manual verification**

Run a validation that produces results (any IFC × IDS pair). Click "Export to Excel" — open the file. Confirm:
- Header rows have filter dropdowns.
- Scrolling vertically keeps the header row visible (frozen pane).
- Summary tab has filter starting on the header row (row 3), with title + blank row above it.

If `!views` isn't honored by the bundled xlsx.js version, swap to `!freeze`:

```js
ws['!freeze'] = { xSplit: 0, ySplit: 1 };
```

…and re-verify.

- [ ] **Step 5: Mirror to dist/**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/validator.js dist/assets/js/validator.js
git commit -m "$(cat <<'EOF'
feat(validator-report): AutoFilter + frozen header in Excel export

Every per-sheet result tab and the Summary sheet now ship with filter
dropdowns on header columns and a frozen header row for vertical
scrolling. No user-facing toggle — always on.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: UI: surface skipped/error/warnings + SW cache bump + final dist sync

**Files:**
- Modify: `assets/js/validator.js` (the results-rendering function — search for how specResult.status is rendered)
- Modify: `assets/js/common/translations.js` (new keys)
- Modify: `sw.js` (bump CACHE_VERSION)
- Mirror: `dist/sw.js`, `dist/assets/js/validator.js`, `dist/assets/js/common/translations.js`

- [ ] **Step 1: Locate the results renderer**

```bash
grep -n "specResult\.status\|displayResults\|renderResults" assets/js/validator.js | head -10
```

Find the function that maps spec results to DOM (typically near `displayResults`).

- [ ] **Step 2: Add status handling for skipped/error**

In the renderer, alongside existing `'pass'` / `'fail'` branches, add:

```js
if (specResult.status === 'skipped') {
    // Render a muted card with the skipReason and declared vs. file schema
    statusBadgeClass = 'status-skipped';
    statusLabel = t('validator.spec.skipped');
    detail = t('validator.spec.skippedReason').replace('{declared}', (specResult.declaredVersions || []).join(', ')).replace('{actual}', specResult.ifcSchema || '?');
} else if (specResult.status === 'error') {
    statusBadgeClass = 'status-error';
    statusLabel = t('validator.spec.errored');
    detail = specResult.errorMessage || '';
}
```

If warnings are present (`Array.isArray(specResult.warnings) && specResult.warnings.length > 0`), render them as a small muted line under the spec header.

The exact DOM structure depends on the existing renderer — adapt to it without restructuring.

- [ ] **Step 3: Add CSS for skipped/error badges**

In `assets/css/ids-validator.css` (or wherever validator results are styled), append:

```css
.status-skipped { background: #888; color: white; }
.status-error   { background: #c33; color: white; }
.spec-warnings  { color: #b87; font-size: 12px; margin-top: 4px; }
```

- [ ] **Step 4: Add translation keys**

Open `assets/js/common/translations.js`. Add to Czech block:

```js
'validator.spec.skipped':       'Přeskočeno',
'validator.spec.skippedReason': 'Spec cílí IFC verze: {declared}; tento soubor je {actual}',
'validator.spec.errored':       'Chyba specifikace',
```

And English block:

```js
'validator.spec.skipped':       'Skipped',
'validator.spec.skippedReason': 'Spec targets IFC versions: {declared}; this file is {actual}',
'validator.spec.errored':       'Specification error',
```

- [ ] **Step 5: Bump SW cache version**

Open `sw.js`. Line 3:

```js
const CACHE_VERSION = 'bim-checker-v88';
```

Increment to:

```js
const CACHE_VERSION = 'bim-checker-v89';
```

Per project memory `feedback_sw_cache_bump`: required when CSS/JS changes ship.

- [ ] **Step 6: Final dist mirror sync**

Verify all changed files have a current `dist/` copy:

```bash
for f in \
    assets/js/common/ids-parser.js \
    assets/js/common/ifc-parser-core.js \
    assets/js/common/ifc-hierarchy.js \
    assets/js/common/validation-engine.js \
    assets/js/validator.js \
    assets/js/parser.js \
    assets/js/ids/ids-editor-modals.js \
    assets/js/ids/ids-xml-generator.js \
    assets/js/ai/tools/tool-ids.js \
    assets/js/ai/tools/tool-storage.js \
    assets/css/ids-editor-styles.css \
    assets/css/ids-validator.css \
    assets/js/common/translations.js \
    sw.js
do
    cp "$f" "dist/$f"
done
```

(The leading `dist/` works because the original paths are repo-relative.)

- [ ] **Step 7: Full test suite run**

```bash
node tests/run-tests.js 2>&1 | tail -30
```

Expected: all tests pass; no regressions in the ~30+ existing suites. Read the "passed/failed" totals at the bottom.

- [ ] **Step 8: Manual end-to-end verification**

In a real browser session:
1. Load an IDS file with `ifcVersion="IFC4 IFC4X3_ADD2"`. Confirm parser view shows two badges.
2. Open it in the editor. Confirm two checkboxes are checked; uncheck one and save; reopen; confirm.
3. Load an IFC4 file. Validate against an IDS whose spec targets only IFC2X3. Confirm "Skipped" status appears with the reason.
4. Load the same IFC4 file against an IDS whose spec targets `IFC4X3 IFC4X3_TC1` (typo / unsupported only). Confirm "Specification error" status appears.
5. Export the validation report to Excel. Confirm AutoFilter dropdowns and frozen header.
6. Trigger the original crash scenario from issue #21 (manually craft an IDS with `ifcVersion="UNSUPPORTED"`). Confirm the error message is the new clear `Hierarchy fetch returned non-JSON for UNSUPPORTED (...)` rather than the raw `<!DOCTYPE` token.

- [ ] **Step 9: Commit**

```bash
git add assets/js/validator.js assets/css/ids-validator.css assets/js/common/translations.js sw.js dist/
git commit -m "$(cat <<'EOF'
feat(validator-ui): show skipped/error/warning states + SW cache bump

Validator results now render distinct cards for skipped (ifc-version
mismatch), error (no supported versions), and warning (partial mismatch)
states with translated labels. Service worker cache bumped to v89 to
flush stale assets per project policy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Push branch and open PR**

```bash
git push -u origin ids-ifcversion-list
gh pr create --title "IDS ifcVersion multi-version support (fixes #21)" --body "$(cat <<'EOF'
## Summary
- Parses IDS `ifcVersion` as `xs:list` per IDS 1.0 XSD; adds derived `spec.ifcVersions` array
- Validator now applies specs only to IFC files whose `FILE_SCHEMA` matches one of the declared versions (buildingSMART semantics)
- Hybrid handling for unsupported versions: hard error if none supported, warning if some
- Editor: 3 checkboxes for version selection
- Parser view: one badge per declared version
- Validator Excel report gains AutoFilter + frozen header
- Defensive `r.json()` in `ifc-hierarchy.js` — clear error instead of raw `<!DOCTYPE` (fixes #21)
- `tool-storage.js` ifcVersion aggregation fix (latent bug; previously always null)

## Test plan
- [ ] `node tests/run-tests.js` — full suite passes
- [ ] Editor: open spec, see 3 checkboxes, save with 2 checked, reopen confirms
- [ ] Parser view: multi-version spec shows multiple badges
- [ ] Validator: IFC4 file × IFC2X3-only spec → Skipped result with reason
- [ ] Validator: IFC4 file × all-unsupported-versions spec → Error result
- [ ] Validator: IFC4 file × mixed versions → validates with warning attached
- [ ] Excel export: AutoFilter dropdowns visible; header row frozen on scroll
- [ ] Issue #21 reproduction (crafted IDS with `ifcVersion="UNSUPPORTED"`) → clear non-JSON error message

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

Before handing off:

- [ ] Every section of `docs/superpowers/specs/2026-05-21-ids-ifcversion-list-design.md` is covered by at least one task (see mapping below).
- [ ] No placeholders in any step.
- [ ] All file paths are absolute or repo-relative.
- [ ] `parseIfcVersionList` name used consistently across Tasks 1, 4, 5.
- [ ] `spec.ifcVersions` field name used consistently (no `versions`, no `ifcVersionList`).
- [ ] `skipReason: 'ifc-version-mismatch'` value used consistently in Tasks 4, 5, 12.
- [ ] SW cache bump appears only in Task 12.
- [ ] dist/ mirror is present in every task that modifies source.

### Spec → task mapping

| Spec section | Implementing task |
| --- | --- |
| Data model (additive) | Task 1 |
| Drift invariant + test | Task 1 (round-trip via Task 8 generator + Task 1 parser) |
| Hybrid mismatch handling | Tasks 4, 5 |
| IFC schema detection | Task 2 |
| Spec applicability gate | Tasks 4, 5 |
| Defensive `r.json()` | Task 3 |
| Editor UI | Task 6 |
| Parser view badge | Task 7 |
| XML generator coerce | Task 8 |
| Excel round-trip (read/write) | Already correct — verified in Task 8 tests for write; read goes through Task 1's parser |
| AI tool defaults | Task 9 |
| Storage aggregation | Task 10 |
| Validator Excel AutoFilter + freeze | Task 11 |
| Skipped/error UI rendering | Task 12 |
| Translations | Tasks 6, 12 |
| SW cache bump | Task 12 |
