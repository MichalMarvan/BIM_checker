// Runs only in Chromium. The reference side never imports any engine module.
import * as THREE from 'three';
import { parseStepText, splitParams } from '../../assets/js/3d/ifc-engine/parser/step-parser.js';
import { EntityIndex } from '../../assets/js/3d/ifc-engine/parser/entity-index.js';
import { detectProductTypes } from '../../assets/js/3d/ifc-engine/parser/product-detect.js';
import { HIDDEN_PRODUCT_TYPES } from '../../assets/js/3d/ifc-engine/constants.js';
import { extractLengthScale, buildContextScaleMap } from '../../assets/js/3d/ifc-engine/parser/units.js';
import { buildEntityGeometry } from '../../assets/js/3d/ifc-engine/geometry/geometry-core.js';
import { decodeIFCString } from '../../assets/js/3d/ifc-engine/parser/ifc-decoder.js';

export function measureWorld(result, lengthScale) {
  const box = new THREE.Box3(), point = new THREE.Vector3();
  let triangles = 0, vertices = 0, nonfiniteVertices = 0;
  for (const item of result.items) {
    const geometry = item.bufferGeometry, positions = geometry.getAttribute('position');
    if (!positions) continue;
    // viewer-core._itemMatrix: placement × mapped-item chain × localOrigin.
    const matrix = result.matrix.clone();
    if (item.parentMatrix) matrix.multiply(item.parentMatrix);
    if (geometry.userData?.localOrigin) {
      matrix.multiply(new THREE.Matrix4().makeTranslation(...geometry.userData.localOrigin));
    }
    vertices += positions.count;
    triangles += Math.floor((geometry.getIndex()?.count ?? positions.count) / 3);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(matrix).multiplyScalar(lengthScale);
      if ([point.x, point.y, point.z].every(Number.isFinite)) box.expandByPoint(point);
      else nonfiniteVertices++;
    }
  }
  return { vertices, triangles, nonfiniteVertices,
    bboxWorld: box.isEmpty() ? null : [...box.min.toArray(), ...box.max.toArray()] };
}

export async function diagnoseOracle(token) {
  const response = await fetch(`/__ifc/${token}`);
  if (!response.ok) throw new Error(`input-http:${response.status}`);
  const parsed = parseStepText(await response.text());
  const index = new EntityIndex(parsed.entities);
  const lengthScale = extractLengthScale(index);
  index._lengthScale = lengthScale;
  index._ctxScaleMap = buildContextScaleMap(index);
  const types = new Set([...detectProductTypes(index), ...HIDDEN_PRODUCT_TYPES]);
  let rows = [];
  for (const type of types) {
    for (const entity of index.byType(type)) {
      const row = { expressId: entity.expressId, ifcType: entity.type, guid: null,
        status: 'NO_GEOMETRY', triangles: 0, vertices: 0, nonfiniteVertices: 0, bboxWorld: null };
      let result;
      try {
        const p = splitParams(entity.params);
        if (/^'(?:[^']|'')*'$/.test(p[0] || '')) row.guid = decodeIFCString(p[0].slice(1, -1).replace(/''/g, "'"));
        if (HIDDEN_PRODUCT_TYPES.has(type)) row.status = 'VIEWER_HIDDEN';
        else {
          result = buildEntityGeometry(index, entity.expressId);
          if (result) {
            Object.assign(row, measureWorld(result, lengthScale));
            const d = result.diagnostics;
            row.diagnostics = { ...d, unsupportedRepresentationTypes: [...(d?.unsupportedRepresentationTypes || [])] };
            if (row.triangles > 0 && row.bboxWorld) row.status = row.nonfiniteVertices ? 'INVALID_GEOMETRY' : 'GEOMETRY';
          }
        }
      } catch (error) { row.status = 'PRODUCT_ERROR'; row.error = String(error.stack || error); }
      finally { for (const item of result?.items || []) item.bufferGeometry.dispose(); }
      rows.push(row);
      if (rows.length >= 100) { await window.oracleReport(rows); rows = []; }
    }
  }
  await window.oracleReport(rows);
  return { schema: parsed.schema, parserDiagnostics: parsed.diagnostics, lengthScale,
    contextScales: index._ctxScaleMap ? [...index._ctxScaleMap] : null,
    productSelection: 'viewer detectProductTypes union HIDDEN_PRODUCT_TYPES; hidden products recorded without geometry' };
}
