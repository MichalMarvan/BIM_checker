// .bimcache serialization — a loaded model's "ready to render" form.
//
// After the first load of an IFC we have everything expensive already
// computed: merged geometry buffers (exactly what goes to the GPU), the
// faceIndex→element table, feature edges, the compacted entity index
// (properties/psets/materials for panels), layer index and geo-coords.
// Serializing that lets the next open of the same file skip parsing and
// triangulation entirely — seconds instead of minutes on big models.
//
// Layout (little-endian):
//   [u32 magic 'BIMC'][u32 formatVersion][u32 geometryVersion][u32 jsonLen]
//   [json utf8][pad to 4][binary chunks…]
// The JSON carries all small data plus {offset, length} descriptors of the
// binary chunks (byte offsets relative to the start of the chunk area).
//
// Invalidation: content hash of the source IFC is the store key (owned by
// the caller); the two version numbers below guard the format and the
// geometry pipeline. Bump GEOMETRY_PIPELINE_VERSION whenever mesh-types /
// geometry-core / merged-model output changes — stale caches then miss and
// regenerate silently.

export const CACHE_FORMAT_VERSION = 1;
export const GEOMETRY_PIPELINE_VERSION = 3;

const MAGIC = 0x434d4942; // 'BIMC' as LE u32

function align4(n) {
  return (n + 3) & ~3;
}

/**
 * @param {{
 *   meta: object, lengthScale: number, productTypes: string[],
 *   anchor: number[],
 *   position: Float32Array, normal: Float32Array, color: Float32Array,
 *   index: Uint32Array,
 *   table: object[], elementInfo: Array<[number, string]>,
 *   elementsByType: object,
 *   edgePositions: Float32Array|null, edgesTable: object[],
 *   entities: Array<[number, string, string]>,
 *   layerIndex: Array<[number, string]>,
 *   coords: object|null
 * }} payload
 * @returns {ArrayBuffer}
 */
export function serializeModelCache(payload) {
  const chunks = [];
  let chunkOfs = 0;
  const describe = (typedArray) => {
    if (!typedArray || typedArray.length === 0) return null;
    const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const desc = { offset: chunkOfs, length: typedArray.length };
    chunks.push(bytes);
    chunkOfs = align4(chunkOfs + bytes.byteLength);
    return desc;
  };

  const json = {
    meta: payload.meta,
    lengthScale: payload.lengthScale,
    productTypes: payload.productTypes || [],
    anchor: payload.anchor || [0, 0, 0],
    buffers: {
      position: describe(payload.position),
      normal: describe(payload.normal),
      color: describe(payload.color),
      index: describe(payload.index),
      edgePositions: describe(payload.edgePositions),
    },
    table: payload.table || [],
    elementInfo: payload.elementInfo || [],
    elementsByType: payload.elementsByType || {},
    edgesTable: payload.edgesTable || [],
    entities: payload.entities || [],
    layerIndex: payload.layerIndex || [],
    coords: payload.coords || null,
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const headerLen = 16;
  const jsonEnd = align4(headerLen + jsonBytes.byteLength);
  const total = jsonEnd + chunkOfs;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, CACHE_FORMAT_VERSION, true);
  view.setUint32(8, GEOMETRY_PIPELINE_VERSION, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  new Uint8Array(out, headerLen, jsonBytes.byteLength).set(jsonBytes);

  let ofs = jsonEnd;
  for (const bytes of chunks) {
    new Uint8Array(out, ofs, bytes.byteLength).set(bytes);
    ofs = align4(ofs + bytes.byteLength);
  }
  return out;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {object|null} payload (same shape as serializeModelCache input),
 *   or null when the magic/version doesn't match — caller regenerates.
 */
export function deserializeModelCache(buffer) {
  if (!buffer || buffer.byteLength < 16) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) return null;
  if (view.getUint32(4, true) !== CACHE_FORMAT_VERSION) return null;
  if (view.getUint32(8, true) !== GEOMETRY_PIPELINE_VERSION) return null;
  const jsonLen = view.getUint32(12, true);
  const headerLen = 16;
  if (headerLen + jsonLen > buffer.byteLength) return null;
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, headerLen, jsonLen)));
  } catch (e) {
    return null;
  }
  const chunkBase = align4(headerLen + jsonLen);
  const read = (desc, Ctor) => {
    if (!desc) return null;
    const byteLen = desc.length * Ctor.BYTES_PER_ELEMENT;
    if (chunkBase + desc.offset + byteLen > buffer.byteLength) return null;
    // View, not copy — the ArrayBuffer comes fresh from IndexedDB/file and
    // belongs to this model from here on.
    return new Ctor(buffer, chunkBase + desc.offset, desc.length);
  };

  return {
    meta: json.meta,
    lengthScale: json.lengthScale,
    productTypes: json.productTypes,
    anchor: json.anchor,
    position: read(json.buffers.position, Float32Array),
    normal: read(json.buffers.normal, Float32Array),
    color: read(json.buffers.color, Float32Array),
    index: read(json.buffers.index, Uint32Array),
    edgePositions: read(json.buffers.edgePositions, Float32Array),
    table: json.table,
    elementInfo: json.elementInfo,
    elementsByType: json.elementsByType,
    edgesTable: json.edgesTable,
    entities: json.entities,
    layerIndex: json.layerIndex,
    coords: json.coords,
  };
}
