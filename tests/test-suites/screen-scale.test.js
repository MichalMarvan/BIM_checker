/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('screen-scale — konstantní velikost na obrazovce', () => {
    let m;
    async function mod() {
        if (!m) m = await import('../../assets/js/3d/ifc-engine/viewer/screen-scale.js');
        return m;
    }
    it('perspektiva: 2·dist·tan(fov/2)/vh', async () => {
        const { worldPerPixel } = await mod();
        const cam = { isPerspectiveCamera: true, fov: 50, position: { x: 0, y: 0, z: 10 } };
        const expected = 2 * 10 * Math.tan((50 * Math.PI / 180) / 2) / 800;
        expect(Math.abs(worldPerPixel(cam, [0, 0, 0], 800) - expected) < 1e-12).toBe(true);
        // worldPos jako objekt
        expect(Math.abs(worldPerPixel(cam, { x: 0, y: 0, z: 0 }, 800) - expected) < 1e-12).toBe(true);
    });
    it('ortho: (top−bottom)/zoom/vh, bez vlivu vzdálenosti', async () => {
        const { worldPerPixel } = await mod();
        const cam = { top: 50, bottom: -50, zoom: 2, position: { x: 0, y: 0, z: 999 } };
        expect(Math.abs(worldPerPixel(cam, [0, 0, 0], 500) - (100 / 2 / 500)) < 1e-12).toBe(true);
    });
    it('screenScale: targetPx × wpp + clamp', async () => {
        const { screenScale } = await mod();
        const cam = { isPerspectiveCamera: true, fov: 50, position: { x: 0, y: 0, z: 10 } };
        const wpp = 2 * 10 * Math.tan((50 * Math.PI / 180) / 2) / 800;
        expect(Math.abs(screenScale(cam, [0, 0, 0], 800, 36) - 36 * wpp) < 1e-12).toBe(true);
        expect(screenScale(cam, [0, 0, 0], 800, 36, { max: 0.1 })).toBe(0.1);
        expect(screenScale(cam, [0, 0, 0], 800, 0.0001, { min: 0.01 })).toBe(0.01);
    });
});
