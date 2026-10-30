// Parita byte-lexeru (assets/js/3d/ifc-engine/parser/byte-lexer.js) versus
// parseStepText (step-parser.js). Pro každý soubor porovná počet entit, pořadí,
// id → typ, RAW params (líně dekódované) a diagnostiku (počty + vzorky).
// Zároveň měří čas a paměť (heapUsed + arrayBuffers) obou cest.
//
// Použití:
//   node --expose-gc scripts/ifc-diag/byte-lexer-parity.mjs <soubor|složka>... [--sample=N] [--max-mb=M] [--index-only] [--out=cesta.json] [--quiet]
//   --max-mb=M     soubory větší než M MB se přeskočí (výchozí 600)
//   --index-only   jen byte-lexer (soubory nad limit JS řetězce se tak zpracují vždy)
//   --no-lines     indexovat bez čísel řádků (vzorky diagnostiky se pak neporovnávají)
//   --stdin=NAME   místo cest číst jeden soubor ze stdin (např. `cat big.ifc | ssh thinkpad node ...`),
//                  aby se velký model nemusel kopírovat na disk
//
// Návratový kód: 0 = vše shodné, 2 = rozdíly, 1 = chyba vstupu.
import fs from 'node:fs';
import path from 'node:path';
import { parseStepText, MAX_STEP_TEXT_BYTES } from '../../assets/js/3d/ifc-engine/parser/step-parser.js';
import { indexStepBytes } from '../../assets/js/3d/ifc-engine/parser/byte-lexer.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const sample = Number(opt('sample', 0)) || 0;
const maxBytes = Number(opt('max-mb', 600)) * 1024 * 1024;
const outPath = opt('out', 'test-results/ifc-diagnostics/byte-lexer-parity.json');
const quiet = args.includes('--quiet');
const indexOnly = args.includes('--index-only');
const withLines = !args.includes('--no-lines');
const stdinName = opt('stdin', '');
const inputs = args.filter(a => !a.startsWith('--'));
if (inputs.length === 0 && !stdinName) {
  console.error('Zadej alespoň jeden soubor nebo složku.');
  process.exit(1);
}

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

const gc = globalThis.gc || (() => {});
const mem = () => {
  gc();
  const m = process.memoryUsage();
  return { heapUsed: m.heapUsed, arrayBuffers: m.arrayBuffers, rss: m.rss };
};
const mb = n => Math.round(n / 1048576 * 10) / 10;
const MAX_SAMPLES = 20;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  chunks.length = 0;
  return buf;
}

function compareFile(file, preloaded) {
  const buf = preloaded || fs.readFileSync(file);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const result = {
    file,
    bytes: bytes.length,
    counts: { ref: null, index: 0 },
    ms: { ref: null, index: 0, decodeAll: null },
    mem: { ref: null, index: null },
    lookupKind: null,
    maxId: null,
    diff: { count: 0, order: 0, type: 0, params: 0, missing: 0, diag: 0, samples: [] },
    diagnostics: null
  };
  const addSample = s => { if (result.diff.samples.length < MAX_SAMPLES) result.diff.samples.push(s); };

  const m0 = mem();
  const t0 = performance.now();
  const index = indexStepBytes(bytes, { lines: withLines });
  result.ms.index = Math.round(performance.now() - t0);
  const m1 = mem();
  result.mem.index = { heapUsed: m1.heapUsed - m0.heapUsed, arrayBuffers: m1.arrayBuffers - m0.arrayBuffers };
  result.counts.index = index.count;
  result.lookupKind = index.lookupKind;
  result.maxId = index.maxId;
  result.diagnostics = {
    invalid: index.diagnostics.invalidRecordCount,
    duplicates: index.diagnostics.duplicateIdCount,
    complex: index.diagnostics.complexRecordCount,
    comments: index.diagnostics.commentCount,
    unterminated: index.diagnostics.unterminatedRecord !== null
  };
  result.schema = index.schema;
  result.viewDefinitions = index.viewDefinitions;

  // Cena líného dekódování všech params (to, co by spotřebitel zaplatil nejvýš).
  const t1 = performance.now();
  let decoded = 0;
  for (let i = 0; i < index.count; i++) decoded += index.paramsString(i).length;
  result.ms.decodeAll = Math.round(performance.now() - t1);
  result.decodedChars = decoded;

  if (indexOnly || bytes.length > MAX_STEP_TEXT_BYTES) {
    result.skippedRef = bytes.length > MAX_STEP_TEXT_BYTES ? 'over-string-limit' : 'index-only';
    result.equal = null;
    return result;
  }

  const m2 = mem();
  const t2 = performance.now();
  const text = new TextDecoder('utf-8').decode(bytes);
  const ref = parseStepText(text);
  result.ms.ref = Math.round(performance.now() - t2);
  const m3 = mem();
  result.mem.ref = { heapUsed: m3.heapUsed - m2.heapUsed, arrayBuffers: m3.arrayBuffers - m2.arrayBuffers };
  result.counts.ref = ref.entities.size;

  if (ref.entities.size !== index.count) result.diff.count = 1;
  let pos = 0;
  for (const [id, e] of ref.entities) {
    const j = index.lookup(id);
    if (j === -1) { result.diff.missing++; addSample({ id, kind: 'missing', ref: `${e.type}(${e.params.slice(0, 80)})` }); pos++; continue; }
    if (j !== pos) { result.diff.order++; if (result.diff.order <= 3) addSample({ id, kind: 'order', ref: pos, other: j }); }
    const type = index.typeName(j);
    if (type !== e.type) { result.diff.type++; addSample({ id, kind: 'type', ref: e.type, other: type }); }
    const params = index.paramsString(j);
    if (params !== e.params) {
      result.diff.params++;
      addSample({ id, kind: 'params', ref: e.params.slice(0, 120), other: params.slice(0, 120) });
    }
    pos++;
  }
  const d = ref.diagnostics, x = index.diagnostics;
  const diagKeys = ['invalidRecordCount', 'duplicateIdCount', 'complexRecordCount', 'commentCount'];
  for (const k of diagKeys) {
    if (d[k] !== x[k]) { result.diff.diag++; addSample({ kind: `diag:${k}`, ref: d[k], other: x[k] }); }
  }
  if (JSON.stringify(d.unterminatedRecord) !== JSON.stringify(x.unterminatedRecord)) {
    result.diff.diag++;
    addSample({ kind: 'diag:unterminatedRecord', ref: d.unterminatedRecord, other: x.unterminatedRecord });
  }
  if (withLines) {
    if (JSON.stringify(d.invalidRecords) !== JSON.stringify(x.invalidRecords)) {
      result.diff.diag++;
      addSample({ kind: 'diag:invalidRecords', ref: d.invalidRecords.slice(0, 3), other: x.invalidRecords.slice(0, 3) });
    }
    if (JSON.stringify(d.duplicateIds) !== JSON.stringify(x.duplicateIds)) {
      result.diff.diag++;
      addSample({ kind: 'diag:duplicateIds', ref: d.duplicateIds.slice(0, 3), other: x.duplicateIds.slice(0, 3) });
    }
    let lineDiff = 0;
    for (const [id, e] of ref.entities) {
      const j = index.lookup(id);
      if (j !== -1 && index.lines[j] !== e.line) { lineDiff++; if (lineDiff <= 3) addSample({ id, kind: 'line', ref: e.line, other: index.lines[j] }); }
    }
    if (lineDiff) { result.diff.diag++; result.diff.lines = lineDiff; }
  }
  if (ref.schema !== index.schema) { result.diff.diag++; addSample({ kind: 'schema', ref: ref.schema, other: index.schema }); }
  if (JSON.stringify(ref.viewDefinitions) !== JSON.stringify(index.viewDefinitions)) {
    result.diff.diag++;
    addSample({ kind: 'viewDefinitions', ref: ref.viewDefinitions, other: index.viewDefinitions });
  }
  const df = result.diff;
  result.equal = !df.count && !df.order && !df.type && !df.params && !df.missing && !df.diag;
  return result;
}

const files = stdinName ? [stdinName] : pickFiles();
const stdinBuf = stdinName ? await readStdin() : null;
if (stdinBuf) console.log(`stdin: ${stdinName} ${mb(stdinBuf.length)}MB`);
const results = [];
let anyDiff = false;
for (const file of files) {
  let r;
  try {
    r = compareFile(file, stdinBuf);
  } catch (err) {
    r = { file, error: String(err && err.stack || err) };
    anyDiff = true;
    console.log(`ERROR  ${file}: ${err.message}`);
    results.push(r);
    continue;
  }
  results.push(r);
  if (r.equal === false) anyDiff = true;
  const d = r.diff;
  const tag = r.equal === null ? 'INDEX' : r.equal ? 'OK   ' : 'DIFF ';
  const memIdx = r.mem.index ? `${mb(r.mem.index.heapUsed)}+${mb(r.mem.index.arrayBuffers)}MB` : '-';
  const memRef = r.mem.ref ? `${mb(r.mem.ref.heapUsed)}+${mb(r.mem.ref.arrayBuffers)}MB` : '-';
  console.log(`${tag} ${path.basename(file).padEnd(48)} ${mb(r.bytes)}MB ref=${r.counts.ref ?? '-'} idx=${r.counts.index} (${r.lookupKind}, maxId/count=${(r.maxId / Math.max(1, r.counts.index)).toFixed(2)}) ` +
    `diff: cnt${d.count}/ord${d.order}/t${d.type}/p${d.params}/m${d.missing}/dg${d.diag} ms ref=${r.ms.ref ?? '-'} idx=${r.ms.index} decodeAll=${r.ms.decodeAll} mem ref=${memRef} idx=${memIdx}`);
  if (!quiet) {
    for (const smp of d.samples.slice(0, 5)) console.log(`      ${smp.kind} ${smp.id !== undefined ? '#' + smp.id : ''}: ${JSON.stringify(smp.ref ?? '')} | ${JSON.stringify(smp.other ?? '')}`);
  }
}

const ok = results.filter(r => !r.error);
const summary = {
  files: results.length,
  compared: ok.filter(r => r.equal !== null).length,
  equal: ok.filter(r => r.equal === true).length,
  indexOnly: ok.filter(r => r.equal === null).length,
  errors: results.length - ok.length,
  entities: { ref: ok.reduce((a, r) => a + (r.counts.ref || 0), 0), index: ok.reduce((a, r) => a + r.counts.index, 0) },
  diffs: ok.reduce((a, r) => { for (const k of ['count', 'order', 'type', 'params', 'missing', 'diag']) a[k] += r.diff[k]; return a; }, { count: 0, order: 0, type: 0, params: 0, missing: 0, diag: 0 }),
  lookup: { dense: ok.filter(r => r.lookupKind === 'dense').length, map: ok.filter(r => r.lookupKind === 'map').length },
  ms: { ref: ok.reduce((a, r) => a + (r.ms.ref || 0), 0), index: ok.reduce((a, r) => a + r.ms.index, 0), decodeAll: ok.reduce((a, r) => a + r.ms.decodeAll, 0) },
  bytes: ok.reduce((a, r) => a + r.bytes, 0)
};
console.log('\nSOUHRN', JSON.stringify(summary));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
console.log(`Uloženo: ${outPath}`);
process.exit(anyDiff ? 2 : 0);
