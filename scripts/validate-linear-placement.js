#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Validace curve-evaluatoru proti CartesianPosition ground truth:
// pro každý IFCLINEARPLACEMENT s vyplněným CartesianPosition vyhodnotí
// IfcPointByDistanceExpression přes vlastní evaluátor a porovná.
// (curve-evaluator je THREE-free, takže běží přímo v Node bez prohlížeče.)
// Usage: node scripts/validate-linear-placement.js <soubor.ifc> [tolerance_m]

import { readFileSync } from 'fs';
import { parseStepText, splitParams } from '../assets/js/3d/ifc-engine/parser/step-parser.js';
import { EntityIndex } from '../assets/js/3d/ifc-engine/parser/entity-index.js';
import { parseRef, parseRefList, parseWrappedNum } from '../assets/js/3d/ifc-engine/geometry/step-helpers.js';
import { getCurveEval } from '../assets/js/3d/ifc-engine/alignment/curve-evaluator.js';

const file = process.argv[2];
const TOL = parseFloat(process.argv[3] || '0.002');
if (!file) { console.error('Usage: node scripts/validate-linear-placement.js <ifc> [tol]'); process.exit(1); }

const { entities } = parseStepText(readFileSync(file, 'utf-8'));
const index = new EntityIndex(entities);

function vec3(id) {
  const e = index.byExpressId(id);
  const m = e && e.params.match(/\(([^)]*)\)/);
  if (!m) return null;
  const n = m[1].split(',').map(s => parseFloat(s.trim()));
  return [n[0], n[1], n[2] || 0];
}

// Známá vada exportu (past č. 3 z implementačního podkladu): výjezdové
// klotoidy z levotočivých oblouků mají SegmentStart = A²·κ₁ místo κ₁·A·|A|
// (signatura: A < 0 a SegmentStart > 0). CartesianPosition ground truth je
// přitom správná → odchylky UVNITŘ těchto rozsahů jsou vada souboru, ne
// evaluátoru. Reportují se odděleně a neshazují exit kód.
function findDefectRanges() {
  const ranges = [];
  for (const cc of index.byType('IfcCompositeCurve')) {
    let cum = 0;
    for (const id of parseRefList(splitParams(cc.params)[0])) {
      const e = index.byExpressId(id);
      if (!e) continue;
      const p = splitParams(e.params);
      const startW = parseWrappedNum(p[2]);
      const lenW = parseWrappedNum(p[3]);
      const len = Math.abs(lenW ? lenW.value : 0);
      const parent = index.byExpressId(parseRef(p[4]));
      if (parent && parent.type === 'IFCCLOTHOID' && startW) {
        const A = parseFloat(splitParams(parent.params)[1]);
        if (A < 0 && startW.value > 0) ranges.push([cum - 0.5, cum + len + 0.5, id]);
      }
      cum += len;
    }
  }
  return ranges;
}
const defectRanges = findDefectRanges();
if (defectRanges.length) {
  console.log(`POZOR: soubor obsahuje ${defectRanges.length} exit-spirál se signaturou vady SegmentStart=A²·κ₁ (A<0, start>0):`);
  for (const [a, b, id] of defectRanges) console.log(`  IfcCurveSegment #${id}: staničení ${a.toFixed(1)}–${b.toFixed(1)}`);
}

let count = 0, skipped = 0, maxDev = 0, sumDev = 0, inDefect = 0;
const worst = [];
for (const lp of index.byType('IfcLinearPlacement')) {
  const parts = splitParams(lp.params);
  const cartId = parseRef(parts[2]);
  const rel = index.byExpressId(parseRef(parts[1]));
  if (!cartId || !rel) { skipped++; continue; }
  const cart = index.byExpressId(cartId);
  const expected = vec3(parseRef(splitParams(cart.params)[0]));
  const pbde = index.byExpressId(parseRef(splitParams(rel.params)[0]));
  if (!expected || !pbde || pbde.type !== 'IFCPOINTBYDISTANCEEXPRESSION') { skipped++; continue; }
  const pp = splitParams(pbde.params);
  const dist = parseWrappedNum(pp[0]);
  const lat = parseWrappedNum(pp[1]);
  const vert = parseWrappedNum(pp[2]);
  const lon = parseWrappedNum(pp[3]);
  const ce = getCurveEval(index, parseRef(pp[4]));
  if (!dist || !ce) { skipped++; continue; }
  const r = ce.evalAt(dist.value + (lon ? lon.value : 0));
  const az = r.azimuth;
  const got = [
    r.point[0] + (lat ? lat.value * -Math.sin(az) : 0),
    r.point[1] + (lat ? lat.value * Math.cos(az) : 0),
    r.point[2] + (vert ? vert.value : 0),
  ];
  const dev = Math.hypot(got[0] - expected[0], got[1] - expected[1], got[2] - expected[2]);
  const d = dist.value + (lon ? lon.value : 0);
  const isDefect = defectRanges.some(([a, b]) => d >= a && d <= b);
  count++;
  if (dev > TOL && isDefect) { inDefect++; continue; } // vada souboru, ne evaluátoru
  sumDev += dev;
  if (dev > maxDev) maxDev = dev;
  if (dev > TOL) worst.push({ id: lp.expressId, dev, expected, got });
}

worst.sort((a, b) => b.dev - a.dev);
console.log(`Placements: ${count} vyhodnoceno, ${skipped} přeskočeno (bez CartesianPosition/PBDE)`);
if (inDefect) console.log(`  ${inDefect} placementů uvnitř vadných exit-spirál (odchylka = vada souboru, vyjmuto z hodnocení)`);
console.log(`Odchylka (mimo vadné rozsahy): max ${(maxDev * 1000).toFixed(3)} mm, průměr ${((sumDev / Math.max(count - inDefect, 1)) * 1000).toFixed(3)} mm, tolerance ${TOL * 1000} mm`);
for (const w of worst.slice(0, 10)) {
  console.log(`  #${w.id}: ${(w.dev * 1000).toFixed(2)} mm  expected(${w.expected.map(v => v.toFixed(3))}) got(${w.got.map(v => v.toFixed(3))})`);
}
if (worst.length > 10) console.log(`  … a dalších ${worst.length - 10}`);
process.exit(worst.length > 0 ? 1 : 0);
