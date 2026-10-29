// Parita STEP tokenizerů: parseStepText (assets/js/3d/ifc-engine/parser/step-parser.js)
// versus IFCParserCore._buildEntityMap (ifc-parser-core.js) a IFCStreamParser
// (ifc-stream-parser.js). Pro každý soubor porovná množinu entit (id → typ)
// a rozdělení params na top-level položky; rozdíly vypíše a uloží do JSON.
//
// Použití:
//   node scripts/ifc-diag/parser-parity.mjs <soubor|složka>... [--sample=N] [--max-mb=M] [--out=cesta.json] [--quiet]
//   --sample=N   deterministický výběr max. N souborů z každé zadané složky (rovnoměrně po setřídění)
//   --max-mb=M   soubory větší než M MB se přeskočí (výchozí 200)
//
// Návratový kód: 0 = všechny soubory shodné, 2 = nalezeny rozdíly, 1 = chyba vstupu.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseStepText, splitParams } from '../../assets/js/3d/ifc-engine/parser/step-parser.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const sample = Number(opt('sample', 0)) || 0;
const maxBytes = Number(opt('max-mb', 200)) * 1024 * 1024;
const outPath = opt('out', 'test-results/ifc-diagnostics/parser-parity.json');
const quiet = args.includes('--quiet');
const inputs = args.filter(a => !a.startsWith('--'));
if (inputs.length === 0) {
  console.error('Zadej alespoň jeden soubor nebo složku.');
  process.exit(1);
}

// Starší parsery jsou klasické skripty (IIFE / window.*): připrav globály a načti je jako moduly bez exportů.
globalThis.self = globalThis;
globalThis.window = globalThis;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
await import(pathToFileURL(path.join(root, 'assets/js/common/ifc-parser-core.js')).href);
await import(pathToFileURL(path.join(root, 'assets/js/common/ifc-stream-parser.js')).href);
const { IFCParserCore, IFCStreamParser } = globalThis;

function walk(p, acc) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const n of fs.readdirSync(p).sort()) walk(path.join(p, n), acc);
  } else if (/\.ifc$/i.test(p)) {
    acc.push(p);
  }
  return acc;
}

function pickFiles() {
  const files = [];
  for (const input of inputs) {
    const resolved = input.replace(/^~(?=$|\/)/, process.env.HOME || '');
    if (!fs.existsSync(resolved)) {
      console.error(`Neexistuje: ${resolved}`);
      process.exit(1);
    }
    let list = walk(resolved, []).filter(f => fs.statSync(f).size <= maxBytes);
    if (sample > 0 && list.length > sample && fs.statSync(resolved).isDirectory()) {
      const step = list.length / sample;
      list = Array.from({ length: sample }, (_, i) => list[Math.floor(i * step)]);
    }
    files.push(...list);
  }
  return Array.from(new Set(files));
}

/** Stream parser krmený po kusech (jako file.stream()), výsledek Map<id, {type, args}>. */
function runStreamParser(text, chunkSize = 1 << 20) {
  const out = new Map();
  const parser = new IFCStreamParser({ onEntity: e => out.set(e.id, e) });
  if (typeof parser.parseText === 'function') {
    parser.parseText(text, chunkSize);
    return out;
  }
  for (let i = 0; i < text.length; i += chunkSize) {
    parser.buffer += text.slice(i, i + chunkSize);
    parser.processBuffer();
  }
  if (parser.buffer.trim()) parser.processLine(parser.buffer);
  return out;
}

/** Hodnota argumentu stream parseru normalizovaná na porovnatelný řetězec. */
function canonStreamArg(v) {
  return JSON.stringify(v === undefined ? '*' : v);
}

const MAX_SAMPLES = 20;

function compareFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const t0 = performance.now();
  const ref = parseStepText(text);
  const tRef = performance.now() - t0;
  const t1 = performance.now();
  const core = IFCParserCore._buildEntityMap(text);
  const tCore = performance.now() - t1;
  const t2 = performance.now();
  const stream = runStreamParser(text);
  const tStream = performance.now() - t2;

  const result = {
    file,
    bytes: text.length,
    counts: { ref: ref.entities.size, core: core.size, stream: stream.size },
    ms: { ref: Math.round(tRef), core: Math.round(tCore), stream: Math.round(tStream) },
    diagnostics: {
      invalid: ref.diagnostics.invalidRecordCount,
      duplicates: ref.diagnostics.duplicateIdCount,
      complex: ref.diagnostics.complexRecordCount,
      comments: ref.diagnostics.commentCount
    },
    emptyFieldEntities: 0, // entity s prázdnou top-level položkou (např. `a,,b`) — splitParams je od 2026-10 zachovává
    core: { missing: 0, extra: 0, typeDiff: 0, paramsDiff: 0, partsDiff: 0, samples: [] },
    stream: { missing: 0, extra: 0, typeDiff: 0, argsDiff: 0, samples: [] }
  };
  const addSample = (bucket, s) => { if (bucket.samples.length < MAX_SAMPLES) bucket.samples.push(s); };

  // --- core ---
  for (const [id, e] of ref.entities) {
    if (splitParams(e.params).includes('')) result.emptyFieldEntities++;
    const c = core.get(String(id));
    if (!c) { result.core.missing++; addSample(result.core, { id, kind: 'missing', ref: `${e.type}(${e.params.slice(0, 80)})` }); continue; }
    if (c.type !== e.type) { result.core.typeDiff++; addSample(result.core, { id, kind: 'type', ref: e.type, other: c.type }); continue; }
    if (c.params !== e.params) {
      result.core.paramsDiff++;
      const a = splitParams(e.params);
      const b = IFCParserCore._splitParams(c.params);
      const partsEqual = a.length === b.length && a.every((x, i) => x === b[i]);
      if (!partsEqual) result.core.partsDiff++;
      addSample(result.core, { id, kind: partsEqual ? 'params-raw' : 'params-parts', ref: e.params.slice(0, 100), other: c.params.slice(0, 100) });
    } else {
      const a = splitParams(e.params);
      const b = IFCParserCore._splitParams(c.params);
      if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
        result.core.partsDiff++;
        addSample(result.core, { id, kind: 'split', ref: a, other: b });
      }
    }
  }
  for (const id of core.keys()) {
    if (!ref.entities.has(Number(id))) { result.core.extra++; addSample(result.core, { id, kind: 'extra', other: `${core.get(id).type}(${core.get(id).params.slice(0, 80)})` }); }
  }

  // --- stream ---
  const probe = new IFCStreamParser();
  for (const [id, e] of ref.entities) {
    const s = stream.get(id);
    if (!s) { result.stream.missing++; addSample(result.stream, { id, kind: 'missing', ref: `${e.type}(${e.params.slice(0, 80)})` }); continue; }
    if (s.type !== e.type) { result.stream.typeDiff++; addSample(result.stream, { id, kind: 'type', ref: e.type, other: s.type }); continue; }
    const expected = splitParams(e.params).map(p => canonStreamArg(probe.parseValue(p)));
    const actual = s.arguments.map(canonStreamArg);
    if (expected.length !== actual.length || expected.some((x, i) => x !== actual[i])) {
      result.stream.argsDiff++;
      addSample(result.stream, { id, kind: 'args', ref: expected.slice(0, 12), other: actual.slice(0, 12) });
    }
  }
  for (const id of stream.keys()) {
    if (!ref.entities.has(id)) { result.stream.extra++; addSample(result.stream, { id, kind: 'extra', other: `${stream.get(id).type}` }); }
  }

  result.coreEqual = result.counts.ref === result.counts.core && !result.core.missing && !result.core.extra && !result.core.typeDiff && !result.core.paramsDiff && !result.core.partsDiff;
  result.streamEqual = result.counts.ref === result.counts.stream && !result.stream.missing && !result.stream.extra && !result.stream.typeDiff && !result.stream.argsDiff;
  return result;
}

const files = pickFiles();
const results = [];
let anyDiff = false;
for (const file of files) {
  let r;
  try {
    r = compareFile(file);
  } catch (err) {
    r = { file, error: String(err && err.stack || err) };
    anyDiff = true;
    console.log(`ERROR  ${file}: ${err.message}`);
    results.push(r);
    continue;
  }
  results.push(r);
  if (!r.coreEqual || !r.streamEqual) anyDiff = true;
  const c = r.core, s = r.stream;
  const line = `${r.coreEqual && r.streamEqual ? 'OK   ' : 'DIFF '} ${path.basename(file).padEnd(48)} ref=${r.counts.ref} core=${r.counts.core}(-${c.missing}/+${c.extra}/t${c.typeDiff}/p${c.paramsDiff}/s${c.partsDiff}) stream=${r.counts.stream}(-${s.missing}/+${s.extra}/t${s.typeDiff}/a${s.argsDiff}) ms=${r.ms.ref}/${r.ms.core}/${r.ms.stream}`;
  console.log(line);
  if (!quiet) {
    for (const smp of c.samples.slice(0, 3)) console.log(`      core   #${smp.id} ${smp.kind}: ${JSON.stringify(smp.ref ?? '')} | ${JSON.stringify(smp.other ?? '')}`);
    for (const smp of s.samples.slice(0, 3)) console.log(`      stream #${smp.id} ${smp.kind}: ${JSON.stringify(smp.ref ?? '')} | ${JSON.stringify(smp.other ?? '')}`);
  }
}

const summary = {
  files: results.length,
  coreEqual: results.filter(r => r.coreEqual).length,
  streamEqual: results.filter(r => r.streamEqual).length,
  errors: results.filter(r => r.error).length,
  totals: results.reduce((acc, r) => {
    if (r.error) return acc;
    acc.ref += r.counts.ref;
    acc.emptyFieldEntities += r.emptyFieldEntities;
    for (const k of ['missing', 'extra', 'typeDiff', 'paramsDiff', 'partsDiff']) acc.core[k] += r.core[k];
    for (const k of ['missing', 'extra', 'typeDiff', 'argsDiff']) acc.stream[k] += r.stream[k];
    acc.ms.ref += r.ms.ref; acc.ms.core += r.ms.core; acc.ms.stream += r.ms.stream;
    return acc;
  }, { ref: 0, emptyFieldEntities: 0, core: { missing: 0, extra: 0, typeDiff: 0, paramsDiff: 0, partsDiff: 0 }, stream: { missing: 0, extra: 0, typeDiff: 0, argsDiff: 0 }, ms: { ref: 0, core: 0, stream: 0 } })
};
console.log('\nSOUHRN', JSON.stringify(summary));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
console.log(`Uloženo: ${outPath}`);
process.exit(anyDiff ? 2 : 0);
