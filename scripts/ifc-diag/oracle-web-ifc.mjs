// Isolated Node/WASM worker: timeout/crash must not destroy the corpus run.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { IfcAPI, IFCPRODUCT } = require('web-ifc');

const [file, output] = process.argv.slice(2);
const api = new IfcAPI();
let model;
try {
  await api.Init();
  const settings = { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 48,
    // Do not silently treat preview IFC4x1/4x2 schemas as fully supported IFC4x3.
    ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: false };
  model = api.OpenModel(new Uint8Array(readFileSync(file)), settings);
  if (model < 0) throw new Error('web-ifc OpenModel failed (unsupported schema or invalid input)');
  const vector = api.GetLineIDsWithType(model, IFCPRODUCT, true);
  const ids = Array.from({ length: vector.size() }, (_, i) => vector.get(i));
  vector.delete();
  const rows = new Map();
  for (const expressId of ids) {
    try {
      const line = api.GetLine(model, expressId, false);
      rows.set(expressId, { expressId, guid: line.GlobalId?.value ?? null,
        ifcType: api.GetNameFromTypeCode(line.type).toUpperCase(), status: 'NO_GEOMETRY',
        triangles: 0, vertices: 0, nonfiniteVertices: 0, bboxWorld: null });
    } catch (error) {
      rows.set(expressId, { expressId, guid: null, ifcType: 'UNKNOWN', status: 'PRODUCT_ERROR', error: String(error) });
    }
  }
  // StreamAllMeshes excludes openings/spaces and is not all IfcProduct.
  // StreamMeshes explicitly includes all schema-derived IfcProduct subtypes.
  api.StreamMeshes(model, ids, mesh => {
    const row = rows.get(mesh.expressID);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    try {
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const placed = mesh.geometries.get(i), m = placed.flatTransformation;
        const geometry = api.GetGeometry(model, placed.geometryExpressID);
        try {
          const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
          row.triangles += Math.floor(geometry.GetIndexDataSize() / 3);
          row.vertices += vertices.length / 6;
          // Interleaved xyz + normal; transform points, never an already-axis-aligned box.
          for (let j = 0; j < vertices.length; j += 6) {
            const x = vertices[j], y = vertices[j + 1], z = vertices[j + 2];
            const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
            const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
            const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
            // web-ifc emits Y-up (x,z,-y). Restore IFC Z-up, already in metres.
            const point = [wx, -wz, wy];
            if (!point.every(Number.isFinite)) { row.nonfiniteVertices++; continue; }
            for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], point[k]); max[k] = Math.max(max[k], point[k]); }
          }
        } finally { geometry.delete(); }
      }
      row.bboxWorld = min.every(Number.isFinite) ? [...min, ...max] : null;
      if (row.triangles > 0 && row.bboxWorld) row.status = row.nonfiniteVertices ? 'INVALID_GEOMETRY' : 'GEOMETRY';
    } catch (error) { row.status = 'PRODUCT_ERROR'; row.error = String(error.stack || error); }
    // StreamMeshes owns the callback mesh; do not delete it a second time.
  }, true);
  const report = { metadata: { version: api.GetVersion(), schema: api.GetModelSchema(model), settings,
    coordinationMatrix: api.GetCoordinationMatrix(model), productCount: ids.length,
    productSelection: 'GetLineIDsWithType(IFCPRODUCT, includeInherited=true) + StreamMeshes' }, rows: [...rows.values()] };
  writeFileSync(output, JSON.stringify(report));
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  if (model >= 0) api.CloseModel(model);
  api.Dispose?.();
}
