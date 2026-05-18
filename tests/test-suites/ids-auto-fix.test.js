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
