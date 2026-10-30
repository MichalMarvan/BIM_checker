/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Geometrie ve workerech nad SharedArrayBuffer (parser/byte-lexer.js shared
// sloupce, viewer/geometry-worker-pool.js, workers/geometry.worker.js).
//
// Část testů potřebuje cross-origin izolovanou stránku (SharedArrayBuffer):
// `TEST_ISOLATED=1 node tests/run-tests.js` ji zapne (COOP/COEP hlavičky).
// Bez izolace se ověřuje, že paralelní cesta sama ohlásí nedostupnost a
// volající staví na hlavním vlákně — tj. plnohodnotný fallback.
describe('ifc-geometry-workers — SAB index, pool workerů a fallback na hlavní vlákno', () => {
    let indexStepBytes, StepByteIndex, isSharedView, sharedMemoryAvailable;
    let EntityStore, EntityIndex, buildEntityGeometry, buildGeometryParallel, canBuildInWorkers, readInputBytes;
    const enc = new TextEncoder();
    const wrap = data => `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`;
    const WALL = [
        "#1=IFCCARTESIANPOINT((0.,0.,0.));", "#2=IFCDIRECTION((0.,0.,1.));", "#3=IFCAXIS2PLACEMENT3D(#1,#2,$);",
        "#4=IFCLOCALPLACEMENT($,#3);", "#5=IFCRECTANGLEPROFILEDEF(.AREA.,$,#6,1.,2.);", "#6=IFCAXIS2PLACEMENT2D(#7,$);",
        "#7=IFCCARTESIANPOINT((0.,0.));", "#8=IFCEXTRUDEDAREASOLID(#5,#3,#2,3.);",
        "#9=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#8));", "#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#9));",
        "#11=IFCWALL('2abcdefghijklmnopqrstu',$,'Zeď ''ž''',$,$,#4,#10,$,$);",
        "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#3,$);"
    ].join('\n');
    const FIXTURES = ['mapped-shape-with-transformation', 'slab-openings', 'basin-faceted-brep', 'extruded-solid',
        'csg-primitive', 'beam-revolved-solid', 'polygonal-face-tessellation'];

    async function load() {
        if (buildGeometryParallel) return;
        ({ indexStepBytes, StepByteIndex, isSharedView, sharedMemoryAvailable } = await import('../../assets/js/3d/ifc-engine/parser/byte-lexer.js'));
        ({ EntityStore } = await import('../../assets/js/3d/ifc-engine/parser/entity-store.js'));
        ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        ({ buildEntityGeometry } = await import('../../assets/js/3d/ifc-engine/geometry/geometry-core.js'));
        ({ buildGeometryParallel, canBuildInWorkers } = await import('../../assets/js/3d/ifc-engine/viewer/geometry-worker-pool.js'));
        ({ readInputBytes } = await import('../../assets/js/3d/ifc-engine/parser/input-bytes.js'));
    }
    const isolated = () => typeof SharedArrayBuffer === 'function' && window.crossOriginIsolated === true;
    function toShared(bytes) {
        const out = new Uint8Array(new SharedArrayBuffer(bytes.byteLength));
        out.set(bytes);
        return out;
    }
    async function fixtureBytes(name) {
        const res = await fetch(`fixtures/ifc-corpus/${name}.ifc`);
        expect(res.ok).toBe(true);
        return new Uint8Array(await res.arrayBuffer());
    }
    /** Index (store mode, shared when possible) + the per-model lookups addModel relies on. */
    async function sharedIndex(bytes) {
        const [{ buildStyleIndex }, { extractLengthScale, buildContextScaleMap }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/geometry/styled-items.js'),
            import('../../assets/js/3d/ifc-engine/parser/units.js')
        ]);
        const ix = indexStepBytes(isolated() ? toShared(bytes) : bytes);
        const index = new EntityIndex(ix);
        index._styleIndex = buildStyleIndex(index);
        index._lengthScale = extractLengthScale(index);
        index._ctxScaleMap = buildContextScaleMap(index);
        return index;
    }
    async function productIds(index) {
        const [{ detectProductTypes }, { HIDDEN_PRODUCT_TYPES }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/product-detect.js'),
            import('../../assets/js/3d/ifc-engine/constants.js')
        ]);
        const ids = [];
        for (const t of detectProductTypes(index)) {
            if (HIDDEN_PRODUCT_TYPES.has(t)) continue;
            for (const e of index.byType(t)) ids.push(e.expressId);
        }
        return ids;
    }
    function sameBytes(a, b) {
        if (!a && !b) return true;
        if (!a || !b || a.constructor !== b.constructor || a.length !== b.length) return false;
        const ua = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        const ub = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
        for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
        return true;
    }
    /** Deep, bit-exact comparison of two buildEntityGeometry results. */
    function expectSameResult(a, b, label) {
        if (!a || !b) {
            expect(`${label}:${a === null}`).toBe(`${label}:${b === null}`);
            return;
        }
        expect(`${label}:matrix:${a.matrix.elements.join(',')}`).toBe(`${label}:matrix:${b.matrix.elements.join(',')}`);
        expect(`${label}:items:${a.items.length}`).toBe(`${label}:items:${b.items.length}`);
        const da = a.diagnostics, db = b.diagnostics;
        expect(`${label}:diag:${[...da.unsupportedRepresentationTypes].sort().join('|')}:${da.fallbackGeometryCount}:${da.exactBooleanDifferenceCount}:${da.recursionLimitCount}:${da.invalidReferenceCount}`)
            .toBe(`${label}:diag:${[...db.unsupportedRepresentationTypes].sort().join('|')}:${db.fallbackGeometryCount}:${db.exactBooleanDifferenceCount}:${db.recursionLimitCount}:${db.invalidReferenceCount}`);
        for (let i = 0; i < a.items.length; i++) {
            const ia = a.items[i], ib = b.items[i];
            expect(`${label}:${i}:color:${ia.color}`).toBe(`${label}:${i}:color:${ib.color}`);
            expect(`${label}:${i}:parent:${ia.parentMatrix ? ia.parentMatrix.elements.join(',') : null}`)
                .toBe(`${label}:${i}:parent:${ib.parentMatrix ? ib.parentMatrix.elements.join(',') : null}`);
            const ga = ia.bufferGeometry, gb = ib.bufferGeometry;
            const names = Object.keys(ga.attributes).sort();
            expect(`${label}:${i}:attrs:${names.join(',')}`).toBe(`${label}:${i}:attrs:${Object.keys(gb.attributes).sort().join(',')}`);
            for (const n of names) {
                expect(`${label}:${i}:${n}:itemSize:${ga.attributes[n].itemSize}`).toBe(`${label}:${i}:${n}:itemSize:${gb.attributes[n].itemSize}`);
                expect(sameBytes(ga.attributes[n].array, gb.attributes[n].array)).toBe(true);
            }
            expect(sameBytes(ga.index ? ga.index.array : null, gb.index ? gb.index.array : null)).toBe(true);
            expect(`${label}:${i}:bbox:${ga.boundingBox.min.toArray().join(',')}|${ga.boundingBox.max.toArray().join(',')}`)
                .toBe(`${label}:${i}:bbox:${gb.boundingBox.min.toArray().join(',')}|${gb.boundingBox.max.toArray().join(',')}`);
            expect(`${label}:${i}:lo:${JSON.stringify(ga.userData.localOrigin || null)}:${ga.userData.leafId}`)
                .toBe(`${label}:${i}:lo:${JSON.stringify(gb.userData.localOrigin || null)}:${gb.userData.leafId}`);
        }
    }

    it('bez SAB vstupu zůstávají sloupce v obyčejných ArrayBufferech a transfer list je plný', async () => {
        await load();
        const ix = indexStepBytes(enc.encode(wrap(WALL)));
        expect(ix.isShared).toBe(false);
        expect(isSharedView(ix.ids)).toBe(false);
        const { transfer } = ix.toTransferable();
        expect(transfer.includes(ix.bytes.buffer)).toBe(true);
        expect(transfer.includes(ix.ids.buffer)).toBe(true);
        expect(transfer.length).toBe(7); // bytes + 5 sloupců + dense lookup
    });

    it('opts.shared bez SharedArrayBuffer je TypeError, bez izolace je sharedMemoryAvailable false', async () => {
        await load();
        if (typeof SharedArrayBuffer === 'function') {
            expect(sharedMemoryAvailable()).toBe(window.crossOriginIsolated === true);
            return;
        }
        expect(sharedMemoryAvailable()).toBe(false);
        let threw = false;
        try { indexStepBytes(enc.encode(wrap(WALL)), { shared: true }); } catch (e) { threw = e instanceof TypeError; }
        expect(threw).toBe(true);
    });

    it('SAB vstup: sloupce i dense lookup v SAB, parita s obyčejným indexem, transfer list prázdný', async () => {
        await load();
        if (!isolated()) { console.warn('ifc-geometry-workers: stránka není cross-origin izolovaná, SAB test přeskočen'); return; }
        const plain = enc.encode(wrap(WALL + "\n#30=IFCWALL(/* c */ 'ěšč',$,'N\n',$,$,$,$,$,$);"));
        const a = indexStepBytes(plain);
        const b = indexStepBytes(toShared(plain));
        expect(b.isShared).toBe(true);
        for (const col of ['ids', 'typeIdx', 'paramsStart', 'paramsLen', 'flags', '_dense']) expect(isSharedView(b[col])).toBe(true);
        expect(b.lookupKind).toBe('dense');
        expect(b.count).toBe(a.count);
        for (let i = 0; i < a.count; i++) {
            expect(b.ids[i]).toBe(a.ids[i]);
            expect(b.typeName(i)).toBe(a.typeName(i));
            expect(b.paramsString(i)).toBe(a.paramsString(i)); // vč. ne-ASCII a komentáře → TextDecoder nad kopií
        }
        expect(b.get(30).params).toBe(a.get(30).params);
        expect(b.toTransferable().transfer.length).toBe(0);
        // fromTransferable nad SAB vrátí použitelný index bez kopie
        const { fields } = b.toTransferable();
        const c = StepByteIndex.fromTransferable(b.bytes.buffer, fields);
        expect(c.isShared).toBe(true);
        expect(c.get(11).params).toBe(a.get(11).params);
        // růst sloupců (mnoho entit) zachová SAB
        let data = '';
        for (let i = 1; i <= 3000; i++) data += `#${i}=IFCCARTESIANPOINT((${i}.,0.,0.));\n`;
        const big = indexStepBytes(toShared(enc.encode(wrap(data))));
        expect(big.count).toBe(3000);
        expect(isSharedView(big.paramsStart)).toBe(true);
        expect(big.get(3000).params).toBe('(3000.,0.,0.)');
    });

    it('EntityStore: export/import typového indexu dává stejné pozice', async () => {
        await load();
        const bytes = enc.encode(wrap(WALL));
        const s1 = new EntityStore(indexStepBytes(isolated() ? toShared(bytes) : bytes));
        const exported = s1.exportTypeIndex();
        expect(isSharedView(exported.typeOrder)).toBe(isolated());
        const s2 = new EntityStore(s1.index);
        s2.importTypeIndex(exported);
        const t = s2.typeIndexOf('IFCCARTESIANPOINT');
        expect(t >= 0).toBe(true);
        expect(Array.from(s2.positionsOfType(t)).join(',')).toBe(Array.from(s1.positionsOfType(t)).join(','));
        let threw = false;
        try { s2.importTypeIndex({ typeStart: new Int32Array(1), typeOrder: new Int32Array(1) }); } catch (e) { threw = e instanceof RangeError; }
        expect(threw).toBe(true);
    });

    it('readInputBytes: string/ArrayBuffer/view/Blob → Uint8Array; se shared=true do SAB (Blob streamem)', async () => {
        await load();
        const text = wrap(WALL);
        const plain = enc.encode(text);
        expect(new TextDecoder().decode(await readInputBytes(text, false))).toBe(text);
        expect((await readInputBytes(plain.buffer, false)).buffer === plain.buffer).toBe(true);
        const partial = new Uint8Array(plain.buffer, 0, plain.byteLength);
        expect((await readInputBytes(partial, false)).buffer === plain.buffer).toBe(true);
        const fromBlob = await readInputBytes(new Blob([plain]), false);
        expect(fromBlob.byteLength).toBe(plain.byteLength);
        if (!isolated()) return;
        for (const input of [text, plain.buffer.slice(0), new Uint8Array(plain), new Blob([plain])]) {
            const out = await readInputBytes(input, true);
            expect(isSharedView(out)).toBe(true);
            expect(out.byteLength).toBe(plain.byteLength);
            expect(new TextDecoder().decode(out.slice())).toBe(text);
        }
    });

    it('bez izolace: pool ohlásí nedostupnost, nic nedodá a hlavní vlákno postaví vše (fallback)', async () => {
        await load();
        if (isolated()) return;
        const index = await sharedIndex(enc.encode(wrap(WALL)));
        expect(canBuildInWorkers(index)).toBe(false);
        const r = await buildGeometryParallel(index, [11], { idleTimeoutMs: 1000 });
        expect(r.delivered).toBe(0);
        expect(r.missing).toBe(1);
        expect(typeof r.error).toBe('string');
        expect(r.results[0]).toBeUndefined();
        const main = buildEntityGeometry(index, 11);
        expect(main.items.length).toBe(1);
    });

    it('izolovaně: výsledky z workerů jsou bit-identické s hlavním vláknem (korpusové fixtury)', async () => {
        await load();
        if (!isolated()) { console.warn('ifc-geometry-workers: paralelní test přeskočen (bez izolace)'); return; }
        for (const name of FIXTURES) {
            const bytes = await fixtureBytes(name);
            const index = await sharedIndex(bytes);
            expect(canBuildInWorkers(index)).toBe(true);
            const ids = await productIds(index);
            expect(ids.length > 0).toBe(true);
            const r = await buildGeometryParallel(index, ids, { shareLeafGeometry: true, workers: 2, batchSize: 3, idleTimeoutMs: 30000 });
            expect(`${name}:error:${r.error}`).toBe(`${name}:error:null`);
            expect(`${name}:delivered:${r.delivered}/${ids.length}`).toBe(`${name}:delivered:${ids.length}/${ids.length}`);
            const ref = await sharedIndex(bytes);
            ref._shareLeafGeometry = true;
            for (let i = 0; i < ids.length; i++) {
                expectSameResult(r.results[i], buildEntityGeometry(ref, ids[i]), `${name}#${ids[i]}`);
            }
        }
    });

    it('izolovaně: instancované listy (IfcMappedItem) se sdílí v merged režimu a klonují v legacy režimu', async () => {
        await load();
        if (!isolated()) return;
        // Tři produkty instancují tutéž IfcRepresentationMap (#40) přes IfcMappedItem.
        const mapped = [
            "#1=IFCCARTESIANPOINT((0.,0.,0.));", "#2=IFCDIRECTION((0.,0.,1.));", "#3=IFCAXIS2PLACEMENT3D(#1,#2,$);",
            "#5=IFCRECTANGLEPROFILEDEF(.AREA.,$,#6,1.,2.);", "#6=IFCAXIS2PLACEMENT2D(#7,$);", "#7=IFCCARTESIANPOINT((0.,0.));",
            "#8=IFCEXTRUDEDAREASOLID(#5,#3,#2,3.);", "#9=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#8));",
            "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#3,$);", "#40=IFCREPRESENTATIONMAP(#3,#9);",
            "#41=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#1,1.);"
        ];
        for (const [k, x] of [[1, 0], [2, 5], [3, 10]]) {
            mapped.push(`#${50 + k}=IFCCARTESIANPOINT((${x}.,0.,0.));`, `#${60 + k}=IFCAXIS2PLACEMENT3D(#${50 + k},#2,$);`,
                `#${70 + k}=IFCLOCALPLACEMENT($,#${60 + k});`, `#${80 + k}=IFCMAPPEDITEM(#40,#41);`,
                `#${90 + k}=IFCSHAPEREPRESENTATION(#20,'Body','MappedRepresentation',(#${80 + k}));`,
                `#${100 + k}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${90 + k}));`,
                `#${110 + k}=IFCWALL('guid-${k}',$,'W${k}',$,$,#${70 + k},#${100 + k},$,$);`);
        }
        const index = await sharedIndex(enc.encode(wrap(mapped.join('\n'))));
        const ids = await productIds(index);
        const shared = await buildGeometryParallel(index, ids, { shareLeafGeometry: true, workers: 1 });
        const cloned = await buildGeometryParallel(index, ids, { shareLeafGeometry: false, workers: 1 });
        expect(shared.error).toBe(null);
        expect(cloned.error).toBe(null);
        const leafItems = (res) => res.results.flatMap(r => (r ? r.items : [])).filter(it => it.bufferGeometry.userData.leafId !== undefined);
        const a = leafItems(shared), b = leafItems(cloned);
        expect(a.length).toBe(b.length);
        expect(a.length > 1).toBe(true);
        // merged: same leafId → same object; legacy: distinct objects with equal bytes
        const byLeaf = new Map();
        for (const it of a) {
            const id = it.bufferGeometry.userData.leafId;
            if (byLeaf.has(id)) expect(byLeaf.get(id) === it.bufferGeometry).toBe(true);
            byLeaf.set(id, it.bufferGeometry);
        }
        const objs = new Set(b.map(it => it.bufferGeometry));
        expect(objs.size).toBe(b.length);
        for (let i = 0; i < a.length; i++) {
            expect(sameBytes(a[i].bufferGeometry.getAttribute('position').array, b[i].bufferGeometry.getAttribute('position').array)).toBe(true);
        }
    });

    it('izolovaně: chybný worker (404) → nic nedodáno, chyba hlášena, hlavní vlákno dostaví', async () => {
        await load();
        if (!isolated()) return;
        const index = await sharedIndex(enc.encode(wrap(WALL)));
        const r = await buildGeometryParallel(index, [11], { workers: 2, idleTimeoutMs: 20000,
            workerUrl: new URL('fixtures/does-not-exist.worker.js', location.href).href });
        expect(r.delivered).toBe(0);
        expect(r.missing).toBe(1);
        expect(typeof r.error).toBe('string');
        expect(r.results[0]).toBeUndefined();
        expect(buildEntityGeometry(index, 11).items.length).toBe(1);
    });

    it('izolovaně: watchdog nečinnosti ukončí mlčící workery a vrátí prázdné sloty', async () => {
        await load();
        if (!isolated()) return;
        const index = await sharedIndex(enc.encode(wrap(WALL)));
        const t0 = performance.now();
        const r = await buildGeometryParallel(index, [11], { workers: 1, idleTimeoutMs: 400,
            workerUrl: new URL('fixtures/silent.worker.js', location.href).href });
        expect(performance.now() - t0 >= 400).toBe(true);
        expect(r.delivered).toBe(0);
        expect(/no message/.test(r.error || '')).toBe(true);
        expect(r.results[0]).toBeUndefined();
    });

    it('izolovaně: výjimka v produktu ve workeru nechá slot prázdný (hlavní vlákno ji zopakuje)', async () => {
        await load();
        if (!isolated()) return;
        // #11 odkazuje na neexistující reprezentaci → buildEntityGeometry vrátí null (ne výjimku): slot = null, ne undefined
        const index = await sharedIndex(enc.encode(wrap("#4=IFCLOCALPLACEMENT($,$);\n#11=IFCWALL('g',$,'W',$,$,#4,#99,$,$);")));
        const r = await buildGeometryParallel(index, [11], { workers: 1 });
        expect(r.error).toBe(null);
        expect(r.delivered).toBe(1);
        expect(r.results[0]).toBe(null);
        expect(buildEntityGeometry(index, 11)).toBe(null);
    });
});
