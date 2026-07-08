/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('DXF export — multi-section řada', () => {
    let mod;
    async function load() {
        if (!mod) mod = await import('../../assets/js/3d/panels/dxf-export.js');
        return mod;
    }
    const mkCurves = () => [{
        modelId: 'm', expressId: 1, ifcType: 'IFCWALL', color: 0xff0000, _layer: null, _dz: 0,
        loops: [{ closed: false, points: [[-1, 200, 0], [1, 201, 0]] }],
    }];
    const mkSections = () => [
        { station: 0,  curves: mkCurves(), plane: { point: [0, 200, 0], normal: [0, 0, 1] } },
        { station: 25, curves: mkCurves(), plane: { point: [0, 200, 0], normal: [0, 0, 1] } },
    ];

    it('řezy v řadě, Y = výška, TEXT staničení', async () => {
        const { buildMultiSectionDxf } = await load();
        const dxf = await buildMultiSectionDxf(mkSections(), { width: 40, height: 20, forceR12: true });
        expect(dxf.includes('TEXT')).toBe(true);
        expect(dxf.includes('km 0,000')).toBe(true);
        expect(dxf.includes('km 0,025')).toBe(true);
        // druhý řez posunut o width + width/4 = 50 → vrchol x=-1 → 49
        expect(dxf.includes('49')).toBe(true);
        // Y zůstává nadmořská výška (200/201)
        expect(dxf.includes('200')).toBe(true);
    });

    it('vrstva POPIS s ACI 7 je v LAYER tabulce (R12)', async () => {
        const { buildMultiSectionDxf } = await load();
        const dxf = await buildMultiSectionDxf(mkSections(), { width: 40, height: 20, forceR12: true });
        // Vrstva POPIS definovaná v tabulce hladin, barva 7 (bílá).
        expect(dxf.includes('POPIS')).toBe(true);
        expect(/\r\n2\r\nPOPIS\r\n70\r\n0\r\n62\r\n7\r\n/.test(dxf)).toBe(true);
    });

    it('TEXT výška = max(0.5, height/20); geometrie na první hladině', async () => {
        const { buildMultiSectionDxf } = await load();
        const dxf = await buildMultiSectionDxf(mkSections(), { width: 40, height: 20, forceR12: true });
        // height/20 = 1 > 0.5 → výška textu 1.0 (kód 40 u TEXT entity).
        expect(dxf.includes('\r\n1\r\nkm 0,000\r\n')).toBe(true);
        // Kód 40 s hodnotou 1.0 se v TEXT bloku vyskytuje.
        expect(/40\r\n1\.0\r\n1\r\nkm 0,000/.test(dxf)).toBe(true);
    });

    it('prázdné pole řezů → null', async () => {
        const { buildMultiSectionDxf } = await load();
        const dxf = await buildMultiSectionDxf([], { width: 40, height: 20, forceR12: true });
        expect(dxf).toBe(null);
    });

    it('jeden řez: bez posunu, TEXT přítomen', async () => {
        const { buildMultiSectionDxf } = await load();
        const one = [{ station: 25, curves: mkCurves(), plane: { point: [0, 200, 0], normal: [0, 0, 1] } }];
        const dxf = await buildMultiSectionDxf(one, { width: 40, height: 20, forceR12: true });
        expect(dxf.includes('km 0,025')).toBe(true);
        // Bez posunu vrchol x = -1 (řez 0 má offsetX 0).
        expect(dxf.includes('-1.0')).toBe(true);
    });

    it('buildDxf zůstává exportovaný (jeden řez, R12 fallback dostupný)', async () => {
        const { buildDxf } = await load();
        expect(typeof buildDxf).toBe('function');
    });

    it('knihovní cesta: TEXT + POPIS (esm.sh, může spadnout na R12)', async () => {
        const { buildMultiSectionDxf } = await load();
        // Bez forceR12 — v testovacím prostředí je síť dostupná, projde knihovna
        // @tarikjabiri/dxf; kdyby ne, spadne na R12. Obě cesty musí obsahovat TEXT.
        const dxf = await buildMultiSectionDxf(mkSections(), { width: 40, height: 20 });
        expect(dxf.includes('TEXT')).toBe(true);
        expect(dxf.includes('km 0,000')).toBe(true);
        expect(dxf.includes('POPIS')).toBe(true);
    });
});
