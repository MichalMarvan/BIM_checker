# Phase 1 — IDS Validation Correctness & XSD: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the two parallel IDS parsers into one shared module, add full IFC subtype + PredefinedType matching to validation, and integrate IDS 1.0 XSD validation through xmllint-wasm with banner-on-import + modal-on-export UX.

**Architecture:** Extract shared `IDSParser` namespace into `assets/js/common/ids-parser.js` (consumed by `parser.js` + `validator.js`). Generate IFC class hierarchy data from EXPRESS schemas at build time, ship as JSON, lazy-load at runtime. Wrap xmllint-wasm in `IDSXSDValidator` with PWA-cached schema. All changes are backward-compatible with the editor's data shape.

**Tech Stack:** Vanilla JS (no build), custom Jasmine-like test framework via Puppeteer, xmllint-wasm WebAssembly library, PWA service worker.

**Reference spec:** `docs/superpowers/specs/2026-05-08-phase-1-ids-validation-correctness-design.md`

---

## File Structure

### New files
- `assets/js/common/ids-parser.js` — `IDSParser` namespace (parse, extractInfo, extractSpecifications, extractFacets, extractFacet, extractValue, extractRestriction)
- `assets/js/common/ifc-hierarchy.js` — `IFCHierarchy` lazy-loaded subtype + PredefinedType lookups
- `assets/js/common/ifc-params.js` — `IfcParams.splitIfcParams`, `unwrapEnumValue`, `unwrapString`
- `assets/js/common/ids-xsd-validator.js` — `IDSXSDValidator.init`, `validate`
- `assets/js/vendor/xmllint-wasm.js` — vendored library
- `assets/js/vendor/xmllint.wasm` — WASM binary
- `assets/data/ids-1.0.xsd` — official buildingSMART schema
- `assets/data/ifc-hierarchy-IFC2X3.json` — generated
- `assets/data/ifc-hierarchy-IFC4.json` — generated
- `assets/data/ifc-hierarchy-IFC4X3.json` — generated
- `scripts/generate-ifc-hierarchy.cjs` — dev tool
- `tests/test-suites/ids-parser-unified.test.js`
- `tests/test-suites/ids-parser-backward-compat.test.js`
- `tests/test-suites/ifc-hierarchy.test.js`
- `tests/test-suites/ifc-params.test.js`
- `tests/test-suites/validation-subtype.test.js`
- `tests/test-suites/validation-predefinedtype.test.js`
- `tests/test-suites/xsd-validator.test.js`
- `tests/test-suites/xsd-validator-lazy.test.js`

### Modified
- `assets/js/parser.js` — delegate to IDSParser, remove local extractors
- `assets/js/validator.js` — delegate to IDSParser, remove duplicate parser (~276 lines deleted)
- `assets/js/common/validation-engine.js` — subtype + PredefinedType matching
- `pages/ids-parser-visualizer.html` — add IDSParser script, XSD banner, export modal
- `pages/ids-ifc-validator.html` — add IDSParser script, per-file XSD indicator, summary banner
- `assets/css/ids-parser.css` — XSD banner + modal styles
- `assets/css/ids-validator.css` — XSD banner + indicator styles
- `assets/js/common/translations.js` — XSD i18n keys (CZ + EN)
- `sw.js` — PWA precache list
- `tests/test-runner.html` — load new common modules + test suites
- `tests/test-suites/integration-real-files.test.js` — extend with end-to-end test
- `PLAN.md` — mark items 1, A, B, C done
- `dist/**` — sync all modified source files (manual copy per CLAUDE.md)

---

## Step 1: Parser Unification (B)

### Task 1: Scaffold IDSParser module

**Files:**
- Create: `assets/js/common/ids-parser.js`
- Modify: `tests/test-runner.html` (load new module)
- Test: `tests/test-suites/ids-parser-unified.test.js`

- [ ] **Step 1.1: Write failing test for IDSParser global**

Create `tests/test-suites/ids-parser-unified.test.js`:
```js
describe('IDSParser', () => {
    it('should expose IDSParser namespace globally', () => {
        expect(typeof window.IDSParser).toBe('object');
        expect(typeof window.IDSParser.parse).toBe('function');
    });
});
```

- [ ] **Step 1.2: Add new test file + module to test-runner.html**

Modify `tests/test-runner.html` — after line 353 `<script src="../assets/js/parser.js"></script>` add:
```html
<script src="../assets/js/common/ids-parser.js"></script>
```
And in the test suites block (after line 355+) add:
```html
<script src="test-suites/ids-parser-unified.test.js"></script>
```

- [ ] **Step 1.3: Run test, verify it fails**

```bash
node tests/run-tests.js 2>&1 | grep -E "IDSParser|FAIL"
```
Expected: FAIL "expected 'undefined' to be 'object'"

- [ ] **Step 1.4: Create IDSParser scaffolding**

Create `assets/js/common/ids-parser.js`:
```js
/**
 * IDSParser — pure parsing of IDS 1.0 XML documents.
 * No DOM mutations, no event listeners. Safe to load on any page.
 */
window.IDSParser = (function() {
    'use strict';

    function parse(xmlString) {
        const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
        const errEl = doc.querySelector('parsererror');
        if (errEl) {
            return { info: {}, specifications: [], error: { message: errEl.textContent } };
        }
        return parseDocument(doc);
    }

    function parseDocument(xmlDoc) {
        return {
            info: extractInfo(xmlDoc),
            specifications: extractSpecifications(xmlDoc),
            error: null
        };
    }

    function extractInfo(_xmlDoc) { return {}; }
    function extractSpecifications(_xmlDoc) { return []; }
    function extractFacets(_facetsElement) { return []; }
    function extractFacet(_element, type) { return { type }; }
    function extractValue(_element) { return null; }
    function extractRestriction(_restriction) { return { type: 'restriction' }; }

    return {
        parse, parseDocument,
        extractInfo, extractSpecifications,
        extractFacets, extractFacet,
        extractValue, extractRestriction
    };
})();
```

- [ ] **Step 1.5: Run test, verify it passes**

```bash
node tests/run-tests.js 2>&1 | grep -E "IDSParser|PASS"
```
Expected: PASS for "should expose IDSParser namespace globally"

- [ ] **Step 1.6: Commit**

```bash
git add assets/js/common/ids-parser.js tests/test-runner.html tests/test-suites/ids-parser-unified.test.js
git commit -m "feat(ids-parser): scaffold IDSParser common module"
```

---

### Task 2: Implement IDSParser.extractInfo

**Files:**
- Modify: `assets/js/common/ids-parser.js` (extractInfo body)
- Test: `tests/test-suites/ids-parser-unified.test.js` (add test)

- [ ] **Step 2.1: Write failing test**

Append to `tests/test-suites/ids-parser-unified.test.js`:
```js
describe('IDSParser.extractInfo', () => {
    it('should extract info element fields', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <info>
                    <title>Test IDS</title>
                    <author>test@example.com</author>
                    <version>1.0</version>
                    <date>2026-01-01</date>
                </info>
                <specifications/>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const info = IDSParser.extractInfo(doc);
        expect(info.title).toBe('Test IDS');
        expect(info.author).toBe('test@example.com');
        expect(info.version).toBe('1.0');
        expect(info.date).toBe('2026-01-01');
    });

    it('should return empty object when info element missing', () => {
        const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"/>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const info = IDSParser.extractInfo(doc);
        expect(info.title).toBeUndefined();
    });
});
```

- [ ] **Step 2.2: Run test, verify it fails**

```bash
node tests/run-tests.js 2>&1 | grep -E "extract info"
```
Expected: FAIL "expected undefined to be 'Test IDS'"

- [ ] **Step 2.3: Implement extractInfo**

Replace the stub in `assets/js/common/ids-parser.js`:
```js
function extractInfo(xmlDoc) {
    const info = {};
    const infoEl = xmlDoc.querySelector('info');
    if (!infoEl) return info;
    const fields = ['title', 'copyright', 'version', 'description', 'author', 'date', 'purpose', 'milestone'];
    for (const field of fields) {
        const el = infoEl.querySelector(field);
        if (el) info[field] = el.textContent.trim();
    }
    return info;
}
```

- [ ] **Step 2.4: Run test, verify it passes**

```bash
node tests/run-tests.js 2>&1 | grep -E "extract info"
```
Expected: PASS for both info tests

- [ ] **Step 2.5: Commit**

```bash
git add assets/js/common/ids-parser.js tests/test-suites/ids-parser-unified.test.js
git commit -m "feat(ids-parser): extractInfo for info element fields"
```

---

### Task 3: Implement IDSParser.extractValue + extractRestriction

**Files:**
- Modify: `assets/js/common/ids-parser.js`
- Test: `tests/test-suites/ids-parser-unified.test.js`

- [ ] **Step 3.1: Write failing tests for all value shapes**

Append to test file:
```js
describe('IDSParser.extractValue', () => {
    function parseValue(xml) {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        return IDSParser.extractValue(doc.documentElement);
    }

    it('should extract simpleValue', () => {
        const v = parseValue('<value xmlns="x"><simpleValue>IFCWALL</simpleValue></value>');
        expect(v.type).toBe('simple');
        expect(v.value).toBe('IFCWALL');
    });

    it('should extract xs:enumeration restriction', () => {
        const v = parseValue(`<value xmlns="x" xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:restriction base="xs:string">
                <xs:enumeration value="A"/>
                <xs:enumeration value="B"/>
            </xs:restriction>
        </value>`);
        expect(v.type).toBe('enumeration');
        expect(v.values).toEqual(['A', 'B']);
    });

    it('should extract xs:pattern restriction with isRegex', () => {
        const v = parseValue(`<value xmlns="x" xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:restriction base="xs:string">
                <xs:pattern value="^IFC.*"/>
            </xs:restriction>
        </value>`);
        expect(v.type).toBe('restriction');
        expect(v.pattern).toBe('^IFC.*');
        expect(v.isRegex).toBe(true);
    });

    it('should extract xs:minInclusive/maxInclusive bounds', () => {
        const v = parseValue(`<value xmlns="x" xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:restriction base="xs:double">
                <xs:minInclusive value="0"/>
                <xs:maxInclusive value="100"/>
            </xs:restriction>
        </value>`);
        expect(v.type).toBe('restriction');
        expect(v.minInclusive).toBe('0');
        expect(v.maxInclusive).toBe('100');
    });
});
```

- [ ] **Step 3.2: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "extractValue"
```
Expected: 4 FAILs (returning null)

- [ ] **Step 3.3: Implement extractValue + extractRestriction**

Replace stubs in `assets/js/common/ids-parser.js`:
```js
function extractValue(element) {
    const simple = element.querySelector('simpleValue');
    if (simple) return { type: 'simple', value: simple.textContent.trim() };

    let restriction = element.querySelector('restriction');
    if (!restriction) {
        restriction = element.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'restriction')[0];
    }
    if (restriction) return extractRestriction(restriction);

    return { type: 'simple', value: element.textContent.trim() };
}

function extractRestriction(restriction) {
    const result = { type: 'restriction' };

    const ns = 'http://www.w3.org/2001/XMLSchema';
    const findChildren = (name) => {
        let nodes = restriction.querySelectorAll(name);
        if (!nodes.length) nodes = restriction.getElementsByTagNameNS(ns, name);
        return Array.from(nodes);
    };

    const patterns = findChildren('pattern');
    if (patterns.length) {
        result.pattern = patterns[0].getAttribute('value') || patterns[0].textContent.trim();
        result.isRegex = true;
    }

    const enums = findChildren('enumeration');
    if (enums.length) {
        result.type = 'enumeration';
        result.values = enums.map(e => e.getAttribute('value'));
    }

    for (const tag of ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive', 'minLength', 'maxLength', 'length']) {
        const els = findChildren(tag);
        if (els.length) result[tag] = els[0].getAttribute('value') || els[0].textContent.trim();
    }

    return result;
}
```

- [ ] **Step 3.4: Run, verify all pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "extractValue"
```
Expected: 4 PASS

- [ ] **Step 3.5: Commit**

```bash
git add assets/js/common/ids-parser.js tests/test-suites/ids-parser-unified.test.js
git commit -m "feat(ids-parser): extractValue + extractRestriction (simple/enum/pattern/bounds)"
```

---

### Task 4: Implement IDSParser.extractFacet + extractFacets

**Files:**
- Modify: `assets/js/common/ids-parser.js`
- Test: `tests/test-suites/ids-parser-unified.test.js`

- [ ] **Step 4.1: Write failing tests**

Append to test file:
```js
describe('IDSParser.extractFacet', () => {
    function parseSpec(xml) {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        return doc;
    }

    it('should extract entity facet with simple name', () => {
        const doc = parseSpec(`<applicability xmlns="x"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>`);
        const entity = doc.querySelector('entity');
        const facet = IDSParser.extractFacet(entity, 'entity');
        expect(facet.type).toBe('entity');
        expect(facet.name.type).toBe('simple');
        expect(facet.name.value).toBe('IFCWALL');
        expect(facet.cardinality).toBe('required');
    });

    it('should extract entity facet with predefinedType', () => {
        const doc = parseSpec(`<applicability xmlns="x"><entity>
            <name><simpleValue>IFCWALL</simpleValue></name>
            <predefinedType><simpleValue>STANDARD</simpleValue></predefinedType>
        </entity></applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('entity'), 'entity');
        expect(facet.predefinedType.value).toBe('STANDARD');
    });

    it('should extract property facet with propertySet + baseName', () => {
        const doc = parseSpec(`<requirements xmlns="x"><property cardinality="required">
            <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
            <baseName><simpleValue>FireRating</simpleValue></baseName>
        </property></requirements>`);
        const facet = IDSParser.extractFacet(doc.querySelector('property'), 'property');
        expect(facet.type).toBe('property');
        expect(facet.propertySet.value).toBe('Pset_WallCommon');
        expect(facet.baseName.value).toBe('FireRating');
        expect(facet.cardinality).toBe('required');
    });

    it('should extract uri attribute when present', () => {
        const doc = parseSpec(`<applicability xmlns="x"><classification uri="https://bsdd/x"><name><simpleValue>OmniClass</simpleValue></name></classification></applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('classification'), 'classification');
        expect(facet.uri).toBe('https://bsdd/x');
    });
});

describe('IDSParser.extractFacets', () => {
    it('should extract all facet types from a parent element', () => {
        const xml = `<applicability xmlns="x">
            <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
            <property><propertySet><simpleValue>Pset</simpleValue></propertySet><baseName><simpleValue>P</simpleValue></baseName></property>
        </applicability>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const facets = IDSParser.extractFacets(doc.querySelector('applicability'));
        expect(facets.length).toBe(2);
        expect(facets[0].type).toBe('entity');
        expect(facets[1].type).toBe('property');
    });

    it('should return empty array when element is null', () => {
        expect(IDSParser.extractFacets(null)).toEqual([]);
    });
});
```

- [ ] **Step 4.2: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "extractFacet"
```
Expected: 6 FAILs

- [ ] **Step 4.3: Implement extractFacet + extractFacets**

Replace stubs in `assets/js/common/ids-parser.js`:
```js
function extractFacets(facetsElement) {
    if (!facetsElement) return [];
    const facets = [];
    const types = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];
    for (const type of types) {
        const elements = facetsElement.querySelectorAll(type);
        for (const el of elements) {
            // Skip nested matches: only direct children of facetsElement
            if (el.parentNode !== facetsElement) continue;
            facets.push(extractFacet(el, type));
        }
    }
    return facets;
}

function extractFacet(element, type) {
    const facet = { type };

    const nameElem = element.querySelector(':scope > name, :scope > baseName');
    if (nameElem) facet.name = extractValue(nameElem);

    const baseNameElem = type === 'property' ? element.querySelector(':scope > baseName') : null;
    if (baseNameElem) facet.baseName = extractValue(baseNameElem);

    const valueElem = element.querySelector(':scope > value');
    if (valueElem) facet.value = extractValue(valueElem);

    if (type === 'property') {
        const psetElem = element.querySelector(':scope > propertySet, :scope > propertyset');
        if (psetElem) facet.propertySet = extractValue(psetElem);
    }

    if (type === 'partOf') {
        const relElem = element.querySelector(':scope > relation');
        if (relElem) facet.relation = extractValue(relElem);
    }

    if (type === 'classification') {
        const sysElem = element.querySelector(':scope > system');
        if (sysElem) facet.system = extractValue(sysElem);
    }

    const predefElem = element.querySelector(':scope > predefinedType');
    if (predefElem) facet.predefinedType = extractValue(predefElem);

    facet.cardinality = element.getAttribute('cardinality') || 'required';

    const uri = element.getAttribute('uri');
    if (uri) facet.uri = uri;

    return facet;
}
```

- [ ] **Step 4.4: Run, verify all pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "extractFacet|extractFacets"
```
Expected: 6 PASS

- [ ] **Step 4.5: Commit**

```bash
git add assets/js/common/ids-parser.js tests/test-suites/ids-parser-unified.test.js
git commit -m "feat(ids-parser): extractFacet + extractFacets for all 6 facet types"
```

---

### Task 5: Implement IDSParser.extractSpecifications

**Files:**
- Modify: `assets/js/common/ids-parser.js`
- Test: `tests/test-suites/ids-parser-unified.test.js`

- [ ] **Step 5.1: Write failing tests**

Append:
```js
describe('IDSParser.extractSpecifications', () => {
    it('should extract spec attributes + applicability minOccurs/maxOccurs', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="x">
                <specifications>
                    <specification name="Walls" ifcVersion="IFC4" identifier="W-001" description="Wall checks">
                        <applicability minOccurs="0" maxOccurs="unbounded">
                            <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
                        </applicability>
                        <requirements>
                            <property><propertySet><simpleValue>Pset</simpleValue></propertySet><baseName><simpleValue>P</simpleValue></baseName></property>
                        </requirements>
                    </specification>
                </specifications>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const specs = IDSParser.extractSpecifications(doc);
        expect(specs.length).toBe(1);
        expect(specs[0].name).toBe('Walls');
        expect(specs[0].ifcVersion).toBe('IFC4');
        expect(specs[0].identifier).toBe('W-001');
        expect(specs[0].description).toBe('Wall checks');
        expect(specs[0].minOccurs).toBe('0');
        expect(specs[0].maxOccurs).toBe('unbounded');
        expect(specs[0].applicability.length).toBe(1);
        expect(specs[0].requirements.length).toBe(1);
    });

    it('should default minOccurs/maxOccurs to undefined when absent', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="x"><specifications><specification name="X" ifcVersion="IFC4">
                <applicability/><requirements/>
            </specification></specifications></ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const specs = IDSParser.extractSpecifications(doc);
        expect(specs[0].minOccurs).toBeUndefined();
        expect(specs[0].maxOccurs).toBeUndefined();
    });
});
```

- [ ] **Step 5.2: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "extractSpecifications"
```
Expected: 2 FAILs

- [ ] **Step 5.3: Implement extractSpecifications**

Replace stub in `assets/js/common/ids-parser.js`:
```js
function extractSpecifications(xmlDoc) {
    const result = [];
    const specEls = xmlDoc.querySelectorAll('specification');
    specEls.forEach((spec, index) => {
        const applicabilityEl = spec.querySelector(':scope > applicability');
        const requirementsEl = spec.querySelector(':scope > requirements');
        result.push({
            name: spec.getAttribute('name') || `Specification ${index + 1}`,
            ifcVersion: spec.getAttribute('ifcVersion') || '',
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

- [ ] **Step 5.4: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "extractSpecifications"
```
Expected: 2 PASS

- [ ] **Step 5.5: Commit**

```bash
git add assets/js/common/ids-parser.js tests/test-suites/ids-parser-unified.test.js
git commit -m "feat(ids-parser): extractSpecifications with applicability minOccurs/maxOccurs"
```

---

### Task 6: Implement IDSParser.parse end-to-end

**Files:**
- Modify: `assets/js/common/ids-parser.js`
- Test: `tests/test-suites/ids-parser-unified.test.js`

- [ ] **Step 6.1: Write failing test**

Append:
```js
describe('IDSParser.parse', () => {
    it('should parse complete IDS xmlString', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <info><title>Test</title></info>
                <specifications>
                    <specification name="S1" ifcVersion="IFC4">
                        <applicability minOccurs="0" maxOccurs="unbounded">
                            <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
                        </applicability>
                        <requirements/>
                    </specification>
                </specifications>
            </ids>`;
        const result = IDSParser.parse(xml);
        expect(result.error).toBeNull();
        expect(result.info.title).toBe('Test');
        expect(result.specifications.length).toBe(1);
    });

    it('should return error object on malformed XML', () => {
        const result = IDSParser.parse('<not valid xml');
        expect(result.error).toBeDefined();
        expect(result.error.message).toBeDefined();
        expect(result.specifications).toEqual([]);
    });
});
```

- [ ] **Step 6.2: Run — `parse` is already implemented, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "IDSParser.parse"
```
Expected: 2 PASS (parse skeleton from Task 1 already calls extractInfo/extractSpecifications which now work)

- [ ] **Step 6.3: Commit**

```bash
git add tests/test-suites/ids-parser-unified.test.js
git commit -m "test(ids-parser): full parse() integration"
```

---

### Task 7: Backward-compatibility snapshot test

**Files:**
- Create: `tests/test-suites/ids-parser-backward-compat.test.js`
- Modify: `tests/test-runner.html` (load new test suite)

- [ ] **Step 7.1: Create snapshot test that compares old parser.js vs new IDSParser**

Create `tests/test-suites/ids-parser-backward-compat.test.js`:
```js
describe('IDSParser backward compatibility with parser.js', () => {

    function deepEqual(a, b) {
        return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
    }

    function normalize(obj) {
        if (Array.isArray(obj)) return obj.map(normalize);
        if (obj && typeof obj === 'object') {
            const sorted = {};
            for (const k of Object.keys(obj).sort()) {
                if (k === 'doc' || k === 'xml') continue; // skip raw refs
                sorted[k] = normalize(obj[k]);
            }
            return sorted;
        }
        return obj;
    }

    const sampleXmls = [
        // Inline minimal IDS for sanity (tests should still run if test-data unavailable)
        `<?xml version="1.0"?>
        <ids xmlns="http://standards.buildingsmart.org/IDS">
            <info><title>Inline</title></info>
            <specifications>
                <specification name="S" ifcVersion="IFC4">
                    <applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
                    <requirements/>
                </specification>
            </specifications>
        </ids>`
    ];

    sampleXmls.forEach((xml, idx) => {
        it(`sample ${idx} produces identical output from old parser.js and new IDSParser`, () => {
            // Old parser path: parseIDS sets currentIDSData (global), extracts info+specs via legacy fns
            const doc = new DOMParser().parseFromString(xml, 'text/xml');
            const oldOutput = {
                info: typeof extractInfo === 'function' ? extractInfo(doc) : {},
                specifications: typeof extractSpecifications === 'function' ? extractSpecifications(doc) : []
            };

            const newOutput = IDSParser.parse(xml);

            const same = deepEqual(
                { info: oldOutput.info, specifications: oldOutput.specifications },
                { info: newOutput.info, specifications: newOutput.specifications }
            );
            if (!same) {
                console.log('OLD:', JSON.stringify(normalize({ info: oldOutput.info, specifications: oldOutput.specifications }), null, 2));
                console.log('NEW:', JSON.stringify(normalize({ info: newOutput.info, specifications: newOutput.specifications }), null, 2));
            }
            expect(same).toBe(true);
        });
    });
});
```

- [ ] **Step 7.2: Add to test-runner.html**

In `tests/test-runner.html`, after the unified test suite line, add:
```html
<script src="test-suites/ids-parser-backward-compat.test.js"></script>
```

- [ ] **Step 7.3: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "backward compat|PASS|FAIL"
```
Expected: PASS for all snapshot tests

- [ ] **Step 7.4: Commit**

```bash
git add tests/test-suites/ids-parser-backward-compat.test.js tests/test-runner.html
git commit -m "test(ids-parser): backward-compat snapshot vs legacy parser.js"
```

---

### Task 8: Refactor parser.js to delegate to IDSParser

**Files:**
- Modify: `assets/js/parser.js` (remove extractors, use IDSParser)
- Modify: `pages/ids-parser-visualizer.html` (load common/ids-parser.js)
- Modify: `dist/assets/js/parser.js`, `dist/pages/ids-parser-visualizer.html`, `dist/assets/js/common/ids-parser.js`

- [ ] **Step 8.1: Add IDSParser script to ids-parser-visualizer.html**

In `pages/ids-parser-visualizer.html`, find the line `<script src="../assets/js/parser.js"></script>` (around line 228) and BEFORE it add:
```html
<script src="../assets/js/common/ids-parser.js"></script>
```

- [ ] **Step 8.2: Replace parseIDS in parser.js to delegate**

In `assets/js/parser.js`, find function `parseIDS` (around line 59):
```js
function parseIDS(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        showError(t('parser.error.invalidXml'));
        return;
    }
    currentIDSData = {
        xml: xmlString,
        doc: xmlDoc,
        info: extractInfo(xmlDoc),
        specifications: extractSpecifications(xmlDoc)
    };
    // ... display logic
}
```

Replace with:
```js
function parseIDS(xmlString) {
    const result = IDSParser.parse(xmlString);
    if (result.error) {
        showError(t('parser.error.invalidXml'));
        return;
    }
    const xmlDoc = new DOMParser().parseFromString(xmlString, 'text/xml');
    currentIDSData = {
        xml: xmlString,
        doc: xmlDoc,
        info: result.info,
        specifications: result.specifications
    };
    // keep display logic that follows
}
```

(Preserve any code that follows the `currentIDSData = {...}` block, e.g., visualization toggle.)

- [ ] **Step 8.3: Delete the legacy extractor functions from parser.js**

Delete from `assets/js/parser.js` these top-level function definitions:
- `extractInfo` (around lines 87–103)
- `extractSpecifications` (around lines 105–125)
- `extractFacets` (around lines 127–143)
- `extractFacet` (around lines 145–216)
- `extractValue` (around lines 218–238)
- `extractRestriction` (around lines 240–298)

- [ ] **Step 8.4: Run all existing tests, verify still pass**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: SUMMARY 280+/280+ tests passed.

- [ ] **Step 8.5: Sync dist/ + commit**

```bash
cp assets/js/common/ids-parser.js dist/assets/js/common/ids-parser.js
cp assets/js/parser.js dist/assets/js/parser.js
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
git add assets/js/parser.js pages/ids-parser-visualizer.html dist/assets/js/parser.js dist/pages/ids-parser-visualizer.html dist/assets/js/common/ids-parser.js
git commit -m "refactor(parser.js): delegate IDS parsing to IDSParser, remove duplicate extractors"
```

---

### Task 9: Refactor validator.js to delegate to IDSParser

**Files:**
- Modify: `assets/js/validator.js`
- Modify: `pages/ids-ifc-validator.html`
- Modify: `dist/` mirrors

- [ ] **Step 9.1: Add IDSParser script to ids-ifc-validator.html**

Find script load order in `pages/ids-ifc-validator.html`. Before `validator.js` script, add:
```html
<script src="../assets/js/common/ids-parser.js"></script>
```

- [ ] **Step 9.2: Replace parseIDS in validator.js**

In `assets/js/validator.js`, find `function parseIDS(xmlString, fileName)` (around line 223). Replace the function body:
```js
function parseIDS(xmlString, fileName) {
    const result = IDSParser.parse(xmlString);
    if (result.error) {
        showError(t('validator.error.idsLoadError') + ' ' + fileName + ': ' + result.error.message);
        return null;
    }
    return { fileName, data: result };
}
```

- [ ] **Step 9.3: Delete legacy extractor functions in validator.js**

Delete from `assets/js/validator.js`:
- `extractFacets` (around lines 270–283)
- `extractFacet` (around lines 285–327)
- `extractValue` (around lines 329–341)
- `extractRestriction` (around lines 343–365 — the version we patched in earlier commits)

- [ ] **Step 9.4: Run all tests, verify pass**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: SUMMARY 280+/280+ tests passed.

- [ ] **Step 9.5: Sync dist/ + commit**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
git add assets/js/validator.js pages/ids-ifc-validator.html dist/assets/js/validator.js dist/pages/ids-ifc-validator.html
git commit -m "refactor(validator.js): delegate IDS parsing to IDSParser, remove duplicate"
```

**✅ Step 1 checkpoint:** Parser unification complete. Both pages share single parser. 280+ tests pass.

---

## Step 2: IFC Hierarchy Data + Module

### Task 10: Generator script

**Files:**
- Create: `scripts/generate-ifc-hierarchy.cjs`
- Create: `scripts/.gitignore` (to exclude downloaded `.exp` files)

- [ ] **Step 10.1: Create scripts/.gitignore**

```bash
echo "*.exp" > scripts/.gitignore
echo "exp-cache/" >> scripts/.gitignore
```

- [ ] **Step 10.2: Create generator script**

Create `scripts/generate-ifc-hierarchy.cjs`:
```js
#!/usr/bin/env node
/**
 * Generate IFC class hierarchy + PredefinedType attribute index from EXPRESS schemas.
 * Usage: node scripts/generate-ifc-hierarchy.cjs --version IFC4 --output assets/data/
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const SCHEMA_URLS = {
    'IFC2X3':  'https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/TC1/EXPRESS/IFC2X3_TC1.exp',
    'IFC4':    'https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/EXPRESS/IFC4_ADD2_TC1.exp',
    'IFC4X3':  'https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.exp'
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) return fetchUrl(res.headers.location).then(resolve, reject);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseExpress(text) {
    const classes = {};
    const entityRe = /ENTITY\s+(\w+)([^;]*?)(?:SUBTYPE\s+OF\s*\(\s*(\w+)\s*\))?\s*;([\s\S]*?)END_ENTITY/gi;
    let match;
    while ((match = entityRe.exec(text)) !== null) {
        const [, name, _supertypeBlock, parent, body] = match;
        const className = name.toUpperCase();
        const entry = {
            parent: parent ? parent.toUpperCase() : null,
            predefinedTypeIndex: null,
            objectTypeIndex: null
        };

        // Extract attribute list (lines like "AttrName : OPTIONAL Type;" before WHERE/UNIQUE/INVERSE)
        const attrSection = body.split(/\b(?:WHERE|UNIQUE|INVERSE|DERIVE)\b/i)[0];
        const attrRe = /(\w+)\s*:\s*(?:OPTIONAL\s+)?[^;]+;/g;
        const attrs = [];
        let ar;
        while ((ar = attrRe.exec(attrSection)) !== null) attrs.push(ar[1]);

        const pdIdx = attrs.findIndex(a => a.toLowerCase() === 'predefinedtype');
        if (pdIdx >= 0) entry.predefinedTypeIndex = pdIdx;
        const otIdx = attrs.findIndex(a => a.toLowerCase() === 'objecttype');
        if (otIdx >= 0 && pdIdx >= 0) entry.objectTypeIndex = otIdx;

        classes[className] = entry;
    }

    // Resolve inherited attribute counts: PredefinedType in IFCWALL is at position 8
    // because parent IFCBUILTELEMENT contributes 8 inherited attrs. Walk parent chain.
    function inheritedAttrCount(name, visited = new Set()) {
        if (visited.has(name)) return 0;
        visited.add(name);
        const cls = classes[name];
        if (!cls || !cls.parent) return 0;
        const parentCls = classes[cls.parent];
        if (!parentCls) return 0;
        return inheritedAttrCount(cls.parent, visited) + countOwnAttrs(cls.parent, text);
    }
    function countOwnAttrs(name, text) {
        const re = new RegExp(`ENTITY\\s+${name}\\b[\\s\\S]*?END_ENTITY`, 'i');
        const m = text.match(re);
        if (!m) return 0;
        const body = m[0].split(/\b(?:WHERE|UNIQUE|INVERSE|DERIVE)\b/i)[0].split(';').slice(1);
        // crude attribute count
        return body.filter(s => /^\s*\w+\s*:/.test(s)).length;
    }

    // Adjust indexes by inherited count
    for (const [name, entry] of Object.entries(classes)) {
        if (entry.predefinedTypeIndex !== null) {
            const inh = inheritedAttrCount(name);
            entry.predefinedTypeIndex += inh;
            if (entry.objectTypeIndex !== null) entry.objectTypeIndex += inh;
        }
    }

    return classes;
}

async function main() {
    const args = process.argv.slice(2);
    const versionIdx = args.indexOf('--version');
    const outputIdx = args.indexOf('--output');
    if (versionIdx < 0 || outputIdx < 0) {
        console.error('Usage: node generate-ifc-hierarchy.cjs --version IFC4 --output assets/data/');
        process.exit(1);
    }
    const version = args[versionIdx + 1];
    const outputDir = args[outputIdx + 1];
    const url = SCHEMA_URLS[version];
    if (!url) { console.error(`Unknown version: ${version}`); process.exit(1); }

    console.log(`Fetching ${url}...`);
    const text = await fetchUrl(url);
    console.log(`Parsing ${text.length} bytes...`);
    const classes = parseExpress(text);
    console.log(`Found ${Object.keys(classes).length} classes`);

    const output = {
        schemaVersion: version,
        generatedFrom: url,
        generatedAt: new Date().toISOString(),
        classes
    };

    const outPath = path.join(outputDir, `ifc-hierarchy-${version}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Wrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 10.3: Test the generator can fetch + parse a small sample (smoke test)**

```bash
node scripts/generate-ifc-hierarchy.cjs --version IFC4 --output /tmp/ 2>&1 | tail -5
ls -la /tmp/ifc-hierarchy-IFC4.json
head -c 500 /tmp/ifc-hierarchy-IFC4.json
```
Expected: file ~50–60 KB, contains valid JSON with `classes` object including `IFCWALL`.

- [ ] **Step 10.4: Commit script**

```bash
git add scripts/generate-ifc-hierarchy.cjs scripts/.gitignore
git commit -m "feat(scripts): EXPRESS → JSON IFC hierarchy generator"
```

---

### Task 11: Generate hierarchy JSON for all 3 IFC versions

**Files:**
- Create: `assets/data/ifc-hierarchy-IFC2X3.json`
- Create: `assets/data/ifc-hierarchy-IFC4.json`
- Create: `assets/data/ifc-hierarchy-IFC4X3.json`

- [ ] **Step 11.1: Run generator for all 3 versions**

```bash
mkdir -p assets/data/
node scripts/generate-ifc-hierarchy.cjs --version IFC2X3 --output assets/data/
node scripts/generate-ifc-hierarchy.cjs --version IFC4   --output assets/data/
node scripts/generate-ifc-hierarchy.cjs --version IFC4X3 --output assets/data/
```

- [ ] **Step 11.2: Verify generated files**

```bash
for v in IFC2X3 IFC4 IFC4X3; do
    f="assets/data/ifc-hierarchy-${v}.json"
    echo "$f: $(wc -c < $f) bytes, $(node -e "console.log(Object.keys(require('./$f').classes).length)") classes"
done
```
Expected: ~50K bytes each, ~600/770/830 classes.

Spot-check IFCWALL has parent + predefinedTypeIndex:
```bash
node -e "const h = require('./assets/data/ifc-hierarchy-IFC4.json'); console.log(JSON.stringify(h.classes.IFCWALL))"
```
Expected: `{"parent":"IFCBUILTELEMENT","predefinedTypeIndex":8,"objectTypeIndex":4}`

- [ ] **Step 11.3: Sync dist/ + commit**

```bash
mkdir -p dist/assets/data/
cp assets/data/ifc-hierarchy-*.json dist/assets/data/
git add assets/data/ifc-hierarchy-*.json dist/assets/data/ifc-hierarchy-*.json
git commit -m "data: generate IFC hierarchy JSON for IFC2X3/IFC4/IFC4X3"
```

---

### Task 12: IFCHierarchy module

**Files:**
- Create: `assets/js/common/ifc-hierarchy.js`
- Create: `tests/test-suites/ifc-hierarchy.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 12.1: Write failing tests**

Create `tests/test-suites/ifc-hierarchy.test.js`:
```js
describe('IFCHierarchy', () => {
    it('should expose IFCHierarchy global', () => {
        expect(typeof window.IFCHierarchy).toBe('object');
        expect(typeof window.IFCHierarchy.load).toBe('function');
        expect(typeof window.IFCHierarchy.isSubtypeOf).toBe('function');
        expect(typeof window.IFCHierarchy.getSubtypes).toBe('function');
        expect(typeof window.IFCHierarchy.getPredefinedTypeIndex).toBe('function');
        expect(typeof window.IFCHierarchy.getObjectTypeIndex).toBe('function');
    });

    it('should load IFC4 hierarchy', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALL', 'IFCWALL')).toBe(true);
    });

    it('should detect direct subtype', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALLSTANDARDCASE', 'IFCWALL')).toBe(true);
    });

    it('should detect transitive subtype', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALL', 'IFCROOT')).toBe(true);
    });

    it('should reject unrelated classes', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALL', 'IFCDOOR')).toBe(false);
    });

    it('should return predefinedTypeIndex for IFCWALL', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.getPredefinedTypeIndex('IFC4', 'IFCWALL')).toBe(8);
    });

    it('should return null predefinedTypeIndex for IFCROOT', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.getPredefinedTypeIndex('IFC4', 'IFCROOT')).toBeNull();
    });

    it('should return objectTypeIndex for IFCWALL', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.getObjectTypeIndex('IFC4', 'IFCWALL')).toBe(4);
    });

    it('should return getSubtypes including self', async () => {
        await IFCHierarchy.load('IFC4');
        const subs = IFCHierarchy.getSubtypes('IFC4', 'IFCWALL');
        expect(subs).toContain('IFCWALL');
        expect(subs).toContain('IFCWALLSTANDARDCASE');
    });

    it('should cache load (second call resolves immediately)', async () => {
        await IFCHierarchy.load('IFC4');
        const t0 = performance.now();
        await IFCHierarchy.load('IFC4');
        const dt = performance.now() - t0;
        expect(dt < 50).toBe(true);
    });
});
```

- [ ] **Step 12.2: Add scripts to test-runner.html**

In `tests/test-runner.html`, add before test-framework.js:
```html
<script src="../assets/js/common/ifc-hierarchy.js"></script>
```
And in suites block:
```html
<script src="test-suites/ifc-hierarchy.test.js"></script>
```

- [ ] **Step 12.3: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "IFCHierarchy"
```
Expected: 10 FAILs

- [ ] **Step 12.4: Implement IFCHierarchy**

Create `assets/js/common/ifc-hierarchy.js`:
```js
/**
 * IFCHierarchy — lazy-loaded IFC class hierarchy + PredefinedType attribute positions.
 * Data sourced from build-time JSON (assets/data/ifc-hierarchy-<version>.json).
 */
window.IFCHierarchy = (function() {
    'use strict';

    const cache = new Map();        // version → { classes, childrenIndex, subtypeCache }
    const loadPromises = new Map(); // version → Promise

    function dataUrl(version) {
        return `../assets/data/ifc-hierarchy-${version}.json`;
    }

    function buildChildrenIndex(classes) {
        const index = {};
        for (const [name, entry] of Object.entries(classes)) {
            if (entry.parent) {
                if (!index[entry.parent]) index[entry.parent] = [];
                index[entry.parent].push(name);
            }
        }
        return index;
    }

    function load(version) {
        if (cache.has(version)) return Promise.resolve();
        if (loadPromises.has(version)) return loadPromises.get(version);

        const promise = fetch(dataUrl(version))
            .then(r => {
                if (!r.ok) throw new Error(`Failed to load hierarchy for ${version}: HTTP ${r.status}`);
                return r.json();
            })
            .then(data => {
                cache.set(version, {
                    classes: data.classes,
                    childrenIndex: buildChildrenIndex(data.classes),
                    subtypeCache: new Map()
                });
            });
        loadPromises.set(version, promise);
        return promise;
    }

    function isSubtypeOf(version, child, ancestor) {
        const data = cache.get(version);
        if (!data) return false;
        let cur = child;
        const seen = new Set();
        while (cur) {
            if (cur === ancestor) return true;
            if (seen.has(cur)) return false; // cycle guard
            seen.add(cur);
            cur = data.classes[cur]?.parent;
        }
        return false;
    }

    function getSubtypes(version, cls) {
        const data = cache.get(version);
        if (!data) return [];
        if (data.subtypeCache.has(cls)) return data.subtypeCache.get(cls);
        const result = [cls];
        const queue = [cls];
        while (queue.length) {
            const cur = queue.shift();
            const children = data.childrenIndex[cur] || [];
            for (const child of children) {
                result.push(child);
                queue.push(child);
            }
        }
        data.subtypeCache.set(cls, result);
        return result;
    }

    function getPredefinedTypeIndex(version, cls) {
        const data = cache.get(version);
        if (!data) return null;
        return data.classes[cls]?.predefinedTypeIndex ?? null;
    }

    function getObjectTypeIndex(version, cls) {
        const data = cache.get(version);
        if (!data) return null;
        return data.classes[cls]?.objectTypeIndex ?? null;
    }

    return { load, isSubtypeOf, getSubtypes, getPredefinedTypeIndex, getObjectTypeIndex };
})();
```

- [ ] **Step 12.5: Run, verify all 10 tests pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "IFCHierarchy"
```
Expected: 10 PASS

- [ ] **Step 12.6: Sync dist/ + commit**

```bash
cp assets/js/common/ifc-hierarchy.js dist/assets/js/common/ifc-hierarchy.js
git add assets/js/common/ifc-hierarchy.js dist/assets/js/common/ifc-hierarchy.js tests/test-suites/ifc-hierarchy.test.js tests/test-runner.html
git commit -m "feat(ifc-hierarchy): lazy-loaded IFC class hierarchy lookup module"
```

**✅ Step 2 checkpoint:** Hierarchy data + module ready.

---

## Step 3: Subtype + PredefinedType Matching (A + C)

### Task 13: IfcParams helpers

**Files:**
- Create: `assets/js/common/ifc-params.js`
- Create: `tests/test-suites/ifc-params.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 13.1: Write failing tests**

Create `tests/test-suites/ifc-params.test.js`:
```js
describe('IfcParams.splitIfcParams', () => {
    it('should split simple comma-separated', () => {
        expect(IfcParams.splitIfcParams("a,b,c")).toEqual(["a","b","c"]);
    });

    it('should respect quoted strings with commas', () => {
        expect(IfcParams.splitIfcParams("a,'hello, world',b")).toEqual(["a","'hello, world'","b"]);
    });

    it('should respect nested parens', () => {
        expect(IfcParams.splitIfcParams("a,(b,c),d")).toEqual(["a","(b,c)","d"]);
    });

    it('should handle deeply nested parens', () => {
        expect(IfcParams.splitIfcParams("a,(b,(c,d)),e")).toEqual(["a","(b,(c,d))","e"]);
    });

    it('should handle escaped quotes inside strings', () => {
        expect(IfcParams.splitIfcParams("a,'it''s ok',b")).toEqual(["a","'it''s ok'","b"]);
    });

    it('should return empty array for empty input', () => {
        expect(IfcParams.splitIfcParams("")).toEqual([]);
    });
});

describe('IfcParams.unwrapEnumValue', () => {
    it('should strip dots', () => {
        expect(IfcParams.unwrapEnumValue(".STANDARD.")).toBe("STANDARD");
    });
    it('should return null for $', () => {
        expect(IfcParams.unwrapEnumValue("$")).toBeNull();
    });
    it('should return null for empty', () => {
        expect(IfcParams.unwrapEnumValue("")).toBeNull();
    });
    it('should handle whitespace', () => {
        expect(IfcParams.unwrapEnumValue("  .STANDARD.  ")).toBe("STANDARD");
    });
});

describe('IfcParams.unwrapString', () => {
    it('should strip surrounding quotes', () => {
        expect(IfcParams.unwrapString("'hello'")).toBe("hello");
    });
    it('should return null for $', () => {
        expect(IfcParams.unwrapString("$")).toBeNull();
    });
    it('should unescape doubled single quotes', () => {
        expect(IfcParams.unwrapString("'it''s'")).toBe("it's");
    });
});
```

- [ ] **Step 13.2: Add to test-runner.html**

```html
<script src="../assets/js/common/ifc-params.js"></script>
<!-- in suites block: -->
<script src="test-suites/ifc-params.test.js"></script>
```

- [ ] **Step 13.3: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "IfcParams"
```
Expected: 13 FAILs

- [ ] **Step 13.4: Implement IfcParams**

Create `assets/js/common/ifc-params.js`:
```js
/**
 * IfcParams — utilities for parsing IFC entity parameter strings.
 */
window.IfcParams = (function() {
    'use strict';

    function splitIfcParams(s) {
        if (!s || !s.length) return [];
        const out = [];
        let buf = '';
        let depth = 0;
        let inString = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (inString) {
                buf += ch;
                if (ch === "'") {
                    if (s[i + 1] === "'") { buf += s[++i]; continue; } // escaped quote
                    inString = false;
                }
                continue;
            }
            if (ch === "'") { inString = true; buf += ch; continue; }
            if (ch === '(') { depth++; buf += ch; continue; }
            if (ch === ')') { depth--; buf += ch; continue; }
            if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
            buf += ch;
        }
        if (buf.length) out.push(buf);
        return out;
    }

    function unwrapEnumValue(s) {
        if (!s) return null;
        const trimmed = s.trim();
        if (!trimmed || trimmed === '$') return null;
        const m = trimmed.match(/^\.(.+)\.$/);
        return m ? m[1] : null;
    }

    function unwrapString(s) {
        if (!s) return null;
        const trimmed = s.trim();
        if (!trimmed || trimmed === '$') return null;
        const m = trimmed.match(/^'(.*)'$/s);
        if (!m) return null;
        return m[1].replace(/''/g, "'");
    }

    return { splitIfcParams, unwrapEnumValue, unwrapString };
})();
```

- [ ] **Step 13.5: Run, verify all pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "IfcParams"
```
Expected: 13 PASS

- [ ] **Step 13.6: Sync dist/ + commit**

```bash
cp assets/js/common/ifc-params.js dist/assets/js/common/ifc-params.js
git add assets/js/common/ifc-params.js dist/assets/js/common/ifc-params.js tests/test-suites/ifc-params.test.js tests/test-runner.html
git commit -m "feat(ifc-params): IFC entity param string utilities (split, unwrap)"
```

---

### Task 14: Subtype matching in checkEntityFacet (validation-engine.js)

**Files:**
- Modify: `assets/js/common/validation-engine.js`
- Create: `tests/test-suites/validation-subtype.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 14.1: Write failing tests**

Create `tests/test-suites/validation-subtype.test.js`:
```js
describe('Validation: subtype matching', () => {
    beforeEach(async () => {
        await IFCHierarchy.load('IFC4');
    });

    function ctx() {
        return {
            ifcVersion: 'IFC4',
            isSubtypeOf: (child, anc) => IFCHierarchy.isSubtypeOf('IFC4', child, anc),
            getPredefinedTypeIndex: (cls) => IFCHierarchy.getPredefinedTypeIndex('IFC4', cls),
            getObjectTypeIndex: (cls) => IFCHierarchy.getObjectTypeIndex('IFC4', cls)
        };
    }

    it('should match exact entity name', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALL' }, facet, ctx())).toBe(true);
    });

    it('should match subtype via inheritance', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALLSTANDARDCASE' }, facet, ctx())).toBe(true);
    });

    it('should NOT match unrelated entity', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCDOOR' }, facet, ctx())).toBe(false);
    });

    it('should match enumeration value with subtype', () => {
        const facet = { type: 'entity', name: { type: 'enumeration', values: ['IFCWALL', 'IFCDOOR'] } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALLSTANDARDCASE' }, facet, ctx())).toBe(true);
    });

    it('should match abstract parent class', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCBUILTELEMENT' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALL' }, facet, ctx())).toBe(true);
    });

    it('should match regex pattern without inheritance', () => {
        const facet = { type: 'entity', name: { type: 'restriction', isRegex: true, pattern: '^IFCWALL.*' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALLSTANDARDCASE' }, facet, ctx())).toBe(true);
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCDOOR' }, facet, ctx())).toBe(false);
    });
});
```

- [ ] **Step 14.2: Add to test-runner.html**

```html
<script src="test-suites/validation-subtype.test.js"></script>
```

- [ ] **Step 14.3: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "subtype"
```
Expected: most fail or behavior unclear (current code returns true for enum unconditionally — wait, after our previous fix it does match `values.includes`. So enum subtype test fails because `IFCWALLSTANDARDCASE` not in `['IFCWALL', 'IFCDOOR']`).

- [ ] **Step 14.4: Update validation-engine.js checkEntityFacet**

In `assets/js/common/validation-engine.js`, replace `checkEntityFacet` (around line 22):
```js
function checkEntityFacet(entity, facet, ctx) {
    if (!facet.name) return true;

    // Regex pattern: explicit, no inheritance
    if (facet.name.type === 'restriction' && facet.name.isRegex) {
        return new RegExp(facet.name.pattern).test(entity.entity);
    }

    // Collect target classes (simple → [value], enumeration → values)
    let targets = null;
    if (facet.name.type === 'simple') targets = [facet.name.value];
    else if (facet.name.type === 'enumeration' && Array.isArray(facet.name.values)) targets = facet.name.values;
    if (!targets) return false;

    // Match by exact or subtype-of
    let nameMatch = false;
    for (const target of targets) {
        if (ctx && ctx.isSubtypeOf && ctx.isSubtypeOf(entity.entity, target)) { nameMatch = true; break; }
        if (entity.entity === target) { nameMatch = true; break; }
    }
    if (!nameMatch) return false;

    // PredefinedType (next task — for now, skip if no ctx)
    return true;
}
```

- [ ] **Step 14.5: Run, verify subtype tests pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "subtype"
```
Expected: 7 PASS

- [ ] **Step 14.6: Sync dist/ + commit**

```bash
cp assets/js/common/validation-engine.js dist/assets/js/common/validation-engine.js
git add assets/js/common/validation-engine.js dist/assets/js/common/validation-engine.js tests/test-suites/validation-subtype.test.js tests/test-runner.html
git commit -m "feat(validation): subtype-aware entity matching in checkEntityFacet"
```

---

### Task 15: PredefinedType matching

**Files:**
- Modify: `assets/js/common/validation-engine.js` (add checkPredefinedType, integrate into checkEntityFacet)
- Create: `tests/test-suites/validation-predefinedtype.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 15.1: Write failing tests**

Create `tests/test-suites/validation-predefinedtype.test.js`:
```js
describe('Validation: predefinedType matching', () => {
    beforeEach(async () => {
        await IFCHierarchy.load('IFC4');
    });

    function ctx() {
        return {
            ifcVersion: 'IFC4',
            isSubtypeOf: (c, a) => IFCHierarchy.isSubtypeOf('IFC4', c, a),
            getPredefinedTypeIndex: (cls) => IFCHierarchy.getPredefinedTypeIndex('IFC4', cls),
            getObjectTypeIndex: (cls) => IFCHierarchy.getObjectTypeIndex('IFC4', cls),
            splitParams: IfcParams.splitIfcParams,
            unwrapEnumValue: IfcParams.unwrapEnumValue,
            unwrapString: IfcParams.unwrapString
        };
    }

    function wallEntity(predef, objType = '$') {
        // IFCWALL params: GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, Tag, PredefinedType
        return {
            entity: 'IFCWALL',
            params: `'guid',#10,'Wall','desc',${objType},#20,#30,$,${predef}`
        };
    }

    it('should match simple predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'STANDARD' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.STANDARD.'), facet, ctx())).toBe(true);
    });

    it('should reject non-matching predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'STANDARD' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.MOVABLE.'), facet, ctx())).toBe(false);
    });

    it('should match USERDEFINED via ObjectType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'CustomWall' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.USERDEFINED.', "'CustomWall'"), facet, ctx())).toBe(true);
    });

    it('should reject when entity has $ predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'STANDARD' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('$'), facet, ctx())).toBe(false);
    });

    it('should match enumeration predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'enumeration', values: ['STANDARD', 'MOVABLE'] } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.STANDARD.'), facet, ctx())).toBe(true);
        expect(ValidationEngine.checkEntityFacet(wallEntity('.PARTITIONING.'), facet, ctx())).toBe(false);
    });
});
```

- [ ] **Step 15.2: Add to test-runner.html**

```html
<script src="test-suites/validation-predefinedtype.test.js"></script>
```

- [ ] **Step 15.3: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "predefinedType matching"
```
Expected: 5 FAILs

- [ ] **Step 15.4: Implement checkPredefinedType + wire into checkEntityFacet**

In `assets/js/common/validation-engine.js`, add new function and update checkEntityFacet:
```js
function checkPredefinedType(entity, facetPredef, ctx) {
    if (!ctx || !ctx.getPredefinedTypeIndex) return true; // no ctx → skip
    const idx = ctx.getPredefinedTypeIndex(entity.entity);
    if (idx === null) return false;
    if (!entity.params) return false;

    const params = ctx.splitParams(entity.params);
    let actual = ctx.unwrapEnumValue(params[idx]);

    if (actual === 'USERDEFINED') {
        const objIdx = ctx.getObjectTypeIndex(entity.entity);
        if (objIdx !== null) {
            actual = ctx.unwrapString(params[objIdx]);
        }
    }
    if (actual === null) return false;

    if (facetPredef.type === 'simple') return actual === facetPredef.value;
    if (facetPredef.type === 'enumeration' && Array.isArray(facetPredef.values)) {
        return facetPredef.values.includes(actual);
    }
    if (facetPredef.type === 'restriction' && facetPredef.isRegex) {
        return new RegExp(facetPredef.pattern).test(actual);
    }
    return false;
}
```

Update `checkEntityFacet` end (replace `return true;` after name match):
```js
    // ... after nameMatch check ...
    if (facet.predefinedType) return checkPredefinedType(entity, facet.predefinedType, ctx);
    return true;
}
```

Add `checkPredefinedType` to the returned object at end of IIFE:
```js
return { checkEntityFacet, checkPropertyFacet, checkAttributeFacet, checkFacetMatch, filterByApplicability, validateEntity, validateBatch, checkPredefinedType };
```

- [ ] **Step 15.5: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "predefinedType matching"
```
Expected: 5 PASS

- [ ] **Step 15.6: Sync dist/ + commit**

```bash
cp assets/js/common/validation-engine.js dist/assets/js/common/validation-engine.js
git add assets/js/common/validation-engine.js dist/assets/js/common/validation-engine.js tests/test-suites/validation-predefinedtype.test.js tests/test-runner.html
git commit -m "feat(validation): predefinedType matching with USERDEFINED + ObjectType fallback"
```

---

### Task 16: Mirror subtype + predefinedType in validator.js

**Files:**
- Modify: `assets/js/validator.js`

The standalone parser-less validator.js has its own `checkEntityFacet`. Update it to use `ctx` like ValidationEngine.

- [ ] **Step 16.1: Update validator.js checkEntityFacet**

In `assets/js/validator.js`, find `checkEntityFacet` (around line 960). Replace with:
```js
function checkEntityFacet(entity, facet, ctx) {
    return ValidationEngine.checkEntityFacet(entity, facet, ctx);
}
```

(Delegates to single source of truth.)

- [ ] **Step 16.2: Update validator.js callers to pass ctx**

In `assets/js/validator.js`, find `filterEntitiesByApplicability` (around line 886). Update:
```js
function filterEntitiesByApplicability(entities, applicability, ctx) {
    if (!applicability || applicability.length === 0) return entities;
    return entities.filter(entity => {
        for (const facet of applicability) {
            if (!checkFacetMatch(entity, facet, ctx)) return false;
        }
        return true;
    });
}
```

And `checkFacetMatch`:
```js
function checkFacetMatch(entity, facet, ctx) {
    if (facet.type === 'entity') return ValidationEngine.checkEntityFacet(entity, facet, ctx);
    if (facet.type === 'property') return checkPropertyFacet(entity, facet, true);
    if (facet.type === 'attribute') return checkAttributeFacet(entity, facet, true);
    return true;
}
```

And in `validateEntitiesAgainstIDS` / `validateEntitiesAgainstIDSAsync` (around line 800/839), pre-load hierarchy and build ctx before iterating:
```js
async function validateEntitiesAgainstIDSAsync(entities, specifications) {
    const results = [];
    const CHUNK_SIZE = 50;
    for (const spec of specifications) {
        const ifcVersion = spec.ifcVersion || 'IFC4';
        await IFCHierarchy.load(ifcVersion);
        const ctx = {
            ifcVersion,
            isSubtypeOf: (c, a) => IFCHierarchy.isSubtypeOf(ifcVersion, c, a),
            getPredefinedTypeIndex: (cls) => IFCHierarchy.getPredefinedTypeIndex(ifcVersion, cls),
            getObjectTypeIndex: (cls) => IFCHierarchy.getObjectTypeIndex(ifcVersion, cls),
            splitParams: IfcParams.splitIfcParams,
            unwrapEnumValue: IfcParams.unwrapEnumValue,
            unwrapString: IfcParams.unwrapString
        };

        const specResult = { specification: spec.name, status: 'pass', passCount: 0, failCount: 0, entityResults: [] };
        const applicableEntities = filterEntitiesByApplicability(entities, spec.applicability, ctx);
        // ... rest unchanged
```

(Apply the same change to the sync `validateEntitiesAgainstIDS` for completeness.)

- [ ] **Step 16.3: Same for validation-engine.js validateBatch**

In `assets/js/common/validation-engine.js`, update `validateBatch` to take ctx OR build it from spec:
```js
async function validateBatch(entities, spec) {
    const ifcVersion = spec.ifcVersion || 'IFC4';
    await window.IFCHierarchy.load(ifcVersion);
    const ctx = {
        ifcVersion,
        isSubtypeOf: (c, a) => window.IFCHierarchy.isSubtypeOf(ifcVersion, c, a),
        getPredefinedTypeIndex: (cls) => window.IFCHierarchy.getPredefinedTypeIndex(ifcVersion, cls),
        getObjectTypeIndex: (cls) => window.IFCHierarchy.getObjectTypeIndex(ifcVersion, cls),
        splitParams: window.IfcParams.splitIfcParams,
        unwrapEnumValue: window.IfcParams.unwrapEnumValue,
        unwrapString: window.IfcParams.unwrapString
    };

    const result = { specification: spec.name, status: 'pass', passCount: 0, failCount: 0, entityResults: [] };
    const applicableEntities = filterByApplicability(entities, spec.applicability, ctx);
    for (const entity of applicableEntities) {
        const entityResult = validateEntity(entity, spec.requirements || [], spec.name);
        result.entityResults.push(entityResult);
        if (entityResult.status === 'pass') result.passCount++;
        else { result.failCount++; result.status = 'fail'; }
    }
    return result;
}
```

Also update `filterByApplicability` to accept and pass ctx.

- [ ] **Step 16.4: Add IFCHierarchy + IfcParams to validator + parser pages**

In `pages/ids-ifc-validator.html`, add before validator.js:
```html
<script src="../assets/js/common/ifc-hierarchy.js"></script>
<script src="../assets/js/common/ifc-params.js"></script>
```

(Parser page doesn't validate, but for consistency add too.)

- [ ] **Step 16.5: Run all tests, verify pass**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: SUMMARY 295+/295+ tests passed (added ~25 new).

- [ ] **Step 16.6: Sync dist/ + commit**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
cp assets/js/common/validation-engine.js dist/assets/js/common/validation-engine.js
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
git add assets/js/validator.js assets/js/common/validation-engine.js pages/ids-ifc-validator.html dist/assets/js/validator.js dist/assets/js/common/validation-engine.js dist/pages/ids-ifc-validator.html
git commit -m "feat(validation): integrate subtype + predefinedType matching across validator"
```

---

### Task 17: End-to-end integration test (real IFC + IDS)

**Files:**
- Modify: `tests/test-suites/integration-real-files.test.js`

- [ ] **Step 17.1: Append e2e test**

Append to `tests/test-suites/integration-real-files.test.js`:
```js
describe('Integration: subtype matching against real IFC', () => {
    it('IDS with simpleValue IFCWALL should match IFCWALLSTANDARDCASE entities', async () => {
        await IFCHierarchy.load('IFC4');
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
        const ctx = {
            ifcVersion: 'IFC4',
            isSubtypeOf: (c, a) => IFCHierarchy.isSubtypeOf('IFC4', c, a)
        };
        // Synthetic entity to avoid loading multi-MB IFC
        const entity = { entity: 'IFCWALLSTANDARDCASE' };
        expect(ValidationEngine.checkEntityFacet(entity, facet, ctx)).toBe(true);
    });

    it('IDS with abstract IFCBUILTELEMENT should match all subtypes', async () => {
        await IFCHierarchy.load('IFC4');
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCBUILTELEMENT' } };
        const ctx = {
            ifcVersion: 'IFC4',
            isSubtypeOf: (c, a) => IFCHierarchy.isSubtypeOf('IFC4', c, a)
        };
        for (const cls of ['IFCWALL', 'IFCSLAB', 'IFCDOOR', 'IFCWINDOW', 'IFCBEAM']) {
            expect(ValidationEngine.checkEntityFacet({ entity: cls }, facet, ctx)).toBe(true);
        }
    });
});
```

- [ ] **Step 17.2: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "Integration: subtype"
```
Expected: 2 PASS

- [ ] **Step 17.3: Commit**

```bash
git add tests/test-suites/integration-real-files.test.js
git commit -m "test(integration): subtype matching e2e against real IFC class names"
```

**✅ Step 3 checkpoint:** Subtype + PredefinedType matching live across validator + ValidationEngine.

---

## Step 4: XSD Validation

### Task 18: Vendor xmllint-wasm + IDS schema

**Files:**
- Create: `assets/js/vendor/xmllint-wasm.js`
- Create: `assets/js/vendor/xmllint.wasm`
- Create: `assets/data/ids-1.0.xsd`

- [ ] **Step 18.1: Download IDS 1.0 XSD**

```bash
curl -fsSL https://standards.buildingsmart.org/IDS/1.0/ids.xsd -o assets/data/ids-1.0.xsd
wc -c assets/data/ids-1.0.xsd
```
Expected: ~13 KB.

- [ ] **Step 18.2: Download xmllint-wasm**

xmllint-wasm distributes as npm package; use the prebuilt browser bundle.

```bash
mkdir -p /tmp/xmllint-fetch
cd /tmp/xmllint-fetch
npm pack xmllint-wasm@4.0.2 --silent
tar xf xmllint-wasm-*.tgz
cp package/index.js /home/michal/work/BIM_checker/assets/js/vendor/xmllint-wasm.js
cp package/xmllint.wasm /home/michal/work/BIM_checker/assets/js/vendor/xmllint.wasm
cd /home/michal/work/BIM_checker
ls -la assets/js/vendor/xmllint*
```
Expected: `xmllint-wasm.js` ~5–10 KB, `xmllint.wasm` ~2 MB.

- [ ] **Step 18.3: Sync dist/ + commit**

```bash
mkdir -p dist/assets/js/vendor/ dist/assets/data/
cp assets/js/vendor/xmllint-wasm.js dist/assets/js/vendor/
cp assets/js/vendor/xmllint.wasm dist/assets/js/vendor/
cp assets/data/ids-1.0.xsd dist/assets/data/
git add assets/js/vendor/xmllint-wasm.js assets/js/vendor/xmllint.wasm assets/data/ids-1.0.xsd dist/assets/js/vendor/xmllint-wasm.js dist/assets/js/vendor/xmllint.wasm dist/assets/data/ids-1.0.xsd
git commit -m "vendor: add xmllint-wasm 4.0.2 + IDS 1.0 XSD schema"
```

---

### Task 19: IDSXSDValidator module

**Files:**
- Create: `assets/js/common/ids-xsd-validator.js`
- Create: `tests/test-suites/xsd-validator.test.js`
- Create: `tests/test-suites/xsd-validator-lazy.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 19.1: Write failing tests**

Create `tests/test-suites/xsd-validator.test.js`:
```js
describe('IDSXSDValidator', () => {
    const validIDS = `<?xml version="1.0"?>
        <ids xmlns="http://standards.buildingsmart.org/IDS"
             xmlns:xs="http://www.w3.org/2001/XMLSchema"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
            <info><title>Valid</title></info>
            <specifications>
                <specification name="S" ifcVersion="IFC4">
                    <applicability minOccurs="0" maxOccurs="unbounded">
                        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
                    </applicability>
                    <requirements/>
                </specification>
            </specifications>
        </ids>`;

    const invalidIDS = `<?xml version="1.0"?>
        <ids xmlns="http://standards.buildingsmart.org/IDS"
             xmlns:xs="http://www.w3.org/2001/XMLSchema"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <specifications>
                <specification fooAttr="bar" ifcVersion="IFC4">
                    <applicability minOccurs="0" maxOccurs="unbounded"/>
                    <requirements/>
                </specification>
            </specifications>
        </ids>`;

    it('should expose IDSXSDValidator global', () => {
        expect(typeof window.IDSXSDValidator).toBe('object');
        expect(typeof window.IDSXSDValidator.validate).toBe('function');
    });

    it('should report valid IDS as valid', async () => {
        const result = await IDSXSDValidator.validate(validIDS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('should report invalid IDS with error details', async () => {
        const result = await IDSXSDValidator.validate(invalidIDS);
        expect(result.valid).toBe(false);
        expect(result.errors.length > 0).toBe(true);
        expect(result.errors[0].message).toBeDefined();
    });

    it('should include line numbers in errors when available', async () => {
        const result = await IDSXSDValidator.validate(invalidIDS);
        const withLines = result.errors.filter(e => e.line !== null);
        expect(withLines.length > 0).toBe(true);
    });
});
```

Create `tests/test-suites/xsd-validator-lazy.test.js`:
```js
describe('IDSXSDValidator lazy init', () => {
    it('should not load WASM until validate is called', () => {
        // Module loaded but init not called: __initState should be null/undefined
        expect(IDSXSDValidator._isInitialized?.() ?? false).toBe(false);
    });

    it('should cache init across validate calls', async () => {
        await IDSXSDValidator.validate('<?xml version="1.0"?><ids xmlns="x"/>');
        const t0 = performance.now();
        await IDSXSDValidator.validate('<?xml version="1.0"?><ids xmlns="x"/>');
        const dt = performance.now() - t0;
        expect(dt < 500).toBe(true);
    });
});
```

- [ ] **Step 19.2: Add to test-runner.html**

```html
<script src="../assets/js/common/ids-xsd-validator.js"></script>
<!-- in suites: -->
<script src="test-suites/xsd-validator.test.js"></script>
<script src="test-suites/xsd-validator-lazy.test.js"></script>
```

- [ ] **Step 19.3: Run, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "XSD"
```
Expected: 6 FAILs

- [ ] **Step 19.4: Implement IDSXSDValidator**

Create `assets/js/common/ids-xsd-validator.js`:
```js
/**
 * IDSXSDValidator — lazy-loaded XSD validation against IDS 1.0 schema via xmllint-wasm.
 */
window.IDSXSDValidator = (function() {
    'use strict';
    let initPromise = null;
    let xmllintFn = null;
    let xsdText = null;
    let initialized = false;

    async function init() {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            const xsdResp = await fetch('../assets/data/ids-1.0.xsd');
            xsdText = await xsdResp.text();

            // xmllint-wasm exports a default function
            const mod = await import('../vendor/xmllint-wasm.js');
            xmllintFn = mod.default || mod.xmllint;
            initialized = true;
        })();
        return initPromise;
    }

    async function validate(xmlString) {
        await init();
        const out = await xmllintFn({
            xml:    [{ fileName: 'doc.ids',     contents: xmlString }],
            schema: [{ fileName: 'ids-1.0.xsd', contents: xsdText }]
        });
        const errors = (out.errors || []).map(parseErrorLine);
        return { valid: errors.length === 0, errors };
    }

    function parseErrorLine(raw) {
        const m = String(raw).match(/^[^:]+:(\d+):(\d+)?:\s*(\w+):\s*(.+)$/);
        return m
            ? { line: parseInt(m[1]), column: m[2] ? parseInt(m[2]) : null, severity: m[3], message: m[4].trim() }
            : { line: null, column: null, severity: 'error', message: String(raw) };
    }

    return { init, validate, _isInitialized: () => initialized };
})();
```

- [ ] **Step 19.5: Run, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "XSD"
```
Expected: 6 PASS

(If xmllint-wasm import path issues arise, the path may need to be adjusted to match the runtime working directory; verify by opening test-runner.html in browser dev tools and checking network tab.)

- [ ] **Step 19.6: Sync dist/ + commit**

```bash
cp assets/js/common/ids-xsd-validator.js dist/assets/js/common/ids-xsd-validator.js
git add assets/js/common/ids-xsd-validator.js dist/assets/js/common/ids-xsd-validator.js tests/test-suites/xsd-validator.test.js tests/test-suites/xsd-validator-lazy.test.js tests/test-runner.html
git commit -m "feat(xsd): IDSXSDValidator module wrapping xmllint-wasm"
```

---

### Task 20: XSD banner UI in IDS Parser & Visualizer

**Files:**
- Modify: `pages/ids-parser-visualizer.html`
- Modify: `assets/css/ids-parser.css`
- Modify: `assets/js/parser.js` (wire validation after load)
- Modify: `assets/js/common/translations.js` (new keys)

- [ ] **Step 20.1: Add banner HTML**

In `pages/ids-parser-visualizer.html`, find `<h2 ... data-i18n="parser.specifications">` (around line 111). After its parent header div, insert:
```html
<div id="xsdValidationBanner" class="xsd-banner" style="display:none">
    <div class="xsd-banner-summary">
        <span class="xsd-banner-icon">⚠️</span>
        <span class="xsd-banner-text" id="xsdBannerText"></span>
        <button type="button" class="xsd-banner-toggle" id="xsdBannerToggle"></button>
    </div>
    <ul class="xsd-banner-details" id="xsdBannerDetails" hidden></ul>
</div>
```

- [ ] **Step 20.2: Add CSS**

Append to `assets/css/ids-parser.css`:
```css
.xsd-banner {
    background: var(--warning-light, #fef3c7);
    border-left: 4px solid var(--warning, #f59e0b);
    border-radius: 4px;
    padding: 12px 16px;
    margin-bottom: 16px;
}
.xsd-banner-summary { display: flex; align-items: center; gap: 12px; }
.xsd-banner-toggle {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--warning-dark, #92400e);
    cursor: pointer;
    font-weight: 600;
}
.xsd-banner-details {
    margin-top: 8px;
    padding-left: 28px;
    font-size: 0.9em;
    list-style: disc;
}
.xsd-banner-details li { margin-bottom: 4px; }
.xsd-banner-details a {
    color: var(--warning-dark, #92400e);
    cursor: pointer;
    text-decoration: underline;
}
.xml-line-highlight {
    background: #fef08a;
    transition: background 3s ease-out;
}
.xsd-error-list { margin: 12px 0; padding-left: 24px; }
.xsd-error-list li { margin-bottom: 6px; line-height: 1.5; }
```

- [ ] **Step 20.3: Add i18n keys**

In `assets/js/common/translations.js`, in CZ block (after existing `parser.*` keys), add:
```js
        'xsd.banner.errors': 'Soubor má {n} chyb proti IDS 1.0 schématu',
        'xsd.banner.singleError': 'Soubor má 1 chybu proti IDS 1.0 schématu',
        'xsd.banner.toggleShow': 'Zobrazit detaily ▾',
        'xsd.banner.toggleHide': 'Skrýt detaily ▴',
        'xsd.banner.line': 'Řádek {n}:',
        'xsd.export.title': 'IDS má chyby proti schématu',
        'xsd.export.intro': 'Soubor obsahuje {n} chyb proti oficiálnímu IDS 1.0 schématu:',
        'xsd.export.warning': 'Můžeš pokračovat se stažením, ale soubor nebude validní podle IDS 1.0.',
        'xsd.export.cancel': 'Zrušit',
        'xsd.export.proceed': 'Stáhnout přesto',
        'xsd.validator.fileBadge': '{n} chyb v schématu',
        'xsd.validator.summaryBanner': '{badCount} z {totalCount} IDS souborů má chyby proti schématu',
```

In EN block (after existing `parser.*` keys), add:
```js
        'xsd.banner.errors': 'File has {n} errors against the IDS 1.0 schema',
        'xsd.banner.singleError': 'File has 1 error against the IDS 1.0 schema',
        'xsd.banner.toggleShow': 'Show details ▾',
        'xsd.banner.toggleHide': 'Hide details ▴',
        'xsd.banner.line': 'Line {n}:',
        'xsd.export.title': 'IDS has schema errors',
        'xsd.export.intro': 'File contains {n} errors against the official IDS 1.0 schema:',
        'xsd.export.warning': 'You can proceed with download, but the file will not be valid per IDS 1.0.',
        'xsd.export.cancel': 'Cancel',
        'xsd.export.proceed': 'Download anyway',
        'xsd.validator.fileBadge': '{n} schema errors',
        'xsd.validator.summaryBanner': '{badCount} of {totalCount} IDS files have schema errors',
```

- [ ] **Step 20.4: Wire validation into parser.js**

In `assets/js/parser.js`, find `function parseIDS(xmlString)`. After `currentIDSData = {...}` block and before `displayIDS()` call, add:
```js
    // Async XSD validation
    runXSDValidation(xmlString);
```

Add the helper function (top-level in parser.js):
```js
async function runXSDValidation(xmlString) {
    const banner = document.getElementById('xsdValidationBanner');
    if (!banner) return;
    banner.style.display = 'none';
    try {
        const result = await IDSXSDValidator.validate(xmlString);
        if (result.valid) return;
        showXSDBanner(result.errors);
    } catch (e) {
        console.warn('XSD validation skipped:', e);
    }
}

function showXSDBanner(errors) {
    const banner = document.getElementById('xsdValidationBanner');
    const text = document.getElementById('xsdBannerText');
    const toggle = document.getElementById('xsdBannerToggle');
    const details = document.getElementById('xsdBannerDetails');

    const n = errors.length;
    text.textContent = n === 1
        ? t('xsd.banner.singleError')
        : t('xsd.banner.errors').replace('{n}', n);
    toggle.textContent = t('xsd.banner.toggleShow');
    details.innerHTML = errors.map(err => {
        const lineLabel = err.line !== null
            ? `<a data-line="${err.line}">${t('xsd.banner.line').replace('{n}', err.line)}</a> `
            : '';
        return `<li>${lineLabel}${escapeHtml(err.message)}</li>`;
    }).join('');
    banner.style.display = 'block';

    toggle.onclick = () => {
        if (details.hasAttribute('hidden')) {
            details.removeAttribute('hidden');
            toggle.textContent = t('xsd.banner.toggleHide');
        } else {
            details.setAttribute('hidden', '');
            toggle.textContent = t('xsd.banner.toggleShow');
        }
    };

    // Click line link → switch to raw tab + scroll
    details.querySelectorAll('a[data-line]').forEach(a => {
        a.addEventListener('click', () => {
            const line = a.getAttribute('data-line');
            switchTab('raw');
            requestAnimationFrame(() => {
                const target = document.getElementById(`xml-line-${line}`);
                if (target) {
                    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    target.classList.add('xml-line-highlight');
                    setTimeout(() => target.classList.remove('xml-line-highlight'), 3000);
                }
            });
        });
    });
}
```

- [ ] **Step 20.5: Wrap raw XML lines for line targeting**

In `assets/js/parser.js`, find `displayRawXML` function. Replace:
```js
function displayRawXML() {
    const rawXML = document.getElementById('rawXML');
    rawXML.textContent = formatXML(currentIDSData.xml);
}
```
With:
```js
function displayRawXML() {
    const rawXML = document.getElementById('rawXML');
    const formatted = formatXML(currentIDSData.xml);
    const lines = formatted.split('\n');
    rawXML.innerHTML = lines.map((line, idx) =>
        `<span id="xml-line-${idx + 1}">${escapeHtml(line)}</span>`
    ).join('\n');
}
```

- [ ] **Step 20.6: Add IDSXSDValidator script to page**

In `pages/ids-parser-visualizer.html`, before `<script src="../assets/js/parser.js"></script>`:
```html
<script src="../assets/js/common/ids-xsd-validator.js"></script>
```

- [ ] **Step 20.7: Manual smoke test**

```bash
python3 -m http.server 8765 >/dev/null 2>&1 &
sleep 1
echo "Open http://localhost:8765/pages/ids-parser-visualizer.html"
echo "Upload /tmp/test_ifc4x3.ids → should show NO banner (valid)"
echo "Upload an intentionally invalid file → should show banner with errors"
```

After verification:
```bash
kill %1 2>/dev/null
```

- [ ] **Step 20.8: Sync dist/ + commit**

```bash
cp assets/js/parser.js dist/assets/js/parser.js
cp assets/css/ids-parser.css dist/assets/css/ids-parser.css
cp assets/js/common/translations.js dist/assets/js/common/translations.js
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
git add assets/js/parser.js assets/css/ids-parser.css assets/js/common/translations.js pages/ids-parser-visualizer.html dist/assets/js/parser.js dist/assets/css/ids-parser.css dist/assets/js/common/translations.js dist/pages/ids-parser-visualizer.html
git commit -m "feat(parser): XSD validation banner with line jump on import"
```

---

### Task 21: XSD export modal in IDS Parser & Visualizer

**Files:**
- Modify: `pages/ids-parser-visualizer.html` (add modal)
- Modify: `assets/js/parser.js` (gate downloads through validation)

- [ ] **Step 21.1: Add modal HTML to ids-parser-visualizer.html**

Before `</body>`, add:
```html
<div id="xsdExportModal" class="modal-overlay" style="display:none">
    <div class="modal-container">
        <div class="modal-header">
            <h2 id="xsdExportTitle"></h2>
            <button type="button" class="modal-close" id="xsdExportClose">&times;</button>
        </div>
        <div class="modal-body">
            <p id="xsdExportIntro"></p>
            <ul class="xsd-error-list" id="xsdExportErrors"></ul>
            <p id="xsdExportWarning" style="margin-top: 1rem; color: var(--text-secondary);"></p>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="xsdExportCancel"></button>
            <button type="button" class="btn btn-primary" id="xsdExportProceed"></button>
        </div>
    </div>
</div>
```

- [ ] **Step 21.2: Wire export modal in parser.js**

In `assets/js/parser.js`, find the download handler for IDS (look for `downloadIdsBtn` or `downloadIDS`). Wrap the actual download logic in this validation gate:
```js
async function attemptDownloadIDS(xmlString, filename) {
    try {
        const result = await IDSXSDValidator.validate(xmlString);
        if (result.valid) {
            performDownload(xmlString, filename);
            return;
        }
        const proceed = await showXSDExportModal(result.errors);
        if (proceed) performDownload(xmlString, filename);
    } catch (e) {
        console.warn('XSD validation failed, proceeding with download:', e);
        performDownload(xmlString, filename);
    }
}

function showXSDExportModal(errors) {
    return new Promise((resolve) => {
        document.getElementById('xsdExportTitle').textContent = t('xsd.export.title');
        document.getElementById('xsdExportIntro').textContent = t('xsd.export.intro').replace('{n}', errors.length);
        document.getElementById('xsdExportErrors').innerHTML = errors.map(e =>
            `<li><strong>${e.line ? t('xsd.banner.line').replace('{n}', e.line) + ' ' : ''}</strong>${escapeHtml(e.message)}</li>`
        ).join('');
        document.getElementById('xsdExportWarning').textContent = t('xsd.export.warning');
        document.getElementById('xsdExportCancel').textContent = t('xsd.export.cancel');
        document.getElementById('xsdExportProceed').textContent = t('xsd.export.proceed');

        const modal = document.getElementById('xsdExportModal');
        modal.style.display = 'flex';

        const cleanup = (proceed) => {
            modal.style.display = 'none';
            resolve(proceed);
        };
        document.getElementById('xsdExportCancel').onclick = () => cleanup(false);
        document.getElementById('xsdExportClose').onclick = () => cleanup(false);
        document.getElementById('xsdExportProceed').onclick = () => cleanup(true);
    });
}

function performDownload(xmlString, filename) {
    const blob = new Blob([xmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
```

Replace existing direct download call sites with `attemptDownloadIDS(xmlString, filename)`.

- [ ] **Step 21.3: Manual smoke test**

```bash
python3 -m http.server 8765 >/dev/null 2>&1 &
sleep 1
echo "Open http://localhost:8765/pages/ids-parser-visualizer.html"
echo "Load valid IDS → click Stáhnout → downloads immediately"
echo "Load invalid IDS → click Stáhnout → modal appears with override"
kill %1 2>/dev/null
```

- [ ] **Step 21.4: Sync dist/ + commit**

```bash
cp assets/js/parser.js dist/assets/js/parser.js
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
git add assets/js/parser.js pages/ids-parser-visualizer.html dist/assets/js/parser.js dist/pages/ids-parser-visualizer.html
git commit -m "feat(parser): XSD export modal with override on invalid IDS"
```

---

### Task 22: XSD banner + per-file indicator in IDS-IFC Validator

**Files:**
- Modify: `pages/ids-ifc-validator.html`
- Modify: `assets/js/validator.js`
- Modify: `assets/css/ids-validator.css`

- [ ] **Step 22.1: Add summary banner HTML**

In `pages/ids-ifc-validator.html`, find `<div id="validationGroups">` (around line 105). Before it, add:
```html
<div id="xsdSummaryBanner" class="xsd-banner" style="display:none">
    <div class="xsd-banner-summary">
        <span class="xsd-banner-icon">⚠️</span>
        <span class="xsd-banner-text" id="xsdSummaryText"></span>
    </div>
</div>
```

- [ ] **Step 22.2: Append CSS to ids-validator.css**

Append to `assets/css/ids-validator.css`:
```css
.xsd-banner {
    background: var(--warning-light, #fef3c7);
    border-left: 4px solid var(--warning, #f59e0b);
    border-radius: 4px;
    padding: 12px 16px;
    margin: 16px 0;
}
.xsd-banner-summary { display: flex; align-items: center; gap: 12px; }
.xsd-file-badge {
    background: var(--warning, #f59e0b);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75em;
    margin-left: 8px;
}
.xsd-file-detail { display: inline; }
.xsd-file-detail-toggle {
    background: none;
    border: none;
    color: var(--warning-dark, #92400e);
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.85em;
}
.xsd-file-detail-list {
    margin: 8px 0;
    padding-left: 24px;
    font-size: 0.85em;
    list-style: disc;
}
```

- [ ] **Step 22.3: Wire validation into validator.js IDS file load**

In `assets/js/validator.js`, find where IDS files are added to a group (look for `parseIDS(...)` calls in upload handlers or storage picker). Add per-file XSD validation:
```js
async function validateIDSFileXSD(idsFile) {
    try {
        const result = await IDSXSDValidator.validate(idsFile.content);
        idsFile.xsdResult = result;
    } catch (e) {
        console.warn('XSD validation failed:', e);
        idsFile.xsdResult = null;
    }
}
```

Call after parseIDS succeeds. Then in the function that renders validation groups, if a file has `xsdResult && !xsdResult.valid`, append:
```js
const errCount = idsFile.xsdResult.errors.length;
const badge = `<span class="xsd-file-badge">${t('xsd.validator.fileBadge').replace('{n}', errCount)}</span>`;
const detailToggle = `<button class="xsd-file-detail-toggle" data-file="${escapeHtml(idsFile.fileName)}">[${t('xsd.banner.toggleShow')}]</button>`;
const detailList = `<ul class="xsd-file-detail-list" data-file-list="${escapeHtml(idsFile.fileName)}" hidden>${
    idsFile.xsdResult.errors.map(e => `<li><strong>${e.line ? `Řádek ${e.line}:` : ''}</strong> ${escapeHtml(e.message)}</li>`).join('')
}</ul>`;
// Append badge + toggle + detailList next to the file name
```

Toggle handler:
```js
document.querySelectorAll('.xsd-file-detail-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        const file = btn.getAttribute('data-file');
        const list = document.querySelector(`[data-file-list="${file}"]`);
        if (list.hasAttribute('hidden')) list.removeAttribute('hidden');
        else list.setAttribute('hidden', '');
    });
});
```

- [ ] **Step 22.4: Update summary banner**

After all IDS files are loaded, count those with errors:
```js
function updateXSDSummaryBanner() {
    const allFiles = idsFiles; // global
    const bad = allFiles.filter(f => f.xsdResult && !f.xsdResult.valid).length;
    const total = allFiles.length;
    const banner = document.getElementById('xsdSummaryBanner');
    const text = document.getElementById('xsdSummaryText');
    if (bad === 0) {
        banner.style.display = 'none';
    } else {
        text.textContent = t('xsd.validator.summaryBanner')
            .replace('{badCount}', bad)
            .replace('{totalCount}', total);
        banner.style.display = 'block';
    }
}
```

Call after each IDS upload finishes.

- [ ] **Step 22.5: Add IDSXSDValidator script to page**

In `pages/ids-ifc-validator.html`, before `validator.js`:
```html
<script src="../assets/js/common/ids-xsd-validator.js"></script>
```

- [ ] **Step 22.6: Manual smoke test**

Same as before — load multiple IDS files including invalid ones, verify banner + per-file badges appear.

- [ ] **Step 22.7: Sync dist/ + commit**

```bash
cp assets/js/validator.js dist/assets/js/validator.js
cp assets/css/ids-validator.css dist/assets/css/ids-validator.css
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
git add assets/js/validator.js assets/css/ids-validator.css pages/ids-ifc-validator.html dist/assets/js/validator.js dist/assets/css/ids-validator.css dist/pages/ids-ifc-validator.html
git commit -m "feat(validator): XSD per-file indicator + summary banner"
```

---

### Task 23: PWA service worker precache

**Files:**
- Modify: `sw.js`

- [ ] **Step 23.1: Update precache list**

In `sw.js`, find the array of precached URLs. Add:
```js
'/assets/js/vendor/xmllint-wasm.js',
'/assets/js/vendor/xmllint.wasm',
'/assets/data/ids-1.0.xsd',
'/assets/data/ifc-hierarchy-IFC2X3.json',
'/assets/data/ifc-hierarchy-IFC4.json',
'/assets/data/ifc-hierarchy-IFC4X3.json',
'/assets/js/common/ids-parser.js',
'/assets/js/common/ifc-hierarchy.js',
'/assets/js/common/ifc-params.js',
'/assets/js/common/ids-xsd-validator.js',
```

Bump cache version (e.g., `'v0.1.3'` → `'v0.1.4'`) so old caches are invalidated.

- [ ] **Step 23.2: Sync dist/ + commit**

```bash
cp sw.js dist/sw.js
git add sw.js dist/sw.js
git commit -m "chore(pwa): add Phase 1 assets to precache + bump cache version"
```

**✅ Step 4 checkpoint:** XSD validation live on import + export, fully offline-capable.

---

## Step 5: i18n Polish + Documentation

### Task 24: Manual smoke test all flows

**Files:** none (validation only)

- [ ] **Step 24.1: Start local server**

```bash
python3 -m http.server 8765 >/dev/null 2>&1 &
sleep 1
```

- [ ] **Step 24.2: Verify checklist**

Open `http://localhost:8765/index.html`. Test in CZ then EN (use language toggle):

1. **IDS Parser & Visualizer**
   - [ ] Load `Kontrola_datoveho_standardu_IFC4X3_ADD2.ids` → no XSD banner (valid)
   - [ ] Load `/tmp/invalid.ids` (deliberately broken) → banner appears with errors
   - [ ] Click "Show details" → list expands
   - [ ] Click line number link → switches to Raw XML tab + highlights line
   - [ ] Click "💾 Stáhnout IDS" on valid → downloads immediately
   - [ ] Click "💾 Stáhnout IDS" on invalid → export modal appears with override
   - [ ] Editor: load IDS, edit spec cardinality (REQ/OPT/PROH), save → re-parse and verify XML reflects choice

2. **IDS-IFC Validator**
   - [ ] Add validation group with one IDS + one IFC
   - [ ] Verify per-file XSD badge if invalid
   - [ ] Run validation → IFCBUILDINGELEMENTPROXY entities matched correctly
   - [ ] Use a synthetic IDS with `<simpleValue>IFCWALL</simpleValue>` (no enum) and verify it matches IFCWALLSTANDARDCASE entities in the IFC
   - [ ] Export XLSX → file downloads correctly

3. **PWA offline test**
   - [ ] Load page with network → service worker caches
   - [ ] DevTools → Network → Offline checkbox
   - [ ] Reload, verify everything still works (XSD validation, hierarchy lookups)

- [ ] **Step 24.3: Stop server**

```bash
kill %1 2>/dev/null
```

---

### Task 25: Update PLAN.md and CHANGELOG

**Files:**
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 25.1: Mark items complete in PLAN.md**

Move from "TODO Vysoká priorita" to "Hotové → IDS validace correctness":
```markdown
### IDS validace correctness (Phase 1)
- [x] Sjednocení dvou paralelních IDS parserů do `common/ids-parser.js`
- [x] Subtype matching v applicability (IFC class hierarchy přes JSON)
- [x] PredefinedType matching včetně USERDEFINED + ObjectType fallback
- [x] XSD validace proti IDS 1.0 schématu (xmllint-wasm)
  - Banner při importu, modal před exportem, plně offline (PWA)
```

Remove the corresponding entry from "Vysoká priorita".

- [ ] **Step 25.2: Add CHANGELOG entry**

In `CHANGELOG.md`, add at top:
```markdown
## [0.2.0] — 2026-05-08

### Added
- Unified IDS parser (`common/ids-parser.js`) — single source of truth shared by Parser/Visualizer and Validator pages.
- Full IFC class hierarchy support: applicability with `IFCWALL` now correctly matches subtypes (`IFCWALLSTANDARDCASE`, etc.).
- `PredefinedType` matching in entity facets, including `USERDEFINED` → `ObjectType` fallback.
- XSD validation against official IDS 1.0 schema using xmllint-wasm. Banner on import, modal on export, fully offline (PWA-cached).
- Generated IFC class hierarchy data for IFC2X3 / IFC4 / IFC4X3 (`assets/data/ifc-hierarchy-*.json`).

### Fixed
- Validator could no longer silently treat unrecognized entity facet shapes as "match all" (now defaults to "no match").

### Internal
- ~30 new test cases.
- `validator.js` shed ~276 lines of duplicate parser code.
```

- [ ] **Step 25.3: Commit**

```bash
git add PLAN.md CHANGELOG.md
git commit -m "docs: mark Phase 1 (IDS validation correctness + XSD) complete"
```

---

### Task 26: Final test run + push

**Files:** none

- [ ] **Step 26.1: Run full test suite**

```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: All ~310 tests pass.

- [ ] **Step 26.2: Verify dist/ in sync**

```bash
for f in $(git ls-files | grep -E '^assets/'); do
    dist_f="dist/${f#assets/}"
    if [ -f "$dist_f" ] && ! cmp -s "$f" "$dist_f"; then
        echo "MISMATCH: $f vs $dist_f"
    fi
done
```
Expected: no MISMATCH output.

- [ ] **Step 26.3: Push**

```bash
git push origin master
```

**✅ Phase 1 done.** Ready for user verification + roll into Phase 2.

---

## Self-Review

### Spec coverage
- ✅ B (parser unification): Tasks 1–9
- ✅ A (subtype matching): Tasks 12, 14, 17
- ✅ C (predefinedType): Task 15
- ✅ 1 (XSD validation): Tasks 18–23
- ✅ Backward compat snapshot test: Task 7
- ✅ End-to-end real-files integration: Task 17
- ✅ i18n + polish: Tasks 24–26

### Type/name consistency
- `IDSParser` namespace used consistently across all tasks
- `IFCHierarchy.load(version)` / `isSubtypeOf(version, c, a)` / `getPredefinedTypeIndex(version, cls)` consistent
- `IfcParams.splitIfcParams` / `unwrapEnumValue` / `unwrapString` consistent
- `IDSXSDValidator.init` / `validate` consistent
- `ctx` object with same fields used in all checkEntityFacet/checkPredefinedType call sites

### Placeholder scan
None — every task has actual code where code is needed.

### Scope check
26 tasks, ~85 steps. Sized for ~5–7 days of subagent execution with checkpoints between each step. Each task is testable independently. Single plan is appropriate — phases are tightly coupled (validation depends on hierarchy, hierarchy depends on parser unification for ifcVersion routing).
