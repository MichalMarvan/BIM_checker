/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Parita tří STEP tokenizerů: parseStepText/splitParams (3d/ifc-engine/parser/step-parser.js)
// je jádro pravdy; IFCParserCore._buildEntityMap/_splitParams (common/ifc-parser-core.js)
// a IFCStreamParser (common/ifc-stream-parser.js) musí dávat stejné entity a stejné položky.
describe('ifc-parser-parity — step-parser vs IFCParserCore vs IFCStreamParser', () => {
    let step;
    async function mod() {
        if (!step) step = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js');
        return step;
    }
    const wrap = data => `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`;

    function streamEntities(text, chunkSize) {
        const out = new Map();
        const parser = new IFCStreamParser({ onEntity: e => out.set(e.id, e) });
        parser.parseText(text, chunkSize);
        return out;
    }

    // Vrátí seznam rozdílů (prázdný = shoda) pro daný DATA obsah.
    async function diff(data, chunkSize = 5) {
        const { parseStepText, splitParams } = await mod();
        const text = wrap(data);
        const ref = parseStepText(text).entities;
        const core = IFCParserCore._buildEntityMap(text);
        const stream = streamEntities(text, chunkSize);
        const probe = new IFCStreamParser();
        const problems = [];
        if (core.size !== ref.size) problems.push(`core count ${core.size} != ${ref.size}`);
        if (stream.size !== ref.size) problems.push(`stream count ${stream.size} != ${ref.size}`);
        for (const [id, e] of ref) {
            const c = core.get(String(id));
            if (!c) { problems.push(`core missing #${id}`); continue; }
            if (c.type !== e.type) problems.push(`core type #${id} ${c.type} != ${e.type}`);
            if (c.params !== e.params) problems.push(`core params #${id} ${JSON.stringify(c.params)} != ${JSON.stringify(e.params)}`);
            const a = splitParams(e.params);
            const b = IFCParserCore._splitParams(c.params);
            if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`core split #${id} ${JSON.stringify(b)} != ${JSON.stringify(a)}`);
            const s = stream.get(id);
            if (!s) { problems.push(`stream missing #${id}`); continue; }
            if (s.type !== e.type) problems.push(`stream type #${id} ${s.type} != ${e.type}`);
            const expected = JSON.stringify(a.map(p => probe.parseValue(p)).map(v => v === undefined ? '*' : v));
            const actual = JSON.stringify(s.arguments.map(v => v === undefined ? '*' : v));
            if (expected !== actual) problems.push(`stream args #${id} ${actual} != ${expected}`);
        }
        return problems;
    }

    it('komentář s # před záznamem neztratí následující entitu', async () => {
        const { parseStepText } = await mod();
        const data = "/* ------- Container within IFCSITE(#30) ------- */\n#37=IFCRELAGGREGATES('g',#7,$,$,#30,(#34));\n#38=IFCSITE('s');";
        expect(parseStepText(wrap(data)).entities.size).toBe(2);
        expect(IFCParserCore._buildEntityMap(wrap(data)).size).toBe(2);
        expect(streamEntities(wrap(data), 5).size).toBe(2);
        expect(JSON.stringify(await diff(data))).toBe('[]');
    });

    it('komentář uvnitř parametrů se vyřízne ve všech parserech', async () => {
        const data = "#1=IFCTRIANGULATEDFACESET(#9,$,.T.,((1,3,2),/*(2,3,4),*/(2,3,6)),$);";
        expect(JSON.stringify(await diff(data))).toBe('[]');
        expect(IFCParserCore._buildEntityMap(wrap(data)).get('1').params).toBe('#9,$,.T.,((1,3,2),(2,3,6)),$');
    });

    it('řetězec končící \\X0\\ (backslash před uvozovkou) a středník v řetězci', async () => {
        const data = "#1=IFCPROPERTYSINGLEVALUE('S\\X2\\017D\\X0\\',$,IFCTEXT('a;b'),$);\n#2=IFCLABEL('it''s; /* ne */ x');";
        expect(JSON.stringify(await diff(data))).toBe('[]');
        const s = streamEntities(wrap(data), 3);
        expect(s.get(1).arguments.length).toBe(4);
        expect(s.get(2).arguments[0]).toBe("it's; /* ne */ x");
    });

    it('víceřádkový záznam a řetězec rozdělený koncem řádku se spojí stejně', async () => {
        const data = "#92=IFCPROJECT('g',#20,'Pozemn\\X\\ED stavby',$,$,'Novostavba (mimo)-\nPraha-Leti',\n  'Stav',(#87),#84);";
        expect(JSON.stringify(await diff(data))).toBe('[]');
        const core = IFCParserCore._buildEntityMap(wrap(data)).get('92');
        expect(IFCParserCore._splitParams(core.params)[5]).toBe("'Novostavba (mimo)-Praha-Leti'");
    });

    it('dvě entity na jednom řádku, mezera před "(", malá písmena v typu', async () => {
        const data = "#1= IFCFACETEDBREP (#2);#2=ifcClosedShell((#3));";
        expect(JSON.stringify(await diff(data))).toBe('[]');
        expect(IFCParserCore._buildEntityMap(wrap(data)).get('2').type).toBe('IFCCLOSEDSHELL');
    });

    it('prázdné položky zachovávají pozice atributů: (a,,b), ($,*), ()', async () => {
        const { splitParams } = await mod();
        expect(JSON.stringify(splitParams('a,,b'))).toBe('["a","","b"]');
        expect(JSON.stringify(splitParams('$,*'))).toBe('["$","*"]');
        expect(JSON.stringify(splitParams('(a,,b),,'))).toBe('["(a,,b)","",""]');
        expect(JSON.stringify(splitParams(''))).toBe('[]');
        expect(JSON.stringify(splitParams('  '))).toBe('[]');
        expect(JSON.stringify(IFCParserCore._splitParams('a,,b'))).toBe('["a","","b"]');
        expect(JSON.stringify(IFCParserCore._splitParams(''))).toBe('[]');
        const data = "#1=IFCWALL('g',,'Wall',$,*,#5);\n#2=IFCOPENSHELL();";
        expect(JSON.stringify(await diff(data))).toBe('[]');
        const s = streamEntities(wrap(data), 4);
        expect(s.get(1).arguments.length).toBe(6);
        expect(s.get(1).arguments[2]).toBe('Wall');
        expect(s.get(2).arguments.length).toBe(0);
    });

    it('záznam bez ");" spolkne další entitu — hlava se zahodí, zbytek zůstane', async () => {
        const { parseStepText } = await mod();
        const data = "#1=IFCWALL('a'\n#2=IFCSLAB('b');\n#3=IFCBEAM('c');";
        const ref = parseStepText(wrap(data)).entities;
        expect(ref.has(2)).toBe(true);
        expect(ref.has(3)).toBe(true);
        expect(JSON.stringify(await diff(data))).toBe('[]');
    });

    it('komplexní instance #1=(A()B()) a záznamy bez # se shodně ignorují, ENDSEC ukončuje sekci', async () => {
        const data = "#1=(IFCA(1)IFCB(2));\nSOMETHING;\n#2=IFCWALL('a');\nENDSEC;\n#3=IFCBEAM('x');";
        const { parseStepText } = await mod();
        expect(parseStepText(wrap(data)).entities.size).toBe(1);
        expect(JSON.stringify(await diff(data))).toBe('[]');
    });

    it('stream parser dává stejný výsledek nezávisle na velikosti kusu', async () => {
        const data = "#1=IFCWALL('it''s',/* k */$,'\\X2\\00E1\\X0\\');\n#2=IFCSLAB((1.,2.),#1);";
        for (const size of [1, 2, 3, 7, 64, 100000]) {
            expect(JSON.stringify(await diff(data, size))).toBe('[]');
        }
    });

    it('collectStatements vrací záznamy ukončené středníkem (zpětná kompatibilita)', () => {
        const stmts = IFCParserCore._collectStatements(wrap("#1=IFCWALL('a');/* #9 */\n#2=IFCSLAB('b');"));
        expect(stmts.length).toBe(2);
        expect(stmts[0]).toBe("#1=IFCWALL('a');");
        expect(stmts[1]).toBe("#2=IFCSLAB('b');");
    });
});
