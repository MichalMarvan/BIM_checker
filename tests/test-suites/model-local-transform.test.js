/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('model-local transformace bodů', () => {
    it('roundtrip world→local→world ≈ identita (rotace −π/2 X + posun)', async () => {
        const { transformPointByMatrix } = await import('../../assets/js/3d/ifc-engine/state/local-transform.js');
        const THREE = await import('three');
        const g = new THREE.Group();
        g.rotation.x = -Math.PI / 2;
        g.position.set(10, -5, 3);
        g.updateMatrixWorld(true);
        const world = [4, 7, -2];
        const inv = g.matrixWorld.clone().invert();
        const local = transformPointByMatrix(world, inv.elements);
        const back = transformPointByMatrix(local, g.matrixWorld.elements);
        for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - world[i]) < 1e-9).toBe(true);
        // shoda s THREE.Vector3.applyMatrix4
        const ref = new THREE.Vector3(...world).applyMatrix4(inv);
        expect(Math.abs(local[0] - ref.x) < 1e-9).toBe(true);
        expect(Math.abs(local[1] - ref.y) < 1e-9).toBe(true);
        expect(Math.abs(local[2] - ref.z) < 1e-9).toBe(true);
    });
});
