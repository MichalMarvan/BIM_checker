/* SPDX-License-Identifier: AGPL-3.0-or-later */
describe('tool-storage — IDS version aggregation', () => {
    beforeEach(async () => {
        await import('../../assets/js/ai/tools/tool-storage.js');
    });

    it('aggregates ifcVersions across specs without duplicates', () => {
        const ids = {
            info: { title: 't' },
            specifications: [
                { ifcVersion: 'IFC4',                ifcVersions: ['IFC4'] },
                { ifcVersion: 'IFC4 IFC4X3_ADD2',    ifcVersions: ['IFC4', 'IFC4X3_ADD2'] },
                { ifcVersion: 'IFC2X3',              ifcVersions: ['IFC2X3'] }
            ]
        };
        const out = window.ToolStorage.summarizeIDS(ids);
        expect(Array.isArray(out.ifcVersions)).toBe(true);
        expect(out.ifcVersions.length).toBe(3);
        expect(out.ifcVersions.includes('IFC4')).toBe(true);
        expect(out.ifcVersions.includes('IFC4X3_ADD2')).toBe(true);
        expect(out.ifcVersions.includes('IFC2X3')).toBe(true);
        expect(typeof out.ifcVersion).toBe('string');
        expect(out.ifcVersion.includes('IFC4')).toBe(true);
        expect(out.ifcVersion.includes('IFC4X3_ADD2')).toBe(true);
    });

    it('returns empty array and null string when no versions present', () => {
        const ids = { info: {}, specifications: [] };
        const out = window.ToolStorage.summarizeIDS(ids);
        expect(out.ifcVersions.length).toBe(0);
        expect(out.ifcVersion).toBe(null);
    });
});
