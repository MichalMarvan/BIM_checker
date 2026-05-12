// STEP text parser — text → Map<expressId, RawEntity>.
// Adapted from BIM_checker/assets/js/common/ifc-parser-core.js (splitParams, parseIFCContent).
//
// IMPORTANT: params strings are stored RAW (no IFC encoding decode).
// Consumers that read string values must apply decodeIFCString() from ifc-decoder.js
// themselves. This keeps the parser fast and lets consumers decide when to decode.

/**
 * Split STEP entity params (without outer parens) into top-level fields.
 * Handles nested parens, strings (single quotes), and escaped quotes ('').
 *
 * Example: "'a',(1,2),#3" → ["'a'", "(1,2)", "#3"]
 */
export function splitParams(params) {
  const out = [];
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
        const trimmed = cur.trim();
        if (trimmed !== '') out.push(trimmed);
        cur = '';
        continue;
      }
    }
    cur += c;
  }
  const trimmed = cur.trim();
  if (trimmed !== '') out.push(trimmed);
  return out;
}

// Regex matches a single STEP entity line: #123=IFCWALL(...);
// - id: digits after #
// - type: uppercase letters/digits/underscores
// - params: anything inside outer parens (greedy, but lazy at end before );)
const ENTITY_LINE_RE = /^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\((.*)\)\s*;\s*$/;

// Schema detection: FILE_SCHEMA(('IFC4'));
const SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/;

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

  // Walk lines. Some entities span multiple lines — join until ');' is found.
  const lines = text.split('\n');
  let buf = '';
  let bufStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Start of a new entity line?
    if (buf === '' && trimmed.startsWith('#')) {
      buf = trimmed;
      bufStartLine = i + 1; // 1-based
    } else if (buf !== '') {
      buf += trimmed;
    } else {
      continue; // not a #N= line, skip (HEADER, ENDSEC, etc.)
    }

    // Entity continues until ');' (followed by optional whitespace/end)
    if (!/\)\s*;\s*$/.test(buf)) continue;

    // Try to match
    const m = buf.match(ENTITY_LINE_RE);
    buf = ''; // reset buffer regardless of match

    if (!m) continue; // malformed — skip silently
    const expressId = parseInt(m[1], 10);
    const type = m[2].toUpperCase();
    const params = m[3];
    entities.set(expressId, { expressId, type, params, line: bufStartLine });
  }

  return { entities, schema };
}
