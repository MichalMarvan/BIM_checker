// Integration checks against the real browser engine, without changing assets/tests.
// Run on ThinkPad: node scripts/ifc-diag/verify-geometry.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = path.resolve('test-results/ifc-diagnostics/geometry-verification');
mkdirSync(dir, { recursive: true });
const header = "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n";
const end = '\nENDSEC;\nEND-ISO-10303-21;\n';
const base = `
#1=IFCCARTESIANPOINTLIST3D(((10.,20.,30.),(11.,20.,30.),(10.,21.,30.)));
#2=IFCTRIANGULATEDFACESET(#1,$,.F.,((1,2,3)),$);
#3=IFCADVANCEDBREP($);
#4=IFCBOOLEANRESULT(.UNION.,#2,#3);
#5=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(2.,0.,0.)));
#6=IFCTRIANGULATEDFACESET(#5,$,.F.,((1,2,3)),$);
#7=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(0.,1.,NaN)));
#8=IFCTRIANGULATEDFACESET(#7,$,.F.,((1,2,3)),$);
#9=IFCCARTESIANPOINTLIST3D();
#10=IFCTRIANGULATEDFACESET(#9,$,.F.,((1,2,3)),$);
#11=IFCCARTESIANPOINT((100.,200.,300.));
#12=IFCAXIS2PLACEMENT3D(#11,$,$);
#13=IFCLOCALPLACEMENT($,#12);
#14=IFCCARTESIANPOINT((0.,0.,0.));
#15=IFCAXIS2PLACEMENT3D(#14,$,$);
#16=IFCCARTESIANPOINT((5.,0.,0.));
#17=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#16,1.,$);
#18=IFCSHAPEREPRESENTATION($,'Body','Tessellation',(#2));
#19=IFCREPRESENTATIONMAP(#15,#18);
#20=IFCMAPPEDITEM(#19,#17);
`;
let body = base;
const expected = new Map();
function product(id, status, items, { type = 'IFCWALL', rep = true, placement = '$', guid = `'g${id}'` } = {}) {
  const shape = id + 1000, representation = id + 2000;
  body += `\n#${id}=${type}(${guid},$,'name',$,$,${placement},${rep ? '#' + representation : '$'},$);`;
  if (rep) body += `\n#${shape}=IFCSHAPEREPRESENTATION($,'Body','Tessellation',(${items}));\n#${representation}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}));`;
  expected.set(id, status);
}
product(100, 'OK_EXACT', '#2', { placement: '#13', guid: "'O''Brien'" });
product(101, 'OK_APPROXIMATED', '#4');
product(102, 'PARTIAL', '#2,#3');
product(103, 'PARTIAL', '#2,#999999');
product(104, 'UNSUPPORTED_GEOMETRY', '#3');
product(105, 'NO_REPRESENTATION', '', { rep: false, guid: '$' });
product(106, 'FAILED_GEOMETRY', '');
product(107, 'NOT_APPLICABLE', '#2', { type: 'IFCSPACE' });
product(108, 'OK_EXACT', '#6');
product(109, 'OK_EXACT', '#8');
product(110, 'FAILED_GEOMETRY', '#10');
product(111, 'OK_EXACT', '#20');
body += "\n#112=IFCWALL('broken',$,$,$,$,$,#999999,$);";
expected.set(112, 'FAILED_GEOMETRY');
// Mapped recursion cycle must terminate, independently in leaf inventory and engine.
body += "\n#30=IFCREPRESENTATIONMAP(#15,#31);\n#31=IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#32));\n#32=IFCMAPPEDITEM(#30,#17);";
product(113, 'PARTIAL', '#2,#32');
// Exact planar Boolean difference, as opposed to the union fallback above.
body += `
#40=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4.,4.);
#41=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1.,1.);
#42=IFCDIRECTION((0.,0.,1.));
#43=IFCEXTRUDEDAREASOLID(#40,#15,#42,2.);
#44=IFCEXTRUDEDAREASOLID(#41,#15,#42,2.);
#45=IFCBOOLEANRESULT(.DIFFERENCE.,#43,#44);
`;
product(114, 'OK_EXACT', '#45');
const fixture = path.join(dir, 'states.ifc');
writeFileSync(fixture, header + body + end);
function run(inputs, out, args = [], expectedCode = 0) {
  const result = spawnSync(process.execPath, ['scripts/ifc-diag/geometry-diagnose.mjs', ...inputs, `--out=${out}`, ...args],
    { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, expectedCode, result.stderr + result.stdout + String(result.error || ''));
  return JSON.parse(readFileSync(path.join(out, 'summary.json'), 'utf8'));
}
const report = run([fixture, fixture], path.join(dir, 'states'));
assert.equal(report.files.length, 1, 'duplicate paths must be deduplicated');
assert.equal(report.totals.processedProducts, expected.size);
const rows = readFileSync(path.join(dir, 'states', report.files[0].jsonl), 'utf8').trim().split('\n').map(JSON.parse);
const byId = new Map(rows.map(row => [row.expressId, row]));
for (const [id, status] of expected) assert.equal(byId.get(id)?.status, status, `#${id}: ${JSON.stringify(byId.get(id))}`);
assert.equal(byId.get(100).guid, "O'Brien");
assert.equal(byId.get(105).guid, null, 'do not use a later name attribute as GUID');
function near(actual, expected) {
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-5, `${actual} != ${expected}`));
}
near(byId.get(100).bboxLocal, [10, 20, 30, 11, 21, 30]);
near(byId.get(111).bboxLocal, [15, 20, 30, 16, 21, 30]);
assert.equal(byId.get(100).triangles, 1);
assert.equal(byId.get(108).degenerateTriangles, 1);
assert.ok(byId.get(109).nanCount > 0);
assert.equal(byId.get(109).bboxLocal, null);
assert.ok(byId.get(110).reason.startsWith('exception:'));
assert.equal(byId.get(112).reason, 'null-geometry');
assert.ok(byId.get(113).diag.recursion > 0);
assert.equal(byId.get(114).diag.exactBool, 1);
assert.deepEqual(byId.get(101).leafTypes, ['IFCADVANCEDBREP', 'IFCTRIANGULATEDFACESET']);
assert.deepEqual(report.totals.unsupportedTypes, [{ type: 'IFCADVANCEDBREP', count: 2 }], 'ignored Boolean operand must not inflate unsupported counts');
assert.equal(Object.values(report.totals.counts).reduce((a, b) => a + b, 0), rows.length);
console.log(`PASS: ${rows.length} products; all seven statuses, exception/null, mapped bbox, Boolean paths, cycles, NaN, degenerate triangles, GUID, ranking.`);

// Force a file timeout in the same run as a subsequent small successful file.
// The large DATA section is parsed synchronously; the browser must be killable.
const timeoutDir = path.join(dir, 'timeout-input');
mkdirSync(path.join(timeoutDir, 'nested'), { recursive: true });
let large = header;
for (let i = 1; i <= 500000; i++) large += `#${i}=IFCCARTESIANPOINT((1.,2.,3.));\n`;
writeFileSync(path.join(timeoutDir, 'a-slow.ifc'), large + end);
writeFileSync(path.join(timeoutDir, 'nested', 'b-good.IFC'), header + base + end);
const timed = run([timeoutDir], path.join(dir, 'timeout'), ['--timeout=0.7'], 2);
assert.equal(timed.files.length, 2);
assert.equal(timed.files[0].status, 'FILE_ERROR');
assert.equal(timed.files[0].error.code, 'TIMEOUT');
assert.equal(timed.files[1].status, 'COMPLETE');
assert.equal(timed.totals.fileErrors, 1);
console.log('PASS: timeout followed by successful file, recursive case-insensitive collection, FILE_ERROR summary, exit code 2.');
