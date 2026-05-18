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
