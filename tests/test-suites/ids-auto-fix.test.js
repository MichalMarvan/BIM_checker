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
