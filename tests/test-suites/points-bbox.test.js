/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('points-bbox — bbox z pole bodů', () => {
    let fn;
    async function bb() {
        if (!fn) ({ bboxFromPoints: fn } = await import('../../assets/js/3d/ifc-engine/viewer/points-bbox.js'));
        return fn;
    }
    it('víc bodů: min/max/center/maxDim', async () => {
        const f = await bb();
        const r = f([[0, 0, 0], [10, 4, 2], [-2, 8, 6]]);
        expect(r.min[0]).toBe(-2); expect(r.max[0]).toBe(10);
        expect(r.min[1]).toBe(0); expect(r.max[1]).toBe(8);
        expect(r.min[2]).toBe(0); expect(r.max[2]).toBe(6);
        expect(r.center[0]).toBe(4); expect(r.center[1]).toBe(4); expect(r.center[2]).toBe(3);
        expect(r.maxDim).toBe(12);  // x rozsah 12 je největší
    });
    it('jeden bod: maxDim 0, min==max', async () => {
        const f = await bb();
        const r = f([[5, 5, 5]]);
        expect(r.maxDim).toBe(0);
        expect(r.min[0]).toBe(5); expect(r.max[0]).toBe(5); expect(r.center[0]).toBe(5);
    });
    it('prázdné / nevalidní → null', async () => {
        const f = await bb();
        expect(f([])).toBe(null);
        expect(f(null)).toBe(null);
        expect(f('x')).toBe(null);
    });
});
