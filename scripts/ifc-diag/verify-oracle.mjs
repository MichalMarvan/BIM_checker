// Run only on ThinkPad. Analytic placement/units fixtures, plus matching edge cases.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';
import { bboxDeviation, compareProducts } from './oracle-compare.mjs';

const dir = path.resolve('test-results/ifc-diagnostics/oracle-verification');
mkdirSync(dir, { recursive: true });
const fixture = unit => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('oracle analytic fixture'),'2;1');
FILE_NAME('oracle.ifc','2026-10-29T00:00:00',('test'),('test'),'test','test','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0000000000000000000001',$,'project',$,$,$,$,(#12),#2);
#2=IFCUNITASSIGNMENT((#3));
${unit}
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.00001,#11,$);
#20=IFCCARTESIANPOINT((100.,200.,300.));
#21=IFCAXIS2PLACEMENT3D(#20,$,$);
#22=IFCLOCALPLACEMENT($,#21);
#23=IFCCARTESIANPOINT((7.,11.,13.));
#24=IFCDIRECTION((0.,0.,1.));
#25=IFCDIRECTION((0.,1.,0.));
#26=IFCAXIS2PLACEMENT3D(#23,#24,#25);
#27=IFCLOCALPLACEMENT(#22,#26);
#30=IFCCARTESIANPOINTLIST3D(((1000010.,20.,30.),(1000011.,20.,30.),(1000010.,21.,32.)));
#31=IFCTRIANGULATEDFACESET(#30,$,.F.,((1,2,3)),$);
#32=IFCSHAPEREPRESENTATION(#12,'Body','Tessellation',(#31));
#33=IFCREPRESENTATIONMAP(#11,#32);
#34=IFCCARTESIANPOINT((5.,0.,0.));
#35=IFCDIRECTION((-1.,0.,0.));
#36=IFCCARTESIANTRANSFORMATIONOPERATOR3D(#25,#35,#34,2.,#24);
#37=IFCMAPPEDITEM(#33,#36);
#38=IFCSHAPEREPRESENTATION(#12,'Body','MappedRepresentation',(#37));
#39=IFCPRODUCTDEFINITIONSHAPE($,$,(#38));
#40=IFCWALL('0000000000000000000040',$,'wall',$,$,#27,#39,$,.NOTDEFINED.);
#41=IFCSPACE('0000000000000000000041',$,'hidden space',$,$,#27,#39,$,.ELEMENT.,.INTERNAL.,$);
ENDSEC;
END-ISO-10303-21;
`;
const cases = [
  ['millimetres', '#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);', 0.001],
  ['metres', '#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);', 1],
  ['feet', "#3=IFCCONVERSIONBASEDUNIT(#6,.LENGTHUNIT.,'FOOT',#4);\n#4=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#5);\n#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);\n#6=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);", 0.3048],
];
const inputs = cases.flatMap(([name, unit]) => ['rotated', 'plain'].map(mode => {
  const file = path.join(dir, name + '-' + mode + '.ifc');
  const data = mode === 'rotated' ? fixture(unit) : fixture(unit).replace('OPERATOR3D(#25,#35,#34,2.,#24)', 'OPERATOR3D($,$,#34,2.,$)');
  writeFileSync(file, data); return file;
}));
const out = path.join(dir, 'analytic');
const run = spawnSync(process.execPath, ['scripts/ifc-diag/oracle-compare.mjs', ...inputs, inputs[0], `--out=${out}`], { encoding: 'utf8', timeout: 120000 });
assert.equal(run.status, 0, run.stdout + run.stderr);
const summary = JSON.parse(readFileSync(path.join(out, 'summary.json')));
assert.equal(summary.files.length, 6, 'deduplicate input files');
const observedDisagreements = [];
for (const file of summary.files) {
  const scale = cases.find(([name]) => path.basename(file.file).startsWith(name + '-'))[2];
  const rotated = file.file.endsWith('-rotated.ifc');
  const detail = JSON.parse(readFileSync(path.join(out, file.artifacts.comparison)));
  assert.equal(detail.counts.matched, 1);
  if (!rotated) assert.equal(detail.counts.overThreshold, 0);
  assert.equal(detail.counts.onlyWebIfc, 1, 'web-ifc includes hidden IfcSpace');
  assert.equal(detail.comparison.onlyWebIfc[0].counterpart.status, 'VIEWER_HIDDEN');
  const row = detail.comparison.matched[0];
  // Derived by hand: parent translation × child quarter turn × mapped quarter
  // turn/scale/translation: (107-2*x, 216-2*y, 313+2*z), then length units.
  const expected = (rotated ? [-1999915, 174, 373, -1999913, 176, 377] : [65, 2000236, 373, 67, 2000238, 377]).map(x => x * scale);
  for (const side of ['ours', 'webIfc']) {
    assert.equal(row[side].triangles, 1);
    // The oracle must expose existing engine bugs, not require both engines
    // to agree. Independently test the browser measuring function below.
    if (side === 'ours' && rotated) continue;
    row[side].bboxWorld.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-6, `${side} ${file.file}: ${v} != ${expected[i]}`));
  }
  if (row.exceedsThreshold) observedDisagreements.push({ file: file.file, guid: row.guid, score: row.score });
}

// Exercise the exact browser measureWorld implementation with known matrices
// and a centred buffer, independently of the engine's placement parser.
const sourceRoot = path.resolve('.');
const server = createServer((req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><script type="importmap">{"imports":{"three":"/assets/js/vendor/three/three.module.js"}}</script>'); return; }
    const file = path.resolve(sourceRoot, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(sourceRoot + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const measured = await page.evaluate(async () => {
    const THREE = await import('three');
    const { measureWorld } = await import('/scripts/ifc-diag/oracle-page.mjs');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 2], 3));
    geometry.userData.localOrigin = [1000010, 20, 30];
    const turn = new THREE.Matrix4().set(0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const matrix = new THREE.Matrix4().makeTranslation(107, 211, 313).multiply(turn);
    const parentMatrix = new THREE.Matrix4().makeTranslation(5, 0, 0).multiply(turn).scale(new THREE.Vector3(2, 2, 2));
    return measureWorld({ matrix, items: [{ bufferGeometry: geometry, parentMatrix }] }, 0.001);
  });
  const expected = [-1999.915, 0.174, 0.373, -1999.913, 0.176, 0.377];
  measured.bboxWorld.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9));
  assert.equal(measured.triangles, 1);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
const row = (guid, box = [0, 0, 0, 1, 0, 0]) => ({ guid, ifcType: 'IFCWALL', status: 'GEOMETRY', triangles: 1, bboxWorld: box });
assert.equal(bboxDeviation([0, 0, 0, 2, 0, 0], [0, 0, 0, 1, 0, 0]).diagonalRelative, 1);
assert.equal(bboxDeviation([1, 0, 0, 2, 0, 0], [0, 0, 0, 1, 0, 0]).centerRelative, 1);
assert.equal(bboxDeviation([0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 0, 0]).score, null);
assert.equal(bboxDeviation([0, 0, 0, 1, 0, 0], [0, 0, 0, 1, 0, 0]).exceedsThreshold, false);
assert.equal(bboxDeviation([0, 0, 0, 1.01, 0, 0], [0, 0, 0, 1, 0, 0], 0.02).exceedsThreshold, false);
assert.equal(bboxDeviation([1, 0, 0, 101, 0, 0], [0, 0, 0, 100, 0, 0]).exceedsThreshold, false, 'exactly 1% is not above threshold');
assert.equal(bboxDeviation([1.001, 0, 0, 101.001, 0, 0], [0, 0, 0, 100, 0, 0]).exceedsThreshold, true);
const comparison = compareProducts([row('duplicate'), row('duplicate'), row(null), row('ours'), row('same')],
  [row('duplicate'), row('web'), row('same')]);
assert.equal(comparison.matched.length, 1);
assert.equal(comparison.ambiguousGuids.length, 1);
assert.equal(comparison.missingGuids.ours.length, 1);
assert.equal(comparison.onlyOurs.length, 1);
assert.equal(comparison.onlyWebIfc.length, 1);
const failed = compareProducts([row('broken')], [{ ...row('broken'), status: 'PRODUCT_ERROR' }]);
assert.equal(failed.matched.length + failed.onlyOurs.length + failed.onlyWebIfc.length, 0);
assert.equal(failed.invalid.webIfc.length, 1);
// A reference-side failure must not look like "only ours", and a later valid
// file must still be compared. Both browser and worker timeouts are killable.
const bad = path.join(dir, 'a-unsupported.ifc');
writeFileSync(bad, fixture(cases[1][1]).replace("FILE_SCHEMA(('IFC4'))", "FILE_SCHEMA(('IFC999'))"));
const failuresOut = path.join(dir, 'failure-continuation');
const failureRun = spawnSync(process.execPath, ['scripts/ifc-diag/oracle-compare.mjs', bad, inputs.find(f => f.endsWith('metres-plain.ifc')), `--out=${failuresOut}`], { encoding: 'utf8', timeout: 60000 });
assert.equal(failureRun.status, 2, failureRun.stdout + failureRun.stderr);
const failureReport = JSON.parse(readFileSync(path.join(failuresOut, 'summary.json')));
assert.equal(failureReport.files[0].status, 'FILE_ERROR');
assert.equal(failureReport.files[1].status, 'COMPLETE');
assert.equal(failureReport.totals.matched, 1);
assert.equal(failureReport.totals.onlyOurs, 0);
const timeoutOut = path.join(dir, 'timeouts');
const timeoutRun = spawnSync(process.execPath, ['scripts/ifc-diag/oracle-compare.mjs', inputs[0], '--timeout=0.001', `--out=${timeoutOut}`], { encoding: 'utf8', timeout: 30000 });
assert.equal(timeoutRun.status, 2, timeoutRun.stdout + timeoutRun.stderr);
const timeoutReport = JSON.parse(readFileSync(path.join(timeoutOut, 'summary.json')));
assert.equal(timeoutReport.totals.matched, 0);
assert.ok(timeoutReport.files[0].errors.some(e => e.includes('browser timeout')));
assert.ok(timeoutReport.files[0].errors.some(e => e.includes('web-ifc timeout')));
console.log(`PASS: Node/WASM analytic reference + Chromium measurement, nested placement, map scale/rotation/translation, large local origin, mm/m/feet, hidden spaces, GUID and metric edge cases. Observed engine disagreements: ${observedDisagreements.length} (reported, not fixed).`);
jsonResult();
function jsonResult() {
  writeFileSync(path.join(dir, 'verification.json'), JSON.stringify({ passed: true, completedAt: new Date().toISOString(), cases: cases.map(([name]) => name), totals: summary.totals, observedDisagreements }, null, 2) + '\n');
}
