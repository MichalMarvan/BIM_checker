#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
// CI brána nad regresním korpusem tests/fixtures/ifc-corpus/: spustí geometry-diagnose.mjs
// (Puppeteer + skutečný engine) nad korpusem a porovná výsledek s tests/fixtures/ifc-corpus/expected.json.
//
// Použití:
//   node scripts/ifc-diag/corpus-gate.mjs [--update] [--corpus=dir] [--expected=file] [--out=dir] [--timeout=120]
//   --update   přepíše expected.json aktuálním stavem (vědomá aktualizace očekávání)
//
// Brána selže (kód 1) jen při REGRESI vůči expected.json nebo při absolutních chybách:
//   - soubor skončil FILE_ERROR, chybí v běhu, nebo chybí v expected.json (přidej přes --update)
//   - jakýkoli produkt FAILED_GEOMETRY nebo nanCount > 0 (vždy, nezávisle na expected)
//   - produkt má horší stav než očekávaný (OK_EXACT < OK_APPROXIMATED < PARTIAL < NO_REPRESENTATION
//     < UNSUPPORTED_GEOMETRY < FAILED_GEOMETRY; změna z/na NOT_APPLICABLE je vždy regrese)
//   - produkt zmizel, nebo mu vzrostl počet degenerovaných trojúhelníků
//   - parser: vzrostl počet neplatných záznamů/duplicit nebo nově neukončený záznam, klesl počet entit
// Lepší stav než očekávaný bránu neshodí, jen se vypíše jako IMPROVED (vhodné přenést do expected.json).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const update = args.includes('--update');
const corpusDir = path.resolve(root, opt('corpus', 'tests/fixtures/ifc-corpus'));
const expectedPath = path.resolve(root, opt('expected', path.join(corpusDir, 'expected.json')));
const outDir = path.resolve(root, opt('out', 'test-results/ifc-diagnostics/corpus-gate'));
const timeout = Number(opt('timeout', 120));
const unknown = args.filter(a => a.startsWith('--') && !/^--(update|corpus=|expected=|out=|timeout=)/.test(a));
if (unknown.length) {
  console.error(`Neznámý argument: ${unknown.join(' ')}`);
  process.exit(1);
}

const STATES = ['OK_EXACT', 'OK_APPROXIMATED', 'PARTIAL', 'NO_REPRESENTATION', 'UNSUPPORTED_GEOMETRY', 'FAILED_GEOMETRY', 'NOT_APPLICABLE'];
const RANK = { OK_EXACT: 0, OK_APPROXIMATED: 1, PARTIAL: 2, NO_REPRESENTATION: 3, UNSUPPORTED_GEOMETRY: 4, FAILED_GEOMETRY: 5 };

function rankOf(status) {
  return RANK[status] ?? 99;
}

/** Spustí geometry-diagnose.mjs nad korpusem; vrátí parsed summary.json. */
function runDiagnose() {
  const corpusFiles = readdirSync(corpusDir).filter(f => /\.ifc$/i.test(f));
  if (!corpusFiles.length) throw new Error(`V korpusu ${corpusDir} nejsou žádné .ifc soubory.`);
  mkdirSync(outDir, { recursive: true });
  const res = spawnSync(process.execPath, [path.join(root, 'scripts/ifc-diag/geometry-diagnose.mjs'), corpusDir, `--out=${outDir}`, `--timeout=${timeout}`],
    { cwd: root, stdio: 'inherit' });
  if (res.error) throw res.error;
  const summaryPath = path.join(outDir, 'summary.json');
  if (!existsSync(summaryPath)) throw new Error(`geometry-diagnose nevytvořil ${summaryPath} (kód ${res.status}).`);
  return { summary: JSON.parse(readFileSync(summaryPath, 'utf8')), exitCode: res.status };
}

/** Z výsledku diagnostiky sestaví kompaktní stav per soubor (klíč = basename). */
function snapshot(summary) {
  const files = {};
  for (const f of summary.files) {
    const name = path.basename(f.file);
    if (files[name]) throw new Error(`Duplicitní název v korpusu: ${name}`);
    const d = f.parserDiagnostics || {};
    const entry = {
      status: f.status,
      error: f.error ? `${f.error.code}: ${f.error.message}` : null,
      schema: f.schema ?? null,
      entityCount: f.entityCount ?? null,
      productCount: f.productCount ?? null,
      processedProducts: f.processedProducts,
      counts: Object.fromEntries(STATES.map(s => [s, f.counts?.[s] ?? 0])),
      nanCount: f.nanCount,
      degenerateTriangles: f.degenerateTriangles,
      parser: {
        invalidRecordCount: d.invalidRecordCount ?? 0,
        duplicateIdCount: d.duplicateIdCount ?? 0,
        complexRecordCount: d.complexRecordCount ?? 0,
        commentCount: d.commentCount ?? 0,
        unterminatedRecord: Boolean(d.unterminatedRecord)
      },
      products: {}
    };
    const jsonlPath = path.join(outDir, f.jsonl);
    if (existsSync(jsonlPath)) {
      for (const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        entry.products[row.expressId] = {
          ifcType: row.ifcType,
          status: row.status,
          triangles: row.triangles,
          nanCount: row.nanCount,
          degenerateTriangles: row.degenerateTriangles,
          unsupported: [...new Set(row.diag?.unsupported || [])].sort()
        };
      }
    }
    files[name] = entry;
  }
  return files;
}

/** Porovná aktuální stav s očekávaným; vrátí { regressions, improvements, infos }. */
function compare(expected, actual) {
  const regressions = [], improvements = [], infos = [];
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const name of [...names].sort()) {
    const e = expected[name], a = actual[name];
    if (!a) { regressions.push(`${name}: soubor z expected.json v běhu chybí (odstraněn z korpusu? aktualizuj --update)`); continue; }
    if (a.status !== 'COMPLETE') { regressions.push(`${name}: ${a.status} ${a.error || ''}`.trim()); continue; }
    if (a.nanCount > 0) regressions.push(`${name}: nanCount=${a.nanCount} (musí být 0)`);
    if (a.counts.FAILED_GEOMETRY > 0) regressions.push(`${name}: FAILED_GEOMETRY=${a.counts.FAILED_GEOMETRY} (musí být 0)`);
    if (!e) { regressions.push(`${name}: není v expected.json — nový fixture přidej vědomě přes --update`); continue; }

    const ep = e.parser || {}, ap = a.parser;
    if (ap.invalidRecordCount > (ep.invalidRecordCount ?? 0)) regressions.push(`${name}: parser invalidRecordCount ${ep.invalidRecordCount} → ${ap.invalidRecordCount}`);
    if (ap.duplicateIdCount > (ep.duplicateIdCount ?? 0)) regressions.push(`${name}: parser duplicateIdCount ${ep.duplicateIdCount} → ${ap.duplicateIdCount}`);
    if (ap.unterminatedRecord && !ep.unterminatedRecord) regressions.push(`${name}: parser nově hlásí neukončený záznam`);
    if (e.entityCount != null && a.entityCount != null && a.entityCount < e.entityCount) regressions.push(`${name}: entityCount ${e.entityCount} → ${a.entityCount}`);
    if (e.schema && a.schema !== e.schema) regressions.push(`${name}: schema ${e.schema} → ${a.schema}`);

    const ids = new Set([...Object.keys(e.products || {}), ...Object.keys(a.products)]);
    for (const id of [...ids].sort((x, y) => Number(x) - Number(y))) {
      const pe = e.products?.[id], pa = a.products[id];
      if (!pa) { regressions.push(`${name} #${id} ${pe.ifcType}: produkt zmizel (byl ${pe.status})`); continue; }
      if (!pe) { infos.push(`${name} #${id} ${pa.ifcType}: nový produkt ${pa.status} (není v expected.json)`); continue; }
      const re = rankOf(pe.status), ra = rankOf(pa.status);
      const naChange = (pe.status === 'NOT_APPLICABLE') !== (pa.status === 'NOT_APPLICABLE');
      if (naChange || ra > re) regressions.push(`${name} #${id} ${pa.ifcType}: ${pe.status} → ${pa.status}`);
      else if (ra < re) improvements.push(`${name} #${id} ${pa.ifcType}: ${pe.status} → ${pa.status}`);
      if (pa.degenerateTriangles > (pe.degenerateTriangles ?? 0)) regressions.push(`${name} #${id} ${pa.ifcType}: degenerateTriangles ${pe.degenerateTriangles} → ${pa.degenerateTriangles}`);
      else if (pa.degenerateTriangles < (pe.degenerateTriangles ?? 0)) improvements.push(`${name} #${id} ${pa.ifcType}: degenerateTriangles ${pe.degenerateTriangles} → ${pa.degenerateTriangles}`);
      const newUnsupported = (pa.unsupported || []).filter(t => !(pe.unsupported || []).includes(t));
      if (newUnsupported.length) regressions.push(`${name} #${id} ${pa.ifcType}: nově unsupported ${newUnsupported.join(',')}`);
    }
  }
  return { regressions, improvements, infos };
}

function printTable(actual) {
  const head = ['file', 'products', ...STATES.map(s => s.replace('_GEOMETRY', '').replace('OK_', '')), 'degen', 'nan', 'inv'];
  console.log(head.join('\t'));
  for (const [name, a] of Object.entries(actual).sort()) {
    console.log([name, `${a.processedProducts}/${a.productCount ?? '?'}`, ...STATES.map(s => a.counts[s]), a.degenerateTriangles, a.nanCount, a.parser.invalidRecordCount].join('\t'));
  }
}

try {
  const { summary } = runDiagnose();
  const actual = snapshot(summary);
  printTable(actual);
  if (update) {
    const broken = Object.entries(actual).filter(([, a]) => a.status !== 'COMPLETE');
    if (broken.length) throw new Error(`--update odmítnut: FILE_ERROR u ${broken.map(([n]) => n).join(', ')}`);
    const doc = { version: 1, generatedAt: new Date().toISOString(), engineSha256: summary.engineSha256, files: actual };
    writeFileSync(expectedPath, JSON.stringify(doc, null, 2) + '\n');
    console.log(`\nZapsáno ${path.relative(root, expectedPath)} (${Object.keys(actual).length} souborů).`);
    const failing = Object.entries(actual).filter(([, a]) => a.nanCount > 0 || a.counts.FAILED_GEOMETRY > 0);
    if (failing.length) {
      console.error(`POZOR: brána stejně selže — FAILED/NaN u: ${failing.map(([n]) => n).join(', ')}`);
      process.exitCode = 1;
    }
  } else {
    if (!existsSync(expectedPath)) throw new Error(`Chybí ${expectedPath}; vytvoř ho přes --update.`);
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
    const { regressions, improvements, infos } = compare(expected.files || {}, actual);
    for (const i of infos) console.log(`INFO      ${i}`);
    for (const i of improvements) console.log(`IMPROVED  ${i}`);
    for (const r of regressions) console.log(`REGRESSION ${r}`);
    const totals = Object.values(actual).reduce((acc, a) => { for (const s of STATES) acc[s] += a.counts[s]; return acc; }, Object.fromEntries(STATES.map(s => [s, 0])));
    console.log(`\nSOUHRN files=${Object.keys(actual).length} ${STATES.map(s => `${s}=${totals[s]}`).join(' ')} regressions=${regressions.length} improvements=${improvements.length}`);
    if (regressions.length) {
      console.error(`IFC corpus gate FAILED: ${regressions.length} regrese vůči ${path.relative(root, expectedPath)}.`);
      process.exitCode = 1;
    } else {
      console.log(`IFC corpus gate OK${improvements.length ? ' (zlepšení — zvaž --update)' : ''}.`);
    }
  }
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
