#!/usr/bin/env node
// Synthetic STEP load fixture; Node >= 18.15 (statfs). No engine dependencies.
// Usage: node scripts/ifc-diag/make-large-ifc.mjs input.ifc /outside/repo/out.ifc [target-MiB=700]
// Repeats whole DATA sections, so output may exceed the requested minimum size.
// GlobalIds intentionally remain unchanged: this is not a semantic IFC model merge.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, statfs, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';

const MiB = 1048576;
const MAX_RECORD = 64 * MiB;
const RESERVE = 256 * MiB;
const ENTITY = /^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\(([\s\S]*)\)\s*;$/i;
const TOKENS = /'(?:[^']|'')*'|"[0-9A-F]*"|#(\d+)/gi;
const stripComments = text => text.replace(/'(?:[^']|'')*'|\/\*[\s\S]*?\*\//g,
  token => token.startsWith('/*') ? ' ' : token);

/** Bounded record scanner: quotes, doubled quotes, comments and chunk boundaries.
 * latin1 is a reversible byte mapping, not a UTF-8 decode; non-ASCII bytes survive.
 * Memory: one record (capped at 64 MiB), plus the stream chunk.
 */
export async function* stepRecords(file, highWaterMark = MiB) {
  let carry = '';
  let parts = [];
  let size = 0;
  let quoted = false;
  let comment = false;
  function append(part) {
    size += part.length;
    if (size > MAX_RECORD) throw new Error('STEP record exceeds 64 MiB safety limit');
    parts.push(part);
  }
  function* scan(data, final = false) {
    // Keep one byte for lookahead across chunks ('', /* and */).
    const end = final ? data.length : data.length - 1;
    let start = 0;
    let i = 0;
    for (; i < end; i++) {
      const c = data[i];
      if (comment) {
        if (c === '*' && data[i + 1] === '/') { comment = false; i++; }
      } else if (quoted) {
        if (c === "'") {
          if (data[i + 1] === "'") i++;
          else quoted = false;
        }
      } else if (c === "'") {
        quoted = true;
      } else if (c === '/' && data[i + 1] === '*') {
        comment = true;
        i++;
      } else if (c === ';') {
        append(data.slice(start, i + 1));
        yield stripComments(parts.join('')).trim();
        parts = [];
        size = 0;
        start = i + 1;
      }
    }
    append(data.slice(start, i));
    carry = data.slice(i);
  }
  for await (const chunk of createReadStream(file, { encoding: 'latin1', highWaterMark })) {
    yield* scan(carry + chunk);
  }
  yield* scan(carry, true);
  if (quoted || comment || stripComments(parts.join('')).trim()) {
    throw new Error('Unterminated STEP string, comment or record');
  }
}

function entity(record) {
  const m = ENTITY.exec(record);
  if (!m) throw new Error(`Unsupported DATA record (simple entities only): ${record.slice(0, 100)}`);
  const id = Number(m[1]);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Invalid expressId: ${m[1]}`);
  // Structural STEP validation, not EXPRESS attribute/schema validation.
  const token = /\s+|'(?:[^']|'')*'|"[0-9A-F]*"|#\d+|\.[A-Z_][A-Z0-9_]*\.|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?|[A-Z_][A-Z0-9_]*|[(),$*]/giy;
  let depth = 0;
  let pos = 0;
  while (pos < m[3].length) {
    token.lastIndex = pos;
    const t = token.exec(m[3]);
    if (!t) throw new Error(`Invalid STEP token in #${id} at ${pos}`);
    if (t[0] === '(') depth++;
    if (t[0] === ')' && --depth < 0) throw new Error(`Unbalanced parentheses in #${id}`);
    pos = token.lastIndex;
  }
  if (depth !== 0) throw new Error(`Unbalanced parentheses in #${id}`);
  return id;
}

async function* sections(file) {
  let state = 'start';
  const headers = new Set();
  for await (const record of stepRecords(file)) {
    const key = record.toUpperCase();
    if (state === 'start' && key === 'ISO-10303-21;') state = 'header-start';
    else if (state === 'header-start' && key === 'HEADER;') state = 'header';
    else if (state === 'header' && key === 'ENDSEC;') {
      if (!['FILE_DESCRIPTION', 'FILE_NAME', 'FILE_SCHEMA'].every(k => headers.has(k))) {
        throw new Error('Missing required HEADER records');
      }
      state = 'data-start';
    } else if (state === 'header' && /^[A-Z][A-Z0-9_]*\s*\([\s\S]*\);$/i.test(record)) {
      headers.add(record.match(/^[A-Z][A-Z0-9_]*/i)[0].toUpperCase());
    } else if (state === 'data-start' && key === 'DATA;') state = 'data';
    else if (state === 'data' && key === 'ENDSEC;') { state = 'end'; continue; }
    else if (state === 'data' && record.startsWith('#')) {
      yield { kind: 'entity', record };
      continue;
    } else if (state === 'end' && key === 'END-ISO-10303-21;') { state = 'done'; continue; }
    else throw new Error(`Unexpected STEP record in ${state}: ${record.slice(0, 100)}`);
    yield { kind: 'header', record };
  }
  if (state !== 'done') throw new Error(`Incomplete STEP envelope (${state})`);
}

function rewrite(record, offset, ids) {
  return record.replace(TOKENS, (token, digits) => {
    if (digits === undefined) return token;
    const id = Number(digits);
    if (!ids.has(id)) throw new Error(`Dangling reference #${digits}`);
    // Preserve leading-zero width so the target-size lower bound stays valid.
    return `#${String(id + offset).padStart(digits.length, '0')}`;
  });
}

export async function makeLargeIfc(input, output, targetMiB = 700) {
  input = resolve(input);
  output = resolve(output);
  if (input === output) throw new Error('Input and output must differ');
  if (!Number.isFinite(targetMiB) || targetMiB <= 0 || !Number.isSafeInteger(Math.ceil(targetMiB * MiB))) {
    throw new Error('target-MiB must be a positive, safe finite size');
  }
  const before = await stat(input);
  const ids = new Set();
  let maxId = 0;
  let dataBytes = 0;
  let refTokens = 0;
  let headerBytes = 0;
  for await (const { kind, record } of sections(input)) {
    if (kind === 'header') { headerBytes += record.length + 1; continue; }
    const id = entity(record);
    if (ids.has(id)) throw new Error(`Duplicate expressId #${id}`);
    ids.add(id);
    maxId = Math.max(maxId, id);
    dataBytes += record.length + 1;
    for (const m of record.matchAll(TOKENS)) if (m[1] !== undefined) refTokens++;
  }
  if (!ids.size) throw new Error('Empty DATA section');
  const footer = 'ENDSEC;\nEND-ISO-10303-21;\n';
  const copies = Math.max(1, Math.ceil((targetMiB * MiB - headerBytes - footer.length) / dataBytes));
  if (!Number.isSafeInteger(copies * maxId) || !Number.isSafeInteger(copies * ids.size)) {
    throw new Error('Repeated expressIds/entity count would exceed Number.MAX_SAFE_INTEGER');
  }
  // Upper bound: assume every ID/ref grows from one digit to the largest output ID.
  const upperBytes = headerBytes + footer.length + copies *
    (dataBytes + refTokens * (String(copies * maxId).length - 1));
  if (!Number.isSafeInteger(upperBytes)) throw new Error('Output size bound is not a safe integer');
  await mkdir(dirname(output), { recursive: true });
  const disk = await statfs(dirname(output), { bigint: true });
  const available = disk.bavail * disk.bsize;
  if (available < BigInt(upperBytes) + BigInt(RESERVE)) {
    throw new Error(`Insufficient free space: available=${available}, upperBound=${upperBytes}, reserve=${RESERVE}`);
  }
  // Validate forward references before creating any output. Set contains source IDs only.
  for await (const { kind, record } of sections(input)) {
    if (kind === 'entity') rewrite(record, 0, ids);
  }
  const assertUnchanged = async () => {
    const now = await stat(input);
    if (now.size !== before.size || now.mtimeMs !== before.mtimeMs || now.ino !== before.ino) {
      throw new Error('Input changed during generation');
    }
  };
  await assertUnchanged();
  let writtenEntities = 0;
  async function* outputChunks() {
    let batch = '';
    for (let copy = 0; copy < copies; copy++) {
      for await (const { kind, record } of sections(input)) {
        if (kind === 'header') {
          if (copy === 0) batch += record + '\n';
        } else {
          batch += rewrite(record, copy * maxId, ids) + '\n';
          writtenEntities++;
        }
        if (batch.length >= MiB) { yield Buffer.from(batch, 'latin1'); batch = ''; }
      }
      await assertUnchanged();
    }
    yield Buffer.from(batch + footer, 'latin1');
  }
  // Never overwrite an existing file; remove only our own partial output on error.
  let created = false;
  const destination = createWriteStream(output, { flags: 'wx' });
  destination.once('open', () => { created = true; });
  try {
    await pipeline(outputChunks(), destination);
    if (writtenEntities !== copies * ids.size) throw new Error('Unexpected entity count');
    return { input, output, targetMiB, sourceEntities: ids.size, maxId, copies,
      entities: writtenEntities, bytes: (await stat(output)).size, upperBytes,
      availableBefore: Number(available), globalIds: 'unchanged (duplicates across copies)' };
  } catch (error) {
    if (created) await unlink(output);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, target = '700', ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length || input === '--help') {
    console.error('Usage: node make-large-ifc.mjs input.ifc /outside/repo/output.ifc [target-MiB=700]');
    process.exitCode = input === '--help' ? 0 : 1;
  } else {
    try { console.log(JSON.stringify(await makeLargeIfc(input, output, Number(target)), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
