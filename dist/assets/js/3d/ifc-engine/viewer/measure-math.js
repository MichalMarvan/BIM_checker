// Pure math for measure tool. No Three.js dependency — operates on plain [x,y,z] arrays.

/** Euclidean distance between two 3D points. */
export function distance(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Angle at vertex p2 between rays (p2→p1) and (p2→p3).
 * Returns degrees in [0, 180].
 */
export function angle(p1, p2, p3) {
  const v1 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const v2 = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m1 = Math.hypot(v1[0], v1[1], v1[2]);
  const m2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (m1 === 0 || m2 === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return Math.acos(cos) * 180 / Math.PI;
}

/**
 * Polygon area in 3D via best-fit plane projection + Shoelace.
 */
export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;

  const a = points[0], b = points[1], c = points[2];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const nLen = Math.hypot(normal[0], normal[1], normal[2]);
  if (nLen === 0) return 0;
  const n = [normal[0] / nLen, normal[1] / nLen, normal[2] / nLen];

  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const uLen = Math.hypot(u[0], u[1], u[2]);
  if (uLen === 0) return 0;
  u[0] /= uLen; u[1] /= uLen; u[2] /= uLen;
  const v = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];

  const proj = points.map(p => {
    const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    return [
      d[0] * u[0] + d[1] * u[1] + d[2] * u[2],
      d[0] * v[0] + d[1] * v[1] + d[2] * v[2],
    ];
  });

  let sum = 0;
  for (let i = 0; i < proj.length; i++) {
    const j = (i + 1) % proj.length;
    sum += proj[i][0] * proj[j][1] - proj[j][0] * proj[i][1];
  }
  return Math.abs(sum) / 2;
}
