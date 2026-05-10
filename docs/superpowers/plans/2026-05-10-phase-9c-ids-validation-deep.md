# Phase 9c: IDS Deep-dive + IDS gen + bSDD + Excel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 AI tools covering IDS spec/facet introspection, validation failure drilldown, IFC analysis (compare + property search), IDS XML generation, bSDD lookup stubs, and validator XLSX export.

**Architecture:** Extends Phase 8/9a/9b tool-module pattern. Two existing modules grow: `tool-ids.js` (gets 5 new tools) and `tool-ifc.js` (gets 2). `tool-validator.js` gets 2 read tools + 1 export tool. New module `tool-bsdd.js` ships gated stubs returning `{ error: 'integration_disabled' }`.

**Tech Stack:** Vanilla JS ES6 modules, `window.IDSParser.parse()` for XML→object, `window.IDSXMLGenerator` for object→XML, `window.IDSXSDValidator.validate()` async XSD check, page-locked tools that read `window.validationResults` set by `validateAll`, native `confirm()` for destructive ops, Puppeteer test runner.

**Branch:** `phase-9c-ids-validation-deep` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-10-phase-9-comprehensive-ai-tools-design.md` (Tier C sections).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/ai/tools/tool-ids.js` | Modify | +5 tools: get_specification_detail, get_facet_detail, generate_ids_skeleton, add_specification_to_ids, validate_ids_xml |
| `assets/js/ai/tools/tool-ifc.js` | Modify | +2 tools: compare_ifc_files, find_property_in_ifc |
| `assets/js/ai/tools/tool-validator.js` | Modify | +3 tools: get_validation_failures, count_failures_by_requirement, export_validation_xlsx |
| `assets/js/ai/tools/tool-bsdd.js` | **Create** | 2 gated stubs: bsdd_search, bsdd_get_property |
| `assets/js/ai/tool-defs.js` | Modify | +12 OpenAI-format definitions in Czech (44 → 56) |
| `assets/js/ai/tool-executor.js` | Modify | Import + register `tool-bsdd` |
| `dist/...` | Mirror | All modified files |
| `sw.js` + `dist/sw.js` | Modify | Bump v29 → v30; add `tool-bsdd.js` to ASSETS_TO_CACHE |
| `tests/test-suites/tools-ids.test.js` | Modify | +10 tests |
| `tests/test-suites/tools-ifc.test.js` | Modify | +5 tests |
| `tests/test-suites/tools-validator.test.js` | Modify | +6 tests |
| `tests/test-suites/tools-bsdd.test.js` | **Create** | 4 tests (gated stubs) |
| `tests/test-suites/chat-panel-tool-loop.test.js` | Modify | Bump 44 → 56 |
| `tests/test-suites/ai-bootstrap.test.js` | Modify | Bump 44 → 56 |
| `tests/test-runner.html` | Modify | Add `tools-bsdd.test.js` script tag |
| `PLAN.md` | Modify | Append Phase 9c section |
| `CHANGELOG.md` | Modify | `[0.7.0]` entry at top |

---

## Cross-cutting conventions (Phase 8/9a/9b baseline)

- Each task adds tool-defs entries inline (not batched to last task) — matches the iterative pattern that Phase 9b adopted after T1 review
- Tools `async`, return plain objects, never throw on missing data — `{ error, message }` instead
- THROW only for missing globals (`BIMStorage`, `IDSParser`, `IDSXMLGenerator`)
- Test framework: no `.not` chaining
- Czech messages for user-visible errors
- After every code change: mirror to `dist/` via `cp <src> <dst>`
- Each task bumps the registry/TOOL_DEFINITIONS count assertions in `chat-panel-tool-loop.test.js` and `ai-bootstrap.test.js`

### IDSParser primer
- `window.IDSParser.parse(xmlString)` returns `{ info: {...}, specifications: [{...}], error: null|{message} }`
- Each spec: `{ name, ifcVersion, identifier, description, instructions, minOccurs, maxOccurs, applicability: [facet], requirements: [facet] }`
- Each facet: `{ type: 'entity'|'partOf'|'classification'|'attribute'|'property'|'material', ...fields }` — `name` for most, `baseName` for property
- Loaded on validator/parser/viewer pages. Phase 8 added `<script src="ids-parser.js">` to homepage too.

### IDSXMLGenerator primer
- `new IDSXMLGenerator().generateIDS(idsData)` returns XML string
- `idsData = { title, copyright?, version?, description?, author?, date?, purpose?, milestone?, specifications: [spec] }`
- Throws if `specifications.length === 0`
- Loaded on parser page. For homepage use, the tool will need to add `<script src="ids-xml-generator.js">` to index.html — verify in Task 4.

### IDSXSDValidator primer
- `await window.IDSXSDValidator.validate(xmlString)` async, returns `{ valid: bool, errors: [{line, column, severity, message}] }`
- Loaded on validator/parser pages. NOT on homepage — tool returns `{ error: 'validator_not_available' }` outside.

### validationResults
- `window.validationResults` is `null` until `validateAll` runs, then `[{ idsFileName, idsTitle, ifcResults: [...] }]`
- Each `ifcResults[i] = { ifcFile: {name}, results: [{ specName, requirements: [{ pass, fail, requirement, ... }] }] }`
- Page-locked tools must check `helpers.getCurrentPageId() === 'validator'` and refuse otherwise.

---

## Task 1: IDS deep-dive — get_specification_detail + get_facet_detail

**Files:**
- Modify: `assets/js/ai/tools/tool-ids.js`
- Modify: `assets/js/ai/tool-defs.js`
- Modify: `tests/test-suites/tools-ids.test.js`
- Modify: `tests/test-suites/chat-panel-tool-loop.test.js` and `ai-bootstrap.test.js` (44 → 46)

- [ ] **Step 1: Add `get_specification_detail` to tool-ids.js**

Open `assets/js/ai/tools/tool-ids.js`. Read it first. BEFORE existing `register()`, append:
```js
function _resolveSpec(specs, args) {
    if (typeof args.specIndex === 'number') {
        if (args.specIndex < 0 || args.specIndex >= specs.length) return { error: 'index_out_of_range' };
        return { spec: specs[args.specIndex], index: args.specIndex };
    }
    if (args.specName) {
        const idx = specs.findIndex(s => (s.name || '').trim() === String(args.specName).trim());
        if (idx === -1) return { error: 'not_found', message: `Specifikace "${args.specName}" v souboru.` };
        return { spec: specs[idx], index: idx };
    }
    return { error: 'missing_identifier', message: 'Zadej specName nebo specIndex.' };
}

export async function get_specification_detail(args) {
    helpers.validateArgs(args, { idsFileName: { required: true } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found', message: `IDS soubor "${args.idsFileName}" neexistuje.` };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const parsed = window.IDSParser.parse(content);
    if (parsed.error) return { error: 'parse_error', message: parsed.error.message };
    const resolution = _resolveSpec(parsed.specifications || [], args);
    if (resolution.error) return resolution;
    const s = resolution.spec;
    return {
        index: resolution.index,
        name: s.name,
        ifcVersion: s.ifcVersion,
        identifier: s.identifier,
        description: s.description,
        instructions: s.instructions,
        minOccurs: s.minOccurs,
        maxOccurs: s.maxOccurs,
        applicabilityCount: (s.applicability || []).length,
        requirementsCount: (s.requirements || []).length,
        applicability: s.applicability || [],
        requirements: s.requirements || []
    };
}
```

- [ ] **Step 2: Add `get_facet_detail`**

After `get_specification_detail`:
```js
export async function get_facet_detail(args) {
    helpers.validateArgs(args, {
        idsFileName: { required: true },
        facetType: { required: true, enum: ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'] },
        index: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const parsed = window.IDSParser.parse(content);
    if (parsed.error) return { error: 'parse_error', message: parsed.error.message };
    const resolution = _resolveSpec(parsed.specifications || [], args);
    if (resolution.error) return resolution;
    const s = resolution.spec;
    const block = (args.in === 'requirements') ? (s.requirements || []) : (s.applicability || []);
    const filtered = block.filter(f => f.type === args.facetType);
    if (args.index < 0 || args.index >= filtered.length) return { error: 'index_out_of_range', count: filtered.length };
    return { facet: filtered[args.index], in: args.in === 'requirements' ? 'requirements' : 'applicability', total: filtered.length };
}
```

- [ ] **Step 3: Update register() in tool-ids.js**

Inside existing `register()`:
```js
    registerFn('get_specification_detail', get_specification_detail);
    registerFn('get_facet_detail', get_facet_detail);
```

Bump existing `register adds X tools` test in tools-ids.test.js by 2.

- [ ] **Step 4: Add 2 tool-defs entries**

In `assets/js/ai/tool-defs.js`, before closing `];`, insert:
```js
    {
        type: 'function',
        function: {
            name: 'get_specification_detail',
            description: 'Detail jedné specifikace v IDS souboru. Najdi přes specName nebo specIndex (od 0). Vrátí applicability + requirements facets.',
            parameters: {
                type: 'object',
                properties: {
                    idsFileName: { type: 'string' },
                    specName: { type: 'string' },
                    specIndex: { type: 'integer', minimum: 0 }
                },
                required: ['idsFileName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_facet_detail',
            description: 'Detail konkrétního facetu uvnitř specifikace. facetType je entity|partOf|classification|attribute|property|material. in=applicability|requirements (default applicability).',
            parameters: {
                type: 'object',
                properties: {
                    idsFileName: { type: 'string' },
                    specName: { type: 'string' },
                    specIndex: { type: 'integer' },
                    facetType: { type: 'string', enum: ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'] },
                    index: { type: 'integer', minimum: 0 },
                    in: { type: 'string', enum: ['applicability', 'requirements'] }
                },
                required: ['idsFileName', 'facetType', 'index']
            }
        }
    }
```

- [ ] **Step 5: Update count assertions: 44 → 46**

`tests/test-suites/chat-panel-tool-loop.test.js` and `tests/test-suites/ai-bootstrap.test.js`: bump 44 → 46.

- [ ] **Step 6: Add 4 tests to tools-ids.test.js**

Append inside the describe (after the existing tests, before the register-count test):
```js
    it('get_specification_detail returns spec by index', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>T</title></info><specifications><specification name="SpecA" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName></property></requirements></specification></specifications></ids>`;
        await window.BIMStorage.saveFile('ids', { name: 'spec1.ids', size: ids.length, content: ids });
        try {
            const r = await tools.get_specification_detail({ idsFileName: 'spec1.ids', specIndex: 0 });
            expect(r.name).toBe('SpecA');
            expect(r.applicabilityCount).toBe(1);
            expect(r.requirementsCount).toBe(1);
        } finally {
            await window.BIMStorage.deleteFile('ids', 'spec1.ids').catch(() => {});
        }
    });

    it('get_specification_detail returns not_found for missing IDS file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const r = await tools.get_specification_detail({ idsFileName: 'nope.ids' });
        expect(r.error).toBe('not_found');
    });

    it('get_specification_detail returns missing_identifier without specName/specIndex', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>T</title></info><specifications><specification name="X" ifcVersion="IFC4"><applicability/><requirements/></specification></specifications></ids>`;
        await window.BIMStorage.saveFile('ids', { name: 'mi.ids', size: ids.length, content: ids });
        try {
            const r = await tools.get_specification_detail({ idsFileName: 'mi.ids' });
            expect(r.error).toBe('missing_identifier');
        } finally {
            await window.BIMStorage.deleteFile('ids', 'mi.ids').catch(() => {});
        }
    });

    it('get_facet_detail returns one facet by index', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>T</title></info><specifications><specification name="S" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability><requirements/></specification></specifications></ids>`;
        await window.BIMStorage.saveFile('ids', { name: 'fd.ids', size: ids.length, content: ids });
        try {
            const r = await tools.get_facet_detail({ idsFileName: 'fd.ids', specIndex: 0, facetType: 'entity', index: 0 });
            expect(r.facet.type).toBe('entity');
            expect(r.in).toBe('applicability');
        } finally {
            await window.BIMStorage.deleteFile('ids', 'fd.ids').catch(() => {});
        }
    });
```

- [ ] **Step 7: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 656/656 (652 + 4).

- [ ] **Step 8: Commit**
```bash
git checkout -b phase-9c-ids-validation-deep
git add assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js \
        assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        tests/test-suites/tools-ids.test.js \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js
git commit -m "feat(ai-tools-9c): get_specification_detail + get_facet_detail"
```

---

## Task 2: Validation deep-dive — get_validation_failures + count_failures_by_requirement

**Files:**
- Modify: `assets/js/ai/tools/tool-validator.js`
- Modify: `assets/js/ai/tool-defs.js`
- Modify: `tests/test-suites/tools-validator.test.js`
- Bump count assertions 46 → 48

- [ ] **Step 1: Add `get_validation_failures`**

Open `assets/js/ai/tools/tool-validator.js`. Before existing `register()`, append:
```js
export async function get_validation_failures(args) {
    helpers.validateArgs(args, { groupIndex: { required: true } });
    if (helpers.getCurrentPageId() !== 'validator') {
        return { error: 'wrong_page', message: 'Failures lze číst pouze na stránce Validator (po spuštění validace).' };
    }
    if (!Array.isArray(window.validationResults) || window.validationResults.length === 0) {
        return { error: 'no_results', message: 'Validace nebyla spuštěna.' };
    }
    const idx = args.groupIndex;
    if (idx < 0 || idx >= window.validationResults.length) {
        return { error: 'index_out_of_range', max: window.validationResults.length - 1 };
    }
    const group = window.validationResults[idx];
    const failures = [];
    let truncated = false;
    const ifcResults = group.ifcResults || [];
    for (const ifcRes of ifcResults) {
        if (args.ifcFileName && ifcRes.ifcFile?.name !== args.ifcFileName) continue;
        for (const specRes of (ifcRes.results || [])) {
            for (const req of (specRes.requirements || [])) {
                if (req.fail > 0) {
                    failures.push({
                        ifcFile: ifcRes.ifcFile?.name || null,
                        specName: specRes.specName || specRes.idsTitle || '',
                        requirement: req.requirement || req.label || '',
                        passed: req.pass || 0,
                        failed: req.fail || 0
                    });
                    if (failures.length >= 50) { truncated = true; break; }
                }
            }
            if (truncated) break;
        }
        if (truncated) break;
    }
    return { groupIndex: idx, failures, truncated };
}
```

- [ ] **Step 2: Add `count_failures_by_requirement`**

After `get_validation_failures`:
```js
export async function count_failures_by_requirement(args) {
    helpers.validateArgs(args, { groupIndex: { required: true } });
    if (helpers.getCurrentPageId() !== 'validator') {
        return { error: 'wrong_page' };
    }
    if (!Array.isArray(window.validationResults) || window.validationResults.length === 0) {
        return { error: 'no_results' };
    }
    const idx = args.groupIndex;
    if (idx < 0 || idx >= window.validationResults.length) {
        return { error: 'index_out_of_range' };
    }
    const group = window.validationResults[idx];
    const buckets = new Map();
    for (const ifcRes of (group.ifcResults || [])) {
        for (const specRes of (ifcRes.results || [])) {
            for (const req of (specRes.requirements || [])) {
                const key = `${specRes.specName || ''}::${req.requirement || req.label || ''}`;
                const b = buckets.get(key) || { specName: specRes.specName || '', requirement: req.requirement || req.label || '', failed: 0, total: 0 };
                b.failed += (req.fail || 0);
                b.total += (req.pass || 0) + (req.fail || 0);
                buckets.set(key, b);
            }
        }
    }
    return { groupIndex: idx, breakdown: Array.from(buckets.values()).sort((a, b) => b.failed - a.failed) };
}
```

- [ ] **Step 3: Update register()**

Inside existing `register()`:
```js
    registerFn('get_validation_failures', get_validation_failures);
    registerFn('count_failures_by_requirement', count_failures_by_requirement);
```

Bump `register adds X tools` test in tools-validator.test.js by 2.

- [ ] **Step 4: Add 2 tool-defs entries**

In `tool-defs.js`, before closing `];`, insert:
```js
    {
        type: 'function',
        function: {
            name: 'get_validation_failures',
            description: 'Detail selhaných requirementů z poslední validace. Page-locked na Validator. Limit 50, vrátí truncated:true při překročení.',
            parameters: {
                type: 'object',
                properties: {
                    groupIndex: { type: 'integer', minimum: 0 },
                    ifcFileName: { type: 'string', description: 'Volitelný filtr na konkrétní IFC soubor.' }
                },
                required: ['groupIndex']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'count_failures_by_requirement',
            description: 'Histogram failed/total per requirement napříč všemi IFC ve skupině. Page-locked na Validator.',
            parameters: {
                type: 'object',
                properties: { groupIndex: { type: 'integer', minimum: 0 } },
                required: ['groupIndex']
            }
        }
    }
```

- [ ] **Step 5: Update count assertions: 46 → 48**

- [ ] **Step 6: Add 4 tests to tools-validator.test.js**

Append:
```js
    it('get_validation_failures returns wrong_page off validator', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers._setCurrentPageForTest('parser');
        try {
            const r = await tools.get_validation_failures({ groupIndex: 0 });
            expect(r.error).toBe('wrong_page');
        } finally {
            helpers._setCurrentPageForTest(null);
        }
    });

    it('get_validation_failures returns no_results when validationResults empty', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers._setCurrentPageForTest('validator');
        const orig = window.validationResults;
        window.validationResults = null;
        try {
            const r = await tools.get_validation_failures({ groupIndex: 0 });
            expect(r.error).toBe('no_results');
        } finally {
            window.validationResults = orig;
            helpers._setCurrentPageForTest(null);
        }
    });

    it('get_validation_failures lists failures from a fake group', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers._setCurrentPageForTest('validator');
        const orig = window.validationResults;
        window.validationResults = [{
            idsFileName: 'a.ids', idsTitle: 'A',
            ifcResults: [{
                ifcFile: { name: 'x.ifc' },
                results: [{ specName: 'S1', requirements: [{ requirement: 'IsExternal', pass: 5, fail: 3 }, { requirement: 'AllOK', pass: 10, fail: 0 }] }]
            }]
        }];
        try {
            const r = await tools.get_validation_failures({ groupIndex: 0 });
            expect(r.failures.length).toBe(1);
            expect(r.failures[0].requirement).toBe('IsExternal');
            expect(r.failures[0].failed).toBe(3);
        } finally {
            window.validationResults = orig;
            helpers._setCurrentPageForTest(null);
        }
    });

    it('count_failures_by_requirement aggregates across files', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers._setCurrentPageForTest('validator');
        const orig = window.validationResults;
        window.validationResults = [{
            ifcResults: [
                { ifcFile: { name: 'a.ifc' }, results: [{ specName: 'S', requirements: [{ requirement: 'R', pass: 1, fail: 2 }] }] },
                { ifcFile: { name: 'b.ifc' }, results: [{ specName: 'S', requirements: [{ requirement: 'R', pass: 0, fail: 4 }] }] }
            ]
        }];
        try {
            const r = await tools.count_failures_by_requirement({ groupIndex: 0 });
            expect(r.breakdown.length).toBe(1);
            expect(r.breakdown[0].failed).toBe(6);
            expect(r.breakdown[0].total).toBe(7);
        } finally {
            window.validationResults = orig;
            helpers._setCurrentPageForTest(null);
        }
    });
```

- [ ] **Step 7: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 660/660 (656 + 4).

- [ ] **Step 8: Commit**
```bash
git add assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js \
        assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        tests/test-suites/tools-validator.test.js \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js
git commit -m "feat(ai-tools-9c): get_validation_failures + count_failures_by_requirement"
```

---

## Task 3: IFC analysis — compare_ifc_files + find_property_in_ifc

**Files:**
- Modify: `assets/js/ai/tools/tool-ifc.js`
- Modify: `assets/js/ai/tool-defs.js`
- Modify: `tests/test-suites/tools-ifc.test.js`
- Bump count 48 → 50

- [ ] **Step 1: Add `compare_ifc_files`**

Open `assets/js/ai/tools/tool-ifc.js`. Read it. Append before existing `register()`:
```js
export async function compare_ifc_files(args) {
    helpers.validateArgs(args, {
        fileNamesA: { required: true },
        fileNamesB: { required: true }
    });
    if (!Array.isArray(args.fileNamesA) || !Array.isArray(args.fileNamesB)) {
        throw new Error('fileNamesA and fileNamesB must be arrays of strings');
    }
    async function _aggregate(names) {
        const counts = {};
        for (const name of names) {
            const entities = await helpers.getParsedIfc(name);
            if (!entities) continue;
            for (const e of entities) {
                const t = (e.entity || '').toUpperCase();
                if (!t) continue;
                counts[t] = (counts[t] || 0) + 1;
            }
        }
        return counts;
    }
    const a = await _aggregate(args.fileNamesA);
    const b = await _aggregate(args.fileNamesB);
    const allTypes = new Set([...Object.keys(a), ...Object.keys(b)]);
    const delta = {};
    for (const t of allTypes) delta[t] = (b[t] || 0) - (a[t] || 0);
    return { a, b, delta };
}
```

- [ ] **Step 2: Add `find_property_in_ifc`**

After `compare_ifc_files`:
```js
export async function find_property_in_ifc(args) {
    helpers.validateArgs(args, {
        fileName: { required: true },
        propertyName: { required: true }
    });
    const entities = await helpers.getParsedIfc(args.fileName);
    if (!entities) return { error: 'not_found', message: `IFC soubor "${args.fileName}" neexistuje nebo se nepodařil parsovat.` };
    const matches = [];
    let truncated = false;
    const targetValue = (args.value !== undefined && args.value !== null) ? String(args.value) : null;
    for (const e of entities) {
        const psets = e.psets || e.propertySets || {};
        for (const psetName of Object.keys(psets)) {
            const props = psets[psetName] || {};
            if (Object.prototype.hasOwnProperty.call(props, args.propertyName)) {
                const v = props[args.propertyName];
                if (targetValue === null || String(v) === targetValue) {
                    matches.push({
                        expressId: e.id,
                        entity: e.entity,
                        guid: e.guid,
                        psetName,
                        value: v
                    });
                    if (matches.length >= 50) { truncated = true; break; }
                }
            }
        }
        if (truncated) break;
    }
    return { fileName: args.fileName, matches, truncated };
}
```

- [ ] **Step 3: Update register() in tool-ifc.js**

Inside existing `register()`:
```js
    registerFn('compare_ifc_files', compare_ifc_files);
    registerFn('find_property_in_ifc', find_property_in_ifc);
```

Bump `register adds X tools` test in tools-ifc.test.js by 2.

- [ ] **Step 4: Add 2 tool-defs entries**

In `tool-defs.js`:
```js
    {
        type: 'function',
        function: {
            name: 'compare_ifc_files',
            description: 'Porovná entity histogramy dvou skupin IFC souborů. Vrátí { a, b, delta } kde delta = b - a per typ.',
            parameters: {
                type: 'object',
                properties: {
                    fileNamesA: { type: 'array', items: { type: 'string' } },
                    fileNamesB: { type: 'array', items: { type: 'string' } }
                },
                required: ['fileNamesA', 'fileNamesB']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_property_in_ifc',
            description: 'Najde entity obsahující property daného jména. Volitelně filtr přes value (přesná shoda). Limit 50 matchů.',
            parameters: {
                type: 'object',
                properties: {
                    fileName: { type: 'string' },
                    propertyName: { type: 'string' },
                    value: { type: 'string' }
                },
                required: ['fileName', 'propertyName']
            }
        }
    }
```

- [ ] **Step 5: Update count assertions: 48 → 50**

- [ ] **Step 6: Add 3 tests to tools-ifc.test.js**

Append:
```js
    it('compare_ifc_files returns delta histogram', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ifc.js');
        helpers._clearIfcCacheForTest();
        const ifcA = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('a'),'2;1');
FILE_NAME('a.ifc','',(),(), '', '', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('GA',$,'W1',$,$,$,$,$,$);
#2=IFCDOOR('GD',$,'D1',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
        const ifcB = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('b'),'2;1');
FILE_NAME('b.ifc','',(),(), '', '', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('GA',$,'W1',$,$,$,$,$,$);
#2=IFCWALL('GA2',$,'W2',$,$,$,$,$,$);
#3=IFCWINDOW('GW',$,'Wd',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
        await window.BIMStorage.saveFile('ifc', { name: 'cmp_a.ifc', size: ifcA.length, content: ifcA });
        await window.BIMStorage.saveFile('ifc', { name: 'cmp_b.ifc', size: ifcB.length, content: ifcB });
        try {
            const r = await tools.compare_ifc_files({ fileNamesA: ['cmp_a.ifc'], fileNamesB: ['cmp_b.ifc'] });
            expect(typeof r.a.IFCWALL).toBe('number');
            expect(typeof r.delta).toBe('object');
            expect(r.delta.IFCWALL).toBe(1); // b has 2, a has 1
            expect(r.delta.IFCDOOR).toBe(-1);
            expect(r.delta.IFCWINDOW).toBe(1);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'cmp_a.ifc').catch(() => {});
            await window.BIMStorage.deleteFile('ifc', 'cmp_b.ifc').catch(() => {});
        }
    });

    it('find_property_in_ifc returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ifc.js');
        const r = await tools.find_property_in_ifc({ fileName: 'never.ifc', propertyName: 'X' });
        expect(r.error).toBe('not_found');
    });

    it('find_property_in_ifc throws on missing required arg', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ifc.js');
        let threw = false;
        try { await tools.find_property_in_ifc({ fileName: 'x.ifc' }); } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });
```

- [ ] **Step 7: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-ifc.js dist/assets/js/ai/tools/tool-ifc.js
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 663/663 (660 + 3).

- [ ] **Step 8: Commit**
```bash
git add assets/js/ai/tools/tool-ifc.js dist/assets/js/ai/tools/tool-ifc.js \
        assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        tests/test-suites/tools-ifc.test.js \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js
git commit -m "feat(ai-tools-9c): compare_ifc_files + find_property_in_ifc"
```

---

## Task 4: IDS gen — generate_ids_skeleton + add_specification_to_ids + validate_ids_xml

**Files:**
- Modify: `assets/js/ai/tools/tool-ids.js`
- Modify: `assets/js/ai/tool-defs.js`
- Modify: `index.html` + dist mirror — load `ids-xml-generator.js` so `IDSXMLGenerator` is available globally on homepage
- Modify: `tests/test-suites/tools-ids.test.js`
- Bump count 50 → 53

- [ ] **Step 1: Add `<script src="...ids-xml-generator.js">` to index.html**

Open `/home/michal/work/BIM_checker/index.html`. Find the existing line `<script src="assets/js/common/ids-parser.js"></script>`. AFTER it, add:
```html
    <script src="assets/js/ids/ids-xml-generator.js"></script>
```
Mirror the same change to `dist/index.html`.

Also add `tool-ids` and `tool-xml-generator` paths to `sw.js` ASSETS_TO_CACHE if not already there — check first via `grep "ids-xml-generator" sw.js`. If missing, add `'./assets/js/ids/ids-xml-generator.js',` near the other `ids-*` lines.

- [ ] **Step 2: Add `generate_ids_skeleton` to tool-ids.js**

Append before existing `register()`:
```js
export async function generate_ids_skeleton(args) {
    helpers.validateArgs(args, { title: { required: true } });
    if (typeof window.IDSXMLGenerator === 'undefined') {
        return { error: 'generator_not_available', message: 'IDS XML generator není načtený na této stránce.' };
    }
    const idsData = {
        title: String(args.title),
        copyright: args.copyright || '',
        version: args.version || '1.0',
        description: args.description || '',
        author: args.author || '',
        date: new Date().toISOString().slice(0, 10),
        purpose: args.purpose || '',
        milestone: args.milestone || '',
        specifications: [{
            name: 'Empty Specification',
            ifcVersion: args.ifcVersion || 'IFC4X3_ADD2',
            identifier: '',
            description: '',
            instructions: '',
            applicability: [{ type: 'entity', name: { simpleValue: 'IFCWALL' } }],
            requirements: []
        }]
    };
    const xml = new window.IDSXMLGenerator().generateIDS(idsData);
    return { xml, length: xml.length };
}
```

- [ ] **Step 3: Add `add_specification_to_ids`**

After `generate_ids_skeleton`:
```js
export async function add_specification_to_ids(args) {
    helpers.validateArgs(args, {
        idsFileName: { required: true },
        name: { required: true },
        applicabilityFacets: { required: true },
        requirementFacets: { required: true }
    });
    if (!Array.isArray(args.applicabilityFacets) || !Array.isArray(args.requirementFacets)) {
        throw new Error('applicabilityFacets and requirementFacets must be arrays');
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available');
    if (typeof window.IDSXMLGenerator === 'undefined') {
        return { error: 'generator_not_available' };
    }
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const parsed = window.IDSParser.parse(content);
    if (parsed.error) return { error: 'parse_error', message: parsed.error.message };
    const idsData = {
        title: parsed.info?.title || '',
        copyright: parsed.info?.copyright || '',
        version: parsed.info?.version || '',
        description: parsed.info?.description || '',
        author: parsed.info?.author || '',
        date: parsed.info?.date || '',
        purpose: parsed.info?.purpose || '',
        milestone: parsed.info?.milestone || '',
        specifications: [...(parsed.specifications || [])]
    };
    idsData.specifications.push({
        name: args.name,
        ifcVersion: args.ifcVersion || idsData.specifications[0]?.ifcVersion || 'IFC4X3_ADD2',
        identifier: '',
        description: args.description || '',
        instructions: '',
        applicability: args.applicabilityFacets,
        requirements: args.requirementFacets
    });
    const xml = new window.IDSXMLGenerator().generateIDS(idsData);
    if (!confirm(`Přidat specifikaci '${args.name}' do '${args.idsFileName}'?`)) {
        return { cancelled: true };
    }
    await window.BIMStorage.saveFile('ids', { name: args.idsFileName, size: xml.length, content: xml }, file.folder);
    return { added: true, totalSpecs: idsData.specifications.length };
}
```

- [ ] **Step 4: Add `validate_ids_xml`**

After `add_specification_to_ids`:
```js
export async function validate_ids_xml(args) {
    helpers.validateArgs(args, { idsFileName: { required: true } });
    if (typeof window.IDSXSDValidator === 'undefined') {
        return { error: 'validator_not_available', message: 'XSD validátor není k dispozici (jen na podstránkách).' };
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const result = await window.IDSXSDValidator.validate(content);
    return { valid: result.valid, errorCount: (result.errors || []).length, errors: (result.errors || []).slice(0, 20) };
}
```

- [ ] **Step 5: Update register() in tool-ids.js**

Inside existing `register()`:
```js
    registerFn('generate_ids_skeleton', generate_ids_skeleton);
    registerFn('add_specification_to_ids', add_specification_to_ids);
    registerFn('validate_ids_xml', validate_ids_xml);
```

Bump `register adds X tools` test by 3.

- [ ] **Step 6: Add 3 tool-defs entries**

In `tool-defs.js`:
```js
    {
        type: 'function',
        function: {
            name: 'generate_ids_skeleton',
            description: 'Vygeneruje minimální IDS XML kostru s jednou prázdnou specifikací. Vrací XML jako string. Generátor vyžaduje email v author poli (XSD constraint).',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    author: { type: 'string', description: 'Email pro author pole (povinné per XSD).' },
                    ifcVersion: { type: 'string', description: 'Default IFC4X3_ADD2.' },
                    copyright: { type: 'string' },
                    version: { type: 'string' },
                    description: { type: 'string' },
                    purpose: { type: 'string' },
                    milestone: { type: 'string' }
                },
                required: ['title']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_specification_to_ids',
            description: 'Přidá novou specifikaci do existujícího IDS souboru. Před zápisem otevře potvrzovací dialog. Facets musí mít správný shape (type + příslušná pole).',
            parameters: {
                type: 'object',
                properties: {
                    idsFileName: { type: 'string' },
                    name: { type: 'string' },
                    ifcVersion: { type: 'string' },
                    description: { type: 'string' },
                    applicabilityFacets: { type: 'array' },
                    requirementFacets: { type: 'array' }
                },
                required: ['idsFileName', 'name', 'applicabilityFacets', 'requirementFacets']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'validate_ids_xml',
            description: 'Spustí XSD validaci IDS souboru proti ids-1.0.xsd. Vrací valid + errors[0..20]. Funguje jen tam, kde je XSD validátor načtený (validator/parser stránka).',
            parameters: {
                type: 'object',
                properties: { idsFileName: { type: 'string' } },
                required: ['idsFileName']
            }
        }
    }
```

- [ ] **Step 7: Update count assertions: 50 → 53**

- [ ] **Step 8: Add 3 tests to tools-ids.test.js**

Append:
```js
    it('generate_ids_skeleton returns valid-looking XML', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const r = await tools.generate_ids_skeleton({ title: 'Test IDS', author: 'me@example.com' });
        expect(typeof r.xml).toBe('string');
        expect(r.xml.includes('<title>Test IDS</title>')).toBe(true);
        expect(r.xml.includes('<ids')).toBe(true);
    });

    it('add_specification_to_ids appends spec with confirm', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>T</title><author>a@b.c</author></info><specifications><specification name="Existing" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements/></specification></specifications></ids>`;
        await window.BIMStorage.saveFile('ids', { name: 'add_spec.ids', size: ids.length, content: ids });
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await tools.add_specification_to_ids({
                idsFileName: 'add_spec.ids',
                name: 'NewSpec',
                applicabilityFacets: [{ type: 'entity', name: { simpleValue: 'IFCDOOR' } }],
                requirementFacets: []
            });
            expect(r.added).toBe(true);
            expect(r.totalSpecs).toBe(2);
        } finally {
            window.confirm = orig;
            await window.BIMStorage.deleteFile('ids', 'add_spec.ids').catch(() => {});
        }
    });

    it('validate_ids_xml returns validator_not_available when XSD validator missing', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const orig = window.IDSXSDValidator;
        delete window.IDSXSDValidator;
        try {
            const r = await tools.validate_ids_xml({ idsFileName: 'whatever.ids' });
            expect(r.error).toBe('validator_not_available');
        } finally {
            if (orig) window.IDSXSDValidator = orig;
        }
    });
```

- [ ] **Step 9: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
cp index.html dist/index.html
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 666/666 (663 + 3).

- [ ] **Step 10: Commit**
```bash
git add assets/js/ai/tools/tool-ids.js dist/assets/js/ai/tools/tool-ids.js \
        assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        index.html dist/index.html \
        tests/test-suites/tools-ids.test.js \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js
git commit -m "feat(ai-tools-9c): IDS gen — skeleton + add_spec + validate_xml"
```

---

## Task 5: bSDD stubs — bsdd_search + bsdd_get_property

**Files:**
- Create: `assets/js/ai/tools/tool-bsdd.js`
- Modify: `assets/js/ai/tool-executor.js` — import + register
- Modify: `assets/js/ai/tool-defs.js`
- Create: `tests/test-suites/tools-bsdd.test.js`
- Modify: `tests/test-runner.html`
- Bump count 53 → 55

- [ ] **Step 1: Create tool-bsdd.js**

```js
import * as helpers from './_helpers.js';

const _DISABLED = { error: 'integration_disabled', message: 'bSDD integrace zatím není zapojena. Implementace přijde v další fázi.' };

export async function bsdd_search(args) {
    helpers.validateArgs(args, { query: { required: true } });
    return _DISABLED;
}

export async function bsdd_get_property(args) {
    helpers.validateArgs(args, { uri: { required: true } });
    return _DISABLED;
}

export function register(registerFn) {
    registerFn('bsdd_search', bsdd_search);
    registerFn('bsdd_get_property', bsdd_get_property);
}
```

- [ ] **Step 2: Wire executor bootstrap**

In `assets/js/ai/tool-executor.js`, after the `tool-presets` import line, add:
```js
import * as bsddTools from './tools/tool-bsdd.js';
```

In `_bootstrap()`, after `presetTools.register(_registerTool);`, add:
```js
    bsddTools.register(_registerTool);
```

- [ ] **Step 3: Add 2 tool-defs entries**

In `tool-defs.js`:
```js
    {
        type: 'function',
        function: {
            name: 'bsdd_search',
            description: 'Hledání v buildingSMART Data Dictionary. Aktuálně gated stub — vrátí integration_disabled. Bude implementováno v další fázi.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    classificationUri: { type: 'string' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'bsdd_get_property',
            description: 'Detail bSDD property dle URI. Aktuálně gated stub — vrátí integration_disabled.',
            parameters: {
                type: 'object',
                properties: { uri: { type: 'string' } },
                required: ['uri']
            }
        }
    }
```

- [ ] **Step 4: Create tests/test-suites/tools-bsdd.test.js**

```js
describe('tool-bsdd (gated stubs)', () => {
    let bsddTools;

    beforeEach(async () => {
        bsddTools = await import('../../assets/js/ai/tools/tool-bsdd.js');
    });

    it('bsdd_search returns integration_disabled', async () => {
        const r = await bsddTools.bsdd_search({ query: 'wall' });
        expect(r.error).toBe('integration_disabled');
    });

    it('bsdd_get_property returns integration_disabled', async () => {
        const r = await bsddTools.bsdd_get_property({ uri: 'https://example/x' });
        expect(r.error).toBe('integration_disabled');
    });

    it('bsdd_search throws on missing query', async () => {
        let threw = false;
        try { await bsddTools.bsdd_search({}); } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('register adds 2 tools', async () => {
        let count = 0;
        bsddTools.register(() => { count++; });
        expect(count).toBe(2);
    });
});
```

- [ ] **Step 5: Add test runner script tag**

In `tests/test-runner.html`, after `<script src="test-suites/tools-presets.test.js"></script>`, add:
```html
    <script src="test-suites/tools-bsdd.test.js"></script>
```

- [ ] **Step 6: Update count assertions: 53 → 55**

- [ ] **Step 7: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-bsdd.js dist/assets/js/ai/tools/tool-bsdd.js
cp assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 670/670 (666 + 4).

- [ ] **Step 8: Commit**
```bash
git add assets/js/ai/tools/tool-bsdd.js dist/assets/js/ai/tools/tool-bsdd.js \
        assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js \
        assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        tests/test-suites/tools-bsdd.test.js tests/test-runner.html \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js
git commit -m "feat(ai-tools-9c): bsdd_search + bsdd_get_property (gated stubs)"
```

---

## Task 6: Excel export — export_validation_xlsx

**Files:**
- Modify: `assets/js/ai/tools/tool-validator.js`
- Modify: `assets/js/ai/tool-defs.js`
- Modify: `tests/test-suites/tools-validator.test.js`
- Bump count 55 → 56

- [ ] **Step 1: Add `export_validation_xlsx` to tool-validator.js**

Append before existing `register()`:
```js
export async function export_validation_xlsx() {
    if (helpers.getCurrentPageId() !== 'validator') {
        return { error: 'wrong_page', message: 'Excel export funguje jen na Validator stránce po spuštění validace.' };
    }
    if (typeof window.exportToXLSX !== 'function') {
        return { error: 'export_not_available', message: 'exportToXLSX není dostupný — validace nebyla spuštěna nebo strana je špatně načtená.' };
    }
    if (!Array.isArray(window.validationResults) || window.validationResults.length === 0) {
        return { error: 'no_results' };
    }
    window.exportToXLSX();
    return { triggered: true, message: 'Export spuštěn — soubor by se měl stáhnout do tvého OS.' };
}
```

- [ ] **Step 2: Update register() in tool-validator.js**

Inside existing `register()`:
```js
    registerFn('export_validation_xlsx', export_validation_xlsx);
```

Bump tools-validator.test.js register count by 1.

- [ ] **Step 3: Add tool-def entry**

In `tool-defs.js`:
```js
    {
        type: 'function',
        function: {
            name: 'export_validation_xlsx',
            description: 'Stáhne Excel export validačních výsledků. Page-locked na Validator po spuštění validace.',
            parameters: { type: 'object', properties: {} }
        }
    }
```

- [ ] **Step 4: Update count assertions: 55 → 56**

- [ ] **Step 5: Add 2 tests to tools-validator.test.js**

Append:
```js
    it('export_validation_xlsx returns wrong_page off validator', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers._setCurrentPageForTest('parser');
        try {
            const r = await tools.export_validation_xlsx({});
            expect(r.error).toBe('wrong_page');
        } finally {
            helpers._setCurrentPageForTest(null);
        }
    });

    it('export_validation_xlsx triggers exportToXLSX when on validator', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers._setCurrentPageForTest('validator');
        const origExport = window.exportToXLSX;
        const origResults = window.validationResults;
        let called = false;
        window.exportToXLSX = () => { called = true; };
        window.validationResults = [{ ifcResults: [] }];
        try {
            const r = await tools.export_validation_xlsx({});
            expect(r.triggered).toBe(true);
            expect(called).toBe(true);
        } finally {
            window.exportToXLSX = origExport;
            window.validationResults = origResults;
            helpers._setCurrentPageForTest(null);
        }
    });
```

- [ ] **Step 6: Mirror + run tests**
```bash
cp assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 672/672 (670 + 2).

- [ ] **Step 7: Commit**
```bash
git add assets/js/ai/tools/tool-validator.js dist/assets/js/ai/tools/tool-validator.js \
        assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        tests/test-suites/tools-validator.test.js \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js
git commit -m "feat(ai-tools-9c): export_validation_xlsx tool"
```

---

## Task 7: Wire-up — SW cache + tool-defs comment + PLAN/CHANGELOG + push

**Files:**
- Modify: `sw.js` + `dist/sw.js` — bump v29 → v30, add `tool-bsdd.js` to ASSETS_TO_CACHE
- Modify: `assets/js/ai/tool-defs.js` + dist mirror — fix header comment to `56 tools`
- Modify: `PLAN.md` — append Phase 9c section
- Modify: `CHANGELOG.md` — `[0.7.0]` entry at top

- [ ] **Step 1: Bump SW cache + add tool-bsdd.js**

In `sw.js`:
- `const CACHE_VERSION = 'bim-checker-v29';` → `'bim-checker-v30'`
- In `ASSETS_TO_CACHE`, find `'./assets/js/ai/tools/tool-presets.js',`. After it add:
```
    './assets/js/ai/tools/tool-bsdd.js',
```

Mirror to `dist/sw.js`.

- [ ] **Step 2: Fix tool-defs.js comment**

In `assets/js/ai/tool-defs.js`, change the header comment count `44 tools` to `56 tools`.

Mirror to dist.

- [ ] **Step 3: Append Phase 9c block to PLAN.md**

After the existing `## Phase 9b` section, append:
```markdown
## Phase 9c: IDS deep-dive + IDS gen + bSDD + Excel ✅
- [x] 12 tools (IDS detail 2, validation deep-dive 2, IFC analysis 2, IDS gen 3, bSDD stubs 2, Excel 1)
- [x] Spec/facet introspection via `IDSParser`
- [x] Validation failure drilldown reads `window.validationResults` (page-locked)
- [x] IDS XML generation via existing `IDSXMLGenerator` (homepage gets script tag for skeleton tool)
- [x] bSDD tools shipped as gated stubs returning `integration_disabled`
- [x] ~22 new tests (652 → ~674)

Branch: phase-9c-ids-validation-deep
```

- [ ] **Step 4: Insert [0.7.0] block in CHANGELOG.md**

After header, before the first existing version block:
```markdown
## [0.7.0] - 2026-05-10

### Added
- AI tools (Phase 9c, 12 new): IDS deep-dive, validation drilldown, IFC analysis, IDS generation, bSDD stubs, Excel export
- `tool-bsdd.js` module — gated stubs for upcoming bSDD integration
- IDSXMLGenerator now loaded on homepage (was only on parser/viewer)
- AI catalog reaches 56 tools end-to-end

### Changed
- `tool-executor.js` `_bootstrap()` registers `tool-bsdd`
- SW cache bumped v29 → v30
```

- [ ] **Step 5: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 672/672.

- [ ] **Step 6: Commit + push**
```bash
git add sw.js dist/sw.js \
        assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        PLAN.md CHANGELOG.md
git commit -m "chore(phase-9c): SW v29→v30 + comment fix + PLAN/CHANGELOG"
git push -u origin phase-9c-ids-validation-deep
```

Capture and report PR URL.

---

## Self-Review Notes

**Spec coverage:**
- Tier C "IDS / Validation deep-dive" 6 tools → Tasks 1-3 cover get_specification_detail, get_facet_detail, get_validation_failures, count_failures_by_requirement, compare_ifc_files, find_property_in_ifc ✓
- Tier C "IDS gen & ecosystem" 6 tools → Task 4 (3 tools), Task 5 (2 bSDD), Task 6 (export) ✓
- Total 12 tools ✓
- Czech tool descriptions ✓
- Native confirm() on `add_specification_to_ids` ✓
- Page-locking on `get_validation_failures`, `count_failures_by_requirement`, `export_validation_xlsx` ✓

**Type consistency:**
- `_resolveSpec(specs, args)` is a tool-ids local helper used by both Task 1 functions; it doesn't conflict with `_resolveAgentId` / `_resolveFolderId` / `_resolvePresetId` (each in its own module).
- All returns follow `{ error, message?, ...details }` shape on failure, plain object on success.
- `validate_ids_xml` is async (await IDSXSDValidator.validate) — caller chain handles it correctly.

**Test count progression:**
- Baseline: 652
- After T1: 656 (+4)
- After T2: 660 (+4)
- After T3: 663 (+3)
- After T4: 666 (+3)
- After T5: 670 (+4)
- After T6: 672 (+2)
- After T7: 672 (no new tests, just count-bumps + docs)

**Risks:**
- `add_specification_to_ids` reconstructs the entire IDS from parsed object then writes back. The IDSXMLGenerator output should round-trip, but if any custom fields are lost in the parse→regen cycle that would corrupt user data. Mitigated by `confirm()`. Document the round-trip risk in CHANGELOG.
- `validate_ids_xml` is async due to xmllint-wasm init. The chat-panel tool loop already awaits tool calls, so no extra wiring needed — but the validator init can take a second on first call.
- bSDD stubs return `integration_disabled` — the LLM will see this and either ask user how to enable or fall back to text reasoning. That's acceptable.

**Final tool count:** 44 + 12 = 56. After Phase 9c, the spec's full Phase 9 catalog is shipped.
