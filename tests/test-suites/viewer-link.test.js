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
    it('stejný název se dvěma fileId ponechá jako dva modely', () => {
        const p = window.ViewerLink.buildElementsPayload({ source: 'ifc-viewer', items: [
            { fileName: 'revision.ifc', fileId: 'rev-1', guid: 'G1' },
            { fileName: 'revision.ifc', fileId: 'rev-2', guid: 'G1' }
        ] });
        expect(p.files.length).toBe(2);
        expect(p.files[0].fileId).toBe('rev-1');
        expect(p.files[1].fileId).toBe('rev-2');
    });
    it('validation payload filtruje statusy', () => {
        const p = window.ViewerLink.buildValidationPayload({ source: 'validator', title: 'Spec 1', items: [
            { fileName: 'a.ifc', guid: 'G1', status: 'pass' }, { fileName: 'a.ifc', guid: 'G2', status: 'fail' },
            { fileName: 'a.ifc', guid: 'G3', status: 'skipped' }] });
        expect(p.validation.items.length).toBe(2);
        expect(p.validation.items[0].fileId).toBe(null);
        expect(p.validation.title).toBe('Spec 1');
        expect(Array.isArray(p.files)).toBe(true);
    });
    it('validation payload zachová fileId u prvku', () => {
        const p = window.ViewerLink.buildValidationPayload({ source: 'validator', items: [
            { fileName: 'a.ifc', fileId: 'f1', guid: 'G1', status: 'fail' }
        ] });
        expect(p.validation.items[0].fileId).toBe('f1');
        expect(p.files[0].fileId).toBe('f1');
    });
    it('validation payload přebere explicitní files', () => {
        const p = window.ViewerLink.buildValidationPayload({ source: 'validator', title: 'Model', files: [{ fileId: 'f1', fileName: 'a.ifc' }], items: [
            { fileName: 'a.ifc', guid: 'G1', status: 'pass' }] });
        expect(Array.isArray(p.files)).toBe(true);
        expect(p.files.length).toBe(1);
        expect(p.files[0].fileId).toBe('f1');
    });
    it('makeHandoffKey má prefix a unikátnost', () => {
        const k1 = window.ViewerLink.makeHandoffKey();
        const k2 = window.ViewerLink.makeHandoffKey();
        expect(k1.startsWith('bim-3d-viewer-handoff:')).toBe(true);
        expect(k1 === k2).toBe(false);
    });
    it('send vrátí blocked, když prohlížeč nepovolí rezervovat okno', async () => {
        const originalChannel = window.BroadcastChannel;
        const originalOpen = window.open;
        try {
            window.BroadcastChannel = function () { throw new Error('unsupported'); };
            window.open = () => null;
            const result = await window.ViewerLink.send({ version: 1, mode: 'element' });
            expect(result).toBe('blocked');
        } finally {
            window.BroadcastChannel = originalChannel;
            window.open = originalOpen;
            Object.keys(sessionStorage)
                .filter(key => key.startsWith(window.ViewerLink.KEY_PREFIX))
                .forEach(key => sessionStorage.removeItem(key));
        }
    });
    it('send uloží handoff do sessionStorage rezervovaného okna před navigací', async () => {
        const originalChannel = window.BroadcastChannel;
        const originalOpen = window.open;
        const childItems = new Map();
        const child = {
            closed: false,
            location: { href: '' },
            focus: () => {},
            sessionStorage: {
                setItem: (key, value) => childItems.set(key, value),
                removeItem: key => childItems.delete(key)
            }
        };
        try {
            window.BroadcastChannel = function () { throw new Error('unsupported'); };
            window.open = () => child;
            const result = await window.ViewerLink.send({ version: 1, mode: 'element' });
            const keys = Array.from(childItems.keys());
            expect(result).toBe('opened');
            expect(keys.length).toBe(1);
            expect(child.location.href.includes(encodeURIComponent(keys[0]))).toBe(true);
        } finally {
            window.BroadcastChannel = originalChannel;
            window.open = originalOpen;
            Object.keys(sessionStorage)
                .filter(key => key.startsWith(window.ViewerLink.KEY_PREFIX))
                .forEach(key => sessionStorage.removeItem(key));
        }
    });
    it('handoff vybere jen revizi se správným fileId i při shodném GUID a názvu', async () => {
        await import('../../assets/js/ifc/viewer-handoff.js');
        const originalState = window.ViewerState;
        const originalBuildTable = window.buildTable;
        const originalUpdateSelectedCount = window.updateSelectedCount;
        try {
            const rows = [
                { fileName: 'revision.ifc', fileId: 'rev-1', guid: 'SAME', ifcId: '10' },
                { fileName: 'revision.ifc', fileId: 'rev-2', guid: 'SAME', ifcId: '10' }
            ];
            window.ViewerState = {
                allData: rows,
                selectedEntities: new Set(),
                handoffRowKeys: new Set()
            };
            window.buildTable = () => {};
            window.updateSelectedCount = () => {};
            window.ViewerHandoff.applyHandoff({
                version: 1,
                files: [{ name: 'revision.ifc', fileId: 'rev-2' }],
                entities: [{ fileName: 'revision.ifc', fileId: 'rev-2', guid: 'SAME', ifcId: '10' }]
            });
            expect(window.ViewerState.selectedEntities.size).toBe(1);
            expect(Array.from(window.ViewerState.selectedEntities)[0].includes('rev-2')).toBe(true);
        } finally {
            window.ViewerState = originalState;
            window.buildTable = originalBuildTable;
            window.updateSelectedCount = originalUpdateSelectedCount;
        }
    });
});
