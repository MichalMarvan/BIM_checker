// Phase 6.16 — Geodetic (lat/lon/h) → ECEF (Earth-Centered Earth-Fixed)
// + East-North-Up local frame rotation. Used to compute the 3D Tiles root
// transform that places a glTF tile (in local ENU/Z-up) on the WGS84 globe.
//
// WGS84 ellipsoid:
//   a (semi-major axis) = 6378137.0 m
//   f (flattening)      = 1 / 298.257223563
//   e² = 2f - f² = 0.00669437999014
//
// Geodetic → ECEF formulas:
//   N = a / sqrt(1 - e² * sin²(lat))
//   X = (N + h) * cos(lat) * cos(lon)
//   Y = (N + h) * cos(lat) * sin(lon)
//   Z = (N * (1 - e²) + h) * sin(lat)
//
// ENU → ECEF rotation matrix at lat/lon (column-major, 3x3):
//   [ -sin(lon)            cos(lon)             0       ]   East
//   [ -sin(lat)*cos(lon)   -sin(lat)*sin(lon)   cos(lat)]   North
//   [  cos(lat)*cos(lon)    cos(lat)*sin(lon)   sin(lat)]   Up
//
// Output for 3D Tiles:
//   transform: 16-element column-major 4x4 matrix
//   [ R[0][0]  R[0][1]  R[0][2]  Tx ]
//   [ R[1][0]  R[1][1]  R[1][2]  Ty ]
//   [ R[2][0]  R[2][1]  R[2][2]  Tz ]
//   [ 0        0        0        1  ]
// Stored column-major: [R00, R10, R20, 0, R01, R11, R21, 0, R02, R12, R22, 0, Tx, Ty, Tz, 1]

const WGS84_A = 6378137.0;
const WGS84_E2 = 0.00669437999014;

/**
 * Geodetic → ECEF.
 * @param {number} latDeg - degrees
 * @param {number} lonDeg - degrees
 * @param {number} h - meters above ellipsoid
 * @returns {[number, number, number]} ECEF X/Y/Z meters
 */
export function geodeticToEcef(latDeg, lonDeg, h = 0) {
  const lat = latDeg * Math.PI / 180;
  const lon = lonDeg * Math.PI / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const X = (N + h) * cosLat * cosLon;
  const Y = (N + h) * cosLat * sinLon;
  const Z = (N * (1 - WGS84_E2) + h) * sinLat;
  return [X, Y, Z];
}

/**
 * Build the 3D Tiles root transform that places a tile authored in local
 * East-North-Up (Z-up, X=East, Y=North) frame at the given lat/lon/h on
 * the WGS84 globe.
 *
 * Resulting transform = T(ECEF position) · R(ENU → ECEF basis).
 *
 * Note: glTF default is Y-up. 3D Tiles consumers (Cesium) automatically
 * convert glTF Y-up content to Z-up before applying the root transform.
 * Therefore the GLB content must be exported assuming Y-up (which is
 * Three.js world space) and Cesium's built-in Y→Z rotation will land
 * the model in our local ENU Z-up frame — exactly where this transform
 * expects it.
 *
 * @returns {number[]} 16-element column-major 4x4 matrix
 */
export function buildEcefRootTransform(latDeg, lonDeg, h = 0) {
  const lat = latDeg * Math.PI / 180;
  const lon = lonDeg * Math.PI / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const [Tx, Ty, Tz] = geodeticToEcef(latDeg, lonDeg, h);

  // ENU → ECEF basis vectors (column vectors of the rotation matrix)
  // East:  [-sinLon, cosLon, 0]
  // North: [-sinLat*cosLon, -sinLat*sinLon, cosLat]
  // Up:    [cosLat*cosLon, cosLat*sinLon, sinLat]
  return [
    -sinLon,            cosLon,              0,        0,  // column 0 = East
    -sinLat * cosLon,   -sinLat * sinLon,    cosLat,   0,  // column 1 = North
     cosLat * cosLon,   cosLat * sinLon,     sinLat,   0,  // column 2 = Up
     Tx,                Ty,                  Tz,       1,  // column 3 = translation
  ];
}

/**
 * Compute geometric error heuristic (used by 3D Tiles for LOD selection).
 * For a single root tile, geometric error = some fraction of the bounding
 * box diagonal — small means "load whenever bbox is in view".
 * @param {number} bboxDiagonalM
 * @returns {number}
 */
export function geometricError(bboxDiagonalM) {
  return Math.max(1, bboxDiagonalM * 0.05);
}
