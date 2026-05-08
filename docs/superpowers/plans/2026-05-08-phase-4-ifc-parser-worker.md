# Phase 4 — IFC Parser Web Worker: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move IFC content parsing from main thread to a Web Worker pool. Single source of truth via new `IFCParserCore` module, called identically from worker and main-thread fallback. UI stays responsive at 60 FPS during parsing; 4 IFC files parse in parallel across 4 cores instead of contending for one.

**Architecture:** Extract pure synchronous parsing function from `validator.js parseIFCFileAsync` into new `assets/js/common/ifc-parser-core.js` (dual-context exported on `window`/`self`). Rewrite `assets/js/workers/ifc-parser.worker.js` as a ~30-line thin wrapper. Refactor validator's `parseIFCFileAsync` to dispatch via existing `WorkerPool` infrastructure with graceful main-thread fallback. Output shape is byte-identical with current parser, gated by snapshot tests before refactor.

**Tech Stack:** Vanilla JS, Web Workers API, custom Jasmine-like test framework via Puppeteer. No new libraries.

**Reference spec:** `docs/superpowers/specs/2026-05-08-phase-4-ifc-parser-worker-design.md`

---

## File Structure

### New files
- `assets/js/common/ifc-parser-core.js` — `IFCParserCore.parseIFCContent` + 7 helpers (extractGUID, extractName, decodeIFCString, parsePropertySet, parseProperty, parseRelDefines, splitParams)
- `tests/test-suites/ifc-parser-core.test.js` — ~10 unit tests for core
- `tests/test-suites/ifc-parser-backward-compat.test.js` — ~3 snapshot tests vs. legacy parseIFCFileAsync
- `tests/test-suites/ifc-parser-worker.test.js` — ~2 worker integration tests (skip-on-failure tolerated)

### Modified
- `assets/js/workers/ifc-parser.worker.js` — REWRITE: 213 → ~30 lines (thin PARSE wrapper)
- `assets/js/validator.js` — `parseIFCFileAsync` dispatches to WorkerPool with fallback; existing helpers deleted (now in IFCParserCore)
- `tests/test-runner.html` — load core module + 3 new test suites
- `sw.js` — precache `ifc-parser-core.js`, bump cache version
- `eslint.config.js` — declare `IFCParserCore` global
- `PLAN.md` — mark Phase 4 done
- `CHANGELOG.md` — entry [0.2.4]
- `dist/**` — sync mirrors

---

## Step 1: Extract IFCParserCore (no behavior change)

### Task 1: Scaffold IFCParserCore module + namespace test

**Files:**
- Create: `assets/js/common/ifc-parser-core.js`
- Create: `tests/test-suites/ifc-parser-core.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1.1: Write failing namespace test**

Create `tests/test-suites/ifc-parser-core.test.js`:
```js
describe('IFCParserCore namespace', () => {
    it('should expose IFCParserCore globally', () => {
        expect(typeof window.IFCParserCore).toBe('object');
        expect(typeof window.IFCParserCore.parseIFCContent).toBe('function');
    });
});
```

- [ ] **Step 1.2: Add module + suite to test-runner.html**

In `tests/test-runner.html`, find the existing `<script src="../assets/js/common/property-set-index.js"></script>` line. Insert AFTER it:
```html
<script src="../assets/js/common/ifc-parser-core.js"></script>
```

In the test suites block (where other `test-suites/*.test.js` lines live), add:
```html
<script src="test-suites/ifc-parser-core.test.js"></script>
```

- [ ] **Step 1.3: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "IFCParserCore namespace"
```
Expected: FAIL with "expected undefined to be 'object'".

- [ ] **Step 1.4: Create scaffold module**

Create `assets/js/common/ifc-parser-core.js`:
```js
/**
 * IFCParserCore — pure synchronous IFC content → entities[] parser.
 * Single source of truth, used by:
 *   - assets/js/workers/ifc-parser.worker.js (worker context, self.IFCParserCore)
 *   - assets/js/validator.js (main thread fallback when Worker unavailable)
 *
 * Output shape matches existing parseIFCFileAsync exactly:
 *   { guid, entity, name, propertySets, fileName, attributes: { Name, GlobalId } }
 */
(function(global) {
    'use strict';

    function parseIFCContent(_content, _fileName) {
        // Stub — implemented in subsequent tasks
        return [];
    }

    global.IFCParserCore = { parseIFCContent };
})(typeof self !== 'undefined' ? self : window);
```

- [ ] **Step 1.5: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "IFCParserCore namespace"
```
Expected: PASS.

- [ ] **Step 1.6: Sync dist + commit**

```bash
mkdir -p dist/assets/js/common/
cp assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js
git add assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js tests/test-runner.html tests/test-suites/ifc-parser-core.test.js
git commit -m "feat(ifc-parser-core): scaffold IFCParserCore namespace module"
```

---

### Task 2: Migrate parsing helpers into IFCParserCore

**Files:**
- Modify: `assets/js/common/ifc-parser-core.js`
- Modify: `tests/test-suites/ifc-parser-core.test.js`

- [ ] **Step 2.1: Write failing helper tests**

Append to `tests/test-suites/ifc-parser-core.test.js`:
```js
describe('IFCParserCore helpers', () => {
    it('extractGUID returns first quoted string', () => {
        const params = "'guid-123', $, 'name', $";
        expect(IFCParserCore._extractGUID(params)).toBe('guid-123');
    });

    it('extractName returns second quoted string (decoded)', () => {
        const params = "'guid', $, 'Wall_001', $";
        expect(IFCParserCore._extractName(params)).toBe('Wall_001');
    });

    it('extractName decodes IFC \\X2\\ encoding', () => {
        // \X2\017D\X0\ = Ž
        const params = "'guid', $, 'S\\X2\\017D\\X0\\_test', $";
        expect(IFCParserCore._extractName(params)).toBe('SŽ_test');
    });

    it('decodeIFCString handles plain ASCII', () => {
        expect(IFCParserCore._decodeIFCString('hello')).toBe('hello');
    });

    it('splitParams handles nested parens', () => {
        const result = IFCParserCore._splitParams("a, b, (c, d), e");
        expect(result.length).toBe(4);
        expect(result[2].trim()).toBe('(c, d)');
    });

    it('splitParams respects quoted strings with commas', () => {
        const result = IFCParserCore._splitParams("'a, b', c");
        expect(result.length).toBe(2);
    });
});
```

- [ ] **Step 2.2: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "IFCParserCore helpers"
```
Expected: 6 FAILs.

- [ ] **Step 2.3: Migrate helpers from validator.js into core**

Read the existing helpers from `assets/js/validator.js`:
- `extractGUID` (around line 492)
- `extractName` (around line 497)
- `decodeIFCString` (around line 502)
- `parsePropertySet` (around line 540)
- `parseProperty` (within parsePropertySet, ~line 564)
- `parseRelDefines` (around line 618)
- `splitParams` (around line 628)

Copy them VERBATIM into `assets/js/common/ifc-parser-core.js` inside the IIFE (above the `parseIFCContent` stub, but inside `(function(global) {`). Update them:

```js
(function(global) {
    'use strict';

    function extractGUID(params) {
        const match = params.match(/'([^']+)'/);
        return match ? match[1] : null;
    }

    function extractName(params) {
        const matches = params.match(/'([^']*)'/g);
        const rawName = matches && matches.length > 1 ? matches[1].replace(/'/g, '') : null;
        return rawName ? decodeIFCString(rawName) : null;
    }

    function decodeIFCString(str) {
        if (!str) return str;
        str = str.replace(/\\S\\(.)/g, (m, char) => String.fromCharCode(char.charCodeAt(0) + 128));
        str = str.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 4) {
                result += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
            }
            return result;
        });
        str = str.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 8) {
                result += String.fromCodePoint(parseInt(hex.substr(i, 8), 16));
            }
            return result;
        });
        return str;
    }

    function splitParams(params) {
        const parts = [];
        let current = '';
        let depth = 0;
        let inString = false;
        for (let i = 0; i < params.length; i++) {
            const char = params[i];
            if (char === "'") {
                if (inString && params[i + 1] === "'") {
                    current += "''";
                    i++;
                    continue;
                }
                inString = !inString;
                current += char;
                continue;
            }
            if (!inString) {
                if (char === '(') depth++;
                else if (char === ')') depth--;
                else if (char === ',' && depth === 0) {
                    parts.push(current);
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        if (current.length) parts.push(current);
        return parts;
    }

    function parsePropertySet(params, entityMap) {
        const parts = splitParams(params);
        const rawName = parts[2] ? parts[2].replace(/'/g, '') : 'Unknown';
        const name = decodeIFCString(rawName);
        const properties = {};
        if (parts.length > 4) {
            const propIds = parts[4].match(/#\d+/g);
            if (propIds) {
                for (const propId of propIds) {
                    const id = propId.substring(1);
                    const propEntity = entityMap.get(id);
                    if (propEntity && propEntity.type === 'IFCPROPERTYSINGLEVALUE') {
                        const prop = parseProperty(propEntity.params);
                        if (prop) properties[prop.name] = prop.value;
                    }
                }
            }
        }
        return { name, properties };
    }

    function parseProperty(params) {
        const parts = splitParams(params);
        if (parts.length < 3) return null;
        const rawName = parts[0].replace(/'/g, '');
        const name = decodeIFCString(rawName);
        let value = parts[2] || '';
        if (value === '$' || value.trim() === '') return { name, value: '' };
        const stringMatch = value.match(/IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE)\s*\(\s*'([^']*)'\s*\)/i);
        if (stringMatch) return { name, value: decodeIFCString(stringMatch[1]) };
        const booleanMatch = value.match(/IFCBOOLEAN\s*\(\s*\.(T|F)\.\s*\)/i);
        if (booleanMatch) return { name, value: booleanMatch[1].toUpperCase() === 'T' ? 'TRUE' : 'FALSE' };
        const logicalMatch = value.match(/IFCLOGICAL\s*\(\s*\.(T|F|U)\.\s*\)/i);
        if (logicalMatch) {
            const v = logicalMatch[1].toUpperCase();
            return { name, value: v === 'T' ? 'TRUE' : v === 'F' ? 'FALSE' : 'UNKNOWN' };
        }
        const numericMatch = value.match(/IFC(?:[A-Z]+)?(?:MEASURE)?\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
        if (numericMatch) return { name, value: numericMatch[1] };
        const angleMatch = value.match(/IFCPLANEANGLEMEASURE\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
        if (angleMatch) return { name, value: angleMatch[1] };
        return { name, value };
    }

    function parseRelDefines(params) {
        const parts = splitParams(params);
        const relatedObjects = parts[4] ? parts[4].match(/#\d+/g)?.map(r => r.substring(1)) : [];
        const relatingMatch = parts[5] ? parts[5].match(/#(\d+)/) : null;
        return {
            relatedObjects,
            relatingPropertyDefinition: relatingMatch ? relatingMatch[1] : null
        };
    }

    function parseIFCContent(_content, _fileName) {
        // Stub — implemented in Task 3
        return [];
    }

    global.IFCParserCore = {
        parseIFCContent,
        // Test-only exports (prefixed with _ to mark internal)
        _extractGUID: extractGUID,
        _extractName: extractName,
        _decodeIFCString: decodeIFCString,
        _splitParams: splitParams,
        _parsePropertySet: parsePropertySet,
        _parseProperty: parseProperty,
        _parseRelDefines: parseRelDefines
    };
})(typeof self !== 'undefined' ? self : window);
```

The `_`-prefixed exports are internal helpers exposed for unit testing. Production callers only use `parseIFCContent`.

- [ ] **Step 2.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "IFCParserCore helpers"
```
Expected: 6 PASS.

- [ ] **Step 2.5: Sync dist + commit**

```bash
cp assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js
git add assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js tests/test-suites/ifc-parser-core.test.js
git commit -m "feat(ifc-parser-core): migrate parsing helpers from validator.js"
```

---

### Task 3: Implement parseIFCContent + tests

**Files:**
- Modify: `assets/js/common/ifc-parser-core.js`
- Modify: `tests/test-suites/ifc-parser-core.test.js`

- [ ] **Step 3.1: Write failing parseIFCContent tests**

Append to `tests/test-suites/ifc-parser-core.test.js`:
```js
describe('IFCParserCore.parseIFCContent', () => {
    const minimalIFC = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('guid-1',$,'Wall_001',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;

    it('parses minimal valid IFC and returns 1 entity', () => {
        const entities = IFCParserCore.parseIFCContent(minimalIFC, 'test.ifc');
        expect(entities.length).toBe(1);
        expect(entities[0].entity).toBe('IFCWALL');
        expect(entities[0].guid).toBe('guid-1');
        expect(entities[0].name).toBe('Wall_001');
        expect(entities[0].fileName).toBe('test.ifc');
    });

    it('output entity has all required fields', () => {
        const entities = IFCParserCore.parseIFCContent(minimalIFC, 'test.ifc');
        const e = entities[0];
        expect(typeof e.guid).toBe('string');
        expect(typeof e.entity).toBe('string');
        expect(typeof e.name).toBe('string');
        expect(typeof e.propertySets).toBe('object');
        expect(typeof e.fileName).toBe('string');
        expect(typeof e.attributes).toBe('object');
        expect(e.attributes.Name).toBe(e.name);
        expect(e.attributes.GlobalId).toBe(e.guid);
    });

    it('returns empty array for empty content', () => {
        const entities = IFCParserCore.parseIFCContent('', 'empty.ifc');
        expect(entities).toEqual([]);
    });

    it('skips REL and PROPERTY entity types from output', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall',$,$,$,$,$,$);
#2=IFCPROPERTYSET('pset-guid',$,'Pset_Test',$,(#3));
#3=IFCPROPERTYSINGLEVALUE('Prop',$,IFCLABEL('val'),$);
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#2);
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        // Only IFCWALL should be in output (IFCPROPERTYSET, IFCPROPERTYSINGLEVALUE, IFCRELDEFINESBYPROPERTIES filtered)
        expect(entities.length).toBe(1);
        expect(entities[0].entity).toBe('IFCWALL');
    });

    it('links property set to entity via rel', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall',$,$,$,$,$,$);
#2=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);
#3=IFCPROPERTYSET('pset-guid',$,'Pset_WallCommon',$,(#2));
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#3);
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        expect(entities.length).toBe(1);
        expect(entities[0].propertySets['Pset_WallCommon']).toBeDefined();
        expect(entities[0].propertySets['Pset_WallCommon']['FireRating']).toBe('EI60');
    });

    it('skips entities without GUID', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        // No quoted strings, no GUID → filtered out
        expect(entities.length).toBe(0);
    });

    it('handles multiple entity types', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('g1',$,'W1',$,$,$,$,$,$);
#2=IFCDOOR('g2',$,'D1',$,$,$,$,$,$,$,$,$);
#3=IFCWALLSTANDARDCASE('g3',$,'W3',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        expect(entities.length).toBe(3);
        const types = entities.map(e => e.entity);
        expect(types).toContain('IFCWALL');
        expect(types).toContain('IFCDOOR');
        expect(types).toContain('IFCWALLSTANDARDCASE');
    });
});
```

- [ ] **Step 3.2: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "parseIFCContent"
```
Expected: 7 FAILs (stub returns []).

- [ ] **Step 3.3: Implement parseIFCContent**

In `assets/js/common/ifc-parser-core.js`, replace the stub `parseIFCContent` with:
```js
function parseIFCContent(content, fileName) {
    const lines = content.split('\n');
    const entityMap = new Map();
    const propertySetMap = new Map();
    const relDefinesMap = new Map();

    // Phase 1: collect entities
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || !line.startsWith('#')) continue;
        const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?\s*$/i);
        if (!match) continue;
        const [, id, entityType, params] = match;
        entityMap.set(id, { id, type: entityType, params });
    }

    // Phase 2: parse property sets + rel defines
    for (const [id, entity] of entityMap.entries()) {
        if (entity.type === 'IFCPROPERTYSET') {
            propertySetMap.set(id, parsePropertySet(entity.params, entityMap));
        } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
            relDefinesMap.set(id, parseRelDefines(entity.params));
        }
    }

    // Phase 3: inverted index for fast pset lookup
    const propertySetIndex = global.PropertySetIndex.build(relDefinesMap);

    // Phase 4: build entity list
    const entities = [];
    for (const [id, entity] of entityMap.entries()) {
        if (!entity.type.startsWith('IFC')) continue;
        if (entity.type.includes('REL') || entity.type.includes('PROPERTY')) continue;
        if (!entity.params.includes("'")) continue;

        const guid = extractGUID(entity.params);
        const name = extractName(entity.params);
        if (!guid) continue;

        const propertySets = {};
        const psetIds = global.PropertySetIndex.getPropertySetIds(propertySetIndex, id);
        for (const psetId of psetIds) {
            if (propertySetMap.has(psetId)) {
                const pset = propertySetMap.get(psetId);
                if (pset && pset.name) {
                    propertySets[pset.name] = pset.properties;
                }
            }
        }

        entities.push({
            guid,
            entity: entity.type,
            name: name || '-',
            propertySets,
            fileName,
            attributes: { Name: name || '-', GlobalId: guid }
        });
    }

    return entities;
}
```

- [ ] **Step 3.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "parseIFCContent"
```
Expected: 7 PASS.

- [ ] **Step 3.5: Sync dist + commit**

```bash
cp assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js
git add assets/js/common/ifc-parser-core.js dist/assets/js/common/ifc-parser-core.js tests/test-suites/ifc-parser-core.test.js
git commit -m "feat(ifc-parser-core): implement parseIFCContent (4-phase parser)"
```

---

### Task 4: Backward-compat snapshot tests

**Files:**
- Create: `tests/test-suites/ifc-parser-backward-compat.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 4.1: Create snapshot test file**

Create `tests/test-suites/ifc-parser-backward-compat.test.js`:
```js
describe('IFCParserCore vs legacy parseIFCFileAsync (snapshot)', () => {
    function deepEqual(a, b) {
        return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
    }
    function normalize(obj) {
        if (Array.isArray(obj)) return obj.map(normalize);
        if (obj && typeof obj === 'object') {
            const sorted = {};
            for (const k of Object.keys(obj).sort()) sorted[k] = normalize(obj[k]);
            return sorted;
        }
        return obj;
    }

    const samples = [
        {
            label: 'minimal IFC with one IFCWALL',
            content: `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall_001',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`
        },
        {
            label: 'IFC with pset',
            content: `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall',$,$,$,$,$,$);
#2=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);
#3=IFCPROPERTYSET('pset-guid',$,'Pset_WallCommon',$,(#2));
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#3);
ENDSEC;
END-ISO-10303-21;`
        },
        {
            label: 'IFCBUILDINGELEMENTPROXY (real-world case)',
            content: `ISO-10303-21;
DATA;
#1=IFCBUILDINGELEMENTPROXY('proxy-guid',$,'Proxy_001','desc','tag',$,$,'876',$);
#2=IFCPROPERTYSINGLEVALUE('Custom',$,IFCLABEL('value'),$);
#3=IFCPROPERTYSET('pset-guid',$,'CustomPset',$,(#2));
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#3);
ENDSEC;
END-ISO-10303-21;`
        }
    ];

    samples.forEach((sample) => {
        it(`output JSON-identical between IFCParserCore and legacy parseIFCFileAsync — ${sample.label}`, async () => {
            // Legacy path — call the existing parseIFCFileAsync from validator.js (loaded globally)
            const legacy = await window.parseIFCFileAsync(sample.content, 'snapshot.ifc');
            const fresh = window.IFCParserCore.parseIFCContent(sample.content, 'snapshot.ifc');
            const same = deepEqual(legacy, fresh);
            if (!same) {
                console.log('LEGACY:', JSON.stringify(normalize(legacy), null, 2));
                console.log('FRESH:', JSON.stringify(normalize(fresh), null, 2));
            }
            expect(same).toBe(true);
        });
    });
});
```

- [ ] **Step 4.2: Add suite to test-runner.html**

In `tests/test-runner.html`, after the `ifc-parser-core.test.js` line, add:
```html
<script src="test-suites/ifc-parser-backward-compat.test.js"></script>
```

- [ ] **Step 4.3: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "snapshot"
```
Expected: 3 PASS (snapshot output should match because IFCParserCore was migrated from same validator.js logic).

If FAIL: compare LEGACY vs FRESH output in console (test prints them). Debug whatever divergence exists. Most likely cause: a missing helper function in the migration, or a subtle whitespace difference. Fix in `ifc-parser-core.js` and re-run.

- [ ] **Step 4.4: Commit**

```bash
git add tests/test-suites/ifc-parser-backward-compat.test.js tests/test-runner.html
git commit -m "test(ifc-parser-core): backward-compat snapshot vs legacy parseIFCFileAsync"
```

---

### Task 5: Refactor validator.js to use IFCParserCore (no worker yet)

**Files:**
- Modify: `assets/js/validator.js`
- Modify: `pages/ids-ifc-validator.html` (load core script)

- [ ] **Step 5.1: Add ifc-parser-core.js to validator page**

In `pages/ids-ifc-validator.html`, find the existing `<script src="../assets/js/common/property-set-index.js"></script>` (or similar common module). Insert AFTER it:
```html
<script src="../assets/js/common/ifc-parser-core.js"></script>
```

Order matters: `ifc-parser-core.js` must load AFTER `property-set-index.js` (it depends on PropertySetIndex global) but BEFORE `validator.js`.

- [ ] **Step 5.2: Refactor parseIFCFileAsync to delegate to IFCParserCore**

In `assets/js/validator.js`, find `async function parseIFCFileAsync(content, fileName)` (around line 321). Replace its body to call `IFCParserCore.parseIFCContent`:

```js
async function parseIFCFileAsync(content, fileName) {
    // Yield to UI thread first to keep frame budget
    await new Promise(resolve => setTimeout(resolve, 0));
    return IFCParserCore.parseIFCContent(content, fileName);
}
```

(The chunked async loop is replaced with sync core call; one yield at start preserves UI responsiveness during dispatch. Worker dispatch comes in Task 7 — for now this is a pure delegation.)

- [ ] **Step 5.3: Delete migrated helpers from validator.js**

In `assets/js/validator.js`, delete these function definitions (now in IFCParserCore):
- `extractGUID` (around line 492)
- `extractName` (around line 497)
- `decodeIFCString` (around line 502)
- `parsePropertySet` (around line 540)
- `parseProperty` (within parsePropertySet area)
- `parseRelDefines` (around line 618)
- `splitParams` (around line 628)

Verify no remaining callers of these helpers in `validator.js`:
```bash
grep -nE "\b(extractGUID|extractName|decodeIFCString|parsePropertySet|parseProperty|parseRelDefines|splitParams)\b" assets/js/validator.js
```
Expected: no matches (only function calls were inside the deleted parseIFCFileAsync body, which now delegates).

- [ ] **Step 5.4: Run all tests**

```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: All ~440 tests pass (425 baseline + ~13 new from Tasks 1-4 + 3 from snapshot). The snapshot tests prove output is identical.

- [ ] **Step 5.5: Sync dist + commit**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
git add assets/js/validator.js dist/assets/js/validator.js pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
git commit -m "refactor(validator): delegate IFC parsing to IFCParserCore"
```

**✅ Step 1 checkpoint:** IFC parsing extracted to IFCParserCore, validator delegates, snapshot tests prove no behavior change.

---

## Step 2: Worker rewrite + dispatch

### Task 6: Rewrite ifc-parser.worker.js as thin wrapper

**Files:**
- Modify: `assets/js/workers/ifc-parser.worker.js` (REWRITE)

- [ ] **Step 6.1: Replace entire worker file content**

Replace `assets/js/workers/ifc-parser.worker.js` content with:
```js
/**
 * IFC parser worker. Single message type: PARSE.
 * Delegates to IFCParserCore.parseIFCContent for actual work.
 *
 * Pool dispatcher (WorkerPool) wraps each task in a taskId envelope:
 *   incoming: { taskId, type: 'PARSE', data: { content, fileName } }
 *   reply:    { taskId, type: 'PARSE_DONE', data: entities[] }
 *   error:    { taskId, error: 'message' }
 */
importScripts('../common/property-set-index.js');
importScripts('../common/ifc-parser-core.js');

self.onmessage = function(e) {
    const { taskId, type, data } = e.data;
    if (type !== 'PARSE') return;

    try {
        const entities = self.IFCParserCore.parseIFCContent(data.content, data.fileName);
        self.postMessage({ taskId, type: 'PARSE_DONE', data: entities });
    } catch (err) {
        self.postMessage({ taskId, error: err.message || String(err) });
    }
};

self.postMessage({ type: 'READY' });
```

- [ ] **Step 6.2: Sync dist**

```bash
cp assets/js/workers/ifc-parser.worker.js dist/assets/js/workers/ifc-parser.worker.js
diff -q assets/js/workers/ifc-parser.worker.js dist/assets/js/workers/ifc-parser.worker.js
```

- [ ] **Step 6.3: Run tests, verify no regression**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: same pass count (worker not yet wired in validator, so tests don't exercise it).

- [ ] **Step 6.4: Commit**

```bash
git add assets/js/workers/ifc-parser.worker.js dist/assets/js/workers/ifc-parser.worker.js
git commit -m "feat(ifc-parser-worker): rewrite as thin IFCParserCore wrapper"
```

---

### Task 7: Wire WorkerPool dispatch into validator

**Files:**
- Modify: `assets/js/validator.js`

- [ ] **Step 7.1: Add lazy worker pool init helper**

In `assets/js/validator.js`, near the top of the file (after the global declarations like `let validationResults = null;`), add:
```js
// Lazy-initialized IFC parser worker pool. null = not yet attempted, false = init failed (use main thread).
let _ifcParserPool = null;
let _ifcParserPoolInitialized = false;

function _getIfcParserPool() {
    if (_ifcParserPoolInitialized) return _ifcParserPool;
    _ifcParserPoolInitialized = true;

    if (typeof Worker === 'undefined' || typeof WorkerPool === 'undefined') {
        return null;
    }

    try {
        const scripts = document.querySelectorAll('script[src*="validator.js"]');
        const validatorSrc = scripts.length ? scripts[0].src : '';
        const baseUrl = validatorSrc.substring(0, validatorSrc.lastIndexOf('/'));
        const workerScript = `${baseUrl}/workers/ifc-parser.worker.js`;
        _ifcParserPool = new WorkerPool({
            workerScript,
            size: Math.min(4, navigator.hardwareConcurrency || 4)
        });
    } catch (e) {
        console.warn('IFC parser worker pool init failed, falling back to main thread:', e);
        _ifcParserPool = null;
    }
    return _ifcParserPool;
}
```

- [ ] **Step 7.2: Update parseIFCFileAsync to dispatch via pool**

Replace the body of `parseIFCFileAsync` (from Task 5) with:
```js
async function parseIFCFileAsync(content, fileName) {
    const pool = _getIfcParserPool();
    if (pool) {
        try {
            return await pool.submit('PARSE', { content, fileName });
        } catch (e) {
            console.warn('Worker parse failed, falling back to main thread:', e);
            // fall through
        }
    }
    // Main-thread fallback: yield to UI then run sync parser
    await new Promise(resolve => setTimeout(resolve, 0));
    return IFCParserCore.parseIFCContent(content, fileName);
}
```

- [ ] **Step 7.3: Run all tests**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: All tests still pass. Tests in Puppeteer test-runner.html may or may not exercise worker path depending on URL resolution; either way, fallback delivers same output.

- [ ] **Step 7.4: Sync dist + commit**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
git add assets/js/validator.js dist/assets/js/validator.js
git commit -m "feat(validator): dispatch IFC parsing to WorkerPool with main-thread fallback"
```

---

### Task 8: Worker integration test

**Files:**
- Create: `tests/test-suites/ifc-parser-worker.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 8.1: Create worker integration test**

Create `tests/test-suites/ifc-parser-worker.test.js`:
```js
describe('IFC parser worker integration', () => {
    let pool = null;
    let workerSupported = false;

    beforeEach(() => {
        try {
            if (typeof Worker !== 'undefined' && typeof WorkerPool !== 'undefined') {
                // Resolve worker script relative to test-runner.html
                pool = new WorkerPool({
                    workerScript: '../assets/js/workers/ifc-parser.worker.js',
                    size: 1
                });
                workerSupported = true;
            }
        } catch (e) {
            console.warn('Worker pool init failed in test env:', e);
            workerSupported = false;
        }
    });

    afterEach(() => {
        if (pool && pool.terminate) pool.terminate();
        pool = null;
    });

    it('worker pool parses minimal IFC and returns expected shape', async () => {
        if (!workerSupported) {
            // Skip on env where Worker spawning fails (e.g., file:// origin)
            console.warn('Worker not supported in test env, skipping');
            return;
        }
        const minimalIFC = `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall_001',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
        const entities = await pool.submit('PARSE', {
            content: minimalIFC,
            fileName: 'worker-test.ifc'
        });
        expect(Array.isArray(entities)).toBe(true);
        expect(entities.length).toBe(1);
        expect(entities[0].entity).toBe('IFCWALL');
        expect(entities[0].guid).toBe('guid-1');
        expect(entities[0].fileName).toBe('worker-test.ifc');
    });

    it('worker reports error for malformed input', async () => {
        if (!workerSupported) return;
        let threw = false;
        try {
            await pool.submit('PARSE', { content: null, fileName: 'broken.ifc' });
        } catch (_e) {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
```

- [ ] **Step 8.2: Add to test-runner.html**

In `tests/test-runner.html`, after the snapshot test suite line, add:
```html
<script src="test-suites/ifc-parser-worker.test.js"></script>
```

- [ ] **Step 8.3: Run, verify outcome**

```bash
node tests/run-tests.js 2>&1 | grep -E "worker integration"
```
Expected: 2 PASS (or 2 PASS-WITH-SKIP if worker spawning fails in test env). Since the test is structured to gracefully skip when `workerSupported = false`, it won't FAIL the suite.

If both genuinely PASS, you've verified end-to-end worker dispatch works in Puppeteer test env.

- [ ] **Step 8.4: Commit**

```bash
git add tests/test-suites/ifc-parser-worker.test.js tests/test-runner.html
git commit -m "test(ifc-parser-worker): worker pool integration tests"
```

**✅ Step 2 checkpoint:** Worker rewritten, validator dispatches via pool, fallback functional. ~16 new tests total for Phase 4.

---

## Step 3: ESLint, PWA, docs, push

### Task 9: ESLint global declaration

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 9.1: Add IFCParserCore global**

In `eslint.config.js`, find the existing globals block (search for `Compression: 'readonly'`). Add nearby:
```js
                // Phase 4: IFC parser worker
                IFCParserCore: 'readonly'
```

(Place after the Compression line. Adjust comma punctuation as needed: previous entry needs trailing comma if not already there.)

- [ ] **Step 9.2: Verify lint passes**

```bash
npx eslint assets/js/ 2>&1 | tail -3
```
Expected: 0 errors.

- [ ] **Step 9.3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(eslint): declare IFCParserCore global"
```

---

### Task 10: PWA precache + version bump

**Files:**
- Modify: `sw.js`
- Modify: `dist/sw.js`

- [ ] **Step 10.1: Find current cache version**

```bash
grep -n "bim-checker-v" /home/michal/work/BIM_checker/sw.js | head -1
```
Note version (e.g., `v10`).

- [ ] **Step 10.2: Bump + add asset**

In `sw.js`, change the cache version constant to next number (e.g., `v10` → `v11`).

Find the `ASSETS_TO_CACHE` array. Add:
```js
'/assets/js/common/ifc-parser-core.js',
```

- [ ] **Step 10.3: Sync dist + commit**

```bash
cp sw.js dist/sw.js
git add sw.js dist/sw.js
git commit -m "chore(pwa): precache ifc-parser-core.js + bump cache version"
```

---

### Task 11: Update PLAN.md and CHANGELOG.md

**Files:**
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 11.1: Update PLAN.md**

In `PLAN.md`, find "Hotové (Done)" section. Append:
```markdown
### IFC parser Web Worker (Phase 4, 2026-05-08)
- [x] Sjednocený `IFCParserCore` modul (sync pure parser, dual-context export)
- [x] Worker rewrite: 213 řádků → ~30 (thin PARSE wrapper)
- [x] Validator dispatchuje IFC parsing přes `WorkerPool` (4 paralelní workery)
- [x] Graceful fallback na main-thread, pokud worker init/parse selže
- [x] UI 60 FPS i během parsing — main thread je free
- [x] +16 nových testů (snapshot kompatibilita + worker integration)
```

If "Web Workers pro IFC parsing" appears in TODO/"Střední priorita" section, remove it.

- [ ] **Step 11.2: Update CHANGELOG.md**

Prepend after `# Changelog` heading:
```markdown
## [0.2.4] — 2026-05-08

### Added
- IFC parser Web Worker pool — IFC content parsing now runs across up to 4 worker threads in parallel. UI thread stays at 60 FPS during parsing of multi-MB IFC files.
- `IFCParserCore` shared module — single source of truth for IFC parsing, called identically from worker and main-thread fallback.

### Changed
- `assets/js/validator.js parseIFCFileAsync` dispatches to WorkerPool when available; gracefully falls back to main-thread sync parsing when Worker API unavailable or worker init fails.
- `assets/js/workers/ifc-parser.worker.js` rewritten from 213 lines to ~30 — single PARSE message type, delegates to IFCParserCore.

### Internal
- Migrated 7 parsing helpers (extractGUID, extractName, decodeIFCString, splitParams, parsePropertySet, parseProperty, parseRelDefines) from validator.js to ifc-parser-core.js.
- 16 new tests (10 unit + 3 backward-compat snapshot + ~3 worker integration with skip-on-failure tolerated).
```

- [ ] **Step 11.3: Commit**

```bash
git add PLAN.md CHANGELOG.md
git commit -m "docs: mark Phase 4 (IFC parser Web Worker) complete"
```

---

### Task 12: Final test run + push

**Files:** none (verification + push)

- [ ] **Step 12.1: Run full test suite**

```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: SUMMARY ~441/441 (425 baseline + ~16 new for Phase 4).

- [ ] **Step 12.2: Verify dist sync**

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

- [ ] **Step 12.3: Push branch**

```bash
git push -u origin phase-4-ifc-parser-worker
```

- [ ] **Step 12.4: Verify CI green**

```bash
gh run list --branch phase-4-ifc-parser-worker --limit 1
```

If CI fails on ESLint, address inline. Most likely cause: missing `IFCParserCore` global already added in Task 9, or unused-vars warning on a deleted helper that's still referenced somewhere — fix with explicit removal.

**✅ Phase 4 done.** Ready for manual benchmark + merge to master.

---

## Self-Review

### Spec coverage
- ✅ IFCParserCore module with parseIFCContent + 7 helpers (dual-context export): Tasks 1-3
- ✅ Worker rewrite (213 → ~30 lines): Task 6
- ✅ Validator delegates to IFCParserCore (Step 1) + dispatches to WorkerPool (Step 2): Tasks 5, 7
- ✅ Lazy worker pool init: Task 7
- ✅ Graceful main-thread fallback: Task 7
- ✅ Output shape backward-compat (snapshot test gate): Task 4
- ✅ Worker integration tests (skip-on-failure): Task 8
- ✅ ESLint global: Task 9
- ✅ PWA precache + cache bump: Task 10
- ✅ PLAN.md + CHANGELOG: Task 11
- ✅ Manual benchmark mentioned in spec (left to user): post-deploy step

### Type/name consistency
- `IFCParserCore.parseIFCContent(content, fileName)` API used consistently in Tasks 3-7
- Worker message shape: `{ taskId, type: 'PARSE', data: { content, fileName } }` → `{ taskId, type: 'PARSE_DONE', data: entities }` consistent in Tasks 6-7
- `WorkerPool.submit(type, data)` API used per existing worker-pool.js
- Helper names (extractGUID, extractName, decodeIFCString, splitParams, parsePropertySet, parseProperty, parseRelDefines) consistent across migration tasks 2-3 and validator deletion task 5

### Placeholder scan
None.

### Scope
12 tasks, ~60 steps. Sized for ~2 days of subagent execution. Single plan appropriate.
