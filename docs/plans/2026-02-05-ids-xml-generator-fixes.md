# IDS XML Generator Schema Compliance Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 IDS XML generation bugs so output validates against the official IDS 1.0 XSD schema.

**Architecture:** All fixes target `assets/js/ids/ids-xml-generator.js` (the XML string builder). The generator uses string concatenation - no DOM APIs. The `generateFacetString` method is shared by both applicability and requirements sections, so we need to pass context (section type) through the call chain to conditionally emit `cardinality`. UI (modals/editor) already handles this correctly and needs only the author email change.

**Tech Stack:** Vanilla JS, custom test framework (Jasmine-like `describe`/`it`/`expect`)

---

### Task 1: Add IDS XML generator tests

**Files:**
- Create: `tests/test-suites/ids-xml-generator.test.js`
- Modify: `tests/test-runner.html` (add script tag for new test file)

**Step 1: Write failing tests for all 4 bugs**

```javascript
// =======================
// IDS XML GENERATOR TESTS
// =======================

describe('IDS XML Generator', () => {
    let generator;

    beforeEach(() => {
        generator = new IDSXMLGenerator();
    });

    // --- Bug #1: Default namespace ---

    it('should use default namespace xmlns without prefix', () => {
        const xml = generator.generateIDS({ title: 'Test' });
        expect(xml).toContain('xmlns="http://standards.buildingsmart.org/IDS"');
    });

    it('should NOT use prefixed xmlns:ids namespace', () => {
        const xml = generator.generateIDS({ title: 'Test' });
        expect(xml).not.toContain('xmlns:ids=');
    });

    // --- Bug #3: Info element order ---

    it('should output info elements in schema-defined order', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            description: 'Desc',
            version: '1.0',
            author: 'a@b.com',
            date: '2025-01-01',
            purpose: 'Testing',
            copyright: 'Copyright',
            milestone: 'Design'
        });
        const titleIdx = xml.indexOf('<title>');
        const copyrightIdx = xml.indexOf('<copyright>');
        const versionIdx = xml.indexOf('<version>');
        const descIdx = xml.indexOf('<description>');
        const authorIdx = xml.indexOf('<author>');
        const dateIdx = xml.indexOf('<date>');
        const purposeIdx = xml.indexOf('<purpose>');
        const milestoneIdx = xml.indexOf('<milestone>');

        // Order: title, copyright, version, description, author, date, purpose, milestone
        expect(titleIdx).toBeLessThan(copyrightIdx);
        expect(copyrightIdx).toBeLessThan(versionIdx);
        expect(versionIdx).toBeLessThan(descIdx);
        expect(descIdx).toBeLessThan(authorIdx);
        expect(authorIdx).toBeLessThan(dateIdx);
        expect(dateIdx).toBeLessThan(purposeIdx);
        expect(purposeIdx).toBeLessThan(milestoneIdx);
    });

    // --- Bug #4: Cardinality only in requirements ---

    it('should NOT add cardinality to facets in applicability section', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [
                    { type: 'entity', name: 'IFCWALL' },
                    { type: 'property', propertySet: 'Pset_WallCommon', baseName: 'IsExternal', cardinality: 'required' }
                ],
                requirements: [
                    { type: 'property', propertySet: 'Pset_WallCommon', baseName: 'LoadBearing', cardinality: 'required' }
                ]
            }]
        });

        // Extract applicability section
        const applicabilityStart = xml.indexOf('<applicability');
        const applicabilityEnd = xml.indexOf('</applicability>');
        const applicabilityXml = xml.substring(applicabilityStart, applicabilityEnd);

        // Entity in applicability should NOT have cardinality
        expect(applicabilityXml).not.toContain('cardinality=');

        // Requirements section SHOULD have cardinality
        const reqStart = xml.indexOf('<requirements>');
        const reqEnd = xml.indexOf('</requirements>');
        const reqXml = xml.substring(reqStart, reqEnd);
        expect(reqXml).toContain('cardinality="required"');
    });

    it('should add cardinality to facets in requirements section', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: 'IFCWALL' }],
                requirements: [
                    { type: 'property', propertySet: 'PSet', baseName: 'Prop', cardinality: 'optional' },
                    { type: 'attribute', name: 'Name', cardinality: 'required' },
                    { type: 'classification', system: 'Uniclass', cardinality: 'required' },
                    { type: 'material', value: 'Concrete', cardinality: 'required' },
                    { type: 'partOf', entity: 'IFCBUILDINGSTOREY', cardinality: 'required' }
                ]
            }]
        });

        const reqStart = xml.indexOf('<requirements>');
        const reqEnd = xml.indexOf('</requirements>');
        const reqXml = xml.substring(reqStart, reqEnd);
        expect(reqXml).toContain('cardinality="optional"');
        expect(reqXml).toContain('cardinality="required"');
    });

    it('should generate valid XML structure', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: 'IFCWALL' }],
                requirements: []
            }]
        });
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<ids ');
        expect(xml).toContain('</ids>');
        expect(xml).toContain('<info>');
        expect(xml).toContain('</info>');
        expect(xml).toContain('<specifications>');
        expect(xml).toContain('</specifications>');
    });
});
```

**Step 2: Register the test file in test-runner.html**

Add `<script src="test-suites/ids-xml-generator.test.js"></script>` alongside the existing test suite script tags.

**Step 3: Run tests to verify they fail**

Run: `node tests/run-tests.js`
Expected: Tests for bugs #1, #3, #4 FAIL (current generator has these bugs)

**Step 4: Commit**

```bash
git add tests/test-suites/ids-xml-generator.test.js tests/test-runner.html
git commit -m "test: add IDS XML generator tests for schema compliance bugs"
```

---

### Task 2: Fix Bug #1 - Default namespace

**Files:**
- Modify: `assets/js/ids/ids-xml-generator.js:18-21`

**Step 1: Change namespace declaration**

Replace lines 18-21:
```javascript
        xml += '<ids xmlns:xs="http://www.w3.org/2001/XMLSchema" ';
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += 'xmlns:ids="http://standards.buildingsmart.org/IDS" ';
        xml += 'xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">\n';
```

With:
```javascript
        xml += '<ids xmlns="http://standards.buildingsmart.org/IDS" ';
        xml += 'xmlns:xs="http://www.w3.org/2001/XMLSchema" ';
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += 'xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">\n';
```

Key changes:
- `xmlns:ids=` → `xmlns=` (default namespace, no prefix)
- Move default namespace to first position (convention)

**Step 2: Run tests**

Run: `node tests/run-tests.js`
Expected: namespace tests PASS

**Step 3: Commit**

```bash
git add assets/js/ids/ids-xml-generator.js
git commit -m "fix: use default xmlns namespace in IDS XML output"
```

---

### Task 3: Fix Bug #2 - Author field must be email

**Files:**
- Modify: `assets/js/ids/ids-editor-core.js:828` (change placeholder)
- Modify: `assets/js/ids/ids-editor-core.js:877` (add validation)
- Modify: `assets/js/common/translations.js` (update placeholder text for both languages)

**Step 1: Update translations to indicate email is required**

In `assets/js/common/translations.js`, change:
- Czech: `'editor.authorName': 'Jméno autora'` → `'editor.authorName': 'E-mail autora'`
- English: `'editor.authorName': 'Author name'` → `'editor.authorName': 'Author email'`

Add new translations for validation:
- Czech: `'editor.authorEmailInvalid': 'Pole Author musí obsahovat platný e-mail (např. jan@firma.cz)'`
- English: `'editor.authorEmailInvalid': 'Author field must contain a valid email (e.g. john@company.com)'`

**Step 2: Change input type and placeholder in editor**

In `ids-editor-core.js` line 828, change:
```javascript
<input type="text" id="editInfoAuthor" value="${this.escapeHtml(this.idsData.author || '')}" placeholder="${t('editor.authorName')}">
```
To:
```javascript
<input type="email" id="editInfoAuthor" value="${this.escapeHtml(this.idsData.author || '')}" placeholder="${t('editor.authorName')}">
```

**Step 3: Add email validation in saveInfo()**

In `ids-editor-core.js`, in the `saveInfo()` method (around line 877), add validation after reading the author value:

```javascript
const author = document.getElementById('editInfoAuthor').value.trim();
if (author && !/^[^@]+@[^.]+\..+$/.test(author)) {
    alert(t('editor.authorEmailInvalid'));
    return;
}
this.idsData.author = author;
```

**Step 4: Run tests**

Run: `node tests/run-tests.js`
Expected: All existing tests PASS

**Step 5: Commit**

```bash
git add assets/js/ids/ids-editor-core.js assets/js/common/translations.js
git commit -m "fix: validate author field as email per IDS schema"
```

---

### Task 4: Fix Bug #3 - Info element order

**Files:**
- Modify: `assets/js/ids/ids-xml-generator.js:23-47`

**Step 1: Reorder info elements to match schema sequence**

The current order in the generator is already correct (title, copyright, version, description, author, date, purpose, milestone). However, looking at the user's bug report, the issue occurs when the **data** is provided in a different order - but since the generator uses explicit `if` blocks per field, the output order is determined by the code order, not the data order.

Wait - re-reading the code, the order IS already: title, copyright, version, description, author, date, purpose, milestone. This matches the schema. The bug report says `description` comes at position 2 and `version` at position 6, which would be wrong. Let me verify this is indeed already correct in the generator...

Looking at lines 23-47 of `ids-xml-generator.js`, the order is:
1. title (line 25)
2. copyright (line 26-28)
3. version (line 29-31)
4. description (line 32-34)
5. author (line 35-37)
6. date (line 38-40)
7. purpose (line 41-43)
8. milestone (line 44-46)

This is ALREADY CORRECT. The bug may have been in a different version or in data coming from the Excel parser. Verify and skip if already correct.

**Step 2: Run tests**

Run: `node tests/run-tests.js`
Expected: Order test should PASS (already correct)

**Step 3: Commit (if changes were needed)**

No commit needed if order is already correct.

---

### Task 5: Fix Bug #4 - Cardinality only in requirements

**Files:**
- Modify: `assets/js/ids/ids-xml-generator.js`

This is the biggest change. The `generateFacetString` and all `generate*FacetString` methods need to know whether they're generating for applicability or requirements. Currently they always add `cardinality`.

**Step 1: Add `isRequirement` parameter to facet generation methods**

Modify `generateSpecificationString` to pass section context:

```javascript
// Applicability - pass isRequirement=false
for (const facet of specData.applicability) {
    xml += this.generateFacetString(facet, indent + '    ', false);
}

// Requirements - pass isRequirement=true
for (const facet of specData.requirements) {
    xml += this.generateFacetString(facet, indent + '    ', true);
}
```

Modify `generateFacetString`:
```javascript
generateFacetString(facetData, indent = '', isRequirement = false) {
    const type = facetData.type;
    switch (type) {
        case 'entity':
            return this.generateEntityFacetString(facetData, indent, isRequirement);
        case 'property':
            return this.generatePropertyFacetString(facetData, indent, isRequirement);
        case 'attribute':
            return this.generateAttributeFacetString(facetData, indent, isRequirement);
        case 'classification':
            return this.generateClassificationFacetString(facetData, indent, isRequirement);
        case 'material':
            return this.generateMaterialFacetString(facetData, indent, isRequirement);
        case 'partOf':
            return this.generatePartOfFacetString(facetData, indent, isRequirement);
        default:
            return '';
    }
}
```

For each facet generator, only add cardinality when `isRequirement` is true:

**Entity** (line 139-148): Entity in applicability has NO attributes. Entity in requirements gets cardinality. Actually per XSD, entity in requirements also does NOT have cardinality. Let me re-check... Looking at the XSD `requirementsType`, the `entity` element uses the base `entityType` without extension - so entity NEVER has cardinality. Fix:
```javascript
generateEntityFacetString(data, indent, isRequirement) {
    let xml = `${indent}<entity>\n`;
    // entity never has cardinality attribute per IDS schema
    ...
}
```

**Property** (line 154-167):
```javascript
generatePropertyFacetString(data, indent, isRequirement) {
    let xml = `${indent}<property`;
    if (isRequirement) {
        const cardinality = data.cardinality || 'required';
        xml += ` cardinality="${cardinality}"`;
    }
    xml += '>\n';
    ...
}
```

Same pattern for **attribute**, **classification**, **material**, **partOf**.

**Step 2: Run tests**

Run: `node tests/run-tests.js`
Expected: All cardinality tests PASS

**Step 3: Commit**

```bash
git add assets/js/ids/ids-xml-generator.js
git commit -m "fix: only add cardinality attribute to facets in requirements section"
```

---

### Task 6: Update sample.ids and final verification

**Files:**
- Verify: `test-data/sample.ids` (already correct - uses default namespace, proper order, no cardinality in applicability)

**Step 1: Run full test suite**

Run: `node tests/run-tests.js`
Expected: ALL tests PASS

**Step 2: Manual verification - generate sample XML and inspect**

Visually verify the generated XML has:
- `xmlns="http://standards.buildingsmart.org/IDS"` (default namespace)
- Info elements in correct order
- No `cardinality` in applicability facets
- `cardinality` present in requirements facets

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: IDS XML generator schema compliance (namespace, cardinality, author validation)"
```
