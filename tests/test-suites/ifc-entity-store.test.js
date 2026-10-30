/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-entity-store — EntityIndex nad bajtovým úložištěm (parita s Map režimem)', () => {
    let indexStepBytes, StepByteIndex, PROGRESS_STEP, EntityStore, EntityIndex, parseStepText;
    const enc = new TextEncoder();
    const wrap = data => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`;
    const G1 = '0YvctVUKr0kugbFTf53O9L';
    const G2 = '1kTvXnbbzCWw8lcMd1dR4o';
    const G3 = '2abcdefghijklmnopqrstu';

    // Root products, a pset chain, geometry, an alignment closure, a duplicate GUID, comments and a newline inside params.
    const SAMPLE = [
        `#1=IFCPROJECT('${G1}',$,'Projekt',$,$,$,$,(#20),#30);`,
        `#2=IFCWALL('${G2}',$,'Zed',$,$,#10,#11,$,.SOLIDWALL.);`,
        `#3=IFCSLAB('${G2}',$,'Dup',$,$,$,$,$,$);`,
        `#4=IFCPROPERTYSINGLEVALUE('${G3}',$,IFCLABEL('x'),$);`,
        `#5=IFCPROPERTYSET('3ta2EOrybCUerPg6Zzh-bD',$,'Pset_WallCommon',$,(#4));`,
        `#6=IFCRELDEFINESBYPROPERTIES('${G3}',$,$,$,(#2),#5);`,
        "#7=IFCCARTESIANPOINT((0.,0.,0.));",
        "#8=IFCCARTESIANPOINT((1.,2.,3.));",
        "#9=IFCDIRECTION((0.,0.,1.));",
        "#10=IFCLOCALPLACEMENT($,#12);",
        "#11=IFCPRODUCTDEFINITIONSHAPE($,$,(#13));",
        "#12=IFCAXIS2PLACEMENT3D(#7,#9,$);",
        "#13=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#14));",
        "#14=IFCEXTRUDEDAREASOLID(#15,#12,#9,2.);",
        "#15=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1.,1.);",
        "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#12,$);",
        "#30=IFCUNITASSIGNMENT((#31));",
        "#31=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);",
        `#40=IFCALIGNMENT('${G1.replace(/^0/, '3')}',$,'Osa',$,$,#41,$,$);`,
        "#41=IFCLOCALPLACEMENT($,#42);",
        "#42=IFCAXIS2PLACEMENT3D(#8,$,$);",
        "#43=IFCMATERIAL('Beton',$,$);",
        "#44=IFCWALL(/* komentar */ 'guid-s-komentarem',$,'K',$,$,$,$,$,$);",
        "#45=IFCWALL(\n'guid-na-radku',$,'N',$,$,$,$,$,$);",
        "#46=IFCWALL('Zeď ''ž'' ok',$,'U',$,$,$,$,$,$);",
        "#47=IFCFUTURETHING('Jmeno dlouhe 22 znaku!',$);",
        `#48=IFCFUTURETHING('${G3}',$);`,
        "#49=IFCWALL( 'mezery' , $);",
        "#50=IFCWALL('bez-carky');",
        "#51=IFCWALL('po-string-neco' 'x');",
        "#52=IFCWALL(#7,'ref-prvni');",
    ].join('\n');

    async function load() {
        if (!EntityStore) {
            ({ indexStepBytes, StepByteIndex, PROGRESS_STEP } = await import('../../assets/js/3d/ifc-engine/parser/byte-lexer.js'));
            ({ EntityStore } = await import('../../assets/js/3d/ifc-engine/parser/entity-store.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        }
    }
    async function both(data) {
        await load();
        const text = wrap(data);
        return {
            byStore: new EntityIndex(indexStepBytes(enc.encode(text))),
            byMap: new EntityIndex(parseStepText(text).entities),
        };
    }
    const rows = idx => [...idx._byId].map(([id, e]) => `${id}|${e.expressId}|${e.type}|${e.params}`);

    it('EntityStore má rozhraní Map: size, get, has, iterace [id, entita] v pořadí souboru, keys/values/forEach', async () => {
        await load();
        const store = new EntityStore(indexStepBytes(enc.encode(wrap(SAMPLE))));
        const ref = parseStepText(wrap(SAMPLE)).entities;
        expect(store.size).toBe(ref.size);
        expect([...store.keys()].join(',')).toBe([...ref.keys()].join(','));
        expect([...store].map(([id, e]) => `${id}:${e.type}`).join(',')).toBe([...ref].map(([id, e]) => `${id}:${e.type}`).join(','));
        expect([...store.values()].map(e => e.params).join('\n')).toBe([...ref.values()].map(e => e.params).join('\n'));
        let n = 0;
        store.forEach((e, id) => { n++; expect(e.expressId).toBe(id); });
        expect(n).toBe(ref.size);
        expect(store.get(2).params).toBe(ref.get(2).params);
        expect(store.get(999)).toBe(undefined);
        expect(store.has(14)).toBe(true);
        expect(store.has(15000)).toBe(false);
    });

    it('LazyEntity.params se dekóduje jednou a drží stejnou hodnotu', async () => {
        await load();
        const store = new EntityStore(indexStepBytes(enc.encode(wrap(SAMPLE))));
        const e = store.get(44);
        const a = e.params;
        expect(a).toBe(parseStepText(wrap(SAMPLE)).entities.get(44).params);
        expect(e.params === a).toBe(true);
    });

    it('byType / types / stats jsou shodné s Map režimem', async () => {
        const { byStore, byMap } = await both(SAMPLE);
        expect(byStore.types().join(',')).toBe(byMap.types().join(','));
        for (const t of byMap.types()) {
            const a = byStore.byType(t).map(e => `${e.expressId}|${e.type}|${e.params}`).join('\n');
            const b = byMap.byType(t).map(e => `${e.expressId}|${e.type}|${e.params}`).join('\n');
            expect(a).toBe(b);
        }
        expect(byStore.byType('ifcwall').length).toBe(byMap.byType('IfcWall').length);
        expect(byStore.byType('IFCNOTHING').length).toBe(0);
        expect(JSON.stringify(byStore.stats())).toBe(JSON.stringify(byMap.stats()));
        expect(byStore.byExpressId(14).type).toBe('IFCEXTRUDEDAREASOLID');
        expect(byStore.byExpressId(12345)).toBe(null);
    });

    it('GUID index: stejná mapa jako Map režim (root typy, komentáře, newline, escapy, mezery, fallback)', async () => {
        const { byStore, byMap } = await both(SAMPLE);
        const a = [...byStore._byGuid].map(([g, id]) => `${g}=${id}`).join('\n');
        const b = [...byMap._byGuid].map(([g, id]) => `${g}=${id}`).join('\n');
        expect(a).toBe(b);
        expect(byStore.byGuid(G2).expressId).toBe(3);
        expect(byStore.byGuid('guid-s-komentarem').expressId).toBe(44);
        expect(byStore.byGuid('guid-na-radku').expressId).toBe(45);
        expect(byStore.byGuid("Zeď ''ž'' ok").expressId).toBe(46);
        expect(byStore.byGuid('mezery').expressId).toBe(49);
        expect(byStore.byGuid('bez-carky').expressId).toBe(50);
        expect(byStore.byGuid('po-string-neco')).toBe(null);
        expect(byStore.byGuid('ref-prvni')).toBe(null);
        expect(byStore.byGuid('Jmeno dlouhe 22 znaku!')).toBe(null);
        expect(byStore.byGuid(G3).expressId).toBe(48);
        expect(byStore.stats().guidDuplicates).toBe(byMap.stats().guidDuplicates);
    });

    it('GUID index se staví líně — až při prvním dotazu', async () => {
        await load();
        const idx = new EntityIndex(indexStepBytes(enc.encode(wrap(SAMPLE))));
        expect(idx._guidMap).toBe(null);
        expect(idx.byType('IFCWALL').length > 0).toBe(true);
        expect(idx._guidMap).toBe(null);
        expect(idx.byGuid(G2).expressId).toBe(3);
        expect(idx._guidMap !== null).toBe(true);
    });

    it('compact(): stejné přeživší entity (ID, pořadí, typ, params) a dropped jako Map režim; bajty uvolněny', async () => {
        const { byStore, byMap } = await both(SAMPLE);
        const store = byStore._store;
        const droppedA = byStore.compact();
        const droppedB = byMap.compact();
        expect(droppedA).toBe(droppedB);
        expect(droppedA > 0).toBe(true);
        expect(rows(byStore).join('\n')).toBe(rows(byMap).join('\n'));
        expect(byStore._byId instanceof Map).toBe(true);
        expect(byStore._store).toBe(null);
        expect(store.index).toBe(null);
        expect(byStore.types().join(',')).toBe(byMap.types().join(','));
        expect(JSON.stringify(byStore.stats())).toBe(JSON.stringify(byMap.stats()));
        // alignment closure survives (#40 → #41 → #42 → #8), plain geometry does not
        expect(byStore.byExpressId(42).type).toBe('IFCAXIS2PLACEMENT3D');
        expect(byStore.byExpressId(8).type).toBe('IFCCARTESIANPOINT');
        expect(byStore.byExpressId(7)).toBe(null);
        expect(byStore.byExpressId(14)).toBe(null);
        expect(byStore.byType('IFCWALL').map(e => e.expressId).join(',')).toBe(byMap.byType('IFCWALL').map(e => e.expressId).join(','));
    });

    it('toTransferable / fromTransferable: round-trip husté i řídké tabulky ID', async () => {
        await load();
        for (const data of [SAMPLE, `#1=IFCWALL('${G1}',$);\n#500000=IFCWALL('${G2}',$);\n#90000000=IFCSLAB('${G3}',$);`]) {
            const bytes = enc.encode(wrap(data));
            const ref = indexStepBytes(bytes.slice());
            const ix = indexStepBytes(bytes);
            const { bytes: outBytes, fields, transfer } = ix.toTransferable();
            expect(transfer.includes(outBytes.buffer)).toBe(true);
            expect(transfer.includes(fields.ids.buffer)).toBe(true);
            const back = StepByteIndex.fromTransferable(outBytes.buffer, fields);
            expect(back.lookupKind).toBe(ref.lookupKind);
            expect(back.count).toBe(ref.count);
            expect(back.schema).toBe(ref.schema);
            for (let i = 0; i < ref.count; i++) {
                const id = ref.ids[i];
                expect(back.lookup(id)).toBe(ref.lookup(id));
                expect(back.get(id).params).toBe(ref.get(id).params);
                expect(back.get(id).type).toBe(ref.get(id).type);
            }
            expect(back.lookup(424242)).toBe(-1);
        }
    });

    it('onProgress: lexer hlásí postup po PROGRESS_STEP bajtech (heartbeat workeru)', async () => {
        await load();
        const lineOf = i => `#${String(i).padStart(7, '0')}=IFCCARTESIANPOINT((1234.5678,2345.6789,3456.7890));\n`;
        const lineLen = lineOf(1).length;
        const reps = Math.ceil((2 * PROGRESS_STEP + 1024) / lineLen);
        const parts = new Array(reps);
        for (let i = 0; i < reps; i++) parts[i] = lineOf(i + 1);
        const bytes = enc.encode(wrap(parts.join('')));
        const calls = [];
        const ix = indexStepBytes(bytes, { onProgress: (done, total) => calls.push([done, total]) });
        expect(ix.count).toBe(reps);
        expect(calls.length).toBe(2);
        expect(calls[0][1]).toBe(bytes.length);
        expect(calls[0][0] >= PROGRESS_STEP && calls[0][0] < PROGRESS_STEP + lineLen).toBe(true);
        expect(calls[1][0] >= 2 * PROGRESS_STEP).toBe(true);
    });

    // Drives the real parser worker (same protocol as IfcEngine._parseInWorker).
    function runWorker(payload, transfer) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('../../assets/js/3d/ifc-engine/workers/parser.worker.js', location.href), { type: 'module' });
            const progress = [];
            const timer = setTimeout(() => { worker.terminate(); reject(new Error('worker timeout')); }, 30000);
            worker.onmessage = e => {
                if (e.data && e.data.progress) { progress.push(e.data.done); return; }
                clearTimeout(timer);
                worker.terminate();
                resolve({ msg: e.data, progress });
            };
            worker.onerror = e => { clearTimeout(timer); worker.terminate(); reject(new Error(e.message || 'worker error')); };
            worker.postMessage(payload, transfer);
        });
    }

    it('parser.worker: bajty tam i zpět transferem, index po fromTransferable shodný s Map režimem', async () => {
        await load();
        const text = wrap(SAMPLE);
        const buffer = enc.encode(text).buffer;
        const size = buffer.byteLength;
        const { msg, progress } = await runWorker({ cmd: 'parse', bytes: buffer }, [buffer]);
        expect(buffer.byteLength).toBe(0); // transferred away
        expect(progress.length).toBe(0); // below PROGRESS_STEP: no heartbeat, result only
        expect(msg.ok).toBe(true);
        expect(msg.bytes instanceof ArrayBuffer).toBe(true);
        expect(msg.bytes.byteLength).toBe(size);
        const ix = StepByteIndex.fromTransferable(msg.bytes, msg.fields);
        const byStore = new EntityIndex(ix);
        const byMap = new EntityIndex(parseStepText(text).entities);
        expect(ix.schema).toBe('IFC4');
        expect(ix.viewDefinitions.join(',')).toBe('ReferenceView');
        expect(rows(byStore).join('\n')).toBe(rows(byMap).join('\n'));
        expect(JSON.stringify(byStore.stats())).toBe(JSON.stringify(byMap.stats()));
        expect(byStore.compact()).toBe(byMap.compact());
        expect(rows(byStore).join('\n')).toBe(rows(byMap).join('\n'));
    });

    it('parser.worker: legacy text vstup a heartbeat nad PROGRESS_STEP', async () => {
        await load();
        const lineOf = i => `#${String(i).padStart(7, '0')}=IFCCARTESIANPOINT((1.,2.,3.));\n`;
        const reps = Math.ceil((PROGRESS_STEP + 4096) / lineOf(1).length);
        const parts = new Array(reps);
        for (let i = 0; i < reps; i++) parts[i] = lineOf(i + 1);
        const text = wrap(parts.join(''));
        const { msg, progress } = await runWorker({ cmd: 'parse', text });
        expect(msg.ok).toBe(true);
        expect(progress.length).toBe(1);
        expect(progress[0] >= PROGRESS_STEP).toBe(true);
        expect(StepByteIndex.fromTransferable(msg.bytes, msg.fields).count).toBe(reps);
    });

    it('parser.worker: neznámý příkaz a špatný vstup vrací ok:false', async () => {
        await load();
        expect((await runWorker({ cmd: 'nope' })).msg.ok).toBe(false);
        const bad = await runWorker({ cmd: 'parse', bytes: 42 });
        expect(bad.msg.ok).toBe(false);
        expect(bad.msg.error.includes('expected bytes')).toBe(true);
    });
});
