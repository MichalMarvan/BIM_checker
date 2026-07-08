/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Section bounds clip (Liang-Barsky v rovině řezu)', () => {
    const B = { origin: [0, 100, 0], hAxis: [1, 0, 0], halfWidth: 10, halfHeight: 5 };
    let clip;
    async function c(p0, p1) {
        if (!clip) ({ clipSegmentToBounds: clip } =
            await import('../../assets/js/3d/ifc-engine/viewer/section-curves.js'));
        return clip(p0, p1, B);
    }
    it('celý uvnitř → beze změny', async () => {
        const r = await c([-5, 98, 0], [5, 102, 0]);
        expect(r[0][0]).toBe(-5); expect(r[1][0]).toBe(5);
    });
    it('celý venku → null', async () => {
        expect(await c([20, 100, 0], [30, 100, 0])).toBe(null);
        expect(await c([0, 110, 0], [0, 120, 0])).toBe(null);
    });
    it('přesah přes hranu u → zkrácen na halfWidth', async () => {
        const r = await c([0, 100, 0], [20, 100, 0]);
        expect(Math.abs(r[1][0] - 10)).toBeLessThan(1e-9);
    });
    it('přesah přes hranu v (výška, world Y) → zkrácen', async () => {
        const r = await c([0, 100, 0], [0, 112, 0]);
        expect(Math.abs(r[1][1] - 105)).toBeLessThan(1e-9);
    });
});
