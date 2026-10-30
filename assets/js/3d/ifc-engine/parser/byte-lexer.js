// Byte-level STEP lexer — Uint8Array → struct-of-arrays entity index.
//
// Same record grammar as parseStepText (step-parser.js) but it never builds one
// JS string for the whole file (V8 caps a string at 2^29 - 24 code units) and
// never allocates an object per entity. STEP physical files are ASCII outside
// of string literals and every byte the lexer looks at ('#', '=', '(', ')',
// ''', '/', '*', ';', whitespace) is ASCII, so the scan works on raw bytes and
// `params` is decoded lazily (UTF-8) only when a consumer asks for it.
//
// Parity contract: for every input, `index.get(id)` has the same expressId,
// type and params as `parseStepText(new TextDecoder().decode(bytes)).entities.get(id)`,
// entities come in the same order and `diagnostics` carries the same counts.
// scripts/ifc-diag/byte-lexer-parity.mjs and tests/test-suites/ifc-byte-lexer.test.js guard this.
//
// Known, documented deviations from the string parser (none occur in real files):
// - `\s` / trim() treat only ASCII whitespace (9-13, 32) as blank; Unicode
//   spaces (U+00A0, U+FEFF inside DATA) are content here.
// - Express ids above 2^31 - 1 do not fit Int32Array.
// - `line` is only computed with `opts.lines = true` (nothing in the engine
//   reads RawEntity.line — boolean-extra.js only writes -1 for synthetic
//   entities), so LazyEntity.line is -1 by default.

const MAX_DIAGNOSTIC_SAMPLES = 100;
const COMPLEX = -2;
const INVALID = -1;

// Byte classes for the main scan: 1 = ', 2 = /, 3 = ;, 4 = #.
const CLS = new Uint8Array(256);
CLS[39] = 1;
CLS[47] = 2;
CLS[59] = 3;
CLS[35] = 4;

const isWs = b => b === 32 || (b >= 9 && b <= 13);
const isDigit = b => b >= 48 && b <= 57;
const isAlpha = b => (b >= 65 && b <= 90) || (b >= 97 && b <= 122);
const isWord = b => isAlpha(b) || isDigit(b) || b === 95;

// ignoreBOM: a range decode must never strip bytes (the file-level BOM is
// skipped by the lexer itself, like TextDecoder does for the whole file).
const rangeDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
const ASCII_FAST_PATH_MAX = 4096;

// Same join rule as parseStepText: multi-line records lose the newline and the
// whitespace around it (also inside string literals — kept for parity).
const NEWLINE_JOIN_RE = /\s*\r?\n\s*/g;
const VIEWDEF_RE = /ViewDefinition\s*\[([^\]]*)\]/;

/**
 * Remove /* ... *\/ comments from a decoded record fragment, honouring string
 * literals ('' = escaped apostrophe). Mirrors the comment cut of parseStepText.
 */
function stripComments(s) {
  let out = '';
  let seg = 0;
  for (let i = 0; i < s.length;) {
    const c = s.charCodeAt(i);
    if (c === 39) {
      let j = i + 1;
      for (;;) {
        j = s.indexOf("'", j);
        if (j === -1) {
          j = s.length;
          break;
        }
        if (s.charCodeAt(j + 1) === 39) {
          j += 2;
          continue;
        }
        j++;
        break;
      }
      i = j;
    } else if (c === 47 && s.charCodeAt(i + 1) === 42) {
      const end = s.indexOf('*/', i + 2);
      out += s.slice(seg, i);
      i = end === -1 ? s.length : end + 2;
      seg = i;
    } else {
      i++;
    }
  }
  return out + s.slice(seg);
}

/** Decode UTF-8 bytes [s, e) to a string; short pure-ASCII ranges avoid TextDecoder. */
function decodeRange(bytes, s, e) {
  const len = e - s;
  if (len === 0) {
    return '';
  }
  if (len <= ASCII_FAST_PATH_MAX) {
    let ascii = true;
    for (let k = s; k < e; k++) {
      if (bytes[k] > 127) {
        ascii = false;
        break;
      }
    }
    if (ascii) {
      return String.fromCharCode.apply(null, bytes.subarray(s, e));
    }
  }
  return rangeDecoder.decode(bytes.subarray(s, e));
}

/** Entity view compatible with RawEntity { expressId, type, params, line }. */
export class LazyEntity {
  constructor(index, i) {
    this.expressId = index.ids[i];
    this.type = index.typeNames[index.typeIdx[i]];
    this._index = index;
    this._i = i;
  }

  /** RAW params (no IFC string decode), identical to parseStepText's `params`. */
  get params() {
    return this._index.paramsString(this._i);
  }

  get line() {
    const lines = this._index.lines;
    return lines ? lines[this._i] : -1;
  }
}

/**
 * Struct-of-arrays entity index. Memory per entity: 4 (id) + 2 (type) +
 * 4 or 8 (params start) + 4 (params len) + 1 (flags) bytes, plus the lookup.
 */
export class StepByteIndex {
  constructor(bytes, fields) {
    this.bytes = bytes;
    this.count = fields.count;
    this.ids = fields.ids;
    this.typeIdx = fields.typeIdx;
    this.typeNames = fields.typeNames;
    this.paramsStart = fields.paramsStart;
    this.paramsLen = fields.paramsLen;
    // bit 0: params range contains a comment or a newline → clean on decode.
    this.flags = fields.flags;
    this.lines = fields.lines;
    this.schema = fields.schema;
    this.viewDefinitions = fields.viewDefinitions;
    this.diagnostics = fields.diagnostics;
    this.maxId = fields.maxId;
    // 'dense' = Int32Array indexed by id, 'map' = Map<id, index>.
    this.lookupKind = fields.lookupKind;
    this._dense = fields.dense;
    this._map = fields.map;
  }

  /** Position of the entity with this express id, or -1. */
  lookup(id) {
    if (this._dense) {
      return id >= 0 && id < this._dense.length ? this._dense[id] : -1;
    }
    const v = this._map.get(id);
    return v === undefined ? -1 : v;
  }

  has(id) {
    return this.lookup(id) !== -1;
  }

  typeName(i) {
    return this.typeNames[this.typeIdx[i]];
  }

  /** RAW params string of entity at position i (same value as RawEntity.params). */
  paramsString(i) {
    const s = this.paramsStart[i];
    let str = decodeRange(this.bytes, s, s + this.paramsLen[i]);
    if (this.flags[i] & 1) {
      str = stripComments(str).replace(NEWLINE_JOIN_RE, '');
    }
    return str;
  }

  entity(i) {
    return new LazyEntity(this, i);
  }

  /** LazyEntity by express id, or undefined (Map.get semantics). */
  get(id) {
    const i = this.lookup(id);
    return i === -1 ? undefined : new LazyEntity(this, i);
  }

  * entities() {
    for (let i = 0; i < this.count; i++) {
      yield new LazyEntity(this, i);
    }
  }
}

/** RAW params of entity at position i — free function form of index.paramsString(i). */
export function paramsString(index, i) {
  return index.paramsString(i);
}

/** First match of `\bDATA\s*;` at or after `from`, as { start, end } or null. */
function findDataMarker(bytes, from) {
  const n = bytes.length;
  for (let i = bytes.indexOf(68, from); i !== -1; i = bytes.indexOf(68, i + 1)) {
    if (bytes[i + 1] !== 65 || bytes[i + 2] !== 84 || bytes[i + 3] !== 65) {
      continue;
    }
    if (i > 0 && isWord(bytes[i - 1])) {
      continue;
    }
    let j = i + 4;
    while (j < n && isWs(bytes[j])) {
      j++;
    }
    if (bytes[j] === 59) {
      return { start: i, end: j + 1 };
    }
  }
  return null;
}

/** FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\) over the whole input (like parseStepText). */
function findSchema(bytes) {
  const n = bytes.length;
  const skipWs = j => {
    while (j < n && isWs(bytes[j])) {
      j++;
    }
    return j;
  };
  const KEY = 'FILE_SCHEMA';
  for (let i = bytes.indexOf(70, 0); i !== -1; i = bytes.indexOf(70, i + 1)) {
    let k = 0;
    while (k < KEY.length && bytes[i + k] === KEY.charCodeAt(k)) {
      k++;
    }
    if (k !== KEY.length) {
      continue;
    }
    let j = skipWs(i + KEY.length);
    if (bytes[j] !== 40) {
      continue;
    }
    j = skipWs(j + 1);
    if (bytes[j] !== 40) {
      continue;
    }
    j = skipWs(j + 1);
    if (bytes[j] !== 39) {
      continue;
    }
    const s = j + 1;
    const e = bytes.indexOf(39, s);
    if (e === -1 || e === s) {
      continue;
    }
    j = skipWs(e + 1);
    if (bytes[j] !== 41) {
      continue;
    }
    j = skipWs(j + 1);
    if (bytes[j] !== 41) {
      continue;
    }
    return decodeRange(bytes, s, e);
  }
  return 'UNKNOWN';
}

/**
 * Build the entity index of a STEP file held as bytes.
 *
 * @param {Uint8Array} bytes — whole file (a Buffer works too; a plain Uint8Array view is faster)
 * @param {{ lines?: boolean, allDataSections?: boolean }} [opts]
 *   lines: also record the 1-based line of every entity (costs 4 B/entity and a newline count).
 *   allDataSections: after ENDSEC keep scanning for further `DATA;` sections.
 *     Off by default because parseStepText stops at the first ENDSEC.
 * @returns {StepByteIndex}
 */
export function indexStepBytes(bytes, opts = {}) {
  if (bytes instanceof ArrayBuffer) {
    bytes = new Uint8Array(bytes);
  } else if (bytes.constructor !== Uint8Array) {
    // Buffer overrides indexOf; a plain view shares the memory.
    bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  const n = bytes.length;
  const wantLines = !!opts.lines;
  const allSections = !!opts.allDataSections;

  // ---- growable columns (doubling, trimmed with slice() at the end) ----
  // paramsStart: Uint32Array covers files < 4 GiB — the only sizes a browser
  // can hold in one ArrayBuffer today; Float64Array is used above that limit
  // (cannot be exercised here but keeps the format honest), so no second column.
  let cap = Math.max(1024, Math.floor(n / 48));
  let ids = new Int32Array(cap);
  let typeIdx = new Uint16Array(cap);
  let paramsStart = n > 0xFFFFFFFF ? new Float64Array(cap) : new Uint32Array(cap);
  let paramsLen = new Uint32Array(cap);
  let flags = new Uint8Array(cap);
  let lines = wantLines ? new Int32Array(cap) : null;
  let count = 0;
  let maxId = -1;
  const grow = () => {
    cap *= 2;
    const g = (arr, Ctor) => {
      const next = new Ctor(cap);
      next.set(arr);
      return next;
    };
    ids = g(ids, Int32Array);
    typeIdx = g(typeIdx, Uint16Array);
    paramsStart = g(paramsStart, paramsStart.constructor);
    paramsLen = g(paramsLen, Uint32Array);
    flags = g(flags, Uint8Array);
    if (lines) {
      lines = g(lines, Int32Array);
    }
  };

  // ---- type-name interning (hash of upper-cased bytes, verified) ----
  const typeNames = [];
  const typeByHash = new Map();
  const typeByName = new Map();
  const scratch = new Uint8Array(256);
  let scratchLen = 0;
  let scratchHash = 0;
  const internType = () => {
    const cached = typeByHash.get(scratchHash);
    if (cached !== undefined) {
      const name = typeNames[cached];
      if (name.length === scratchLen) {
        let k = 0;
        while (k < scratchLen && name.charCodeAt(k) === scratch[k]) {
          k++;
        }
        if (k === scratchLen) {
          return cached;
        }
      }
    }
    const name = String.fromCharCode.apply(null, scratch.subarray(0, scratchLen));
    let idx = typeByName.get(name);
    if (idx === undefined) {
      if (typeNames.length === 0xFFFF) {
        throw new RangeError('STEP file uses more than 65535 distinct entity types');
      }
      idx = typeNames.length;
      typeNames.push(name);
      typeByName.set(name, idx);
      if (cached === undefined) {
        typeByHash.set(scratchHash, idx);
      }
    }
    return idx;
  };

  const diagnostics = {
    invalidRecords: [],
    invalidRecordCount: 0,
    duplicateIds: [],
    duplicateIdCount: 0,
    complexRecordCount: 0,
    commentCount: 0,
    unterminatedRecord: null
  };

  // ---- line numbers (lazy newline count, only with opts.lines) ----
  let line = 1;
  let linePos = 0;
  const lineAt = (offset) => {
    if (!wantLines) {
      return -1;
    }
    for (let i = bytes.indexOf(10, linePos); i !== -1 && i < offset; i = bytes.indexOf(10, linePos)) {
      line++;
      linePos = i + 1;
    }
    return line;
  };

  // ---- byte helpers ----
  /** i at "/*": index after the closing "*\/", or `end` when unterminated. */
  const skipComment = (i, end) => {
    for (let k = bytes.indexOf(42, i + 2); k !== -1 && k + 1 < end; k = bytes.indexOf(42, k + 1)) {
      if (bytes[k + 1] === 47) {
        return k + 2;
      }
    }
    return end;
  };
  /** Skip whitespace and comments (a `\s*` slot of the record grammar). */
  const skipBlank = (i, end) => {
    for (;;) {
      if (i >= end) {
        return end;
      }
      const b = bytes[i];
      if (isWs(b)) {
        i++;
      } else if (b === 47 && bytes[i + 1] === 42 && i + 1 < end) {
        i = skipComment(i, end);
      } else {
        return i;
      }
    }
  };
  /**
   * Next byte that survives parseStepText's comment cut and newline join:
   * comments vanish, a whitespace run (comments included) containing '\n'
   * vanishes, a run without '\n' survives as whitespace (its first byte is
   * returned). Lets tokens like `#12` span a line break exactly like the
   * string parser's NEWLINE_JOIN_RE replace.
   */
  const logical = (i, end) => {
    for (;;) {
      if (i >= end) {
        return end;
      }
      const b = bytes[i];
      if (b === 47 && bytes[i + 1] === 42 && i + 1 < end) {
        i = skipComment(i, end);
      } else if (isWs(b)) {
        let j = i;
        let nl = false;
        for (;;) {
          if (j >= end) {
            break;
          }
          const c = bytes[j];
          if (c === 10) {
            nl = true;
            j++;
          } else if (isWs(c)) {
            j++;
          } else if (c === 47 && bytes[j + 1] === 42 && j + 1 < end) {
            j = skipComment(j, end);
          } else {
            break;
          }
        }
        if (!nl) {
          return i;
        }
        i = j;
      } else {
        return i;
      }
    }
  };

  /** `#\d+\s*=` at byte i (outside strings/comments) — the inner-entity-start test of parseStepText. */
  const innerStartAt = (i) => {
    let j = i + 1;
    if (!isDigit(bytes[j])) {
      j = logical(j, n);
      if (j >= n || !isDigit(bytes[j])) {
        return false;
      }
    }
    while (isDigit(bytes[j])) {
      j++;
    }
    const b = bytes[j];
    if (b === 61) {
      return true;
    }
    if (!isWs(b) && b !== 47) {
      return false;
    }
    j = logical(j, n);
    while (j < n && isDigit(bytes[j])) {
      j = logical(j + 1, n);
    }
    j = skipBlank(j, n);
    return bytes[j] === 61;
  };

  // ---- record head: #id = TYPE ( ----
  let headId = 0;
  let headType = 0;
  /** Parse `#(\d+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*\(` at p; returns params start, INVALID or COMPLEX. */
  const parseHead = (p, end) => {
    let i = logical(p + 1, end);
    if (i >= end || !isDigit(bytes[i])) {
      return INVALID;
    }
    let id = 0;
    while (i < end && isDigit(bytes[i])) {
      id = id * 10 + (bytes[i] - 48);
      i = logical(i + 1, end);
    }
    i = skipBlank(i, end);
    if (bytes[i] !== 61 || i >= end) {
      return INVALID;
    }
    i = skipBlank(i + 1, end);
    if (i >= end) {
      return INVALID;
    }
    if (bytes[i] === 40) {
      return COMPLEX;
    }
    if (!isAlpha(bytes[i])) {
      return INVALID;
    }
    scratchLen = 0;
    let h = 0x811c9dc5;
    while (i < end && isWord(bytes[i])) {
      let b = bytes[i];
      if (b >= 97 && b <= 122) {
        b -= 32;
      }
      if (scratchLen === scratch.length) {
        return INVALID; // no real schema has a 256-char entity name
      }
      scratch[scratchLen++] = b;
      h = Math.imul(h ^ b, 0x01000193);
      i = logical(i + 1, end);
    }
    scratchHash = h >>> 0;
    i = skipBlank(i, end);
    if (bytes[i] !== 40 || i >= end) {
      return INVALID;
    }
    headId = id;
    headType = internType();
    return i + 1;
  };

  // ---- per-record state collected by the main scan ----
  const cStart = []; // comment ranges inside the current record
  const cEnd = [];
  const splits = []; // byte offsets of `#\d+\s*=` found inside the record
  let noteOffset = false; // parseStepText.noteStart() quirk, only for the unterminated tail
  let segStart = 0;
  const resetRecord = () => {
    cStart.length = 0;
    cEnd.length = 0;
    splits.length = 0;
    noteOffset = false;
  };

  /** End of the trailing content of [p, recEnd): skip whitespace and comments backwards. */
  const contentEnd = (p, recEnd) => {
    let j = recEnd;
    let k = cEnd.length - 1;
    for (;;) {
      while (j > p && isWs(bytes[j - 1])) {
        j--;
      }
      while (k >= 0 && cEnd[k] > j) {
        k--;
      }
      if (k >= 0 && cEnd[k] === j && cStart[k] >= p) {
        j = cStart[k];
        k--;
        continue;
      }
      return j;
    }
  };

  /** Comment-free, trimmed (optionally newline-joined) text of [from, to) — only for diagnostics samples. */
  const cleanedText = (from, to, join, trim = true) => {
    let s = decodeRange(bytes, from, to);
    if (cStart.length) {
      s = stripComments(s);
    }
    if (trim) {
      s = s.trim();
    }
    if (join) {
      s = s.replace(NEWLINE_JOIN_RE, '');
    }
    return s.slice(0, 120);
  };

  /** /^ENDSEC$/i on the comment-free, trimmed record [p, q): comments are transparent, whitespace is not. */
  const isEndsec = (p, q) => {
    const KEY = 'ENDSEC';
    let i = p;
    for (let k = 0; k < KEY.length; k++) {
      while (i < q && bytes[i] === 47 && bytes[i + 1] === 42) {
        i = skipComment(i, q);
      }
      if (i >= q || (bytes[i] & 0xDF) !== KEY.charCodeAt(k)) {
        return false;
      }
      i++;
    }
    while (i < q && bytes[i] === 47 && bytes[i + 1] === 42) {
      i = skipComment(i, q);
    }
    return i >= q;
  };

  // Position of the first '\n' at or after `pos`, cached so the forward
  // search is amortised O(n) even for files without line breaks.
  let nextNl = -1;
  const newlineAfter = (pos) => {
    if (nextNl < pos) {
      const k = bytes.indexOf(10, pos);
      nextNl = k === -1 ? n : k;
    }
    return nextNl;
  };

  const addInvalid = (lineNo, text) => {
    diagnostics.invalidRecordCount++;
    if (diagnostics.invalidRecords.length < MAX_DIAGNOSTIC_SAMPLES) {
      diagnostics.invalidRecords.push({ line: lineNo, text });
    }
  };

  let hasData = false;

  /** Classify the record [recBegin, recEnd) (recEnd = the ';'). Returns false on ENDSEC. */
  const finishRecord = (recBegin, recEnd) => {
    let p = skipBlank(recBegin, recEnd);
    if (p >= recEnd) {
      return true;
    }
    const q = contentEnd(p, recEnd);
    if (hasData && isEndsec(p, q)) {
      return false;
    }
    if (bytes[p] !== 35) {
      if (hasData) {
        addInvalid(lineAt(p), cleanedText(p, q, false));
      }
      return true;
    }
    const startLine = lineAt(p);
    for (let s = 0; s < splits.length; s++) {
      const at = splits[s];
      if (at > p) {
        addInvalid(startLine, cleanedText(p, at, true, false));
        p = at;
      }
    }
    const ps = parseHead(p, q);
    if (ps === COMPLEX) {
      diagnostics.complexRecordCount++;
      return true;
    }
    if (ps === INVALID || q - 1 < ps || bytes[q - 1] !== 41) {
      addInvalid(startLine, cleanedText(p, q, true));
      return true;
    }
    if (count === cap) {
      grow();
    }
    const len = q - 1 - ps;
    ids[count] = headId;
    typeIdx[count] = headType;
    paramsStart[count] = ps;
    paramsLen[count] = len;
    let f = 0;
    if (len > 0 && (newlineAfter(ps) < q - 1 || (cStart.length && cStart[cStart.length - 1] >= ps))) {
      f = 1;
    }
    flags[count] = f;
    if (lines) {
      lines[count] = startLine;
    }
    if (headId > maxId) {
      maxId = headId;
    }
    count++;
    return true;
  };

  // ---- header ----
  let pos = 0;
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    pos = 3; // UTF-8 BOM: TextDecoder drops it, so does the lexer
  }
  const schema = findSchema(bytes);
  let viewDefinitions = [];
  const vdMatch = decodeRange(bytes, pos, Math.min(n, pos + 32000)).slice(0, 8000).match(VIEWDEF_RE);
  if (vdMatch) {
    viewDefinitions = vdMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }
  const data = findDataMarker(bytes, pos);
  hasData = data !== null;
  if (hasData) {
    pos = data.end;
  }

  // ---- main scan: one pass over the DATA section ----
  let i = pos;
  let recBegin = pos;
  segStart = pos;
  let ended = false;
  while (i < n) {
    const c = CLS[bytes[i]];
    if (c === 0) {
      i++;
    } else if (c === 1) {
      let j = i + 1;
      for (;;) {
        j = bytes.indexOf(39, j);
        if (j === -1) {
          j = n;
          break;
        }
        if (bytes[j + 1] === 39) {
          j += 2;
          continue;
        }
        j++;
        break;
      }
      noteOffset = true;
      i = j;
    } else if (c === 2) {
      if (bytes[i + 1] !== 42) {
        i++;
        continue;
      }
      if (!noteOffset) {
        let k = segStart;
        while (k < i && isWs(bytes[k])) {
          k++;
        }
        noteOffset = k < i;
      }
      const e = skipComment(i, n);
      diagnostics.commentCount++;
      cStart.push(i);
      cEnd.push(e);
      segStart = e;
      i = e;
    } else if (c === 3) {
      const cont = finishRecord(recBegin, i);
      i++;
      recBegin = i;
      segStart = i;
      resetRecord();
      if (!cont) {
        const next = allSections ? findDataMarker(bytes, i) : null;
        if (next === null) {
          ended = true;
          break;
        }
        i = next.end;
        recBegin = i;
        segStart = i;
      }
    } else {
      if (innerStartAt(i)) {
        splits.push(i);
      }
      i++;
    }
  }

  if (!ended) {
    const p = skipBlank(recBegin, n);
    if (p < n) {
      const q = contentEnd(p, n);
      if (!(hasData && isEndsec(p, q)) && (!hasData || bytes[p] === 35)) {
        diagnostics.unterminatedRecord = { line: lineAt(noteOffset ? p : segStart), text: cleanedText(p, q, false) };
      }
    }
  }

  // ---- lookup + duplicate ids (later record overwrites the earlier slot, like Map.set) ----
  // Dense table costs 4 B per id up to maxId; a Map costs ~40+ B per entity.
  // Dense wins unless ids are very sparse (maxId > 8 × count).
  const dense = maxId + 1 <= 8 * count + 1024;
  const table = dense ? new Int32Array(maxId + 1).fill(-1) : null;
  const map = dense ? null : new Map();
  const getSlot = id => (dense ? table[id] : (map.get(id) ?? -1));
  const setSlot = (id, j) => {
    if (dense) {
      table[id] = j;
    } else {
      map.set(id, j);
    }
  };
  let dead = 0;
  for (let j = 0; j < count; j++) {
    const id = ids[j];
    const prev = getSlot(id);
    if (prev === -1) {
      setSlot(id, j);
      continue;
    }
    diagnostics.duplicateIdCount++;
    if (diagnostics.duplicateIds.length < MAX_DIAGNOSTIC_SAMPLES) {
      diagnostics.duplicateIds.push({ id, line: lines ? lines[j] : -1 });
    }
    typeIdx[prev] = typeIdx[j];
    paramsStart[prev] = paramsStart[j];
    paramsLen[prev] = paramsLen[j];
    flags[prev] = flags[j];
    if (lines) {
      lines[prev] = lines[j];
    }
    ids[j] = -1;
    dead++;
  }
  if (dead) {
    let k = 0;
    for (let j = 0; j < count; j++) {
      if (ids[j] === -1) {
        continue;
      }
      if (k !== j) {
        ids[k] = ids[j];
        typeIdx[k] = typeIdx[j];
        paramsStart[k] = paramsStart[j];
        paramsLen[k] = paramsLen[j];
        flags[k] = flags[j];
        if (lines) {
          lines[k] = lines[j];
        }
      }
      setSlot(ids[k], k);
      k++;
    }
    count = k;
  }

  return new StepByteIndex(bytes, {
    count,
    ids: ids.slice(0, count),
    typeIdx: typeIdx.slice(0, count),
    typeNames,
    paramsStart: paramsStart.slice(0, count),
    paramsLen: paramsLen.slice(0, count),
    flags: flags.slice(0, count),
    lines: lines ? lines.slice(0, count) : null,
    schema,
    viewDefinitions,
    diagnostics,
    maxId,
    lookupKind: dense ? 'dense' : 'map',
    dense: table,
    map
  });
}
