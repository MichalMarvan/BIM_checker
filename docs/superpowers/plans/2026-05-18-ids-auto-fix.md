# IDS Auto-Fix on Load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After loading an IDS file that fails XSD validation, present the user with a modal listing each error and a one-click fix; apply selected fixes and re-validate. Also normalize the bundled sample IDS so it ships XSD-valid.

**Architecture:** Two new modules (`IDSAutoFix` for pure-function analysis/application, `IDSAutoFixModal` for the picker UI) plug into the existing `runXSDValidation` call site in `assets/js/parser.js`. The classifier matches xmllint-wasm error messages against a hand-curated catalogue (7 categories at launch). Each `FixDescriptor` carries a closure that mutates the parsed `XMLDocument` in place; after the user accepts, the serialised XML is re-fed through `parseIDS` with a one-shot re-entry guard.

**Tech Stack:** Vanilla JS (no build, no modules), DOMParser/XMLSerializer, custom Jasmine-like test framework run via Puppeteer (`node tests/run-tests.js`), xmllint-wasm 4.0.2 for XSD validation.

**Spec:** `docs/superpowers/specs/2026-05-18-ids-auto-fix-design.md`

---

## File map

**New:**
- `assets/js/ids/ids-auto-fix.js` — pure functions (`window.IDSAutoFix.analyze`, `applyFixes`)
- `assets/js/ids/ids-auto-fix-modal.js` — modal controller (`window.IDSAutoFixModal.show`)
- `tests/test-suites/ids-auto-fix.test.js` — unit tests for the pure functions

**Modified:**
- `assets/js/parser.js` — extend `runXSDValidation` (lines 91–103); fix `loadSampleIDS` author (line 705 area)
- `assets/js/common/translations.js` — add `editor.autoFix.*` keys to the cs block (~line 246) and en block (~line 1451)
- `assets/css/ids-parser.css` — modal-specific styles
- `pages/ids-parser-visualizer.html` — `<script>` tags for the two new modules (after line 340), modal HTML (after line 282)
- `tests/test-runner.html` — `<script>` tag for the new test (after line 463)
- `sw.js` — `CACHE_VERSION` v58 → v59 (line 3)

**Mirrors:** every modified `assets/` file is also copied into `dist/` at the final ship step.

**Untouched:** `index.html`, `ids-editor-core.js`, `ids-xml-generator.js`, `ids-parser.js`, `ids-xsd-validator.js`.

---

## Phase A — Module scaffolding

### Task A1: Create `IDSAutoFix` skeleton

**Files:**
- Create: `assets/js/ids/ids-auto-fix.js`
- Modify: `pages/ids-parser-visualizer.html`

- [ ] **Step 1:** Create `assets/js/ids/ids-auto-fix.js` with this content:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDSAutoFix — analyses xmllint-wasm errors against the IDS 1.0 XSD and
 * produces fixable descriptors that mutate the XMLDocument in place.
 *
 * Pure functions; no DOM dependencies outside the supplied XMLDocument.
 */
window.IDSAutoFix = (function () {
    'use strict';

    // Catalogue entries are pushed by feature tasks below.
    // Each entry: { id, test(err, xmlDoc), build(err, xmlDoc) → FixDescriptor }
    const classifiers = [];

    function analyze(xmlDoc, xmllintErrors) {
        if (!xmlDoc || !Array.isArray(xmllintErrors)) return [];
        const descriptors = [];
        xmllintErrors.forEach((err, idx) => {
            for (const c of classifiers) {
                if (c.test(err, xmlDoc)) {
                    const d = c.build(err, xmlDoc);
                    if (d) {
                        descriptors.push(d);
                        return;
                    }
                }
            }
            descriptors.push({
                id: 'unknown-' + idx,
                category: 'unknown',
                label: err.message || err.rawMessage || 'XSD error',
                before: null,
                after: null,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: false,
                apply: null
            });
        });
        return descriptors;
    }

    function applyFixes(xmlDoc, fixIds, descriptors) {
        if (!xmlDoc || !Array.isArray(fixIds) || !Array.isArray(descriptors)) {
            return new XMLSerializer().serializeToString(xmlDoc);
        }
        const wanted = new Set(fixIds);
        for (const d of descriptors) {
            if (!wanted.has(d.id) || !d.fixable || typeof d.apply !== 'function') continue;
            try { d.apply(xmlDoc); } catch (e) { console.warn('IDSAutoFix apply failed:', d.id, e); }
        }
        return new XMLSerializer().serializeToString(xmlDoc);
    }

    return { analyze, applyFixes, _classifiers: classifiers };
})();
```

- [ ] **Step 2:** Add the script tag in `pages/ids-parser-visualizer.html` immediately after the line `<script src="../assets/js/ids/ids-xml-generator.js"></script>` (around line 329):

```html
    <script src="../assets/js/ids/ids-auto-fix.js"></script>
```

- [ ] **Step 3:** Verify the file is syntactically valid (a real load test happens in Task A2 via the test runner):

```bash
node --check assets/js/ids/ids-auto-fix.js
```

Expected: no output, exit code 0.

- [ ] **Step 4:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js pages/ids-parser-visualizer.html
git commit -m "feat(ids): IDSAutoFix module skeleton + page wiring"
```

---

### Task A2: Test scaffolding

**Files:**
- Create: `tests/test-suites/ids-auto-fix.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1:** Create `tests/test-suites/ids-auto-fix.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

function makeDoc(xml) {
    return new DOMParser().parseFromString(xml, 'text/xml');
}

function makeErr(message, lineNumber) {
    return { rawMessage: message, message, loc: lineNumber ? { fileName: 'in.ids', lineNumber } : null };
}

describe('IDSAutoFix module surface', () => {
    it('exposes analyze and applyFixes on window', () => {
        expect(typeof window.IDSAutoFix).toBe('object');
        expect(typeof window.IDSAutoFix.analyze).toBe('function');
        expect(typeof window.IDSAutoFix.applyFixes).toBe('function');
    });

    it('returns empty array when no errors', () => {
        const doc = makeDoc('<ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>t</title></info></ids>');
        expect(IDSAutoFix.analyze(doc, []).length).toBe(0);
    });

    it('emits an unfixable descriptor for unknown error messages', () => {
        const doc = makeDoc('<ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>t</title></info></ids>');
        const descriptors = IDSAutoFix.analyze(doc, [makeErr('Some unrelated XSD problem', 1)]);
        expect(descriptors.length).toBe(1);
        expect(descriptors[0].fixable).toBe(false);
        expect(descriptors[0].lineNumber).toBe(1);
    });
});
```

- [ ] **Step 2:** Register the new test file in `tests/test-runner.html`. After the line `<script src="test-suites/ids-xml-generator.test.js"></script>` (around line 463), insert:

```html
    <script src="../assets/js/ids/ids-auto-fix.js"></script>
    <script src="test-suites/ids-auto-fix.test.js"></script>
```

(The auto-fix module needs to load before its tests; load order matches the existing pattern for `compression.test.js`.)

- [ ] **Step 3:** Run the test suite, expect the new tests to pass:

```bash
node tests/run-tests.js
```

Expected: existing tests pass; the three new "IDSAutoFix module surface" tests pass.

- [ ] **Step 4:** Commit.

```bash
git add tests/test-suites/ids-auto-fix.test.js tests/test-runner.html
git commit -m "test(ids-auto-fix): module surface + unknown-error fallback"
```

---

## Phase B — Fix catalogue (one task per category, TDD)

Each task follows the same shape: write a failing test that pre-registers a classifier and asserts the descriptor it produces / the result of applying it, run the test (red), implement the classifier by pushing into `IDSAutoFix._classifiers`, run again (green), commit.

### Task B1: `author-not-email`

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`
- Modify: `assets/js/ids/ids-auto-fix.js`

- [ ] **Step 1:** Append to `tests/test-suites/ids-auto-fix.test.js`:

```js
describe('IDSAutoFix: author-not-email', () => {
    const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS">
        <info><title>t</title><author>Michal Marvan</author></info></ids>`;

    it('classifies an author pattern violation as fixable', () => {
        const doc = makeDoc(xml);
        const errs = [makeErr(
            "Element '{http://standards.buildingsmart.org/IDS}author': [facet 'pattern'] The value 'Michal Marvan' is not accepted by the pattern '[^@]+@[^\\.]+\\..+'.",
            2
        )];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds.length).toBe(1);
        expect(ds[0].fixable).toBe(true);
        expect(ds[0].category).toBe('author-not-email');
        expect(ds[0].before).toBe('Michal Marvan');
        expect(ds[0].after).toBe('noreply@example.com');
    });

    it('applyFixes replaces the author text node', () => {
        const doc = makeDoc(xml);
        const errs = [makeErr("Element 'author': [facet 'pattern']", 2)];
        const ds = IDSAutoFix.analyze(doc, errs);
        IDSAutoFix.applyFixes(doc, [ds[0].id], ds);
        expect(doc.querySelector('author').textContent).toBe('noreply@example.com');
    });
});
```

- [ ] **Step 2:** Run tests; expect both new tests to FAIL (no classifier yet).

```bash
node tests/run-tests.js
```

- [ ] **Step 3:** In `assets/js/ids/ids-auto-fix.js`, push a classifier into `classifiers` just before the closing `return { analyze, ... }`:

```js
    classifiers.push({
        id: 'author-not-email',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes('author') && msg.includes('pattern');
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('author');
            if (!node) return null;
            const before = node.textContent;
            const after = 'noreply@example.com';
            if (before === after) return null;
            return {
                id: 'author-not-email-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'author-not-email',
                label: 'editor.autoFix.fix.authorNotEmail',
                before,
                after,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    const n = doc.querySelector('author');
                    if (n) n.textContent = after;
                }
            };
        }
    });
```

- [ ] **Step 4:** Run tests; expect the two new tests to PASS and all existing tests to still pass.

```bash
node tests/run-tests.js
```

- [ ] **Step 5:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js tests/test-suites/ids-auto-fix.test.js
git commit -m "feat(ids-auto-fix): classifier — author not email"
```

---

### Task B2: `date-bad-format`

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`, `assets/js/ids/ids-auto-fix.js`

- [ ] **Step 1:** Append to the test file:

```js
describe('IDSAutoFix: date-bad-format', () => {
    const xml = (date) => `<ids xmlns="http://standards.buildingsmart.org/IDS">
        <info><title>t</title><date>${date}</date></info></ids>`;

    it('reformats D.M.YYYY → YYYY-MM-DD', () => {
        const doc = makeDoc(xml('1.1.2024'));
        const errs = [makeErr("Element 'date': '1.1.2024' is not a valid value of the atomic type 'xs:date'.", 2)];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].fixable).toBe(true);
        expect(ds[0].after).toBe('2024-01-01');
        IDSAutoFix.applyFixes(doc, [ds[0].id], ds);
        expect(doc.querySelector('date').textContent).toBe('2024-01-01');
    });

    it('reformats D/M/YYYY → YYYY-MM-DD', () => {
        const doc = makeDoc(xml('15/3/2024'));
        const errs = [makeErr("Element 'date': '15/3/2024' is not a valid value of the atomic type 'xs:date'.", 2)];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].after).toBe('2024-03-15');
    });

    it('marks unparseable date as not fixable', () => {
        const doc = makeDoc(xml('abc'));
        const errs = [makeErr("Element 'date': 'abc' is not a valid value of the atomic type 'xs:date'.", 2)];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].fixable).toBe(false);
    });
});
```

- [ ] **Step 2:** Run tests; expect all three new tests to FAIL.

```bash
node tests/run-tests.js
```

- [ ] **Step 3:** In `assets/js/ids/ids-auto-fix.js`, add a helper above the `classifiers.push(...)` for author and another classifier:

```js
    function reformatDate(s) {
        if (typeof s !== 'string') return null;
        const trimmed = s.trim();
        let m;
        m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);          // D.M.YYYY
        if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
        m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);          // D/M/YYYY
        if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
        m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);          // YYYY/M/D
        if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
        return null;
    }

    classifiers.push({
        id: 'date-bad-format',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes("'date'") && msg.includes('xs:date');
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('date');
            if (!node) return null;
            const before = node.textContent;
            const after = reformatDate(before);
            return {
                id: 'date-bad-format-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'date-bad-format',
                label: 'editor.autoFix.fix.dateBadFormat',
                before,
                after,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: !!after,
                apply(doc) {
                    if (!after) return;
                    const n = doc.querySelector('date');
                    if (n) n.textContent = after;
                }
            };
        }
    });
```

- [ ] **Step 4:** Run tests; expect all new tests to PASS, existing to remain green.

```bash
node tests/run-tests.js
```

- [ ] **Step 5:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js tests/test-suites/ids-auto-fix.test.js
git commit -m "feat(ids-auto-fix): classifier — date bad format"
```

---

### Task B3: `cardinality-on-entity`

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`, `assets/js/ids/ids-auto-fix.js`

- [ ] **Step 1:** Append to the test file:

```js
describe('IDSAutoFix: cardinality-on-entity', () => {
    const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS">
        <info><title>t</title></info>
        <specifications>
            <specification name="s" ifcVersion="IFC4">
                <applicability>
                    <entity cardinality="required"><name><simpleValue>IfcWall</simpleValue></name></entity>
                </applicability>
                <requirements/>
            </specification>
        </specifications></ids>`;

    it('classifies and removes the cardinality attribute', () => {
        const doc = makeDoc(xml);
        const errs = [makeErr("Element 'entity', attribute 'cardinality': The attribute 'cardinality' is not allowed.", 5)];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].fixable).toBe(true);
        expect(ds[0].category).toBe('cardinality-on-entity');
        IDSAutoFix.applyFixes(doc, [ds[0].id], ds);
        expect(doc.querySelector('entity').hasAttribute('cardinality')).toBe(false);
    });
});
```

- [ ] **Step 2:** Run tests; expect FAIL.

- [ ] **Step 3:** Append to `assets/js/ids/ids-auto-fix.js`:

```js
    classifiers.push({
        id: 'cardinality-on-entity',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes("'entity'") && msg.includes('cardinality');
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('entity[cardinality]');
            if (!node) return null;
            return {
                id: 'cardinality-on-entity-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'cardinality-on-entity',
                label: 'editor.autoFix.fix.cardinalityOnEntity',
                before: 'cardinality="' + node.getAttribute('cardinality') + '"',
                after: '(removed)',
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    doc.querySelectorAll('entity[cardinality]').forEach(n => n.removeAttribute('cardinality'));
                }
            };
        }
    });
```

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js tests/test-suites/ids-auto-fix.test.js
git commit -m "feat(ids-auto-fix): classifier — cardinality on entity"
```

---

### Task B4: `cardinality-on-applicability`

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`, `assets/js/ids/ids-auto-fix.js`

- [ ] **Step 1:** Append to the test file:

```js
describe('IDSAutoFix: cardinality-on-applicability', () => {
    const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS">
        <info><title>t</title></info>
        <specifications>
            <specification name="s" ifcVersion="IFC4">
                <applicability>
                    <entity><name><simpleValue>IfcWall</simpleValue></name></entity>
                    <property cardinality="optional">
                        <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
                        <baseName><simpleValue>LoadBearing</simpleValue></baseName>
                    </property>
                </applicability>
                <requirements/>
            </specification>
        </specifications></ids>`;

    it('removes cardinality on applicability child facet', () => {
        const doc = makeDoc(xml);
        const errs = [makeErr("Element 'property', attribute 'cardinality': The attribute 'cardinality' is not allowed.", 7)];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].fixable).toBe(true);
        expect(ds[0].category).toBe('cardinality-on-applicability');
        IDSAutoFix.applyFixes(doc, [ds[0].id], ds);
        const prop = doc.querySelector('applicability > property');
        expect(prop.hasAttribute('cardinality')).toBe(false);
    });

    it('does NOT remove cardinality on requirements facets', () => {
        const reqXml = xml.replace('<applicability>', '<applicability><x_skip/></applicability><requirements_orig>')
            .replace('<requirements/>', '</requirements_orig>'); // sanity guard — keep this test simple
        // Use a fresh fixture instead:
        const xml2 = `<ids xmlns="http://standards.buildingsmart.org/IDS">
            <info><title>t</title></info>
            <specifications>
                <specification name="s" ifcVersion="IFC4">
                    <applicability><entity><name><simpleValue>IfcWall</simpleValue></name></entity></applicability>
                    <requirements>
                        <property cardinality="required">
                            <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
                            <baseName><simpleValue>FireRating</simpleValue></baseName>
                        </property>
                    </requirements>
                </specification>
            </specifications></ids>`;
        const doc = makeDoc(xml2);
        // No error fired by xmllint for this case; the apply must not touch <requirements> children.
        const ds = [{
            id: 'cardinality-on-applicability-x',
            category: 'cardinality-on-applicability',
            fixable: true,
            apply(d) {
                d.querySelectorAll('applicability > [cardinality]').forEach(n => n.removeAttribute('cardinality'));
            }
        }];
        IDSAutoFix.applyFixes(doc, ['cardinality-on-applicability-x'], ds);
        expect(doc.querySelector('requirements > property').getAttribute('cardinality')).toBe('required');
    });
});
```

- [ ] **Step 2:** Run tests. Expected: the first new test FAILS (no classifier yet); the second new test PASSES (it provides its own ad-hoc `apply` and only checks the CSS selector behaviour, so it does not depend on the classifier).

```bash
node tests/run-tests.js
```

- [ ] **Step 3:** Append to `assets/js/ids/ids-auto-fix.js`:

```js
    const APPLICABILITY_FACETS = ['entity','partOf','classification','attribute','property','material'];

    classifiers.push({
        id: 'cardinality-on-applicability',
        test(err, xmlDoc) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            if (!msg.includes('cardinality') || !msg.includes('not allowed')) return false;
            if (msg.includes("'entity'")) return false; // handled by cardinality-on-entity
            // Confirm the offending element lives inside <applicability>.
            const found = xmlDoc.querySelector('applicability > [cardinality]');
            return !!found;
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('applicability > [cardinality]');
            if (!node) return null;
            return {
                id: 'cardinality-on-applicability-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'cardinality-on-applicability',
                label: 'editor.autoFix.fix.cardinalityOnApplicability',
                before: `<${node.tagName} cardinality="${node.getAttribute('cardinality')}">`,
                after: `<${node.tagName}>`,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    doc.querySelectorAll('applicability > [cardinality]')
                        .forEach(n => { if (APPLICABILITY_FACETS.includes(n.tagName)) n.removeAttribute('cardinality'); });
                }
            };
        }
    });
```

- [ ] **Step 4:** Run tests; expect both PASS.

- [ ] **Step 5:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js tests/test-suites/ids-auto-fix.test.js
git commit -m "feat(ids-auto-fix): classifier — cardinality on applicability facet"
```

---

### Task B5: `missing-title`

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`, `assets/js/ids/ids-auto-fix.js`

- [ ] **Step 1:** Append to the test file:

```js
describe('IDSAutoFix: missing-title', () => {
    const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS">
        <info><version>1.0</version></info></ids>`;

    it('inserts <title> as first child of <info>', () => {
        const doc = makeDoc(xml);
        const errs = [makeErr("Element 'info': Missing child element(s). Expected is ( title ).", 2)];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].fixable).toBe(true);
        expect(ds[0].category).toBe('missing-title');
        IDSAutoFix.applyFixes(doc, [ds[0].id], ds);
        const info = doc.querySelector('info');
        expect(info.firstElementChild.tagName).toBe('title');
        expect(info.querySelector('title').textContent).toBe('Untitled IDS');
    });
});
```

- [ ] **Step 2:** Run tests; expect FAIL.

- [ ] **Step 3:** Append to `assets/js/ids/ids-auto-fix.js`:

```js
    classifiers.push({
        id: 'missing-title',
        test(err, xmlDoc) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            if (!msg.includes("'info'") || !msg.includes('title')) return false;
            return !xmlDoc.querySelector('info > title');
        },
        build(err, xmlDoc) {
            return {
                id: 'missing-title',
                category: 'missing-title',
                label: 'editor.autoFix.fix.missingTitle',
                before: null,
                after: '<title>Untitled IDS</title>',
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    const info = doc.querySelector('info');
                    if (!info || info.querySelector('title')) return;
                    const ns = doc.documentElement.namespaceURI || null;
                    const title = ns ? doc.createElementNS(ns, 'title') : doc.createElement('title');
                    title.textContent = 'Untitled IDS';
                    info.insertBefore(title, info.firstChild);
                }
            };
        }
    });
```

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js tests/test-suites/ids-auto-fix.test.js
git commit -m "feat(ids-auto-fix): classifier — missing title"
```

---

### Task B6: `missing-ifc-version`

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`, `assets/js/ids/ids-auto-fix.js`

- [ ] **Step 1:** Append to the test file:

```js
describe('IDSAutoFix: missing-ifc-version', () => {
    const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS">
        <info><title>t</title></info>
        <specifications>
            <specification name="s">
                <applicability><entity><name><simpleValue>IfcWall</simpleValue></name></entity></applicability>
                <requirements/>
            </specification>
        </specifications></ids>`;

    it('sets ifcVersion to IFC4 when missing', () => {
        const doc = makeDoc(xml);
        const errs = [makeErr("Element 'specification': The attribute 'ifcVersion' is required but missing.", 4)];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].fixable).toBe(true);
        IDSAutoFix.applyFixes(doc, [ds[0].id], ds);
        expect(doc.querySelector('specification').getAttribute('ifcVersion')).toBe('IFC4');
    });
});
```

- [ ] **Step 2:** Run tests; expect FAIL.

- [ ] **Step 3:** Append to `assets/js/ids/ids-auto-fix.js`:

```js
    classifiers.push({
        id: 'missing-ifc-version',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes('specification') && msg.includes('ifcversion');
        },
        build(err, xmlDoc) {
            const node = Array.from(xmlDoc.querySelectorAll('specification'))
                .find(n => !n.getAttribute('ifcVersion'));
            if (!node) return null;
            return {
                id: 'missing-ifc-version-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'missing-ifc-version',
                label: 'editor.autoFix.fix.missingIfcVersion',
                before: null,
                after: 'ifcVersion="IFC4"',
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    doc.querySelectorAll('specification').forEach(n => {
                        if (!n.getAttribute('ifcVersion')) n.setAttribute('ifcVersion', 'IFC4');
                    });
                }
            };
        }
    });
```

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js tests/test-suites/ids-auto-fix.test.js
git commit -m "feat(ids-auto-fix): classifier — missing ifcVersion"
```

---

### Task B7: `missing-spec-name`

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`, `assets/js/ids/ids-auto-fix.js`

- [ ] **Step 1:** Append to the test file:

```js
describe('IDSAutoFix: missing-spec-name', () => {
    const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS">
        <info><title>t</title></info>
        <specifications>
            <specification ifcVersion="IFC4">
                <applicability><entity><name><simpleValue>IfcWall</simpleValue></name></entity></applicability>
                <requirements/>
            </specification>
            <specification ifcVersion="IFC4">
                <applicability><entity><name><simpleValue>IfcSlab</simpleValue></name></entity></applicability>
                <requirements/>
            </specification>
        </specifications></ids>`;

    it('names unnamed specs by 1-based index', () => {
        const doc = makeDoc(xml);
        const errs = [
            makeErr("Element 'specification': The attribute 'name' is required but missing.", 4),
            makeErr("Element 'specification': The attribute 'name' is required but missing.", 8)
        ];
        const ds = IDSAutoFix.analyze(doc, errs);
        expect(ds[0].fixable).toBe(true);
        IDSAutoFix.applyFixes(doc, ds.map(d => d.id), ds);
        const specs = doc.querySelectorAll('specification');
        expect(specs[0].getAttribute('name')).toBe('Specification 1');
        expect(specs[1].getAttribute('name')).toBe('Specification 2');
    });
});
```

- [ ] **Step 2:** Run tests; expect FAIL.

- [ ] **Step 3:** Append to `assets/js/ids/ids-auto-fix.js`:

```js
    classifiers.push({
        id: 'missing-spec-name',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes('specification') && msg.includes("'name'");
        },
        build(err) {
            return {
                id: 'missing-spec-name-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'missing-spec-name',
                label: 'editor.autoFix.fix.missingSpecName',
                before: null,
                after: 'name="Specification N"',
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    Array.from(doc.querySelectorAll('specification')).forEach((n, i) => {
                        if (!n.getAttribute('name')) n.setAttribute('name', 'Specification ' + (i + 1));
                    });
                }
            };
        }
    });
```

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add assets/js/ids/ids-auto-fix.js tests/test-suites/ids-auto-fix.test.js
git commit -m "feat(ids-auto-fix): classifier — missing specification name"
```

---

### Task B8: Combined-fixture integration test

**Files:**
- Modify: `tests/test-suites/ids-auto-fix.test.js`

- [ ] **Step 1:** Append:

```js
describe('IDSAutoFix: combined fixture', () => {
    it('applies all known fixes in one pass', () => {
        const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS">
            <info><author>Not Email</author><date>5.6.2024</date></info>
            <specifications>
                <specification>
                    <applicability>
                        <entity cardinality="required"><name><simpleValue>IfcWall</simpleValue></name></entity>
                        <property cardinality="optional">
                            <propertySet><simpleValue>Pset_X</simpleValue></propertySet>
                            <baseName><simpleValue>Y</simpleValue></baseName>
                        </property>
                    </applicability>
                    <requirements/>
                </specification>
            </specifications></ids>`;
        const doc = makeDoc(xml);
        const errs = [
            makeErr("Element 'info': Missing child element(s). Expected is ( title ).", 2),
            makeErr("Element 'author': [facet 'pattern']", 2),
            makeErr("Element 'date': '5.6.2024' is not a valid value of the atomic type 'xs:date'.", 2),
            makeErr("Element 'specification': The attribute 'name' is required but missing.", 4),
            makeErr("Element 'specification': The attribute 'ifcVersion' is required but missing.", 4),
            makeErr("Element 'entity', attribute 'cardinality': The attribute 'cardinality' is not allowed.", 6),
            makeErr("Element 'property', attribute 'cardinality': The attribute 'cardinality' is not allowed.", 7)
        ];
        const ds = IDSAutoFix.analyze(doc, errs);
        const fixable = ds.filter(d => d.fixable);
        expect(fixable.length).toBe(7);
        IDSAutoFix.applyFixes(doc, fixable.map(d => d.id), ds);
        expect(doc.querySelector('info > title').textContent).toBe('Untitled IDS');
        expect(doc.querySelector('author').textContent).toBe('noreply@example.com');
        expect(doc.querySelector('date').textContent).toBe('2024-06-05');
        expect(doc.querySelector('specification').getAttribute('name')).toBe('Specification 1');
        expect(doc.querySelector('specification').getAttribute('ifcVersion')).toBe('IFC4');
        expect(doc.querySelector('entity').hasAttribute('cardinality')).toBe(false);
        expect(doc.querySelector('applicability > property').hasAttribute('cardinality')).toBe(false);
    });
});
```

- [ ] **Step 2:** Run tests; expect PASS.

```bash
node tests/run-tests.js
```

- [ ] **Step 3:** Commit.

```bash
git add tests/test-suites/ids-auto-fix.test.js
git commit -m "test(ids-auto-fix): combined fixture covering all 7 catalogue fixes"
```

---

## Phase C — Modal UI

### Task C1: Translation keys

**Files:**
- Modify: `assets/js/common/translations.js`

- [ ] **Step 1:** In `assets/js/common/translations.js`, locate the cs block at line ~246 (after `'parser.error.invalidXml'` etc.). Append within the cs object:

```js
        'editor.autoFix.modalTitle': '⚠ IDS obsahuje XSD chyby',
        'editor.autoFix.intro': 'Načtený IDS neprošel validací IDS 1.0 schématu. Vyber, které chyby chceš opravit:',
        'editor.autoFix.fixSelected': 'Opravit vybrané',
        'editor.autoFix.fixAll': 'Opravit vše',
        'editor.autoFix.ignore': 'Ignorovat',
        'editor.autoFix.unfixableHint': 'Tuhle chybu zatím neumíme opravit automaticky — vyřeš ji ručně v editoru.',
        'editor.autoFix.line': 'řádek {n}',
        'editor.autoFix.applied': 'Opraveno {n} chyb',
        'editor.autoFix.fix.authorNotEmail': 'Author není platný e-mail',
        'editor.autoFix.fix.dateBadFormat': 'Datum nemá formát YYYY-MM-DD',
        'editor.autoFix.fix.cardinalityOnEntity': 'Entity má atribut cardinality (zakázáno)',
        'editor.autoFix.fix.cardinalityOnApplicability': 'Facet v Applicability má atribut cardinality (zakázáno)',
        'editor.autoFix.fix.missingTitle': 'Chybí povinný element <title>',
        'editor.autoFix.fix.missingIfcVersion': 'Specification nemá atribut ifcVersion',
        'editor.autoFix.fix.missingSpecName': 'Specification nemá atribut name',
```

- [ ] **Step 2:** Locate the en block at line ~1451 (after `'parser.error.invalidXml': 'Invalid XML file'`). Append within the en object:

```js
        'editor.autoFix.modalTitle': '⚠ IDS contains XSD errors',
        'editor.autoFix.intro': 'The loaded IDS did not pass IDS 1.0 schema validation. Choose which errors to fix:',
        'editor.autoFix.fixSelected': 'Fix selected',
        'editor.autoFix.fixAll': 'Fix all',
        'editor.autoFix.ignore': 'Ignore',
        'editor.autoFix.unfixableHint': 'No auto-fix available yet — fix it manually in the editor.',
        'editor.autoFix.line': 'line {n}',
        'editor.autoFix.applied': '{n} errors fixed',
        'editor.autoFix.fix.authorNotEmail': 'Author is not a valid email',
        'editor.autoFix.fix.dateBadFormat': 'Date is not in YYYY-MM-DD format',
        'editor.autoFix.fix.cardinalityOnEntity': 'Entity has cardinality attribute (not allowed)',
        'editor.autoFix.fix.cardinalityOnApplicability': 'Facet in Applicability has cardinality attribute (not allowed)',
        'editor.autoFix.fix.missingTitle': 'Required <title> element is missing',
        'editor.autoFix.fix.missingIfcVersion': 'Specification is missing ifcVersion attribute',
        'editor.autoFix.fix.missingSpecName': 'Specification is missing name attribute',
```

- [ ] **Step 3:** Run the full test suite to make sure i18n parity tests still pass:

```bash
node tests/run-tests.js
```

Expected: existing `i18n.test.js` (which checks that every cs key has an en counterpart and vice-versa) continues to pass.

- [ ] **Step 4:** Commit.

```bash
git add assets/js/common/translations.js
git commit -m "i18n(ids-auto-fix): cs+en keys for modal + 7 fix labels"
```

---

### Task C2: Modal HTML + CSS

**Files:**
- Modify: `pages/ids-parser-visualizer.html`, `assets/css/ids-parser.css`

- [ ] **Step 1:** In `pages/ids-parser-visualizer.html`, immediately after the closing `</div>` of the XSD Export Modal (the block starting at line 264), add:

```html
    <!-- IDS Auto-Fix Modal -->
    <div id="idsAutoFixModal" class="modal-overlay" style="display:none">
        <div class="modal-container">
            <div class="modal-header">
                <h2 id="idsAutoFixTitle"></h2>
                <button type="button" class="modal-close" id="idsAutoFixClose">&times;</button>
            </div>
            <div class="modal-body">
                <p id="idsAutoFixIntro"></p>
                <ul class="ids-auto-fix-list" id="idsAutoFixList"></ul>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="idsAutoFixIgnore"></button>
                <button type="button" class="btn btn-secondary" id="idsAutoFixFixSelected"></button>
                <button type="button" class="btn btn-primary" id="idsAutoFixFixAll"></button>
            </div>
        </div>
    </div>
```

- [ ] **Step 2:** Append to `assets/css/ids-parser.css`:

```css
.ids-auto-fix-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 50vh;
    overflow-y: auto;
}
.ids-auto-fix-list li {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
}
.ids-auto-fix-list li:last-child { border-bottom: none; }
.ids-auto-fix-list .fix-label { font-weight: 600; }
.ids-auto-fix-list .fix-diff {
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
    color: var(--text-secondary, #4a5568);
    margin-top: 4px;
    word-break: break-word;
}
.ids-auto-fix-list .fix-line {
    margin-top: 4px;
    font-size: 0.8em;
    color: var(--text-secondary, #718096);
}
.ids-auto-fix-list .fix-line a { color: inherit; text-decoration: underline; cursor: pointer; }
.ids-auto-fix-list input[type=checkbox]:disabled + .fix-meta { opacity: 0.55; }
```

- [ ] **Step 3:** Open `pages/ids-parser-visualizer.html` in a browser via the dev workflow you already use (or via `python3 -m http.server` from project root) and verify the modal markup renders nothing visible (it's hidden by default). No automated test for this step; manual smoke only.

- [ ] **Step 4:** Commit.

```bash
git add pages/ids-parser-visualizer.html assets/css/ids-parser.css
git commit -m "feat(ids-auto-fix): modal HTML + CSS in parser visualizer page"
```

---

### Task C3: IDSAutoFixModal controller

**Files:**
- Create: `assets/js/ids/ids-auto-fix-modal.js`
- Modify: `pages/ids-parser-visualizer.html`

- [ ] **Step 1:** Create `assets/js/ids/ids-auto-fix-modal.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDSAutoFixModal — renders the auto-fix picker built from FixDescriptors
 * produced by IDSAutoFix.analyze. Returns the user's choice as a Promise.
 *
 * Resolution shape:
 *   { action: 'fix' | 'ignore', selectedIds: string[] }
 */
window.IDSAutoFixModal = (function () {
    'use strict';

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[c]);
    }

    function show(descriptors) {
        return new Promise((resolve) => {
            const modal = document.getElementById('idsAutoFixModal');
            if (!modal) { resolve({ action: 'ignore', selectedIds: [] }); return; }

            document.getElementById('idsAutoFixTitle').textContent     = t('editor.autoFix.modalTitle');
            document.getElementById('idsAutoFixIntro').textContent     = t('editor.autoFix.intro');
            document.getElementById('idsAutoFixIgnore').textContent    = t('editor.autoFix.ignore');
            document.getElementById('idsAutoFixFixSelected').textContent = t('editor.autoFix.fixSelected');
            document.getElementById('idsAutoFixFixAll').textContent    = t('editor.autoFix.fixAll');

            const list = document.getElementById('idsAutoFixList');
            list.innerHTML = descriptors.map(d => {
                const labelText = d.fixable ? t(d.label) : (d.label || '');
                const before = d.before !== null && d.before !== undefined
                    ? `<div class="fix-diff">${escapeHtml(d.before)} → ${escapeHtml(d.after || '')}</div>` : '';
                const lineLink = d.lineNumber
                    ? `<div class="fix-line"><a data-jump="${d.lineNumber}">${escapeHtml(t('editor.autoFix.line').replace('{n}', d.lineNumber))}</a></div>` : '';
                const cbAttrs = d.fixable
                    ? `type="checkbox" data-id="${escapeHtml(d.id)}" checked`
                    : `type="checkbox" disabled title="${escapeHtml(t('editor.autoFix.unfixableHint'))}"`;
                return `<li>
                    <input ${cbAttrs}>
                    <div class="fix-meta">
                        <div class="fix-label">${escapeHtml(labelText)}</div>
                        ${before}${lineLink}
                    </div>
                </li>`;
            }).join('');

            list.querySelectorAll('a[data-jump]').forEach(a => {
                a.addEventListener('click', () => {
                    const line = a.getAttribute('data-jump');
                    if (typeof window.switchTab === 'function') window.switchTab('raw');
                    requestAnimationFrame(() => {
                        const t = document.getElementById('xml-line-' + line);
                        if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    });
                });
            });

            modal.style.display = 'flex';

            function selected() {
                return Array.from(list.querySelectorAll('input[type=checkbox][data-id]:checked'))
                    .map(cb => cb.getAttribute('data-id'));
            }
            function cleanup(action, ids) {
                modal.style.display = 'none';
                document.getElementById('idsAutoFixClose').onclick        = null;
                document.getElementById('idsAutoFixIgnore').onclick       = null;
                document.getElementById('idsAutoFixFixSelected').onclick  = null;
                document.getElementById('idsAutoFixFixAll').onclick       = null;
                resolve({ action, selectedIds: ids });
            }

            document.getElementById('idsAutoFixClose').onclick        = () => cleanup('ignore', []);
            document.getElementById('idsAutoFixIgnore').onclick       = () => cleanup('ignore', []);
            document.getElementById('idsAutoFixFixSelected').onclick  = () => cleanup('fix', selected());
            document.getElementById('idsAutoFixFixAll').onclick       = () => cleanup(
                'fix',
                descriptors.filter(d => d.fixable).map(d => d.id)
            );
        });
    }

    return { show };
})();
```

- [ ] **Step 2:** Add the script tag in `pages/ids-parser-visualizer.html` immediately after the `<script src="../assets/js/ids/ids-auto-fix.js"></script>` line:

```html
    <script src="../assets/js/ids/ids-auto-fix-modal.js"></script>
```

- [ ] **Step 3:** Smoke-check by opening the parser page in a browser, opening DevTools console, and running:

```js
IDSAutoFixModal.show([
    { id: 'a', category: 'author-not-email', label: 'editor.autoFix.fix.authorNotEmail',
      before: 'Not Email', after: 'noreply@example.com', lineNumber: 2, fixable: true, apply(){} },
    { id: 'b', category: 'unknown', label: 'mystery xsd error', before: null, after: null,
      lineNumber: 5, fixable: false, apply: null }
]).then(r => console.log('result', r));
```

Expected: modal opens, shows two rows (first with checked checkbox, second disabled). Clicking "Opravit vše" resolves with `{ action: 'fix', selectedIds: ['a'] }`. Clicking "Ignorovat" resolves with `{ action: 'ignore', selectedIds: [] }`.

- [ ] **Step 4:** Commit.

```bash
git add assets/js/ids/ids-auto-fix-modal.js pages/ids-parser-visualizer.html
git commit -m "feat(ids-auto-fix): modal controller with selected/all/ignore actions"
```

---

## Phase D — Integration

### Task D1: Hook into `runXSDValidation`

**Files:**
- Modify: `assets/js/parser.js`

- [ ] **Step 1:** In `assets/js/parser.js`, replace the existing `runXSDValidation` function (currently lines 91–103) with:

```js
let _idsAutoFixSkip = false;

async function runXSDValidation(xmlString) {
    const banner = document.getElementById('xsdValidationBanner');
    if (!banner || typeof window.IDSXSDValidator === 'undefined') return;
    banner.style.display = 'none';
    try {
        const result = await IDSXSDValidator.validate(xmlString);
        if (result.valid) return;

        if (!_idsAutoFixSkip
            && typeof window.IDSAutoFix !== 'undefined'
            && typeof window.IDSAutoFixModal !== 'undefined'
            && currentIDSData && currentIDSData.doc) {

            const descriptors = IDSAutoFix.analyze(currentIDSData.doc, result.errors);
            const anyFixable = descriptors.some(d => d.fixable);
            if (anyFixable) {
                const choice = await IDSAutoFixModal.show(descriptors);
                if (choice.action === 'fix' && choice.selectedIds.length > 0) {
                    const fixedXml = IDSAutoFix.applyFixes(currentIDSData.doc, choice.selectedIds, descriptors);
                    _idsAutoFixSkip = true;
                    try { parseIDS(fixedXml); } finally { _idsAutoFixSkip = false; }
                    return;
                }
            }
        }
        showXSDBanner(result.errors);
    } catch (e) {
        console.warn('XSD validation skipped:', e);
    }
}
```

- [ ] **Step 2:** Manual smoke test in browser:

  1. Open `pages/ids-parser-visualizer.html` in a browser.
  2. Drag-and-drop an intentionally-broken IDS file (use the sample below saved as `bad.ids`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS"
     xmlns:xs="http://www.w3.org/2001/XMLSchema"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
    <info>
        <title>Broken Sample</title>
        <author>Not An Email</author>
        <date>5.6.2024</date>
    </info>
    <specifications>
        <specification name="s" ifcVersion="IFC4">
            <applicability>
                <entity cardinality="required"><name><simpleValue>IfcWall</simpleValue></name></entity>
            </applicability>
            <requirements/>
        </specification>
    </specifications>
</ids>
```

  3. Expected: auto-fix modal opens with at least three fixable rows (author, date, cardinality). Click "Opravit vše" → modal closes → no XSD banner.
  4. Reload with drag-and-drop and click "Ignorovat" instead → modal closes → XSD banner shows the three errors.

- [ ] **Step 3:** Commit.

```bash
git add assets/js/parser.js
git commit -m "feat(parser): wire IDS auto-fix into runXSDValidation"
```

---

### Task D2: Fix sample IDS

**Files:**
- Modify: `assets/js/parser.js`

- [ ] **Step 1:** In `assets/js/parser.js` `loadSampleIDS()`, locate the `<ids:author>` line (currently `<ids:author>BIM Checker — IDS Visualizer</ids:author>`, around line 705) and replace with:

```js
        <ids:author>info@bim-checker.example</ids:author>
```

- [ ] **Step 2:** Manual smoke test:

  1. Open the parser page in a browser.
  2. Click the "Load sample IDS" button (label varies by language).
  3. Expected: the IDS renders; **no auto-fix modal opens**; **no XSD banner appears**.

- [ ] **Step 3:** If the sample still triggers any XSD error in step 2, capture the error message, fix it in the same `loadSampleIDS` body (the goal is "sample passes validation"), repeat step 2. Likely culprits: any other element that needs a specific pattern or required attribute. Do not move on until the sample loads clean.

- [ ] **Step 4:** Commit.

```bash
git add assets/js/parser.js
git commit -m "fix(parser): make sample IDS pass XSD 1.0 validation"
```

---

## Phase E — Ship

### Task E1: Sync `dist/`, bump SW cache, full test pass

**Files:**
- Modify: `dist/assets/js/parser.js`, `dist/assets/js/common/translations.js`, `dist/assets/css/ids-parser.css`
- Create: `dist/assets/js/ids/ids-auto-fix.js`, `dist/assets/js/ids/ids-auto-fix-modal.js`
- Modify: `dist/pages/ids-parser-visualizer.html`, `sw.js`

- [ ] **Step 1:** Mirror all changed/new files into `dist/`:

```bash
cp assets/js/parser.js dist/assets/js/parser.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
cp assets/css/ids-parser.css dist/assets/css/ids-parser.css
cp assets/js/ids/ids-auto-fix.js dist/assets/js/ids/ids-auto-fix.js
cp assets/js/ids/ids-auto-fix-modal.js dist/assets/js/ids/ids-auto-fix-modal.js
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
```

- [ ] **Step 2:** Verify dist sync:

```bash
diff -q assets/js/parser.js dist/assets/js/parser.js \
  && diff -q assets/js/common/translations.js dist/assets/js/common/translations.js \
  && diff -q assets/css/ids-parser.css dist/assets/css/ids-parser.css \
  && diff -q assets/js/ids/ids-auto-fix.js dist/assets/js/ids/ids-auto-fix.js \
  && diff -q assets/js/ids/ids-auto-fix-modal.js dist/assets/js/ids/ids-auto-fix-modal.js \
  && diff -q pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html \
  && echo ALL OK
```

Expected: `ALL OK`.

- [ ] **Step 3:** Bump SW cache version in `sw.js` line 3:

```js
const CACHE_VERSION = 'bim-checker-v59';
```

- [ ] **Step 4:** Run the full test suite end-to-end:

```bash
node tests/run-tests.js
```

Expected: all tests pass (including the new `ids-auto-fix.test.js` suites, the existing `i18n.test.js` parity check, and every pre-existing test).

- [ ] **Step 5:** Manual end-to-end browser check in `pages/ids-parser-visualizer.html`:

  a. **Sample button** → loads sample → no modal, no banner.
  b. **Broken-IDS drag-and-drop** (from Task D1 step 2) → modal opens → "Opravit vše" → renders cleanly → no banner.
  c. **Broken-IDS drag-and-drop** → modal opens → "Ignorovat" → renders with XSD banner showing the errors (existing behaviour preserved).
  d. **Broken-IDS via Storage picker** (upload the bad file to Storage, then click "Load from storage") → same as (b)/(c).
  e. **Switch language cs↔en** while the modal is open → labels should re-render on next open; the modal itself does not need live re-render. Confirm both languages show the correct text.

- [ ] **Step 6:** Commit + push.

```bash
git add sw.js dist/
git commit -m "chore(ids-auto-fix): sync dist + SW v58→v59"
git push
```

---

## Self-Review Notes

**Spec coverage:**
- Section "Goals" item 1 (modal with one-click fixes) → Tasks C2, C3, D1.
- Item 2 (residual errors via XSD banner) → Task D1, integration test in step 5.c.
- Item 3 (sample passes validation) → Task D2.
- Catalogue (7 fix categories) → Tasks B1–B7 (one each), B8 (combined).
- i18n keys → Task C1 with one-to-one mapping.
- Re-entry guard → Task D1.
- Mirror/dist + SW bump → Task E1.

**No placeholders:** every code step contains complete, runnable code; every command has an expected outcome. Where the sample-IDS fix might surface unforeseen XSD errors, Task D2 Step 3 explicitly handles iteration (concrete instruction, not a TBD).

**Type consistency:** `FixDescriptor` shape defined in Task A1, re-used identically in B1–B8 and consumed in C3/D1. Function names (`analyze`, `applyFixes`, `show`) are stable across tasks. Translation keys defined in C1 are referenced by exact string in C3 and B-tasks via the `label` field of each descriptor.
