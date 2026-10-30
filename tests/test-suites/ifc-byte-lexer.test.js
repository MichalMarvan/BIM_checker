/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-byte-lexer — indexování STEP nad bajty (parita s parseStepText)', () => {
    let indexStepBytes, LazyEntity, parseStepText;
    const enc = new TextEncoder();
    const wrap = data => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2, Alignment-basedView]'),'2;1');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`;

    async function load() {
        if (!indexStepBytes) {
            ({ indexStepBytes, LazyEntity } = await import('../../assets/js/3d/ifc-engine/parser/byte-lexer.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        }
    }
    async function index(text, opts = { lines: true }) {
        await load();
        return indexStepBytes(enc.encode(text), opts);
    }
    const idx = data => index(wrap(data));

    /** Shodnost indexu s parseStepText nad stejným textem (počet, pořadí, typ, params, diagnostika). */
    async function expectParity(text, opts = { lines: true }) {
        await load();
        const bytes = enc.encode(text);
        const ix = indexStepBytes(bytes, opts);
        const ref = parseStepText(new TextDecoder('utf-8').decode(bytes));
        expect(ix.count).toBe(ref.entities.size);
        let pos = 0;
        for (const [id, e] of ref.entities) {
            const j = ix.lookup(id);
            expect(j).toBe(pos);
            expect(ix.typeName(j)).toBe(e.type);
            expect(ix.paramsString(j)).toBe(e.params);
            if (opts.lines) {
                expect(ix.lines[j]).toBe(e.line);
            }
            pos++;
        }
        for (const k of ['invalidRecordCount', 'duplicateIdCount', 'complexRecordCount', 'commentCount']) {
            expect(ix.diagnostics[k]).toBe(ref.diagnostics[k]);
        }
        expect(JSON.stringify(ix.diagnostics.unterminatedRecord)).toBe(JSON.stringify(ref.diagnostics.unterminatedRecord));
        if (opts.lines) {
            expect(JSON.stringify(ix.diagnostics.invalidRecords)).toBe(JSON.stringify(ref.diagnostics.invalidRecords));
            expect(JSON.stringify(ix.diagnostics.duplicateIds)).toBe(JSON.stringify(ref.diagnostics.duplicateIds));
        }
        expect(ix.schema).toBe(ref.schema);
        expect(JSON.stringify(ix.viewDefinitions)).toBe(JSON.stringify(ref.viewDefinitions));
        return ix;
    }

    it('dvě entity na jednom řádku', async () => {
        const r = await idx("#1=IFCWALL('a');#2=IFCSLAB('b');");
        expect(r.count).toBe(2);
        expect(r.get(1).params).toBe("'a'");
        expect(r.get(2).type).toBe('IFCSLAB');
        await expectParity(wrap("#1=IFCWALL('a');#2=IFCSLAB('b');"));
    });
    it('dvě entity na dvou řádcích, pořadí a lookup', async () => {
        const r = await idx("#1=IFCWALL('a');\n#2=IFCSLAB('b');");
        expect(r.lookup(1)).toBe(0);
        expect(r.lookup(2)).toBe(1);
        expect(r.lookup(3)).toBe(-1);
        expect(r.has(2)).toBe(true);
        expect(r.get(3)).toBe(undefined);
    });
    it('schema a viewDefinitions z HEADER', async () => {
        const r = await idx("#1=IFCWALL('a');");
        expect(r.schema).toBe('IFC4');
        expect(r.viewDefinitions.join('|')).toBe('ReferenceView_V1.2|Alignment-basedView');
    });
    it('komentář v parametrech se odstraní (líně při dekódování)', async () => {
        const r = await idx("#1=IFCWALL('a',/* kom */$);");
        expect(r.get(1).params).toBe("'a',$");
        expect(r.diagnostics.commentCount).toBe(1);
        expect(r.flags[0] & 1).toBe(1);
        await expectParity(wrap("#1=IFCWALL('a',/* kom */$);"));
    });
    it('středník, apostrof a /* */ uvnitř řetězce zůstávají', async () => {
        const r = await idx("#1=IFCLABEL('it''s /* ne komentář */ ; tady');");
        expect(r.get(1).params).toBe("'it''s /* ne komentář */ ; tady'");
        expect(r.diagnostics.commentCount).toBe(0);
        expect(r.flags[0]).toBe(0);
    });
    it('středník v řetězci neukončí záznam', async () => {
        const r = await idx("#1=IFCWALL('a);b');");
        expect(r.get(1).params).toBe("'a);b'");
    });
    it('mezera mezi typem a "(" a před "="', async () => {
        const r = await idx('#1 = IFCFACETEDBREP (#2);');
        expect(r.get(1).type).toBe('IFCFACETEDBREP');
        expect(r.get(1).params).toBe('#2');
    });
    it('komentář za středníkem na řádku entity', async () => {
        const r = await idx('#1=IFCDIRECTION((1.,0.,0.));     /* poznámka */\n#2=IFCDIRECTION((0.,1.,0.));');
        expect(r.count).toBe(2);
        expect(r.get(1).params).toBe('(1.,0.,0.)');
    });
    it('zakomentovaný trojúhelník v CoordIndex', async () => {
        const r = await idx('#1=IFCTRIANGULATEDFACESET(#9,$,.T.,((1,3,2),/*(2,3,4),*/(2,3,6)),$);');
        expect(r.get(1).params).toBe('#9,$,.T.,((1,3,2),(2,3,6)),$');
    });
    it('číslo řádku entity za komentářovým řádkem a víceřádková entita', async () => {
        const text = wrap("/* poznámka */\n#10= IFCRELDECLARES ('x',\n  $);\n#11=IFCSLAB($);");
        const r = await expectParity(text);
        expect(r.get(10).line).toBe(8);
        expect(r.get(10).params).toBe("'x',$");
        expect(r.get(11).line).toBe(10);
    });
    it('víceřádková entita: newline + okolní mezery se odstraní i uvnitř řetězce (parita)', async () => {
        const text = wrap("#1=IFCWALL(\n  'a\n  b',\n  $\n);\n#2=IFCSLAB($);");
        const r = await expectParity(text);
        expect(r.get(1).params).toBe("'ab',$");
    });
    it('bez opts.lines je line -1 a lines null', async () => {
        const r = await index(wrap("#1=IFCWALL('a');"), {});
        expect(r.lines).toBe(null);
        expect(r.get(1).line).toBe(-1);
    });
    it('neuzavřená entita se ohlásí a další zůstane zachována', async () => {
        const text = wrap("#1=IFCWALL('a'\n#2=IFCSLAB('b');\n#3=IFCBEAM('c');");
        const r = await expectParity(text);
        expect(r.has(2)).toBe(true);
        expect(r.has(3)).toBe(true);
        expect(r.has(1)).toBe(false);
        expect(r.diagnostics.invalidRecordCount).toBe(1);
    });
    it('komplexní entita a smetí se ohlásí, zbytek se zachová', async () => {
        const text = wrap('#1=(IFCA()IFCB());\nSMETI;\n#2=IFCWALL($);');
        const r = await expectParity(text);
        expect(r.has(2)).toBe(true);
        expect(r.has(1)).toBe(false);
        expect(r.diagnostics.complexRecordCount).toBe(1);
        expect(r.diagnostics.invalidRecordCount).toBe(1);
    });
    it('záznam bez ID (bez #) se ohlásí jako neplatný', async () => {
        const text = wrap("#1=IFCWALL('a');\nIFCSLAB('b');\n#3=IFCBEAM('c');");
        const r = await expectParity(text);
        expect(r.count).toBe(2);
        expect(r.diagnostics.invalidRecordCount).toBe(1);
        expect(r.diagnostics.invalidRecords[0].text).toBe("IFCSLAB('b')");
    });
    it('duplicitní ID se ohlásí, platí poslední, pořadí jako Map', async () => {
        const text = wrap("#1=IFCWALL('a');\n#2=IFCDOOR($);\n#1=IFCSLAB('b');");
        const r = await expectParity(text);
        expect(r.count).toBe(2);
        expect(r.diagnostics.duplicateIdCount).toBe(1);
        expect(r.get(1).type).toBe('IFCSLAB');
        expect(r.lookup(1)).toBe(0);
        expect(r.lookup(2)).toBe(1);
    });
    it('CRLF konce řádků', async () => {
        const text = wrap("#1=IFCWALL('a');\r\n#2=IFCSLAB('b');\r\n");
        const r = await expectParity(text);
        expect(r.count).toBe(2);
        expect(r.get(2).line).toBe(8);
    });
    it('UTF-8 BOM na začátku souboru se přeskočí', async () => {
        const r = await index('﻿' + wrap("#1=IFCWALL('a');"));
        expect(r.count).toBe(1);
        expect(r.schema).toBe('IFC4');
        await expectParity('﻿' + wrap("#1=IFCWALL('a');"));
    });
    it('holý fragment bez DATA se parsuje beze smetí v diagnostice', async () => {
        const r = await index("#1=IFCWALL('a');\n#2=IFCSLAB('b');");
        expect(r.count).toBe(2);
        expect(r.diagnostics.invalidRecordCount).toBe(0);
        expect(r.schema).toBe('UNKNOWN');
        await expectParity("#1=IFCWALL('a');\n#2=IFCSLAB('b');");
    });
    it('prázdné parametry, prázdná pole a vnořené seznamy', async () => {
        const text = wrap("#1=IFCX();\n#2=IFCY($,,'');\n#3=IFCZ(((1,2),(3,(4,5))),#1);");
        const r = await expectParity(text);
        expect(r.get(1).params).toBe('');
        expect(r.paramsLen[0]).toBe(0);
        expect(r.get(2).params).toBe("$,,''");
        expect(r.get(3).params).toBe('((1,2),(3,(4,5))),#1');
    });
    it('IFC escapy \\X2\\ a vícebajtové UTF-8 v řetězci zůstávají RAW', async () => {
        const text = wrap("#1=IFCWALL('Budova \\X2\\017D\\X0\\','P\\X\\E9','příliš žluťoučký kůň');");
        const r = await expectParity(text);
        expect(r.get(1).params).toBe("'Budova \\X2\\017D\\X0\\','P\\X\\E9','příliš žluťoučký kůň'");
        expect(r.paramsLen[0] > r.get(1).params.length).toBe(true);
    });
    it('malá písmena v názvu typu se normalizují', async () => {
        const r = await idx('#1=ifcDirection((0.,0.,1.));');
        expect(r.get(1).type).toBe('IFCDIRECTION');
        expect(r.typeNames.length).toBe(1);
    });
    it('typ přerušený newlinem se spojí stejně jako v parseStepText', async () => {
        const text = wrap("#1=IFC\nWALL('a');\n#12\n=IFCSLAB($);");
        const r = await expectParity(text);
        expect(r.get(1).type).toBe('IFCWALL');
        expect(r.has(12)).toBe(true);
    });
    it('neukončený záznam na konci souboru se ohlásí', async () => {
        const text = "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCWALL('a');\n#2=IFCSLAB('b'";
        const r = await expectParity(text);
        expect(r.count).toBe(1);
        expect(r.diagnostics.unterminatedRecord.text).toBe("#2=IFCSLAB('b'");
    });
    it('ENDSEC ukončí DATA; druhá DATA sekce se čte jen s allDataSections', async () => {
        const text = "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCWALL('a');\nENDSEC;\nDATA;\n#2=IFCSLAB('b');\nENDSEC;\nEND-ISO-10303-21;";
        const r = await expectParity(text);
        expect(r.count).toBe(1);
        const all = await index(text, { lines: true, allDataSections: true });
        expect(all.count).toBe(2);
        expect(all.get(2).params).toBe("'b'");
        expect(all.get(2).line).toBe(9);
    });
    it('ENDSEC uvnitř řetězce ani jako část delšího tokenu neukončí sekci', async () => {
        const text = wrap("#1=IFCWALL('ENDSEC;');\n#2=IFCSLAB($);");
        const r = await expectParity(text);
        expect(r.count).toBe(2);
    });
    it('typované sloupce jsou oříznuté na count a lookup je hustý pro husté ID', async () => {
        const r = await idx("#1=IFCWALL('a');\n#2=IFCSLAB($);\n#3=IFCBEAM($);");
        expect(r.ids.length).toBe(3);
        expect(r.typeIdx.length).toBe(3);
        expect(r.paramsStart.length).toBe(3);
        expect(r.paramsLen.length).toBe(3);
        expect(r.flags.length).toBe(3);
        expect(r.lookupKind).toBe('dense');
        expect(r.maxId).toBe(3);
        expect(Array.from(r.ids).join(',')).toBe('1,2,3');
    });
    it('řídké ID přepnou lookup na Map', async () => {
        const r = await idx("#1=IFCWALL('a');\n#90000=IFCSLAB($);");
        expect(r.lookupKind).toBe('map');
        expect(r.lookup(90000)).toBe(1);
        expect(r.lookup(5)).toBe(-1);
        expect(r.lookup(-1)).toBe(-1);
    });
    it('růst polí: více entit než počáteční kapacita', async () => {
        const n = 3000;
        let data = '';
        for (let i = 1; i <= n; i++) {
            data += `#${i}=IFCCARTESIANPOINT((${i}.,0.,0.));\n`;
        }
        const r = await expectParity(wrap(data));
        expect(r.count).toBe(n);
        expect(r.get(n).params).toBe(`(${n}.,0.,0.)`);
    });
    it('LazyEntity má tvar RawEntity a dekóduje params líně', async () => {
        const r = await idx("#7=IFCWALL('a',#1);");
        const e = r.get(7);
        expect(e instanceof LazyEntity).toBe(true);
        expect(e.expressId).toBe(7);
        expect(e.type).toBe('IFCWALL');
        expect(e.params).toBe("'a',#1");
        expect(e.line).toBe(7);
        expect(r.entity(0).expressId).toBe(7);
        expect([...r.entities()].length).toBe(1);
    });
    it('Buffer/ArrayBuffer vstup se převede na Uint8Array', async () => {
        await load();
        const bytes = enc.encode(wrap("#1=IFCWALL('a');"));
        const r = indexStepBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        expect(r.count).toBe(1);
        expect(r.get(1).params).toBe("'a'");
    });

    describe('diferenciální test proti parseStepText na tests/fixtures/ifc-corpus', () => {
        const FIXTURES = [
            'basin-faceted-brep', 'basin-tessellation', 'bath-csg-solid', 'beam-revolved-solid', 'brep-model',
            'csg-primitive', 'cube-advanced-brep', 'curve-parameters-in-degrees', 'extruded-solid',
            'fixed-reference-swept-area-solid', 'mapped-shape-with-transformation',
            'pass-als006-alignment_horizontal_shape_representation', 'pass-gem001-brep_model',
            'polygonal-face-tessellation', 'sectioned-solid-horizontal', 'slab-openings', 'surface-model',
            'synthetic-tokenizer-edge-cases', 'triangulated-item'
        ];
        for (const name of FIXTURES) {
            it(`${name}.ifc — stejný počet, pořadí, typy, params a diagnostika`, async () => {
                await load();
                const res = await fetch(`fixtures/ifc-corpus/${name}.ifc`);
                expect(res.ok).toBe(true);
                const bytes = new Uint8Array(await res.arrayBuffer());
                const ix = indexStepBytes(bytes, { lines: true });
                const ref = parseStepText(new TextDecoder('utf-8').decode(bytes));
                expect(ix.count).toBe(ref.entities.size);
                expect(ix.count > 0).toBe(true);
                let pos = 0;
                let mismatches = 0;
                for (const [id, e] of ref.entities) {
                    const j = ix.lookup(id);
                    if (j !== pos || ix.typeName(j) !== e.type || ix.paramsString(j) !== e.params || ix.lines[j] !== e.line) {
                        mismatches++;
                    }
                    pos++;
                }
                expect(mismatches).toBe(0);
                expect(ix.schema).toBe(ref.schema);
                expect(JSON.stringify(ix.viewDefinitions)).toBe(JSON.stringify(ref.viewDefinitions));
                for (const k of ['invalidRecordCount', 'duplicateIdCount', 'complexRecordCount', 'commentCount']) {
                    expect(ix.diagnostics[k]).toBe(ref.diagnostics[k]);
                }
                expect(JSON.stringify(ix.diagnostics.invalidRecords)).toBe(JSON.stringify(ref.diagnostics.invalidRecords));
                expect(JSON.stringify(ix.diagnostics.unterminatedRecord)).toBe(JSON.stringify(ref.diagnostics.unterminatedRecord));
            });
        }
    });
});
