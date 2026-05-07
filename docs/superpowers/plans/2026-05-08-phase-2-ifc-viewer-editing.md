# Phase 2 — IFC Viewer Edit Correctness: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `applyModificationsToIFC` in `viewer-init.js` so that adding a property to an element correctly distinguishes three cases (in-place edit, add to existing pset, create isolated pset) and produces valid IFC output for the user-reported bug.

**Architecture:** Extract pure-function utilities into a new `IfcPsetUtils` namespace (`assets/js/ifc/ifc-pset-utils.js`). Replace the single fall-through path in `applyModificationsToIFC` with an explicit classification step (`classifyModification`) that branches into one of three handlers (case A edit, case B add-prop, case C create-pset). Preserve qto/pset entity type through classification so quantity edits stay quantities.

**Tech Stack:** Vanilla JS (no build), custom Jasmine-like test framework via Puppeteer. Targets `pages/ifc-viewer-multi-file.html`.

**Reference spec:** `docs/superpowers/specs/2026-05-08-phase-2-ifc-viewer-editing-design.md`

---

## File Structure

### New files
- `assets/js/ifc/ifc-pset-utils.js` — `IfcPsetUtils` namespace (parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement)
- `tests/test-suites/ifc-pset-utils.test.js` — unit tests for the four utilities
- `tests/test-suites/ifc-viewer-modifications.test.js` — classification + e2e tests via synthetic IFC strings

### Modified
- `assets/js/ifc/viewer-init.js` — refactor `applyModificationsToIFC` into named functions + new case B handler
- `pages/ifc-viewer-multi-file.html` — load `ifc-pset-utils.js` before `viewer-init.js`
- `tests/test-runner.html` — load new module + test suites
- `sw.js` — precache new asset + bump cache version
- `PLAN.md` — mark Phase 2 done
- `CHANGELOG.md` — entry [0.2.1]
- `dist/**` — sync all of the above

---

## Step 1: IfcPsetUtils Helpers

### Task 1: Scaffold IfcPsetUtils module

**Files:**
- Create: `assets/js/ifc/ifc-pset-utils.js`
- Create: `tests/test-suites/ifc-pset-utils.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1.1: Write failing namespace test**

Create `tests/test-suites/ifc-pset-utils.test.js`:
```js
describe('IfcPsetUtils', () => {
    it('should expose IfcPsetUtils namespace globally', () => {
        expect(typeof window.IfcPsetUtils).toBe('object');
        const expected = ['parsePsetHasProperties', 'addPropertyIdToPset', 'parsePropertyName', 'findPsetOnElement'];
        for (const fn of expected) {
            expect(typeof window.IfcPsetUtils[fn]).toBe('function');
        }
    });
});
```

- [ ] **Step 1.2: Add new module + suite to test-runner.html**

In `tests/test-runner.html`, find the IFC scripts loading section. After `<script src="../assets/js/ifc/viewer-parser.js"></script>` (around line 346), add:
```html
<script src="../assets/js/ifc/ifc-pset-utils.js"></script>
```

In the test-suites block, append:
```html
<script src="test-suites/ifc-pset-utils.test.js"></script>
```

- [ ] **Step 1.3: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "IfcPsetUtils"
```
Expected: FAIL with "IfcPsetUtils is not defined" or "expected undefined to be 'object'"

- [ ] **Step 1.4: Create scaffold module**

Create `assets/js/ifc/ifc-pset-utils.js`:
```js
/**
 * IfcPsetUtils — pure utilities for IFC property set / quantity set parsing and manipulation.
 * No DOM mutations, no global state beyond namespace export.
 */
window.IfcPsetUtils = (function() {
    'use strict';

    function parsePsetHasProperties(_params) { return []; }
    function addPropertyIdToPset(_line, _newPropId) { return _line; }
    function parsePropertyName(_line) { return null; }
    function findPsetOnElement(_entityId, _psetName, _relDefinesMap, _propertySetMap) { return null; }

    return { parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement };
})();
```

- [ ] **Step 1.5: Run tests, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "IfcPsetUtils"
```
Expected: PASS

- [ ] **Step 1.6: Sync dist + commit**

```bash
mkdir -p dist/assets/js/ifc/
cp assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js
git add assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js tests/test-runner.html tests/test-suites/ifc-pset-utils.test.js
git commit -m "feat(ifc-pset-utils): scaffold pset/qto utility module"
```

---

### Task 2: Implement `parsePsetHasProperties`

**Files:**
- Modify: `assets/js/ifc/ifc-pset-utils.js`
- Modify: `tests/test-suites/ifc-pset-utils.test.js`

- [ ] **Step 2.1: Write failing tests**

Append to `tests/test-suites/ifc-pset-utils.test.js`:
```js
describe('IfcPsetUtils.parsePsetHasProperties', () => {
    it('should extract single property from tuple', () => {
        const params = "'guid',$,'Name',$,(#1)";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual(['#1']);
    });

    it('should extract multiple properties', () => {
        const params = "'guid',$,'Name',$,(#1,#2,#3)";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual(['#1', '#2', '#3']);
    });

    it('should return empty array for empty tuple', () => {
        const params = "'guid',$,'Name',$,()";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual([]);
    });

    it('should tolerate whitespace around IDs', () => {
        const params = "'guid',$,'Name',$,( #1 , #2 )";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual(['#1', '#2']);
    });

    it('should return empty array when tuple missing', () => {
        const params = "'guid',$,'Name',$";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual([]);
    });
});
```

- [ ] **Step 2.2: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "parsePsetHasProperties"
```
Expected: 5 FAILs (returning [] for everything)

- [ ] **Step 2.3: Implement**

Replace stub in `assets/js/ifc/ifc-pset-utils.js`:
```js
function parsePsetHasProperties(params) {
    if (!params) return [];
    // HasProperties is the LAST tuple in the params: "...,(#1,#2,#3)"
    const match = params.match(/\(([^()]*)\)\s*$/);
    if (!match) return [];
    const inside = match[1];
    if (!inside.trim()) return [];
    return inside.split(',').map(s => s.trim()).filter(s => s.length > 0);
}
```

- [ ] **Step 2.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "parsePsetHasProperties"
```
Expected: 5 PASS

- [ ] **Step 2.5: Sync dist + commit**

```bash
cp assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js
git add assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js tests/test-suites/ifc-pset-utils.test.js
git commit -m "feat(ifc-pset-utils): parsePsetHasProperties extracts HasProperties tuple"
```

---

### Task 3: Implement `addPropertyIdToPset`

**Files:**
- Modify: `assets/js/ifc/ifc-pset-utils.js`
- Modify: `tests/test-suites/ifc-pset-utils.test.js`

- [ ] **Step 3.1: Write failing tests**

Append:
```js
describe('IfcPsetUtils.addPropertyIdToPset', () => {
    it('should add ID to non-empty tuple', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,(#1,#2));";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#1,#2,#999));");
    });

    it('should add ID to empty tuple', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,());";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#999));");
    });

    it('should preserve trailing whitespace', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,(#1));   ";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#1,#999));   ");
    });

    it('should return line unchanged when no tuple found', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$);";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe(line);
    });

    it('should work with single-property tuple', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,(#42));";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#42,#999));");
    });
});
```

- [ ] **Step 3.2: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "addPropertyIdToPset"
```
Expected: 5 FAILs (stub returns line unchanged)

- [ ] **Step 3.3: Implement**

Replace stub in `assets/js/ifc/ifc-pset-utils.js`:
```js
function addPropertyIdToPset(line, newPropId) {
    // Find the LAST "(...)"  in the entity body (the HasProperties tuple)
    // Handles: (#1,#2)  ()  (#1)
    const match = line.match(/^(.*\()([^()]*)(\)[^()]*)$/);
    if (!match) return line;
    const [, prefix, inside, suffix] = match;
    const trimmed = inside.trim();
    const newInside = trimmed.length === 0 ? `#${newPropId}` : `${inside},#${newPropId}`;
    return prefix + newInside + suffix;
}
```

- [ ] **Step 3.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "addPropertyIdToPset"
```
Expected: 5 PASS

- [ ] **Step 3.5: Sync dist + commit**

```bash
cp assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js
git add assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js tests/test-suites/ifc-pset-utils.test.js
git commit -m "feat(ifc-pset-utils): addPropertyIdToPset appends ID to HasProperties tuple"
```

---

### Task 4: Implement `parsePropertyName`

**Files:**
- Modify: `assets/js/ifc/ifc-pset-utils.js`
- Modify: `tests/test-suites/ifc-pset-utils.test.js`

- [ ] **Step 4.1: Write failing tests**

Append:
```js
describe('IfcPsetUtils.parsePropertyName', () => {
    it('should extract name from IFCPROPERTYSINGLEVALUE', () => {
        const line = "#200=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBe('FireRating');
    });

    it('should extract name from IFCQUANTITYLENGTH', () => {
        const line = "#201=IFCQUANTITYLENGTH('Width',$,$,5.0);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBe('Width');
    });

    it('should unescape doubled single quotes', () => {
        const line = "#202=IFCPROPERTYSINGLEVALUE('O''Brien',$,IFCLABEL('value'),$);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBe("O'Brien");
    });

    it('should return null when no quoted name found', () => {
        const line = "#203=IFCPROPERTYSINGLEVALUE($,$,$,$);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBeNull();
    });
});
```

- [ ] **Step 4.2: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "parsePropertyName"
```
Expected: 4 FAILs

- [ ] **Step 4.3: Implement**

Replace stub:
```js
function parsePropertyName(line) {
    if (!line) return null;
    // Find the FIRST quoted string in the entity body (after the "(")
    const bodyMatch = line.match(/\(([^]*)/);
    if (!bodyMatch) return null;
    const body = bodyMatch[1];
    const nameMatch = body.match(/^'((?:[^']|'')*)'/);
    if (!nameMatch) return null;
    return nameMatch[1].replace(/''/g, "'");
}
```

- [ ] **Step 4.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "parsePropertyName"
```
Expected: 4 PASS

- [ ] **Step 4.5: Sync dist + commit**

```bash
cp assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js
git add assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js tests/test-suites/ifc-pset-utils.test.js
git commit -m "feat(ifc-pset-utils): parsePropertyName extracts name from prop/qto entity line"
```

---

### Task 5: Implement `findPsetOnElement`

**Files:**
- Modify: `assets/js/ifc/ifc-pset-utils.js`
- Modify: `tests/test-suites/ifc-pset-utils.test.js`

- [ ] **Step 5.1: Write failing tests**

Append:
```js
describe('IfcPsetUtils.findPsetOnElement', () => {
    function makeMaps() {
        // element #10 is linked via rel #300 to pset #100 (Pset_WallCommon)
        // element #11 is linked via rel #301 to pset #101 (Pset_Custom)
        const propertySetMap = new Map();
        propertySetMap.set('100', { lineIndex: 5, params: "'pset-guid',$,'Pset_WallCommon',$,(#200,#201)", line: "#100=IFCPROPERTYSET(...)", type: 'IFCPROPERTYSET' });
        propertySetMap.set('101', { lineIndex: 6, params: "'pset-guid2',$,'Pset_Custom',$,(#202)", line: "#101=IFCPROPERTYSET(...)", type: 'IFCPROPERTYSET' });

        const relDefinesMap = new Map();
        relDefinesMap.set('300', { lineIndex: 8, params: "'rel-guid',$,$,$,(#10),#100", line: "#300=IFCRELDEFINESBYPROPERTIES(...)" });
        relDefinesMap.set('301', { lineIndex: 9, params: "'rel-guid2',$,$,$,(#11),#101", line: "#301=IFCRELDEFINESBYPROPERTIES(...)" });

        return { propertySetMap, relDefinesMap };
    }

    it('should find existing pset on element', () => {
        const { propertySetMap, relDefinesMap } = makeMaps();
        const result = IfcPsetUtils.findPsetOnElement('10', 'Pset_WallCommon', relDefinesMap, propertySetMap);
        expect(result).toBeDefined();
        expect(result.id).toBe('100');
        expect(result.type).toBe('IFCPROPERTYSET');
    });

    it('should return null when element has no rel', () => {
        const { propertySetMap, relDefinesMap } = makeMaps();
        const result = IfcPsetUtils.findPsetOnElement('99', 'Pset_WallCommon', relDefinesMap, propertySetMap);
        expect(result).toBeNull();
    });

    it('should return null when rel exists but pset name differs', () => {
        const { propertySetMap, relDefinesMap } = makeMaps();
        const result = IfcPsetUtils.findPsetOnElement('10', 'Pset_Different', relDefinesMap, propertySetMap);
        expect(result).toBeNull();
    });

    it('should match shared pset (multi-element rel)', () => {
        const propertySetMap = new Map();
        propertySetMap.set('100', { lineIndex: 5, params: "'pset-guid',$,'Pset_Shared',$,(#200)", line: "#100=IFCPROPERTYSET(...)", type: 'IFCPROPERTYSET' });
        const relDefinesMap = new Map();
        relDefinesMap.set('300', { lineIndex: 8, params: "'rel-guid',$,$,$,(#10,#11,#12),#100", line: "#300=IFCRELDEFINESBYPROPERTIES(...)" });
        const result = IfcPsetUtils.findPsetOnElement('11', 'Pset_Shared', relDefinesMap, propertySetMap);
        expect(result).toBeDefined();
        expect(result.id).toBe('100');
    });

    it('should ignore rel pointing to non-existent pset', () => {
        const propertySetMap = new Map();
        const relDefinesMap = new Map();
        relDefinesMap.set('300', { lineIndex: 8, params: "'rel-guid',$,$,$,(#10),#999", line: "..." });
        const result = IfcPsetUtils.findPsetOnElement('10', 'Pset_X', relDefinesMap, propertySetMap);
        expect(result).toBeNull();
    });
});
```

- [ ] **Step 5.2: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "findPsetOnElement"
```
Expected: 5 FAILs (stub returns null always — only the "should return null" cases pass by accident, but the other 3 fail)

- [ ] **Step 5.3: Implement**

Replace stub:
```js
function findPsetOnElement(entityId, psetName, relDefinesMap, propertySetMap) {
    // IFCRELDEFINESBYPROPERTIES params: 'guid', $, $, $, (relatedObjects...), #relatingPset
    // Iterate rels, find ones whose RelatedObjects contains entityId
    for (const [_relId, relInfo] of relDefinesMap) {
        if (!relInfo.params) continue;
        // Match all "(...)" then extract IDs
        // Last #N reference outside the tuple is the pset ID
        const tupleMatch = relInfo.params.match(/\(([^()]*)\)\s*,\s*(#\d+)\s*$/);
        if (!tupleMatch) continue;
        const objIds = tupleMatch[1].split(',').map(s => s.trim().replace(/^#/, '')).filter(s => s.length);
        if (!objIds.includes(String(entityId))) continue;
        const psetId = tupleMatch[2].replace(/^#/, '');
        const pset = propertySetMap.get(psetId);
        if (!pset) continue;
        // Check pset name (3rd quoted string in params: 'guid', $, 'Name', ...)
        const nameMatch = pset.params.match(/'(?:[^']|'')*'\s*,\s*\$?[^,]*,\s*'((?:[^']|'')*)'/);
        if (!nameMatch) continue;
        const foundName = nameMatch[1].replace(/''/g, "'");
        if (foundName === psetName) {
            return { id: psetId, ...pset };
        }
    }
    return null;
}
```

- [ ] **Step 5.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "findPsetOnElement"
```
Expected: 5 PASS

- [ ] **Step 5.5: Sync dist + commit**

```bash
cp assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js
git add assets/js/ifc/ifc-pset-utils.js dist/assets/js/ifc/ifc-pset-utils.js tests/test-suites/ifc-pset-utils.test.js
git commit -m "feat(ifc-pset-utils): findPsetOnElement locates pset by element + name"
```

**✅ Step 1 checkpoint:** All four utilities implemented and tested. ~19 new tests (1 namespace + 5 + 5 + 4 + 5 = 20). Existing tests untouched.

---

## Step 2: Refactor `applyModificationsToIFC`

### Task 6: Add IfcPsetUtils to viewer page + extract parseIFCStructure

**Files:**
- Modify: `pages/ifc-viewer-multi-file.html` (add script tag)
- Modify: `assets/js/ifc/viewer-init.js` (extract parseIFCStructure as named function)

- [ ] **Step 6.1: Add IfcPsetUtils script to viewer page**

In `pages/ifc-viewer-multi-file.html`, find `<script src="../assets/js/ifc/viewer-parser.js"></script>` and BEFORE the `viewer-init.js` line, add:
```html
<script src="../assets/js/ifc/ifc-pset-utils.js"></script>
```

(Place it after `viewer-parser.js` and before `viewer-init.js` since `viewer-init.js` will be the consumer.)

- [ ] **Step 6.2: Extract parseIFCStructure (no behavior change)**

In `assets/js/ifc/viewer-init.js`, find `applyModificationsToIFC` (around line 886). The first ~50 lines (parsing the lines into entity maps) is mechanical. Extract into a named helper above `applyModificationsToIFC`:

```js
// Parse IFC content into entity lookup maps used by applyModificationsToIFC.
function parseIFCStructure(ifcContent) {
    const lines = ifcContent.split('\n');
    const entityMap = new Map();
    const propertySetMap = new Map();
    const propertySingleValueMap = new Map();
    const relDefinesMap = new Map();
    let maxEntityId = 0;

    lines.forEach((originalLine, lineIndex) => {
        const line = originalLine.trim();
        if (!line || !line.startsWith('#')) return;

        const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?\s*$/i);
        if (!match) return;

        const [, id, entityType, params] = match;
        const numId = parseInt(id);
        if (numId > maxEntityId) maxEntityId = numId;

        entityMap.set(id, { lineIndex, type: entityType, params, line: originalLine });

        if (entityType === 'IFCPROPERTYSET' || entityType === 'IFCELEMENTQUANTITY') {
            propertySetMap.set(id, { lineIndex, params, line: originalLine, type: entityType });
        } else if (entityType === 'IFCPROPERTYSINGLEVALUE' || entityType.startsWith('IFCQUANTITY')) {
            propertySingleValueMap.set(id, { lineIndex, params, line: originalLine, type: entityType });
        } else if (entityType === 'IFCRELDEFINESBYPROPERTIES') {
            relDefinesMap.set(id, { lineIndex, params, line: originalLine });
        }
    });

    const guidToEntityId = new Map();
    entityMap.forEach((entity, id) => {
        if (entity.type.startsWith('IFC') && !entity.type.includes('REL') && !entity.type.includes('PROPERTY')) {
            const guidMatch = entity.params.match(/'([^']+)'/);
            if (guidMatch) guidToEntityId.set(guidMatch[1], id);
        }
    });

    return { lines, entityMap, propertySetMap, propertySingleValueMap, relDefinesMap, guidToEntityId, maxEntityId };
}
```

Then replace the corresponding inline code in `applyModificationsToIFC`:
```js
function applyModificationsToIFC(ifcContent, modifications, fileName) {
    const state = window.ViewerState;
    const parsed = parseIFCStructure(ifcContent);
    const modifiedLines = [...parsed.lines];
    let { maxEntityId } = parsed;

    let modificationCount = 0;
    let createdCount = 0;
    const newEntities = [];

    for (const [guid, psetModifications] of Object.entries(modifications)) {
        // ... rest unchanged for now
```

Use `parsed.entityMap`, `parsed.propertySetMap`, etc. throughout the rest of the function.

- [ ] **Step 6.3: Run all tests**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: All tests pass (no regressions). The refactor is purely structural — same output.

- [ ] **Step 6.4: Sync dist + commit**

```bash
cp assets/js/ifc/viewer-init.js dist/assets/js/ifc/viewer-init.js
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
git add assets/js/ifc/viewer-init.js dist/assets/js/ifc/viewer-init.js pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
git commit -m "refactor(viewer): extract parseIFCStructure from applyModificationsToIFC"
```

---

### Task 7: Implement `classifyModification`

**Files:**
- Modify: `assets/js/ifc/viewer-init.js`
- Create: `tests/test-suites/ifc-viewer-modifications.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 7.1: Create test file with failing classification tests**

Create `tests/test-suites/ifc-viewer-modifications.test.js`:
```js
// Tests classifyModification + applyModificationsToIFC behavior using synthetic IFC strings.
// classifyModification is exposed on window for testing.

const SYNTHETIC_IFC_BASE = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Test'), '2;1');
FILE_NAME('test.ifc', '2026-01-01T00:00:00', ('User'), ('Org'), 'Test', '', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`;

const SYNTHETIC_IFC_WITH_PSET = SYNTHETIC_IFC_BASE + `
#1=IFCPROJECT('proj-guid',$,'Project',$,$,$,$,(#2),#3);
#2=IFCREPRESENTATIONCONTEXT($,$,3,1.E-5,$,$);
#3=IFCUNITASSIGNMENT((#4));
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#10=IFCWALL('guid-A',$,'Wall_001',$,$,$,$,$,$);
#11=IFCWALL('guid-B',$,'Wall_002',$,$,$,$,$,$);
#100=IFCPROPERTYSET('pset-guid-A',$,'Pset_WallCommon',$,(#200,#201));
#200=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);
#201=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);
#300=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#10),#100);
ENDSEC;
END-ISO-10303-21;`;

describe('classifyModification', () => {
    function parseHelper(ifc) {
        // call parseIFCStructure (must be exposed on window)
        return window.parseIFCStructure(ifc);
    }

    it('should return case "edit" when element has pset and property', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-A', 'Pset_WallCommon', 'FireRating', parsed);
        expect(result.case).toBe('edit');
        expect(result.propEntity).toBeDefined();
    });

    it('should return case "add-prop" when element has pset but missing property', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-A', 'Pset_WallCommon', 'IsExternal', parsed);
        expect(result.case).toBe('add-prop');
        expect(result.psetEntity).toBeDefined();
        expect(result.entityType).toBe('IFCPROPERTYSET');
    });

    it('should return case "create-pset" when element has no pset by that name', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-B', 'Pset_WallCommon', 'FireRating', parsed);
        expect(result.case).toBe('create-pset');
    });

    it('should return case "create-pset" when element does not exist', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-NONEXISTENT', 'Pset_X', 'PropX', parsed);
        expect(result.case).toBe('create-pset');
    });
});
```

Add suite to `tests/test-runner.html`:
```html
<script src="test-suites/ifc-viewer-modifications.test.js"></script>
```

- [ ] **Step 7.2: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "classifyModification"
```
Expected: 4 FAILs (classifyModification not defined)

- [ ] **Step 7.3: Implement classifyModification + expose on window**

In `assets/js/ifc/viewer-init.js`, after `parseIFCStructure` and before `applyModificationsToIFC`, add:
```js
// Classify a single modification record into one of three cases:
//   'edit'        — element has pset and property  → in-place value update
//   'add-prop'    — element has pset, no property  → add new property to existing pset
//   'create-pset' — element has no pset by name    → create isolated pset
function classifyModification(guid, psetName, propName, parsed) {
    const entityId = parsed.guidToEntityId.get(guid);
    if (!entityId) return { case: 'create-pset' };

    const pset = IfcPsetUtils.findPsetOnElement(entityId, psetName, parsed.relDefinesMap, parsed.propertySetMap);
    if (!pset) return { case: 'create-pset' };

    const propIds = IfcPsetUtils.parsePsetHasProperties(pset.params);
    for (const propIdRef of propIds) {
        const propId = propIdRef.replace(/^#/, '');
        const prop = parsed.propertySingleValueMap.get(propId);
        if (!prop) continue;
        if (IfcPsetUtils.parsePropertyName(prop.line) === propName) {
            return { case: 'edit', propEntity: prop, propId, psetEntity: pset, entityType: pset.type };
        }
    }
    return { case: 'add-prop', psetEntity: pset, entityType: pset.type };
}
```

At the bottom of the IIFE/file (or just before any existing window.* exports near the bottom), expose for testing:
```js
window.parseIFCStructure = parseIFCStructure;
window.classifyModification = classifyModification;
```

- [ ] **Step 7.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "classifyModification"
```
Expected: 4 PASS

- [ ] **Step 7.5: Sync dist + commit**

```bash
cp assets/js/ifc/viewer-init.js dist/assets/js/ifc/viewer-init.js
git add assets/js/ifc/viewer-init.js dist/assets/js/ifc/viewer-init.js tests/test-suites/ifc-viewer-modifications.test.js tests/test-runner.html
git commit -m "feat(viewer): classifyModification distinguishes edit/add-prop/create-pset cases"
```

---

### Task 8: Implement case B handler `addPropertyToExistingPset`

**Files:**
- Modify: `assets/js/ifc/viewer-init.js`
- Modify: `tests/test-suites/ifc-viewer-modifications.test.js`

- [ ] **Step 8.1: Write failing e2e tests for case B**

Append to `tests/test-suites/ifc-viewer-modifications.test.js`:
```js
describe('applyModificationsToIFC case B (add-prop)', () => {
    function setupViewerState(synthetic) {
        // Mock window.ViewerState with allData populated for the test
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: { 'Pset_WallCommon': { FireRating: 'EI60', LoadBearing: 'TRUE' } } },
                { guid: 'guid-B', fileName: 'test.ifc', propertySets: {} }
            ]
        };
    }

    it('case B: adds new property entity AND extends existing pset HasProperties', () => {
        setupViewerState();
        const modifications = {
            'guid-A': {
                'Pset_WallCommon': {
                    'IsExternal': 'TRUE'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');

        // Check new property entity created
        expect(result.includes("IFCPROPERTYSINGLEVALUE('IsExternal'")).toBe(true);
        // Check it was added to existing pset, not a new one
        const psetMatches = result.match(/IFCPROPERTYSET\('pset-guid-A'/g);
        expect(psetMatches.length).toBe(1);  // still ONE pset entity (not duplicated)
        // Check the new prop ID is in the original pset's HasProperties tuple
        const psetLine = result.split('\n').find(l => l.includes("IFCPROPERTYSET('pset-guid-A'"));
        // Should now have THREE prop refs: #200, #201, #newId
        const tupleMatch = psetLine.match(/\(([^()]+)\)\s*\)\s*;/);
        expect(tupleMatch).toBeTruthy();
        const ids = tupleMatch[1].split(',').map(s => s.trim());
        expect(ids.length).toBe(3);
        expect(ids).toContain('#200');
        expect(ids).toContain('#201');
    });

    it('case B multi-prop: 2 new properties end up in same pset HasProperties', () => {
        setupViewerState();
        const modifications = {
            'guid-A': {
                'Pset_WallCommon': {
                    'IsExternal': 'TRUE',
                    'AcousticRating': '50dB'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');

        const psetLine = result.split('\n').find(l => l.includes("IFCPROPERTYSET('pset-guid-A'"));
        const tupleMatch = psetLine.match(/\(([^()]+)\)\s*\)\s*;/);
        const ids = tupleMatch[1].split(',').map(s => s.trim());
        expect(ids.length).toBe(4);  // #200, #201 + 2 new
    });
});
```

- [ ] **Step 8.2: Run, verify failure**

```bash
node tests/run-tests.js 2>&1 | grep -E "case B"
```
Expected: 2 FAILs (current code creates parallel pset, has 2 IFCPROPERTYSET matches with same name)

- [ ] **Step 8.3: Implement addPropertyToExistingPset + wire into applyModificationsToIFC**

In `assets/js/ifc/viewer-init.js`, after `classifyModification`, add:
```js
// Case B handler: append new property entity and extend the existing pset's HasProperties tuple.
// Mutates parsed.maxEntityId, parsed.propertySetMap (in-memory pset entry), and the modifiedLines array.
function addPropertyToExistingPset(modifiedLines, parsed, classification, propName, newValue) {
    parsed.maxEntityId++;
    const newPropId = parsed.maxEntityId;

    const propLine = classification.entityType === 'IFCELEMENTQUANTITY'
        ? createQuantity(newPropId, propName, newValue)
        : createPropertySingleValue(newPropId, propName, newValue);

    const psetEntity = classification.psetEntity;
    const updatedPsetLine = IfcPsetUtils.addPropertyIdToPset(psetEntity.line, newPropId);
    modifiedLines[psetEntity.lineIndex] = updatedPsetLine;

    // Update in-memory pset entry so subsequent classifications on same pset see the new prop
    psetEntity.line = updatedPsetLine;
    const newParamsMatch = updatedPsetLine.match(/^#\d+\s*=\s*[A-Z0-9_]+\((.*)\);?\s*$/i);
    if (newParamsMatch) psetEntity.params = newParamsMatch[1];
    parsed.propertySingleValueMap.set(String(newPropId), {
        lineIndex: -1,  // virtual; not in modifiedLines yet (will be appended)
        params: '',
        line: propLine,
        type: classification.entityType === 'IFCELEMENTQUANTITY' ? 'IFCQUANTITYLENGTH' : 'IFCPROPERTYSINGLEVALUE'
    });

    return { newEntityLine: propLine, newPropId };
}
```

Now, you also need a `createQuantity` helper. Add it after `createPropertySingleValue` (look around line 1152-1170):
```js
function createQuantity(id, propName, value) {
    const encodedName = encodeIFCString(propName);
    // Default to LENGTH; user can refine via IFC editing tools
    const num = parseFloat(value);
    const numericValue = isNaN(num) ? 0 : num;
    return `#${id}=IFCQUANTITYLENGTH('${encodedName}',$,$,${numericValue});`;
}
```

Now wire case A/B/C dispatch into `applyModificationsToIFC`. Replace the inner loop body. Find:
```js
for (const [propName, newValue] of Object.entries(propModifications)) {
    const updated = updatePropertyInIFC(modifiedLines, entityMap, propertySetMap, propertySingleValueMap, psetName, propName, newValue);
    if (updated) {
        modificationCount++;
    } else {
        newProperties[propName] = newValue;
    }
}
```

Replace with:
```js
for (const [propName, newValue] of Object.entries(propModifications)) {
    const classification = classifyModification(guid, psetName, propName, parsed);

    if (classification.case === 'edit') {
        const propInfo = classification.propEntity;
        const newLine = updatePropertyValue(propInfo.line, newValue);
        if (newLine !== propInfo.line) {
            modifiedLines[propInfo.lineIndex] = newLine;
            propInfo.line = newLine;
        }
        modificationCount++;
    } else if (classification.case === 'add-prop') {
        const { newEntityLine } = addPropertyToExistingPset(modifiedLines, parsed, classification, propName, newValue);
        newEntities.push(newEntityLine);
        modificationCount++;
    } else {
        // case 'create-pset' — accumulate for batched isolated pset creation below
        newProperties[propName] = newValue;
    }
}
```

(The remaining batched `if (Object.keys(newProperties).length > 0) { ...createIsolatedPset stuff... }` block is untouched — it still runs for case C.)

- [ ] **Step 8.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "case B"
```
Expected: 2 PASS

- [ ] **Step 8.5: Sync dist + commit**

```bash
cp assets/js/ifc/viewer-init.js dist/assets/js/ifc/viewer-init.js
git add assets/js/ifc/viewer-init.js dist/assets/js/ifc/viewer-init.js tests/test-suites/ifc-viewer-modifications.test.js
git commit -m "feat(viewer): case B handler — add property to existing pset on element"
```

---

### Task 9: Verify case A and case C still work + add tests

**Files:**
- Modify: `tests/test-suites/ifc-viewer-modifications.test.js`

- [ ] **Step 9.1: Append regression tests for case A and case C**

Append:
```js
describe('applyModificationsToIFC case A (edit)', () => {
    it('case A: in-place value update, no new entities', () => {
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: { 'Pset_WallCommon': { FireRating: 'EI60', LoadBearing: 'TRUE' } } }
            ]
        };
        const modifications = {
            'guid-A': {
                'Pset_WallCommon': {
                    'FireRating': 'EI120'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');
        // Should have updated value
        expect(result.includes("IFCLABEL('EI120')")).toBe(true);
        expect(result.includes("IFCLABEL('EI60')")).toBe(false);
        // No new pset entities
        const psetCount = (result.match(/IFCPROPERTYSET\(/g) || []).length;
        expect(psetCount).toBe(1);
    });
});

describe('applyModificationsToIFC case C (create-pset)', () => {
    it('case C: creates new isolated pset + property + rel for element with no pset', () => {
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: {} },
                { guid: 'guid-B', fileName: 'test.ifc', propertySets: {} }
            ]
        };
        const modifications = {
            'guid-B': {
                'Pset_WallCommon': {
                    'FireRating': 'EI60'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');
        // Now there should be TWO IFCPROPERTYSET entities — original (#100) + isolated new one for guid-B
        const psetCount = (result.match(/IFCPROPERTYSET\(/g) || []).length;
        expect(psetCount).toBe(2);
        // New rel should reference #11 (guid-B's entity)
        expect(/IFCRELDEFINESBYPROPERTIES\([^)]+,\(#11\)/.test(result)).toBe(true);
    });
});
```

- [ ] **Step 9.2: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "case A|case C"
```
Expected: 2 PASS (case A) + 1 PASS (case C) = 3 PASS

- [ ] **Step 9.3: Run full suite, verify no regressions**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: SUMMARY shows ~24 new tests added beyond Phase 1 baseline (~352 + 24 = 376) all passing.

- [ ] **Step 9.4: Commit**

```bash
git add tests/test-suites/ifc-viewer-modifications.test.js
git commit -m "test(viewer): regression tests for case A (edit) + case C (create-pset)"
```

---

### Task 10: Roundtrip + qto preservation tests

**Files:**
- Modify: `tests/test-suites/ifc-viewer-modifications.test.js`

- [ ] **Step 10.1: Write roundtrip + qto tests**

Append:
```js
describe('applyModificationsToIFC roundtrip', () => {
    it('case B export → re-parse: new property visible inside existing pset', () => {
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: { 'Pset_WallCommon': { FireRating: 'EI60', LoadBearing: 'TRUE' } } }
            ]
        };
        const modifications = {
            'guid-A': {
                'Pset_WallCommon': {
                    'IsExternal': 'TRUE'
                }
            }
        };
        const exported = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');
        const reparsed = window.parseIFCStructure(exported);
        // Locate the original pset (#100) by name and verify HasProperties has 3 IDs
        const pset100 = reparsed.propertySetMap.get('100');
        expect(pset100).toBeDefined();
        const propIds = IfcPsetUtils.parsePsetHasProperties(pset100.params);
        expect(propIds.length).toBe(3);
        // Verify one of the new prop IDs in propIds resolves to a SINGLEVALUE with name 'IsExternal'
        const newPropIds = propIds.filter(id => !['#200', '#201'].includes(id));
        expect(newPropIds.length).toBe(1);
        const newProp = reparsed.propertySingleValueMap.get(newPropIds[0].replace('#', ''));
        expect(newProp).toBeDefined();
        expect(IfcPsetUtils.parsePropertyName(newProp.line)).toBe('IsExternal');
    });
});

describe('applyModificationsToIFC qto preservation', () => {
    const SYNTHETIC_IFC_WITH_QTO = SYNTHETIC_IFC_BASE + `
#10=IFCWALL('guid-A',$,'Wall_001',$,$,$,$,$,$);
#100=IFCELEMENTQUANTITY('qto-guid',$,'BaseQuantities',$,$,(#200));
#200=IFCQUANTITYLENGTH('Length',$,$,5.0);
#300=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#10),#100);
ENDSEC;
END-ISO-10303-21;`;

    it('case B on qto: adds IFCQUANTITYLENGTH to IFCELEMENTQUANTITY', () => {
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: { 'BaseQuantities': { Length: '5.0' } } }
            ]
        };
        const modifications = {
            'guid-A': {
                'BaseQuantities': {
                    'Width': '3.5'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_QTO, modifications, 'test.ifc');
        // New entity is IFCQUANTITY*, NOT IFCPROPERTYSINGLEVALUE
        expect(result.includes("IFCQUANTITYLENGTH('Width'")).toBe(true);
        expect(result.includes("IFCPROPERTYSINGLEVALUE('Width'")).toBe(false);
        // Still ONE IFCELEMENTQUANTITY entity (extended in place)
        const qtoCount = (result.match(/IFCELEMENTQUANTITY\(/g) || []).length;
        expect(qtoCount).toBe(1);
    });
});
```

- [ ] **Step 10.2: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "roundtrip|qto preservation"
```
Expected: 2 PASS

- [ ] **Step 10.3: Run full suite**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: ~378 tests pass.

- [ ] **Step 10.4: Commit**

```bash
git add tests/test-suites/ifc-viewer-modifications.test.js
git commit -m "test(viewer): roundtrip + qto type preservation"
```

**✅ Step 2 checkpoint:** All three cases handled correctly. ~26 new tests for Phase 2.

---

## Step 3: Documentation, PWA, Push

### Task 11: Update PWA service worker

**Files:**
- Modify: `sw.js`

- [ ] **Step 11.1: Bump cache version + add new asset to precache**

In `sw.js`, find the cache version constant and bump it (e.g., `'bim-checker-v3'` → `'bim-checker-v4'`).

Find the `urlsToCache` (or similar) array and add:
```js
'/assets/js/ifc/ifc-pset-utils.js',
```

- [ ] **Step 11.2: Sync dist/ + commit**

```bash
cp sw.js dist/sw.js
git add sw.js dist/sw.js
git commit -m "chore(pwa): add ifc-pset-utils.js to precache + bump cache version"
```

---

### Task 12: Update PLAN.md and CHANGELOG.md

**Files:**
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 12.1: Update PLAN.md**

In `PLAN.md`, find the "Hotové (Done)" section. Add a new subsection at the end:
```markdown
### IFC Viewer — edit correctness (Phase 2, 2026-05-08)
- [x] Refaktor `applyModificationsToIFC` na tři jasně oddělené case (A edit / B add-prop / C create-pset)
- [x] Nová `IfcPsetUtils` knihovna (parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement)
- [x] Případ B (přidat property do existujícího psetu na elementu) korektně rozšíří pset entitu místo vytvoření paralelního
- [x] Případ C izoluje nový pset (žádné sdílení s existujícím stejnojmenným)
- [x] Qto edit zachovává `IFCELEMENTQUANTITY` / `IFCQUANTITY*` entity types
- [x] +26 nových testů
```

If "IFC viewer editing" was listed in any TODO section (off-plan items), remove it from there.

- [ ] **Step 12.2: Update CHANGELOG.md**

Prepend at the top of `CHANGELOG.md` (after the heading):
```markdown
## [0.2.1] — 2026-05-08

### Fixed
- IFC Viewer: adding a property to an element that didn't have it (but the pset existed) now correctly extends the existing pset entity instead of creating a parallel pset, producing valid IFC output.
- IFC Viewer: editing quantity (`IFCELEMENTQUANTITY`) now preserves quantity entity types instead of overwriting with property entities.

### Added
- `IfcPsetUtils` shared utility module for IFC pset/qto parsing and manipulation.
- Explicit case classification in `applyModificationsToIFC` (edit / add-prop / create-pset).
- 26 new tests covering all three modification cases plus roundtrip verification.
```

- [ ] **Step 12.3: Commit**

```bash
git add PLAN.md CHANGELOG.md
git commit -m "docs: mark Phase 2 (IFC viewer edit correctness) complete"
```

---

### Task 13: Final test run + push

**Files:** none (verification + push)

- [ ] **Step 13.1: Run full test suite**

```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: SUMMARY ~378/378 tests pass.

- [ ] **Step 13.2: Verify dist/ in sync**

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
Expected: "Total mismatches: 0".

- [ ] **Step 13.3: Push branch**

```bash
git push -u origin phase-2-ifc-viewer-editing
```

- [ ] **Step 13.4: Verify CI passes**

```bash
gh run list --branch phase-2-ifc-viewer-editing --limit 1 2>&1
```
Expected: status `success` after a few minutes. If lint fails, address immediately (likely globals to add to `eslint.config.js`).

If CI failure related to new globals (`IfcPsetUtils`, `parseIFCStructure`, `classifyModification`), update `eslint.config.js`:
```js
                // Phase 2: IFC viewer pset utilities
                IfcPsetUtils: 'readonly',
                parseIFCStructure: 'readonly',
                classifyModification: 'readonly',
                applyModificationsToIFC: 'readonly'
```

Commit + push fix.

**✅ Phase 2 done.** Ready for manual verification + merge to master.

---

## Self-Review

### Spec coverage
- ✅ Case A (edit): Task 9 + existing applyModificationsToIFC behavior preserved
- ✅ Case B (add-prop): Tasks 8, 9 with passing tests including multi-prop and roundtrip
- ✅ Case C (create-pset): Task 9 (regression test) + existing logic preserved
- ✅ IfcPsetUtils helpers: Tasks 1-5
- ✅ classifyModification: Task 7
- ✅ Qto preservation: Task 10
- ✅ All three write-paths flow through same applyModificationsToIFC: validated by existing flows from saveCell/applyBulkEdit/applyAddPset which all populate state.modifications, and applyModificationsToIFC is the single export consumer
- ✅ Sync dist/: every file-modifying task includes a sync step
- ✅ PWA precache: Task 11
- ✅ PLAN.md + CHANGELOG: Task 12

### Type/name consistency
- `IfcPsetUtils.parsePsetHasProperties`, `addPropertyIdToPset`, `parsePropertyName`, `findPsetOnElement` — used consistently across tasks
- `classifyModification(guid, psetName, propName, parsed)` returns `{ case, psetEntity?, propEntity?, propId?, entityType? }` — same shape across tasks 7, 8, 9, 10
- `parseIFCStructure(ifcContent)` returns `{ lines, entityMap, propertySetMap, propertySingleValueMap, relDefinesMap, guidToEntityId, maxEntityId }` — consistent

### Placeholder scan
None.

### Scope
13 tasks, ~52 steps. Sized for ~3-4 days of subagent execution. Appropriate for a single Phase 2 plan.
