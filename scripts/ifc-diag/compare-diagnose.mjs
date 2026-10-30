#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Compare two geometry-diagnose.mjs output directories product by product.
// Used for parser-path parity: `--parser=text` (legacy parseStepText + Map)
// versus `--parser=bytes` (byte lexer + EntityStore) must give identical rows.
//
//   node scripts/ifc-diag/compare-diagnose.mjs <dirA> <dirB> [--fields=status,reason,...]
//
// Default fields: everything that describes the geometry result (status,
// reason, leafTypes, items, vertices, triangles, nanCount, degenerateTriangles,
// bboxLocal, diag, guid). Exit code 1 when any file or product differs.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dirs = args.filter(a => !a.startsWith('--'));
if (dirs.length !== 2) {
  console.error('usage: compare-diagnose.mjs <dirA> <dirB> [--fields=a,b,c]');
  process.exit(2);
}
const fieldsArg = args.find(a => a.startsWith('--fields='));
const FIELDS = fieldsArg ? fieldsArg.slice(9).split(',')
  : ['ifcType', 'guid', 'status', 'reason', 'leafTypes', 'items', 'vertices', 'triangles', 'nanCount', 'degenerateTriangles', 'bboxLocal', 'diag'];

function loadRun(dir) {
  const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  const files = new Map();
  for (const f of summary.files) {
    const rows = new Map();
    if (readdirSync(dir).includes(f.jsonl)) {
      for (const line of readFileSync(path.join(dir, f.jsonl), 'utf8').split('\n')) {
        if (!line) continue;
        const row = JSON.parse(line);
        rows.set(row.expressId, row);
      }
    }
    files.set(f.file, { summary: f, rows });
  }
  return { summary, files };
}

const A = loadRun(dirs[0]);
const B = loadRun(dirs[1]);
const diffs = [];
let products = 0, filesCompared = 0;
const states = {};
const bump = (k, s) => { states[k] = states[k] || {}; states[k][s] = (states[k][s] || 0) + 1; };

for (const [name, a] of A.files) {
  const b = B.files.get(name);
  if (!b) { diffs.push(`${name}: missing in B`); continue; }
  filesCompared++;
  for (const k of ['status', 'schema', 'productCount', 'processedProducts', 'entityCount']) {
    if (JSON.stringify(a.summary[k]) !== JSON.stringify(b.summary[k])) diffs.push(`${name}: summary.${k} ${JSON.stringify(a.summary[k])} != ${JSON.stringify(b.summary[k])}`);
  }
  const pd = a.summary.parserDiagnostics, qd = b.summary.parserDiagnostics;
  for (const k of ['invalidRecordCount', 'duplicateIdCount', 'complexRecordCount', 'commentCount']) {
    if ((pd?.[k] ?? null) !== (qd?.[k] ?? null)) diffs.push(`${name}: parserDiagnostics.${k} ${pd?.[k]} != ${qd?.[k]}`);
  }
  for (const [id, ra] of a.rows) {
    const rb = b.rows.get(id);
    products++;
    bump('A', ra.status);
    if (!rb) { diffs.push(`${name}: #${id} missing in B`); continue; }
    bump('B', rb.status);
    for (const f of FIELDS) {
      const va = JSON.stringify(ra[f] ?? null), vb = JSON.stringify(rb[f] ?? null);
      if (va !== vb) diffs.push(`${name}: #${id} ${f}: ${va} != ${vb}`);
    }
  }
  for (const id of b.rows.keys()) if (!a.rows.has(id)) diffs.push(`${name}: #${id} missing in A`);
}
for (const name of B.files.keys()) if (!A.files.has(name)) diffs.push(`${name}: missing in A`);

const ms = run => `parse=${Math.round(run.summary.totals.parseMs)} geometry=${Math.round(run.summary.totals.geometryMs)} peakRss=${(run.summary.totals.peakBrowserRssBytes / 2 ** 20).toFixed(0)}MiB`;
console.log(`A=${dirs[0]} (${A.summary.options?.parser || '?'}) ${ms(A)}`);
console.log(`B=${dirs[1]} (${B.summary.options?.parser || '?'}) ${ms(B)}`);
console.log(`files=${filesCompared} products=${products} fields=${FIELDS.join(',')}`);
console.log(`states A=${JSON.stringify(states.A || {})}`);
console.log(`states B=${JSON.stringify(states.B || {})}`);
console.log(`differences=${diffs.length}`);
for (const d of diffs.slice(0, 50)) console.log('  ' + d);
if (diffs.length > 50) console.log(`  … ${diffs.length - 50} more`);
process.exitCode = diffs.length ? 1 : 0;
