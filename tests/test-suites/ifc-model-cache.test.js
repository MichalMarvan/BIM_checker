/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('3D IFC model cache (.bimcache)', () => {
    async function mod() {
        return import('../../assets/js/3d/ifc-engine/cache/model-cache.js');
    }

    function samplePayload() {
        return {
            meta: { name: 'Test žlutý.ifc', schema: 'IFC4', entityCount: 3, typeCount: 2, lengthScale: 0.001 },
            lengthScale: 0.001,
            productTypes: ['IFCWALL', 'IFCBEAM'],
            anchor: [12.5, -7.25, 1041328.51],
            position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            color: new Float32Array([0.5, 0.25, 0.125, 0.5, 0.25, 0.125, 0.5, 0.25, 0.125]),
            index: new Uint32Array([0, 1, 2]),
            table: [{ expressId: 7, ifcType: 'IFCWALL', triStart: 0, triCount: 1, vertStart: 0, vertCount: 3 }],
            elementInfo: [[7, 'IFCWALL']],
            elementsByType: { IFCWALL: [7] },
            edgePositions: new Float32Array([0, 0, 0, 1, 0, 0]),
            edgesTable: [{ expressId: 7, vertStart: 0, vertCount: 2 }],
            entities: [[7, 'IFCWALL', "'guid7',$,'Stěna č.1',$,$,$,$,$,$"]],
            layerIndex: [[7, 'Hladina-01']],
            coords: { refLat: 50.1, refLon: 14.26, bboxCenter: [1, 2, 3] },
        };
    }

    it('roundtrips a full payload byte-exactly', async () => {
        const { serializeModelCache, deserializeModelCache } = await mod();
        const src = samplePayload();
        const buf = serializeModelCache(src);
        expect(buf instanceof ArrayBuffer).toBe(true);
        const out = deserializeModelCache(buf);
        expect(out === null).toBe(false);
        expect(out.meta.name).toBe('Test žlutý.ifc');
        expect(out.lengthScale).toBe(0.001);
        expect(out.anchor[2]).toBe(1041328.51);
        expect(Array.from(out.position).join(',')).toBe(Array.from(src.position).join(','));
        expect(Array.from(out.normal).join(',')).toBe(Array.from(src.normal).join(','));
        expect(Array.from(out.color).join(',')).toBe(Array.from(src.color).join(','));
        expect(Array.from(out.index).join(',')).toBe(Array.from(src.index).join(','));
        expect(Array.from(out.edgePositions).join(',')).toBe(Array.from(src.edgePositions).join(','));
        expect(out.table.length).toBe(1);
        expect(out.table[0].triCount).toBe(1);
        expect(out.elementInfo[0][1]).toBe('IFCWALL');
        expect(out.elementsByType.IFCWALL[0]).toBe(7);
        expect(out.entities[0][2].includes('Stěna č.1')).toBe(true);
        expect(out.layerIndex[0][1]).toBe('Hladina-01');
        expect(out.coords.refLon).toBe(14.26);
        expect(out.productTypes.length).toBe(2);
    });

    it('handles missing optional buffers (no edges, no normals)', async () => {
        const { serializeModelCache, deserializeModelCache } = await mod();
        const src = samplePayload();
        src.normal = null;
        src.edgePositions = null;
        src.coords = null;
        const out = deserializeModelCache(serializeModelCache(src));
        expect(out === null).toBe(false);
        expect(out.normal).toBe(null);
        expect(out.edgePositions).toBe(null);
        expect(out.coords).toBe(null);
        expect(out.position.length).toBe(9);
    });

    it('rejects wrong magic and version (stale caches regenerate)', async () => {
        const { serializeModelCache, deserializeModelCache } = await mod();
        const buf = serializeModelCache(samplePayload());
        const bad1 = buf.slice(0);
        new DataView(bad1).setUint32(0, 0xdeadbeef, true);
        expect(deserializeModelCache(bad1)).toBe(null);
        const bad2 = buf.slice(0);
        new DataView(bad2).setUint32(8, 9999, true); // geometry pipeline version
        expect(deserializeModelCache(bad2)).toBe(null);
        expect(deserializeModelCache(new ArrayBuffer(4))).toBe(null);
    });
});
