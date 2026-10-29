// Průchod A diagnostiky: nezávislý referenční STEP skener (konečný automat) vs. parseStepText.
// Měří ztráty záznamů, rozbité params, komentáře, více záznamů na řádku a kolize GUID.
// Použití: node scripts/ifc-diag/parser-inventory.mjs <soubor|složka>... [--out=cesta.json]
import fs from 'node:fs';
import path from 'node:path';
import { parseStepText } from '../../assets/js/3d/ifc-engine/parser/step-parser.js';
import { EntityIndex, extractGuid } from '../../assets/js/3d/ifc-engine/parser/entity-index.js';
import { IFC_ROOT_TYPES } from '../../assets/js/3d/ifc-engine/parser/ifc-root-types.js';

const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='));
const outPath = outArg ? outArg.slice(6) : 'test-results/ifc-diagnostics/parser-inventory.json';
const inputs = args.filter(a => !a.startsWith('--'));

function walk(p, acc) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const n of fs.readdirSync(p).sort()) walk(path.join(p, n), acc);
  } else if (/\.ifc$/i.test(p)) {
    acc.push(p);
  }
  return acc;
}

/**
 * Referenční rozdělení DATA sekce na záznamy: `;` ukončuje záznam jen mimo
 * řetězec ('...' s '' escapem) a mimo blokový komentář.
 */
function scanRecords(text) {
  const m = /\bDATA\s*;/.exec(text);
  const records = [];
  const stats = { commentsInData: 0, recordsSharingLine: 0, unterminated: 0 };
  if (!m) return { records, stats, noData: true };
  let i = m.index + m[0].length;
  let line = text.slice(0, i).split('\n').length;
  let start = i;
  let startLine = line;
  let inStr = false;
  let lastRecordEndLine = -1;
  let buf = '';
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') line++;
    if (inStr) {
      buf += c;
      if (c === "'") {
        if (text[i + 1] === "'") { buf += "'"; i++; } else inStr = false;
      }
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      stats.commentsInData++;
      const stop = end === -1 ? text.length : end + 2;
      for (let k = i; k < stop; k++) if (text[k] === '\n') line++;
      i = stop - 1;
      continue;
    }
    if (c === "'") { inStr = true; buf += c; continue; }
    if (c === ';') {
      const rec = buf.trim();
      buf = '';
      if (rec === '') { start = i + 1; startLine = line; continue; }
      if (/^ENDSEC$/i.test(rec)) break;
      records.push({ text: rec, line: startLine });
      if (startLine === lastRecordEndLine) stats.recordsSharingLine++;
      lastRecordEndLine = line;
      start = i + 1;
      startLine = line;
      continue;
    }
    if (buf === '' && /\s/.test(c)) { startLine = line; continue; }
    if (buf === '') startLine = line;
    buf += c;
  }
  if (buf.trim() !== '' && !/^ENDSEC$/i.test(buf.trim())) stats.unterminated++;
  return { records, stats, noData: false };
}

const REC_RE = /^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\(([\s\S]*)\)\s*$/;
const COMPLEX_RE = /^#(\d+)\s*=\s*\(/;
const stripWs = s => s.replace(/\s+/g, '');

function inspect(file) {
  const text = fs.readFileSync(file, 'utf8');
  const t0 = performance.now();
  const ref = scanRecords(text);
  const refMap = new Map();
  let refInvalid = 0;
  let refDuplicateIds = 0;
  let complexRecords = 0;
  for (const r of ref.records) {
    const m = REC_RE.exec(r.text);
    if (!m) {
      if (COMPLEX_RE.test(r.text)) complexRecords++; else refInvalid++;
      continue;
    }
    const id = parseInt(m[1], 10);
    if (refMap.has(id)) refDuplicateIds++;
    refMap.set(id, { id, type: m[2], params: m[3], line: r.line });
  }

  const parsed = parseStepText(text);
  const missing = [];
  const mismatch = [];
  for (const [id, e] of refMap) {
    const p = parsed.entities.get(id);
    if (!p) { missing.push({ id, type: e.type, line: e.line }); continue; }
    if (p.type !== e.type || stripWs(p.params) !== stripWs(e.params)) {
      mismatch.push({ id, refType: e.type, parserType: p.type, line: e.line });
    }
  }
  let extra = 0;
  for (const id of parsed.entities.keys()) if (!refMap.has(id)) extra++;

  // GUID: stará heuristika "první řetězec délky 22 kdekoli" (candidates) vs.
  // schema-aware EntityIndex (indexed). rejectedFalse = staří kandidáti, které
  // nový index neindexuje (ne-root typ nebo řetězec mimo první atribut);
  // rootNotIndexed = IfcRoot entity bez indexovatelného GlobalId;
  // fallbackIndexed = neznámý typ indexovaný přes přísný tvar GUID.
  const idx = new EntityIndex(parsed.entities);
  let candidates = 0;
  let badCharset = 0;
  let rejectedFalse = 0;
  let rootEntities = 0;
  let rootNotIndexed = 0;
  let rootNonStandard = 0;
  let fallbackIndexed = 0;
  const byGuid = new Map();
  const typeCount = new Map();
  const fallbackTypes = new Map();
  for (const e of parsed.entities.values()) {
    const g = /'([^']+)'/.exec(e.params)?.[1];
    const ng = extractGuid(e.type, e.params);
    const isRoot = IFC_ROOT_TYPES.has(e.type);
    if (g && g.length === 22) {
      candidates++;
      if (!/^[0-9A-Za-z_$]{22}$/.test(g)) badCharset++;
      byGuid.set(g, (byGuid.get(g) || 0) + 1);
      if (ng === null) {
        rejectedFalse++;
        typeCount.set(e.type, (typeCount.get(e.type) || 0) + 1);
      }
    }
    if (isRoot) {
      rootEntities++;
      if (ng === null) rootNotIndexed++;
      else if (!/^[0-3][0-9A-Za-z_$]{21}$/.test(ng)) rootNonStandard++;
    } else if (ng !== null) {
      fallbackIndexed++;
      fallbackTypes.set(e.type, (fallbackTypes.get(e.type) || 0) + 1);
    }
  }
  let dupGuids = 0;
  for (const n of byGuid.values()) if (n > 1) dupGuids++;
  const topTypes = [...typeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const guidLost = candidates - idx._byGuid.size;
  const st = idx.stats();

  return {
    file,
    bytes: text.length,
    schema: parsed.schema,
    ms: Math.round(performance.now() - t0),
    refRecords: ref.records.length,
    refValid: refMap.size,
    refInvalid,
    refDuplicateIds,
    complexRecords,
    noData: ref.noData,
    unterminated: ref.stats.unterminated,
    commentsInData: ref.stats.commentsInData,
    recordsSharingLine: ref.stats.recordsSharingLine,
    parserEntities: parsed.entities.size,
    missingInParser: missing.length,
    missingExamples: missing.slice(0, 5),
    mismatchParams: mismatch.length,
    mismatchExamples: mismatch.slice(0, 5),
    extraInParser: extra,
    guid: {
      candidates, indexed: st.guidCount, lostByCollision: guidLost, dupGuids, badCharset,
      rejectedFalse, duplicates: st.guidDuplicates, rootEntities, rootNotIndexed, rootNonStandard, fallbackIndexed,
      topRejectedTypes: topTypes,
      fallbackTypes: [...fallbackTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    },
  };
}

const files = inputs.flatMap(p => walk(p, []));
const results = [];
for (const f of files) {
  try {
    results.push(inspect(f));
  } catch (e) {
    results.push({ file: f, error: String(e && e.message || e) });
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(results, null, 1));

const ok = results.filter(r => !r.error);
const sum = k => ok.reduce((s, r) => s + (r[k] || 0), 0);
const bad = k => ok.filter(r => r[k] > 0).length;
console.log(`soubory: ${results.length} (chyby běhu: ${results.length - ok.length})`);
console.log(`ref. záznamy: ${sum('refValid')} | parser entity: ${sum('parserEntities')}`);
console.log(`soubory se ztrátou záznamů v parseru: ${bad('missingInParser')} (celkem ${sum('missingInParser')} záznamů)`);
console.log(`soubory s rozbitými params: ${bad('mismatchParams')} (celkem ${sum('mismatchParams')})`);
console.log(`soubory s komentáři v DATA: ${bad('commentsInData')} | s více záznamy na řádku: ${bad('recordsSharingLine')}`);
console.log(`soubory s komplexními záznamy: ${bad('complexRecords')} (celkem ${sum('complexRecords')}) | neplatné záznamy: ${sum('refInvalid')} | duplicitní ID: ${sum('refDuplicateIds')} | neuzavřené: ${sum('unterminated')}`);
const g = k => ok.reduce((s, r) => s + (r.guid[k] || 0), 0);
console.log(`GUID (stará heuristika): kandidátů ${g('candidates')}, rozdíl proti indexu ${g('lostByCollision')}, špatná abeceda ${g('badCharset')}`);
console.log(`GUID (EntityIndex): indexováno ${g('indexed')}, odmítnuto falešných ${g('rejectedFalse')}, duplicit ${g('duplicates')}, fallback (neznámý typ) ${g('fallbackIndexed')}`);
console.log(`IfcRoot entity: ${g('rootEntities')}, bez GlobalId k indexaci ${g('rootNotIndexed')}, nestandardní GlobalId ${g('rootNonStandard')}`);
console.log(`detail: ${outPath}`);
