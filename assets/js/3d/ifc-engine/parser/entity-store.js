// EntityStore — Map<expressId, RawEntity>-compatible view over a StepByteIndex.
//
// EntityIndex and the engine were written against the Map that parseStepText
// returns (get / has / size / iteration of [id, entity]). This class gives the
// byte index the same surface without materialising an object per entity:
// every get() returns a fresh LazyEntity (flyweight over the typed-array
// columns; params decoded on first read), so a 14 M-entity file costs the
// ~15 B/entity of the columns plus the file bytes, not 200+ B/entity.
//
// On top of the Map surface it adds what EntityIndex needs to stay cheap on
// large models:
//  - a per-type position index built with one counting sort over typeIdx
//    (Int32Array, no Set<number> per type);
//  - firstAttrString(i): the first attribute when it is a string literal,
//    read straight from the bytes — the GUID index only decodes GUIDs of
//    root entities, never whole params;
//  - release(): drop the file bytes once compact() copied the kept entities.
//
// Deletion is deliberately NOT supported: compact() in EntityIndex rebuilds a
// plain Map of the survivors (strings) and releases the bytes — deleting
// in-place would keep the whole file alive for the 10–20 % of entities kept.

import { StepByteIndex, decodeRange } from './byte-lexer.js';

const isAttrWs = b => b === 32 || b === 9 || b === 13 || b === 10;

/** JS-string twin of firstAttrString, used when params need the cleaned decode. */
export function firstAttrStringOf(params) {
  const n = params.length;
  let i = 0;
  while (i < n && (params[i] === ' ' || params[i] === '\t' || params[i] === '\r' || params[i] === '\n')) {
    i++;
  }
  if (params[i] !== "'") {
    return null;
  }
  let j = i + 1;
  while (j < n) {
    if (params[j] === "'") {
      if (params[j + 1] === "'") {
        j += 2;
        continue;
      }
      break;
    }
    j++;
  }
  if (j >= n) {
    return null;
  }
  let k = j + 1;
  while (k < n && (params[k] === ' ' || params[k] === '\t' || params[k] === '\r' || params[k] === '\n')) {
    k++;
  }
  if (k < n && params[k] !== ',') {
    return null;
  }
  const s = params.slice(i + 1, j);
  return s.length ? s : null;
}

export class EntityStore {
  /** @param {StepByteIndex} index */
  constructor(index) {
    if (!(index instanceof StepByteIndex)) {
      throw new TypeError('EntityStore expects a StepByteIndex');
    }
    this.index = index;
    this._typeStart = null; // Int32Array(typeCount + 1): prefix sums over typeIdx
    this._typeOrder = null; // Int32Array(count): positions grouped by type, ascending inside a group
    this._typeByName = null; // Map<UPPERCASE name, typeIdx>
  }

  get size() {
    return this.index.count;
  }

  get(id) {
    return this.index.get(id);
  }

  has(id) {
    return this.index.has(id);
  }

  * keys() {
    const ids = this.index.ids;
    for (let i = 0, n = this.index.count; i < n; i++) {
      yield ids[i];
    }
  }

  * values() {
    for (let i = 0, n = this.index.count; i < n; i++) {
      yield this.index.entity(i);
    }
  }

  * entries() {
    const ids = this.index.ids;
    for (let i = 0, n = this.index.count; i < n; i++) {
      yield [ids[i], this.index.entity(i)];
    }
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  forEach(fn, thisArg) {
    for (const [id, e] of this.entries()) {
      fn.call(thisArg, e, id, this);
    }
  }

  // ---- type index ----

  _buildTypeIndex() {
    const { typeIdx, typeNames, count } = this.index;
    const typeCount = typeNames.length;
    const start = new Int32Array(typeCount + 1);
    for (let i = 0; i < count; i++) {
      start[typeIdx[i] + 1]++;
    }
    for (let t = 0; t < typeCount; t++) {
      start[t + 1] += start[t];
    }
    const fill = start.slice(0, typeCount);
    const order = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      order[fill[typeIdx[i]]++] = i;
    }
    this._typeStart = start;
    this._typeOrder = order;
    this._typeByName = new Map(typeNames.map((name, t) => [name, t]));
  }

  /** typeIdx of an UPPERCASE type name, or -1. */
  typeIndexOf(name) {
    if (!this._typeByName) {
      this._buildTypeIndex();
    }
    const t = this._typeByName.get(name);
    return t === undefined ? -1 : t;
  }

  /** Entity positions of type t (typeIdx), ascending — a view, do not mutate. */
  positionsOfType(t) {
    if (!this._typeOrder) {
      this._buildTypeIndex();
    }
    return this._typeOrder.subarray(this._typeStart[t], this._typeStart[t + 1]);
  }

  typeCountOf(t) {
    if (!this._typeStart) {
      this._buildTypeIndex();
    }
    return this._typeStart[t + 1] - this._typeStart[t];
  }

  /** Type names with at least one entity (duplicate folding can empty a type). */
  presentTypeNames() {
    const names = this.index.typeNames;
    const out = [];
    for (let t = 0; t < names.length; t++) {
      if (this.typeCountOf(t) > 0) {
        out.push(names[t]);
      }
    }
    return out;
  }

  // ---- first attribute (GUID candidate) ----

  /**
   * Content of the FIRST attribute of entity at position i when it is a quoted
   * string followed by ',' or the end of params (raw, '' escapes kept); null
   * otherwise. Same rule as extractFirstAttrString in entity-index.js, applied
   * to the bytes so only the literal itself is decoded. Params that need the
   * comment/newline cleanup (flag bit 0) take the decoded route.
   */
  firstAttrString(i) {
    const ix = this.index;
    if (ix.flags[i] & 1) {
      return firstAttrStringOf(ix.paramsString(i));
    }
    const bytes = ix.bytes;
    const s = ix.paramsStart[i];
    const e = s + ix.paramsLen[i];
    let p = s;
    while (p < e && isAttrWs(bytes[p])) {
      p++;
    }
    if (p >= e || bytes[p] !== 39) {
      return null;
    }
    let j = p + 1;
    while (j < e) {
      if (bytes[j] === 39) {
        if (j + 1 < e && bytes[j + 1] === 39) {
          j += 2;
          continue;
        }
        break;
      }
      j++;
    }
    if (j >= e) {
      return null;
    }
    let k = j + 1;
    while (k < e && isAttrWs(bytes[k])) {
      k++;
    }
    if (k < e && bytes[k] !== 44) {
      return null;
    }
    return j > p + 1 ? decodeRange(bytes, p + 1, j) : null;
  }

  /** Drop the file bytes and columns. The store is unusable afterwards. */
  release() {
    this.index = null;
    this._typeStart = null;
    this._typeOrder = null;
    this._typeByName = null;
  }
}
