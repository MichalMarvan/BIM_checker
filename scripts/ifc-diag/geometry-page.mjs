// Browser only. Import the actual engine; never compact or run the viewer filter.
import * as THREE from 'three';
import { parseStepText, splitParams } from '../../assets/js/3d/ifc-engine/parser/step-parser.js';
import { indexStepBytes } from '../../assets/js/3d/ifc-engine/parser/byte-lexer.js';
import { EntityIndex } from '../../assets/js/3d/ifc-engine/parser/entity-index.js';
import { detectProductTypes } from '../../assets/js/3d/ifc-engine/parser/product-detect.js';
import { HIDDEN_PRODUCT_TYPES } from '../../assets/js/3d/ifc-engine/constants.js';
import { buildEntityGeometry } from '../../assets/js/3d/ifc-engine/geometry/geometry-core.js';
import { parseRef, parseRefList } from '../../assets/js/3d/ifc-engine/geometry/step-helpers.js';
import { decodeIFCString } from '../../assets/js/3d/ifc-engine/parser/ifc-decoder.js';

// Representation containers only: do not descend into profiles, points or topology.
// Both Boolean operands are inventoried, including the operand a fallback ignores.
function leafTypes(index, representation) {
  const types = new Set();
  const seen = new Set();
  const pending = [representation];
  while (pending.length) {
    const id = pending.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const e = index.byExpressId(id);
    if (!e) continue;
    const p = splitParams(e.params);
    switch (e.type) {
      case 'IFCPRODUCTDEFINITIONSHAPE':
      case 'IFCPRODUCTREPRESENTATION': pending.push(...parseRefList(p[2] || '')); break;
      case 'IFCSHAPEREPRESENTATION':
      case 'IFCREPRESENTATION':
      case 'IFCTOPOLOGYREPRESENTATION': pending.push(...parseRefList(p[3] || '')); break;
      case 'IFCMAPPEDITEM': pending.push(parseRef(p[0])); break;
      case 'IFCREPRESENTATIONMAP': pending.push(parseRef(p[1])); break;
      case 'IFCBOOLEANRESULT':
      case 'IFCBOOLEANCLIPPINGRESULT': pending.push(parseRef(p[1]), parseRef(p[2])); break;
      case 'IFCCSGSOLID': pending.push(parseRef(p[0])); break;
      default: types.add(e.type);
    }
  }
  return [...types].sort();
}

// Leaf types that carry no solid/surface geometry (curves, text, boxes, points).
const NON_SOLID_LEAF_RE = /^IFC(?:\w*CURVE\w*|POLYLINE|CIRCLE|ELLIPSE|LINE|TEXTLITERAL\w*|BOUNDINGBOX|CARTESIANPOINT|GRADIENTCURVE|CURVESEGMENT)$/;

function measure(items) {
  let vertices = 0, triangles = 0, nanCount = 0, degenerateTriangles = 0;
  const box = new THREE.Box3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();
  const read = (out, pos, i, matrix) => {
    out.fromBufferAttribute(pos, i);
    if (matrix) out.applyMatrix4(matrix);
    return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
  };
  for (const item of items) {
    const g = item.bufferGeometry, pos = g.getAttribute('position');
    if (!pos) continue;
    // Same order as viewer._composeItemMatrix, omitting product placement.
    const localMatrix = item.parentMatrix?.clone() || new THREE.Matrix4();
    const origin = g.userData?.localOrigin;
    if (origin) localMatrix.multiply(new THREE.Matrix4().makeTranslation(...origin));
    vertices += pos.count;
    for (let i = 0; i < pos.count; i++) {
      if (read(a, pos, i, localMatrix)) box.expandByPoint(a);
      else nanCount += [a.x, a.y, a.z].filter(v => !Number.isFinite(v)).length;
    }
    const indices = g.getIndex();
    const count = Math.floor((indices ? indices.count : pos.count) / 3);
    triangles += count;
    for (let i = 0; i < count * 3; i += 3) {
      const ids = [0, 1, 2].map(j => indices ? indices.getX(i + j) : i + j);
      if (ids.some(id => !Number.isInteger(id) || id < 0 || id >= pos.count)) {
        degenerateTriangles++;
        continue;
      }
      const validA = read(a, pos, ids[0], localMatrix);
      const validB = read(b, pos, ids[1], localMatrix);
      const validC = read(c, pos, ids[2], localMatrix);
      if (!validA || !validB || !validC) { degenerateTriangles++; continue; }
      ab.subVectors(b, a); ac.subVectors(c, a);
      const area2 = cross.crossVectors(ab, ac).lengthSq();
      // Relative tolerance: independent of IFC length units (sin(angle)^2).
      if (!Number.isFinite(area2) || area2 <= 1e-24 * ab.lengthSq() * ac.lengthSq()) degenerateTriangles++;
    }
  }
  return { vertices, triangles, nanCount, degenerateTriangles,
    bboxLocal: box.isEmpty() ? null : [...box.min.toArray(), ...box.max.toArray()] };
}

function record(index, entity) {
  const row = { expressId: entity.expressId, ifcType: entity.type, guid: null,
    status: 'FAILED_GEOMETRY', reason: 'empty-geometry', leafTypes: [], items: 0,
    vertices: 0, triangles: 0, nanCount: 0, degenerateTriangles: 0, bboxLocal: null,
    diag: { unsupported: [], fallback: 0, exactBool: 0, recursion: 0, invalidRef: 0 } };
  let result;
  try {
    const p = splitParams(entity.params);
    if (/^'(?:[^']|'')*'$/.test(p[0] || '')) row.guid = decodeIFCString(p[0].slice(1, -1).replace(/''/g, "'"));
    const rep = parseRef(p[6]);
    row.leafTypes = leafTypes(index, rep);
    if (HIDDEN_PRODUCT_TYPES.has(entity.type)) {
      row.status = 'NOT_APPLICABLE'; row.reason = 'viewer-hidden'; return row;
    }
    // Invoke even for products without a representation, just like the viewer.
    result = buildEntityGeometry(index, entity.expressId);
    if (!rep && (!p[6] || p[6] === '$' || p[6] === '*')) {
      row.status = 'NO_REPRESENTATION'; row.reason = 'no-representation'; return row;
    }
    if (!result) { row.reason = 'null-geometry'; return row; }
    const d = result.diagnostics;
    row.diag = { unsupported: [...(d?.unsupportedRepresentationTypes || [])].sort(),
      fallback: d?.fallbackGeometryCount || 0, exactBool: d?.exactBooleanDifferenceCount || 0,
      recursion: d?.recursionLimitCount || 0, invalidRef: d?.invalidReferenceCount || 0 };
    if (!row.leafTypes.length) row.leafTypes = [...row.diag.unsupported];
    row.items = result.items.length;
    Object.assign(row, measure(result.items));
    const issues = [];
    if (row.diag.unsupported.length) issues.push(`unsupported:${row.diag.unsupported.join(',')}`);
    if (row.diag.invalidRef) issues.push('invalid-reference');
    if (row.diag.recursion) issues.push('recursion-limit');
    if (row.items) {
      row.status = issues.length ? 'PARTIAL' : row.diag.fallback ? 'OK_APPROXIMATED' : 'OK_EXACT';
      row.reason = issues.join(';') || (row.diag.fallback ? 'fallback-boolean' : 'geometry-built');
    } else if (!issues.length && row.leafTypes.length && row.leafTypes.every(t => NON_SOLID_LEAF_RE.test(t))) {
      // Axis / curve / annotation / bounding-box representations are skipped by the
      // viewer on purpose (geometry-core.js: 'Axis', 'FootPrint', 'Box', 'Annotation',
      // 'Profile', BoundingBox, Curve2D); IFC 4.3 alignment curves go to the alignment panel.
      row.status = 'NOT_APPLICABLE';
      row.reason = `non-solid-representation:${[...new Set(row.leafTypes)].sort().join('+')}`;
    } else {
      row.status = row.diag.unsupported.length ? 'UNSUPPORTED_GEOMETRY' : 'FAILED_GEOMETRY';
      row.reason = issues.join(';') || 'empty-geometry';
    }
  } catch (error) {
    row.status = 'FAILED_GEOMETRY';
    row.reason = `exception:${String(error.message || error).replace(/\s+/g, ' ').slice(0, 240)}`;
  } finally {
    // No renderer/GPU allocations; release returned buffers after measuring.
    for (const item of result?.items || []) item.bufferGeometry.dispose();
  }
  return row;
}

/**
 * @param {string} token
 * @param {{ parser?: 'bytes' | 'text' }} [options] — 'bytes' (default) is the
 *   engine's production path (indexStepBytes + EntityIndex over the byte
 *   store); 'text' is the legacy parseStepText + Map path, kept as the oracle
 *   for parity runs.
 */
export async function diagnose(token, options = {}) {
  const parser = options.parser === 'text' ? 'text' : 'bytes';
  const post = async data => {
    const response = await fetch(`/__report/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`report-http:${response.status}`);
  };
  const response = await fetch(`/__ifc/${token}`);
  if (!response.ok) throw new Error(`input-http:${response.status}`);
  let parsed, entities, parseMs;
  if (parser === 'text') {
    let text = await response.text();
    const start = performance.now();
    parsed = parseStepText(text);
    text = null;
    parseMs = performance.now() - start;
    entities = parsed.entities;
  } else {
    const buffer = await response.arrayBuffer();
    const start = performance.now();
    entities = indexStepBytes(new Uint8Array(buffer));
    parseMs = performance.now() - start;
    parsed = { schema: entities.schema, viewDefinitions: entities.viewDefinitions,
      diagnostics: entities.diagnostics, entities: { size: entities.count } };
  }
  const indexStart = performance.now();
  const index = new EntityIndex(entities);
  const types = new Set([...detectProductTypes(index), ...HIDDEN_PRODUCT_TYPES]);
  const productCount = [...types].reduce((sum, type) => sum + index.byType(type).length, 0);
  const heap = () => performance.memory?.usedJSHeapSize ?? null;
  await post({ metadata: { schema: parsed.schema, viewDefinitions: parsed.viewDefinitions,
    parserDiagnostics: parsed.diagnostics, entityCount: parsed.entities.size, productCount, parser,
    parseMs, indexMs: performance.now() - indexStart }, heapBytes: heap() });
  let rows = [], geometryMs = 0, inspectionMs = 0;
  // geometryMs includes representation traversal + buffer inspection; excludes HTTP.
  for (const type of types) {
    for (const entity of index.byType(type)) {
      const t = performance.now();
      rows.push(record(index, entity));
      geometryMs += performance.now() - t;
      if (rows.length >= 100) {
        const ioStart = performance.now();
        await post({ rows, geometryMs, heapBytes: heap() });
        inspectionMs += performance.now() - ioStart;
        rows = [];
      }
    }
  }
  await post({ rows, geometryMs, reportMs: inspectionMs, heapBytes: heap() });
  return { geometryMs };
}
