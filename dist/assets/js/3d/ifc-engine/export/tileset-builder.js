// Phase 6.16 — 3D Tiles 1.1 tileset.json builder.
//
// Single-tile tileset structure (root tile points to model.glb):
//   {
//     "asset": { "version": "1.1", "tilesetVersion": "1.0.0" },
//     "geometricError": 500,
//     "root": {
//       "boundingVolume": { "box": [...12 numbers...] },
//       "geometricError": 500,
//       "refine": "REPLACE",
//       "transform": [...16 numbers column-major...],
//       "content": { "uri": "model.glb" }
//     }
//   }
//
// Bounding volume "box" format (12 numbers, OBB):
//   [cx, cy, cz, hx_x, hx_y, hx_z, hy_x, hy_y, hy_z, hz_x, hz_y, hz_z]
//   - cx,cy,cz: center
//   - hx,hy,hz: half-extents along x/y/z axes (in tile-local frame)

import { buildEcefRootTransform, geometricError } from './ecef-transform.js';

/**
 * Build a single-tile 3D Tiles 1.1 tileset.json structure.
 *
 * @param {{
 *   modelLatLonHeight: { lat, lon, h },
 *   bboxLocal: { min: [x,y,z], max: [x,y,z] },  // model bbox in local frame (m)
 *   contentUri?: string,                         // default 'model.glb'
 *   tilesetVersion?: string,
 * }} opts
 * @returns {object} tileset.json data (caller can JSON.stringify)
 */
export function buildTileset(opts) {
  const { modelLatLonHeight, bboxLocal } = opts;
  if (!modelLatLonHeight || !bboxLocal) {
    throw new Error('buildTileset: modelLatLonHeight + bboxLocal required');
  }
  const transform = buildEcefRootTransform(
    modelLatLonHeight.lat,
    modelLatLonHeight.lon,
    modelLatLonHeight.h ?? 0,
  );

  // Bounding box: center + half-extents along each axis
  const cx = (bboxLocal.min[0] + bboxLocal.max[0]) / 2;
  const cy = (bboxLocal.min[1] + bboxLocal.max[1]) / 2;
  const cz = (bboxLocal.min[2] + bboxLocal.max[2]) / 2;
  const hx = (bboxLocal.max[0] - bboxLocal.min[0]) / 2;
  const hy = (bboxLocal.max[1] - bboxLocal.min[1]) / 2;
  const hz = (bboxLocal.max[2] - bboxLocal.min[2]) / 2;
  const diagonal = Math.sqrt(
    (bboxLocal.max[0] - bboxLocal.min[0]) ** 2 +
    (bboxLocal.max[1] - bboxLocal.min[1]) ** 2 +
    (bboxLocal.max[2] - bboxLocal.min[2]) ** 2,
  );
  const ge = geometricError(diagonal);

  return {
    asset: {
      version: '1.1',
      tilesetVersion: opts.tilesetVersion || '1.0.0',
      generator: 'bim-ai-viewer',
    },
    geometricError: ge,
    root: {
      boundingVolume: {
        box: [cx, cy, cz, hx, 0, 0, 0, hy, 0, 0, 0, hz],
      },
      geometricError: ge,
      refine: 'REPLACE',
      transform,
      content: { uri: opts.contentUri || 'model.glb' },
    },
  };
}
