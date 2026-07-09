/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('viewer-state-store — IndexedDB persistence', () => {
    let s;
    async function store() {
        if (!s) s = await import('../../assets/js/3d/ifc-engine/state/viewer-state-store.js');
        return s;
    }
    it('modelState put/get/delete roundtrip', async () => {
        const { statePut, stateGet, stateDelete } = await store();
        const doc = { schemaVersion: 1, measurements: [{ id: 'ms_1', type: 'distance', points: [[0, 0, 0], [1, 1, 1]], visible: true, value: 1.732, unit: 'm', label: '' }], sectionPlanes: [] };
        await statePut('hash_test_1', doc);
        const got = await stateGet('hash_test_1');
        expect(got.measurements[0].id).toBe('ms_1');
        expect(got.contentHash).toBe('hash_test_1');
        await stateDelete('hash_test_1');
        expect(await stateGet('hash_test_1')).toBe(null);
    });
    it('views: multiEntry index + legacy bez models', async () => {
        const { viewPut, viewsForModels, viewsAll, viewDelete } = await store();
        await viewPut({ id: 'v1', name: 'A', models: ['hA', 'hB'] });
        await viewPut({ id: 'v2', name: 'B', models: ['hC'] });
        await viewPut({ id: 'v3', name: 'legacy', models: [] });
        const forA = await viewsForModels(['hA']);
        expect(forA.some(v => v.id === 'v1')).toBe(true);
        expect(forA.some(v => v.id === 'v2')).toBe(false);
        expect(forA.some(v => v.id === 'v3')).toBe(true);   // legacy vždy
        expect((await viewsAll()).length >= 3).toBe(true);
        await viewDelete('v1'); await viewDelete('v2'); await viewDelete('v3');
        expect((await viewsAll()).length).toBe(0);
    });
});
