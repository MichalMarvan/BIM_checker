/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ViewerLink — payload buildery a klíče', () => {
    it('element payload', () => {
        const p = window.ViewerLink.buildElementPayload({ source: 'validator', fileName: 'a.ifc', guid: 'G1', fileId: 'f1' });
        expect(p.version).toBe(1);
        expect(p.mode).toBe('element');
        expect(p.source).toBe('validator');
        expect(p.element.guid).toBe('G1');
        expect(p.files.length).toBe(1);
        expect(p.files[0].fileId).toBe('f1');
    });
    it('elements payload deduplikuje files', () => {
        const p = window.ViewerLink.buildElementsPayload({ source: 'ifc-viewer', items: [
            { fileName: 'a.ifc', guid: 'G1' }, { fileName: 'a.ifc', guid: 'G2' }, { fileName: 'b.ifc', guid: 'G3' }] });
        expect(p.elements.length).toBe(3);
        expect(p.files.length).toBe(2);
    });
    it('validation payload filtruje statusy', () => {
        const p = window.ViewerLink.buildValidationPayload({ source: 'validator', title: 'Spec 1', items: [
            { fileName: 'a.ifc', guid: 'G1', status: 'pass' }, { fileName: 'a.ifc', guid: 'G2', status: 'fail' },
            { fileName: 'a.ifc', guid: 'G3', status: 'skipped' }] });
        expect(p.validation.items.length).toBe(2);
        expect(p.validation.title).toBe('Spec 1');
    });
    it('makeHandoffKey má prefix a unikátnost', () => {
        const k1 = window.ViewerLink.makeHandoffKey();
        const k2 = window.ViewerLink.makeHandoffKey();
        expect(k1.startsWith('bim-3d-viewer-handoff:')).toBe(true);
        expect(k1 === k2).toBe(false);
    });
});
