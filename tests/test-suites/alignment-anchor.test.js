/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('alignment-anchor — osy respektují federation anchor (bake)', () => {
    let AlignmentVisuals, THREE;
    async function mods() {
        if (!AlignmentVisuals) {
            ({ AlignmentVisuals } = await import('../../assets/js/3d/ifc-engine/viewer/alignment-visuals.js'));
            THREE = await import('three');
        }
    }
    function fakeViewer(anchor) {
        return { _scene: new THREE.Scene(), _federationAnchor: anchor };
    }
    const SAMPLED = {
        points: [[0, 0, 100], [10, 0, 101], [20, 0, 102]],
        stations: [0, 10, 20],
        tangents: [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
        elementIndex: [0, 0, 0],
    };
    it('bez kotvy: skupina na počátku (stávající chování)', async () => {
        await mods();
        const av = new AlignmentVisuals(fakeViewer(null));
        av.add('a1', SAMPLED);
        const g = av._byId.get('a1').group;
        expect(g.position.x).toBe(0);
        expect(g.position.y).toBe(0);
        expect(g.position.z).toBe(0);
    });
    it('s kotvou: skupina posunutá o −anchor (model je bake-nutý do scene-local framu)', async () => {
        await mods();
        const av = new AlignmentVisuals(fakeViewer([100, 50, -30]));
        av.add('a1', SAMPLED);
        const g = av._byId.get('a1').group;
        expect(g.position.x).toBe(-100);
        expect(g.position.y).toBe(-50);
        expect(g.position.z).toBe(30);
        // world pozice bodu osy = Rot(-π/2)·p − anchor: (0,0,100) → (0,100,0) − a = (−100, 50, 30)
        g.updateMatrixWorld(true);
        const v = new THREE.Vector3(0, 0, 100).applyMatrix4(g.matrixWorld);
        expect(Math.abs(v.x - (-100)) < 1e-9).toBe(true);
        expect(Math.abs(v.y - 50) < 1e-9).toBe(true);
        expect(Math.abs(v.z - 30) < 1e-9).toBe(true);
    });
    it('applyAnchor přepolohuje existující osy (kotva se nastaví až po importu os)', async () => {
        await mods();
        const viewer = fakeViewer(null);
        const av = new AlignmentVisuals(viewer);
        av.add('a1', SAMPLED);
        viewer._federationAnchor = [7, 8, 9];
        av.applyAnchor();
        const g = av._byId.get('a1').group;
        expect(g.position.x).toBe(-7);
        expect(g.position.y).toBe(-8);
        expect(g.position.z).toBe(-9);
    });
});
