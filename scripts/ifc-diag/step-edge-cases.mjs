// Regresní fixtury STEP lexeru (parseStepText). Spuštění: node scripts/ifc-diag/step-edge-cases.mjs
import { parseStepText } from '../../assets/js/3d/ifc-engine/parser/step-parser.js';

const wrap = d => `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${d}\nENDSEC;\nEND-ISO-10303-21;`;
let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + detail}`);
  if (!cond) failed++;
};
const parse = d => parseStepText(wrap(d));
const ids = r => [...r.entities.keys()].join(',');

{
  const r = parse("#1=IFCWALL('a');\n#2=IFCSLAB('b');");
  check('STEP-001 dvě entity na dvou řádcích', r.entities.size === 2, ids(r));
}
{
  const r = parse("#1=IFCWALL('a');#2=IFCSLAB('b');");
  check('STEP-002 dvě entity na jednom řádku', r.entities.size === 2 && r.entities.get(1).params === "'a'", JSON.stringify([...r.entities.values()]));
}
{
  const r = parse("#1=IFCWALL('a',/* kom */$);");
  check('STEP-003 komentář v parametrech je odstraněn', r.entities.get(1)?.params === "'a',$" && r.diagnostics.commentCount === 1, r.entities.get(1)?.params);
}
{
  const r = parse("#1=IFCWALL('a);b');");
  check('STEP-004 středník v řetězci', r.entities.get(1)?.params === "'a);b'", r.entities.get(1)?.params);
}
{
  const r = parse("#1=IFCWALL('a'\n#2=IFCSLAB('b');\n#3=IFCBEAM('c');");
  check('STEP-005 neuzavřená entita se ohlásí (INVALID) a neukradne další', r.entities.has(3) && r.diagnostics.invalidRecordCount >= 1, `ids=${ids(r)} invalid=${r.diagnostics.invalidRecordCount}`);
}
{
  const r = parse("#1= IFCFACETEDBREP (#2);");
  check('mezera před "(" (brep-model.ifc z buildingSMART)', r.entities.get(1)?.type === 'IFCFACETEDBREP' && r.entities.get(1).params === '#2', ids(r));
}
{
  const r = parse("#1=IFCDIRECTION((1.,0.,0.));     /* poznámka za středníkem */\n#2=IFCDIRECTION((0.,1.,0.));");
  check('komentář za ; na řádku entity (beam-parametric-cross-section.ifc)', r.entities.size === 2, ids(r));
}
{
  const r = parse("#1=IFCTRIANGULATEDFACESET(#9,$,.T.,((1,3,2),/*(2,3,4),*/(2,3,6)),$);");
  check('zakomentovaný trojúhelník v CoordIndex (geographic-referencing)', r.entities.get(1)?.params === '#9,$,.T.,((1,3,2),(2,3,6)),$', r.entities.get(1)?.params);
}
{
  const r = parse("/* proxy type ---- */\n#10200= IFCRELDECLARES ('x',$,$,$,#100,(#5000));");
  check('komentářový řádek před entitou + mezera před "(" (mapped-shape)', r.entities.get(10200)?.type === 'IFCRELDECLARES' && r.entities.get(10200).line === 7, `line=${r.entities.get(10200)?.line}`);
}
{
  const r = parse("#1=IFCLABEL('it''s /* ne komentář */ ; tady');");
  check("'' a /* */ uvnitř řetězce zůstávají", r.entities.get(1)?.params === "'it''s /* ne komentář */ ; tady'" && r.diagnostics.commentCount === 0, r.entities.get(1)?.params);
}
{
  const r = parse("#1=IFCWALL(\n  'a',\n  $\n);\n#2=IFCSLAB($);");
  check('víceřádková entita', r.entities.get(1)?.params === "'a',$" && r.entities.get(1).line === 6 && r.entities.get(2).line === 10, JSON.stringify([r.entities.get(1), r.entities.get(2)]));
}
{
  const r = parse("#1=(IFCA()IFCB());\n#2=IFCWALL($);");
  check('komplexní entita se ohlásí, ostatní se zachovají', r.diagnostics.complexRecordCount === 1 && r.entities.has(2) && !r.entities.has(1), JSON.stringify(r.diagnostics));
}
{
  const r = parse("#1=IFCWALL('a');\n#1=IFCSLAB('b');");
  check('duplicitní ID se ohlásí', r.diagnostics.duplicateIdCount === 1 && r.entities.get(1).type === 'IFCSLAB', JSON.stringify(r.diagnostics.duplicateIds));
}
{
  const r = parseStepText("#1=IFCWALL('a');\n#2=IFCSLAB('b');");
  check('holý fragment bez HEADER/DATA (testovací fixtury)', r.entities.size === 2 && r.diagnostics.invalidRecordCount === 0, ids(r));
}
{
  const r = parse("#1=IFCWALL('a');\nGARBAGE LINE;\n#2=IFCSLAB('b');");
  check('smetí v DATA se ohlásí a neshodí zbytek', r.entities.size === 2 && r.diagnostics.invalidRecordCount === 1, JSON.stringify(r.diagnostics.invalidRecords));
}
{
  const r = parse("#1=IFCWALL('a');\r\n#2=IFCSLAB('b');\r\n");
  check('CRLF konce řádků', r.entities.size === 2 && r.entities.get(2).line === 7, JSON.stringify(r.entities.get(2)));
}

console.log(failed === 0 ? '\nVŠE OK' : `\nSELHÁNÍ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
