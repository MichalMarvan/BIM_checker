/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Coords federation — worldToIfcFrame (inverze viewer-page bake)', () => {
    async function mod() {
        return await import('../../assets/js/3d/ifc-engine/coords/federation.js');
    }
    it('inverze bake vrací původní IFC bod', async () => {
        const { worldToIfcFrame } = await mod();
        // IFC bod (10, 20, 30): world = Rot(−π/2)·ifc = (x, z, −y) = (10, 30, −20), kotva nulová.
        const r = worldToIfcFrame([10, 30, -20], [0, 0, 0]);
        expect(r[0]).toBe(10);
        expect(r[1]).toBe(20);
        expect(r[2]).toBe(30);
        // S-JTSK magnitudy s kotvou: ifc = (−751890.5, −1042021.25, 347.125),
        // kotva a = (−751890, 347, 1042021) → world = ifc→(x,z,−y) − a.
        const ifc = [-751890.5, -1042021.25, 347.125];
        const a = [-751890, 347, 1042021];
        const world = [ifc[0] - a[0], ifc[2] - a[1], -ifc[1] - a[2]];
        const back = worldToIfcFrame(world, a);
        expect(Math.abs(back[0] - ifc[0]) < 1e-9).toBe(true);
        expect(Math.abs(back[1] - ifc[1]) < 1e-9).toBe(true);
        expect(Math.abs(back[2] - ifc[2]) < 1e-9).toBe(true);
    });
    it('bez kotvy / špatný vstup → null', async () => {
        const { worldToIfcFrame } = await mod();
        expect(worldToIfcFrame([1, 2, 3], null)).toBe(null);
        expect(worldToIfcFrame([1, 2, 3], undefined)).toBe(null);
        expect(worldToIfcFrame([1, 2], [0, 0, 0])).toBe(null);
        expect(worldToIfcFrame(null, [0, 0, 0])).toBe(null);
    });
});
