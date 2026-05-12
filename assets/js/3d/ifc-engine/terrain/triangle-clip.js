// Phase 6.15.2 — Sutherland-Hodgman polygon clipping for triangle vs. axis-aligned rect.
//
// Used for splitting terrain triangles by tile boundaries, so each tile gets
// a sub-mesh of the terrain whose projected XY falls inside that tile's bbox.
//
// Inputs:
//   - triangle: array of 3 {x, y, z} points (z is preserved through clip via barycentric interp)
//   - rect: { minX, minY, maxX, maxY }
//
// Output: array of {x, y, z} polygon vertices (CW or CCW preserved). Empty array
// if the triangle is entirely outside the rect. Caller fan-triangulates the polygon.
//
// Z is interpolated along clipped edges so the resulting polygon vertices have
// correct elevations from the underlying terrain plane.

function _interpZ(p1, p2, t) {
  return p1.z + (p2.z - p1.z) * t;
}

function _intersect(p1, p2, axis, value) {
  // Find the point on segment p1→p2 where axis (x or y) = value.
  const t = (value - p1[axis]) / (p2[axis] - p1[axis]);
  if (axis === 'x') {
    return { x: value, y: p1.y + (p2.y - p1.y) * t, z: _interpZ(p1, p2, t) };
  }
  return { x: p1.x + (p2.x - p1.x) * t, y: value, z: _interpZ(p1, p2, t) };
}

function _clipEdge(input, axis, value, keepGreater) {
  // Sutherland-Hodgman one-edge clip. keepGreater=true keeps points with axis >= value.
  if (input.length === 0) return [];
  const out = [];
  const inside = (p) => keepGreater ? p[axis] >= value : p[axis] <= value;
  for (let i = 0; i < input.length; i++) {
    const cur = input[i];
    const prev = input[(i - 1 + input.length) % input.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(_intersect(prev, cur, axis, value));
      out.push(cur);
    } else if (prevIn) {
      out.push(_intersect(prev, cur, axis, value));
    }
  }
  return out;
}

/**
 * Clip a triangle against an axis-aligned rectangle in XY.
 * @param {Array<{x,y,z}>} triangle  3 vertices
 * @param {{minX,minY,maxX,maxY}} rect
 * @returns {Array<{x,y,z}>} polygon (3+ vertices) or [] if entirely outside
 */
export function clipTriangleToRect(triangle, rect) {
  let poly = triangle.slice();
  poly = _clipEdge(poly, 'x', rect.minX, true);
  poly = _clipEdge(poly, 'x', rect.maxX, false);
  poly = _clipEdge(poly, 'y', rect.minY, true);
  poly = _clipEdge(poly, 'y', rect.maxY, false);
  return poly;
}

/**
 * Fan-triangulate a convex polygon (output of Sutherland-Hodgman is convex
 * if input rect is convex and triangle is convex — both true).
 * @param {Array<{x,y,z}>} polygon
 * @returns {Array<[{x,y,z}, {x,y,z}, {x,y,z}]>}
 */
export function fanTriangulate(polygon) {
  if (polygon.length < 3) return [];
  const tris = [];
  for (let i = 1; i < polygon.length - 1; i++) {
    tris.push([polygon[0], polygon[i], polygon[i + 1]]);
  }
  return tris;
}
