// STEP text parser — text → Map<expressId, RawEntity>.
// Adapted from BIM_checker/assets/js/common/ifc-parser-core.js (splitParams, parseIFCContent).
//
// IMPORTANT: params strings are stored RAW (no IFC encoding decode).
// Consumers that read string values must apply decodeIFCString() from ifc-decoder.js
// themselves. This keeps the parser fast and lets consumers decide when to decode.

/**
 * Split STEP entity params (without outer parens) into top-level fields.
 * Handles nested parens, strings (single quotes), and escaped quotes ('').
 * Empty fields are kept so attribute positions stay stable: "a,,b" → ["a", "", "b"].
 * Only an empty/blank input yields [] (an entity or list with no fields).
 *
 * Example: "'a',(1,2),#3" → ["'a'", "(1,2)", "#3"]
 *
 * Kept in sync with IFCParserCore._splitParams (assets/js/common/ifc-parser-core.js)
 * and IFCStreamParser.parseArguments — tests/test-suites/ifc-parser-parity.test.js guards it.
 */
export function splitParams(params) {
  const out = [];
  if (!params || params.trim() === '') {
    return out;
  }
  let cur = '';
  let depth = 0;
  let inStr = false;

  for (let i = 0; i < params.length; i++) {
    const c = params[i];

    if (c === "'") {
      // IFC escapes apostrophe by doubling: '' inside a string
      if (inStr && params[i + 1] === "'") {
        cur += c + params[i + 1];
        i++;
        continue;
      }
      inStr = !inStr;
    }

    if (!inStr) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

// Regex matches one complete STEP record WITHOUT the terminating ';':
//   #123 = IFCWALL (...)
// - id: digits after #
// - type: letters/digits/underscores; whitespace before '(' is legal STEP
// - params: anything inside outer parens
const ENTITY_RECORD_RE = /^#(\d+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/;
// Complex entity instance: #1=(IFCA(...)IFCB(...)); — not interpreted, only reported.
const COMPLEX_RECORD_RE = /^#\d+\s*=\s*\(/;
const DATA_SECTION_RE = /\bDATA\s*;/;
const MAX_DIAGNOSTIC_SAMPLES = 100;

// Schema detection: FILE_SCHEMA(('IFC4'));
const SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/;

// MVD detection: FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'), '2;1');
const VIEWDEF_RE = /ViewDefinition\s*\[([^\]]*)\]/;

/**
 * Parse a STEP-encoded IFC text into Map<expressId, RawEntity>.
 *
 * RawEntity shape: { expressId, type, params, line }
 * - params is the RAW string between outer parens; NOT decoded for IFC string
 *   encoding (\X\, \X2\, etc). Consumers must call decodeIFCString() if they
 *   read user-facing strings out of params.
 * - All entities are kept (no skip list — geometry is included)
 * - Multi-line entities are joined before regex match
 * - Schema is detected from HEADER section
 *
 * @param {string} text — full IFC file contents
 * @returns {{ entities: Map<number, RawEntity>, schema: string }}
 */
export function parseStepText(text) {
  const entities = new Map();
  let schema = 'UNKNOWN';

  // Detect schema from HEADER (search whole text — HEADER is at top, fast)
  const schemaMatch = text.match(SCHEMA_RE);
  if (schemaMatch) schema = schemaMatch[1];

  // MVD z FILE_DESCRIPTION — HEADER je vždy na začátku, prohledávat celý
  // soubor by bylo zbytečně drahé.
  let viewDefinitions = [];
  const vdMatch = text.slice(0, 8000).match(VIEWDEF_RE);
  if (vdMatch) {
    viewDefinitions = vdMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  const diagnostics = {
    invalidRecords: [],      // { line, text } — records that are not `#id=TYPE(...)`
    invalidRecordCount: 0,
    duplicateIds: [],        // { id, line } — later record overwrites the earlier one
    duplicateIdCount: 0,
    complexRecordCount: 0,   // `#id=(A()B())` — recognised, not interpreted
    commentCount: 0,         // /* ... */ blocks removed from the DATA section
    unterminatedRecord: null // { line, text } when the file ends inside a record
  };

  // Single pass over the DATA section. A record ends at the first ';' that is
  // outside a string ('...', '' = escaped quote) and outside a /* comment */.
  // Comments are cut out of the record text. When the file has no DATA marker
  // (bare fixtures) the whole text is scanned and non-`#` records are ignored.
  const dataMatch = DATA_SECTION_RE.exec(text);
  const hasData = dataMatch !== null;
  let pos = hasData ? dataMatch.index + dataMatch[0].length : 0;
  let line = 1;
  let linePos = 0; // everything before this offset is already counted in `line`
  const lineAt = (offset) => {
    for (let i = text.indexOf('\n', linePos); i !== -1 && i < offset; i = text.indexOf('\n', linePos)) {
      line++;
      linePos = i + 1;
    }
    return line;
  };

  const scanRe = /['/;]/g;
  let segStart = pos;     // start of the current uncommented segment
  let recordText = '';    // finished segments of the current record
  let recordOffset = -1;  // offset of the first non-blank char of the record

  const noteStart = (offset) => {
    if (recordOffset !== -1) return;
    let o = offset;
    while (o < text.length && text.charCodeAt(o) <= 32) o++;
    recordOffset = o;
  };

  const finishRecord = (endOffset) => {
    const raw = recordText + text.slice(segStart, endOffset);
    recordText = '';
    const startOffset = recordOffset === -1 ? endOffset : recordOffset;
    recordOffset = -1;
    let rec = raw.trim();
    if (rec === '') return true;
    if (hasData && /^ENDSEC$/i.test(rec)) return false;
    if (rec.charCodeAt(0) !== 35 /* # */) {
      if (hasData) {
        diagnostics.invalidRecordCount++;
        if (diagnostics.invalidRecords.length < MAX_DIAGNOSTIC_SAMPLES) {
          diagnostics.invalidRecords.push({ line: lineAt(startOffset), text: rec.slice(0, 120) });
        }
      }
      return true;
    }
    // Multi-line records: trim each line and join (same as the former line parser).
    if (rec.indexOf('\n') !== -1) rec = rec.replace(/\s*\r?\n\s*/g, '');
    return acceptRecord(rec, startOffset);
  };

  // `#id=` outside a string inside a record means the previous entity lost its
  // closing `);` and swallowed the next one. Report the broken head, keep the tail.
  const INNER_ENTITY_START_RE = /'(?:[^']|'')*'|(#\d+\s*=)/g;
  const acceptRecord = (rec, startOffset) => {
    if (rec.indexOf('=', 1) !== -1) {
      INNER_ENTITY_START_RE.lastIndex = 1;
      for (let s = INNER_ENTITY_START_RE.exec(rec); s !== null; s = INNER_ENTITY_START_RE.exec(rec)) {
        if (s[1] === undefined) continue;
        diagnostics.invalidRecordCount++;
        if (diagnostics.invalidRecords.length < MAX_DIAGNOSTIC_SAMPLES) {
          diagnostics.invalidRecords.push({ line: lineAt(startOffset), text: rec.slice(0, s.index).slice(0, 120) });
        }
        return acceptRecord(rec.slice(s.index), startOffset);
      }
    }
    const m = ENTITY_RECORD_RE.exec(rec);
    if (!m) {
      if (COMPLEX_RECORD_RE.test(rec)) {
        diagnostics.complexRecordCount++;
      } else {
        diagnostics.invalidRecordCount++;
        if (diagnostics.invalidRecords.length < MAX_DIAGNOSTIC_SAMPLES) {
          diagnostics.invalidRecords.push({ line: lineAt(startOffset), text: rec.slice(0, 120) });
        }
      }
      return true;
    }
    const expressId = parseInt(m[1], 10);
    if (entities.has(expressId)) {
      diagnostics.duplicateIdCount++;
      if (diagnostics.duplicateIds.length < MAX_DIAGNOSTIC_SAMPLES) {
        diagnostics.duplicateIds.push({ id: expressId, line: lineAt(startOffset) });
      }
    }
    entities.set(expressId, { expressId, type: m[2].toUpperCase(), params: m[3], line: lineAt(startOffset) });
    return true;
  };

  scanRe.lastIndex = pos;
  for (let m = scanRe.exec(text); m !== null; m = scanRe.exec(text)) {
    const at = m.index;
    const c = text.charCodeAt(at);
    if (c === 39 /* ' */) {
      noteStart(segStart);
      // Skip the string; '' inside is an escaped apostrophe.
      let j = at + 1;
      for (;;) {
        j = text.indexOf("'", j);
        if (j === -1) { j = text.length; break; }
        if (text.charCodeAt(j + 1) === 39) { j += 2; continue; }
        j++;
        break;
      }
      scanRe.lastIndex = j;
    } else if (c === 47 /* / */) {
      if (text.charCodeAt(at + 1) !== 42 /* * */) continue;
      const end = text.indexOf('*/', at + 2);
      diagnostics.commentCount++;
      const before = text.slice(segStart, at);
      if (before.trim() !== '') noteStart(segStart);
      recordText += before;
      const resume = end === -1 ? text.length : end + 2;
      segStart = resume;
      scanRe.lastIndex = resume;
    } else {
      noteStart(segStart);
      if (!finishRecord(at)) { segStart = text.length; break; }
      segStart = at + 1;
    }
  }

  const tail = (recordText + text.slice(segStart)).trim();
  if (tail !== '' && !(hasData && /^ENDSEC$/i.test(tail)) && (!hasData || tail.charCodeAt(0) === 35)) {
    diagnostics.unterminatedRecord = { line: lineAt(recordOffset === -1 ? segStart : recordOffset), text: tail.slice(0, 120) };
  }

  return { entities, schema, viewDefinitions, diagnostics };
}
