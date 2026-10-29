/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Generátor assets/js/3d/ifc-engine/parser/ifc-root-types.js — množiny podtypů
// IfcRoot odvozené deterministicky (transitivní uzávěr SUBTYPE OF) z oficiálních
// EXPRESS schémat buildingSMART.
//
// Použití:
//   node scripts/ifc-diag/generate-root-types.mjs [--schemas=<složka>] [--fetch] [--out=<cesta>]
//
// Zdroje (.exp ve složce --schemas, výchozí test-results/ifc-diagnostics/schemas):
//   IFC2X3_TC1.exp, IFC4_ADD2_TC1.exp — buildingSMART/IFC4.x-development,
//     reference_schemas/, commit 5d08761e63557bd3ded140139eede665ec31511c
//     (--fetch je stáhne z raw.githubusercontent.com na pinovaný commit)
//   IFC4X3_*.exp — oficiální IFC4X3_ADD2.exp ze standards.buildingsmart.org
//     (Cloudflare blokuje stažení skriptem; dodej ručně), nebo vývojová kopie
//     IFC4X3_DEV_923b0514 (buildingSMART/IFC4.x-development, commit 923b0514,
//     2025-05-22) — stejná entitní hierarchie jako ADD2 (876 ENTITY), ale
//     není to publikovaný artefakt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PINNED_COMMIT = '5d08761e63557bd3ded140139eede665ec31511c';
const FETCHABLE = {
  'IFC2X3_TC1.exp': `https://raw.githubusercontent.com/buildingSMART/IFC4.x-development/${PINNED_COMMIT}/reference_schemas/IFC2X3_TC1.exp`,
  'IFC4_ADD2_TC1.exp': `https://raw.githubusercontent.com/buildingSMART/IFC4.x-development/${PINNED_COMMIT}/reference_schemas/IFC4_ADD2_TC1.exp`,
};
// Klíč výstupní množiny podle názvu souboru.
const SCHEMA_KEY = [
  [/^IFC2X3/i, 'IFC2X3'],
  [/^IFC4X3/i, 'IFC4X3'],
  [/^IFC4X1|^IFC4X2/i, null],
  [/^IFC4/i, 'IFC4'],
];

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const schemasDir = opt('schemas', 'test-results/ifc-diagnostics/schemas');
const outPath = opt('out', 'assets/js/3d/ifc-engine/parser/ifc-root-types.js');

if (args.includes('--fetch')) {
  fs.mkdirSync(schemasDir, { recursive: true });
  for (const [name, url] of Object.entries(FETCHABLE)) {
    const dst = path.join(schemasDir, name);
    if (fs.existsSync(dst)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    fs.writeFileSync(dst, await res.text());
    console.log(`staženo ${name}`);
  }
}

/** Odstraní EXPRESS komentáře (* ... *) a -- do konce řádku. */
function stripComments(text) {
  return text.replace(/\(\*[\s\S]*?\*\)/g, '').replace(/--[^\n]*/g, '');
}

/** @returns {{ schemaName: string, parents: Map<string,string|null> }} */
function parseExpress(text) {
  const src = stripComments(text);
  const schemaName = /\bSCHEMA\s+([A-Za-z0-9_]+)\s*;/.exec(src)?.[1] || '?';
  const parents = new Map();
  const re = /\bENTITY\s+([A-Za-z0-9_]+)\b([\s\S]*?);/g;
  let m;
  while ((m = re.exec(src))) {
    const head = m[2];
    const sub = /\bSUBTYPE\s+OF\s*\(\s*([A-Za-z0-9_]+)\s*\)/.exec(head);
    parents.set(m[1], sub ? sub[1] : null);
  }
  return { schemaName, parents };
}

/** Transitivní uzávěr: všechny entity, jejichž řetěz SUBTYPE OF vede k rootu. */
function descendantsOf(parents, root) {
  const memo = new Map();
  const isRoot = (name) => {
    if (name === root) return true;
    if (memo.has(name)) return memo.get(name);
    memo.set(name, false); // ochrana proti cyklu
    const p = parents.get(name);
    const r = p ? isRoot(p) : false;
    memo.set(name, r);
    return r;
  };
  return [...parents.keys()].filter(n => n !== root && isRoot(n)).map(n => n.toUpperCase()).sort();
}

const files = fs.readdirSync(schemasDir).filter(f => /\.exp$/i.test(f)).sort();
if (!files.length) throw new Error(`ve složce ${schemasDir} nejsou žádné .exp (zkus --fetch)`);

const perSchema = {};
const allEntities = new Set();
const sources = [];
for (const f of files) {
  const key = SCHEMA_KEY.find(([re]) => re.test(f))?.[1];
  if (!key) { console.log(`přeskočeno ${f} (schéma mimo rozsah)`); continue; }
  const text = fs.readFileSync(path.join(schemasDir, f), 'utf8');
  const { schemaName, parents } = parseExpress(text);
  if (!parents.has('IfcRoot')) throw new Error(`${f}: nenalezena ENTITY IfcRoot`);
  const list = descendantsOf(parents, 'IfcRoot');
  perSchema[key] = list;
  for (const n of parents.keys()) allEntities.add(n.toUpperCase());
  sources.push({ key, file: f, schemaName, entities: parents.size, roots: list.length, sha256: crypto.createHash('sha256').update(text).digest('hex') });
  console.log(`${f}: SCHEMA ${schemaName}, ENTITY ${parents.size}, podtypů IfcRoot ${list.length}`);
}
for (const k of ['IFC2X3', 'IFC4', 'IFC4X3']) if (!perSchema[k]) throw new Error(`chybí schéma ${k} ve složce ${schemasDir}`);

const union = [...new Set(Object.values(perSchema).flat())].sort();
const unionSet = new Set(union);
const nonRoot = [...allEntities].filter(n => !unionSet.has(n)).sort();
const fmt = (arr) => arr.map(n => `  '${n}',`).join('\n');

const out = `/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// GENEROVÁNO — neupravovat ručně. Zdroj: scripts/ifc-diag/generate-root-types.mjs
// Podtypy IfcRoot (transitivní uzávěr SUBTYPE OF) z EXPRESS schémat buildingSMART:
${sources.map(s => `//   ${s.key}: ${s.file} (SCHEMA ${s.schemaName}, ${s.entities} ENTITY, ${s.roots} podtypů IfcRoot, sha256 ${s.sha256.slice(0, 16)}…)`).join('\n')}
//   IFC2X3/IFC4: buildingSMART/IFC4.x-development reference_schemas/, commit ${PINNED_COMMIT}
//   IFC4X3: ${sources.find(s => s.key === 'IFC4X3')?.schemaName} — viz hlavičku generátoru (ADD2 vs. dev snapshot)
// Názvy jsou UPPERCASE, jak je vrací parseStepText.

export const IFC_ROOT_TYPES_BY_SCHEMA = Object.freeze({
${['IFC2X3', 'IFC4', 'IFC4X3'].map(k => `  ${k}: new Set([\n${fmt(perSchema[k])}\n  ]),`).join('\n')}
});

/** Sjednocení přes všechna schémata (${union.length} typů). */
export const IFC_ROOT_TYPES = new Set([
${fmt(union)}
]);

/**
 * Entity známé ze schémat, které NEJSOU podtypem IfcRoot (${nonRoot.length} typů) —
 * nemají GlobalId; první řetězcový atribut (Name apod.) se nikdy nebere jako GUID.
 */
export const IFC_NON_ROOT_TYPES = new Set([
${fmt(nonRoot)}
]);

/** @param {string} type — UPPERCASE název entity */
export function isIfcRootType(type) {
  return IFC_ROOT_TYPES.has(type);
}
`;
fs.writeFileSync(outPath, out);
console.log(`zapsáno ${outPath}: sjednocení ${union.length} root typů, ${nonRoot.length} ne-root typů`);
