/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('guid-resolve — GUID → expressId', () => {
    it('najde existující GUIDy, chybějící vynechá', async () => {
        const [{ parseStepText }, { EntityIndex }, { resolveGuidsInIndex }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/parser/guid-resolve.js'),
        ]);
        const ifc = `ISO-10303-21;\nDATA;\n#1=IFCWALL('2O2Fr$t4X7Zf8NOew3FLKr',$,'Stena A',$,$,$,$,$,$);\n#2=IFCDOOR('0Btm5o6XL0IhurFcbfxOQ7',$,'Dvere B',$,$,$,$,$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;`;
        const { entities } = parseStepText(ifc);
        const idx = new EntityIndex(entities);
        const map = resolveGuidsInIndex(idx, ['2O2Fr$t4X7Zf8NOew3FLKr', 'NEEXISTUJE0000000000ab']);
        expect(map.get('2O2Fr$t4X7Zf8NOew3FLKr')).toBe(1);
        expect(map.has('NEEXISTUJE0000000000ab')).toBe(false);
        expect(map.size).toBe(1);
        // druhý GUID jiného typu
        const map2 = resolveGuidsInIndex(idx, ['0Btm5o6XL0IhurFcbfxOQ7']);
        expect(map2.get('0Btm5o6XL0IhurFcbfxOQ7')).toBe(2);
    });
});
