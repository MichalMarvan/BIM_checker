// IFC geometry primitives → THREE.BufferGeometry.
// Phase 1: IfcTriangulatedFaceSet, IfcFacetedBrep.
// Phase 2 (this file expanded): IfcExtrudedAreaSolid (rectangle / circle /
// arbitrary closed / I-shape profiles), IfcShellBasedSurfaceModel,
// IfcPolygonalFaceSet. MappedItem + BooleanResult handled in geometry-core.

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parsePointList } from './step-helpers.js';

// -------------------- shared parsers --------------------

function parseIntTripleList(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const matches = inner.match(/\(([^()]+)\)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).split(',').map(s => parseInt(s.trim(), 10)));
}

/** Parse list of int N-tuples "((1,3,2),(1,4,3,5),...)" → [[1,3,2],[1,4,3,5],...] */
function parseIntNTupleList(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const matches = inner.match(/\(([^()]+)\)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).split(',').map(s => parseInt(s.trim(), 10)));
}

function parseFloatScalar(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Resolve IfcCartesianPoint/IfcDirection → [x,y,z] (or [x,y] for 2D). */
function resolveCoords(entityIndex, expressId) {
  const e = entityIndex.byExpressId(expressId);
  if (!e) return null;
  const inner = e.params.replace(/^\(+|\)+$/g, '');
  return inner.split(',').map(s => parseFloat(s.trim()));
}

// -------------------- Face / Shell utilities --------------------

/**
 * Push triangulated polygon (fan-triangulation) to the position/index arrays.
 * Polygon = array of [x,y,z]. Caller passes accumulated arrays.
 */
function pushFanTriangulatedPolygon(polygon, positions, indices) {
  if (polygon.length < 3) return;
  const baseIndex = positions.length / 3;
  for (const v of polygon) positions.push(v[0], v[1], v[2]);
  for (let i = 1; i < polygon.length - 1; i++) {
    indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
  }
}

/**
 * Walk a IfcClosedShell → push its triangulated face polygons to position/index arrays.
 * Used by FacetedBrep and ShellBasedSurfaceModel.
 */
function appendClosedShell(entityIndex, shellId, positions, indices) {
  const shell = entityIndex.byExpressId(shellId);
  if (!shell) return;
  // Both IFCCLOSEDSHELL and IFCOPENSHELL have a list of face refs at index 0
  const shellParts = splitParams(shell.params);
  const faceRefs = parseRefList(shellParts[0]);

  for (const faceRef of faceRefs) {
    const face = entityIndex.byExpressId(faceRef);
    if (!face) continue;
    const faceParts = splitParams(face.params);
    const boundRefs = parseRefList(faceParts[0]);

    for (const boundRef of boundRefs) {
      const bound = entityIndex.byExpressId(boundRef);
      if (!bound) continue;
      const boundParts = splitParams(bound.params);
      const loopRef = parseRef(boundParts[0]);
      const loop = entityIndex.byExpressId(loopRef);
      if (!loop || loop.type !== 'IFCPOLYLOOP') continue;
      const loopParts = splitParams(loop.params);
      const pointRefs = parseRefList(loopParts[0]);

      const polygon = [];
      for (const ptRef of pointRefs) {
        const pt = entityIndex.byExpressId(ptRef);
        if (!pt || pt.type !== 'IFCCARTESIANPOINT') continue;
        const inner = pt.params.replace(/^\(/, '').replace(/\)$/, '');
        const coords = inner.split(',').map(s => parseFloat(s.trim()));
        if (coords.length === 3) polygon.push(coords);
      }
      pushFanTriangulatedPolygon(polygon, positions, indices);
    }
  }
}

function geometryFromPositionsIndices(positions, indices) {
  if (positions.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geom.computeVertexNormals();
  return geom;
}

// -------------------- IfcTriangulatedFaceSet --------------------

export function triangulatedFaceSetToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCTRIANGULATEDFACESET') return null;
  const parts = splitParams(entity.params);
  const coordRef = parseRef(parts[0]);
  if (!coordRef) return null;
  const coordEntity = entityIndex.byExpressId(coordRef);
  if (!coordEntity || coordEntity.type !== 'IFCCARTESIANPOINTLIST3D') return null;
  const coordParts = splitParams(coordEntity.params);
  const points = parsePointList(coordParts[0]);
  if (!parts[3] || parts[3] === '$') return null;
  const triangles = parseIntTripleList(parts[3]);

  const positionArr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    positionArr[i * 3]     = points[i][0];
    positionArr[i * 3 + 1] = points[i][1];
    positionArr[i * 3 + 2] = points[i][2];
  }
  const indexArr = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    indexArr[i * 3]     = triangles[i][0] - 1;
    indexArr[i * 3 + 1] = triangles[i][1] - 1;
    indexArr[i * 3 + 2] = triangles[i][2] - 1;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positionArr, 3));
  geom.setIndex(new THREE.BufferAttribute(indexArr, 1));
  geom.computeVertexNormals();
  return geom;
}

// -------------------- IfcFacetedBrep --------------------

export function facetedBrepToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCFACETEDBREP') return null;
  const parts = splitParams(entity.params);
  const shellRef = parseRef(parts[0]);
  if (!shellRef) return null;
  const positions = [];
  const indices = [];
  appendClosedShell(entityIndex, shellRef, positions, indices);
  return geometryFromPositionsIndices(positions, indices);
}

// -------------------- IfcShellBasedSurfaceModel --------------------

/**
 * IFC: IFCSHELLBASEDSURFACEMODEL(SbsmBoundary)
 *   SbsmBoundary → list of refs to IfcClosedShell or IfcOpenShell
 * Civil 3D's primary export representation — collection of shells.
 */
export function shellBasedSurfaceModelToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCSHELLBASEDSURFACEMODEL') return null;
  const parts = splitParams(entity.params);
  const shellRefs = parseRefList(parts[0]);
  if (shellRefs.length === 0) return null;
  const positions = [];
  const indices = [];
  for (const shellId of shellRefs) {
    appendClosedShell(entityIndex, shellId, positions, indices);
  }
  return geometryFromPositionsIndices(positions, indices);
}

// -------------------- IfcPolygonalFaceSet --------------------

/**
 * IFC: IFCPOLYGONALFACESET(Coordinates, Closed, Faces, PnIndex)
 *   Coordinates → IfcCartesianPointList3D
 *   Faces → list of IfcIndexedPolygonalFace(CoordIndex) [or WithVoids subtype]
 *   PnIndex → optional remap (ignored)
 * IfcIndexedPolygonalFace.params: ((idx1,idx2,idx3,...))  1-based STEP indices.
 */
export function polygonalFaceSetToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCPOLYGONALFACESET') return null;
  const parts = splitParams(entity.params);
  const coordRef = parseRef(parts[0]);
  if (!coordRef) return null;
  const coordEntity = entityIndex.byExpressId(coordRef);
  if (!coordEntity || coordEntity.type !== 'IFCCARTESIANPOINTLIST3D') return null;
  const coordParts = splitParams(coordEntity.params);
  const allPoints = parsePointList(coordParts[0]);

  const faceRefs = parseRefList(parts[2]);
  const positions = [];
  const indices = [];

  for (const faceRef of faceRefs) {
    const face = entityIndex.byExpressId(faceRef);
    if (!face) continue;
    // CoordIndex at param 0; voids (sub-loops) at param 1 for IfcIndexedPolygonalFaceWithVoids — Phase 1 ignores voids.
    const faceParts = splitParams(face.params);
    const idxRaw = faceParts[0];
    if (!idxRaw) continue;
    const idxList = idxRaw.replace(/^\(/, '').replace(/\)$/, '').split(',').map(s => parseInt(s.trim(), 10));
    const polygon = [];
    for (const i of idxList) {
      if (!Number.isFinite(i) || i < 1 || i > allPoints.length) continue;
      polygon.push(allPoints[i - 1]);
    }
    pushFanTriangulatedPolygon(polygon, positions, indices);
  }
  return geometryFromPositionsIndices(positions, indices);
}

// -------------------- Profile parsing (2D outline) --------------------

const CIRCLE_SEGMENTS = 32;

/**
 * Build a 2D polygon (array of [x, y]) from various IfcProfileDef subtypes.
 * Returns { outer: [[x,y]...], holes: [[[x,y]...], ...] } or null.
 */
function resolveProfilePoints(entityIndex, profileId) {
  const profile = entityIndex.byExpressId(profileId);
  if (!profile) return null;
  const parts = splitParams(profile.params);

  switch (profile.type) {
    case 'IFCRECTANGLEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, XDim, YDim)
      const xDim = parseFloatScalar(parts[3]);
      const yDim = parseFloatScalar(parts[4]);
      if (!xDim || !yDim) return null;
      const hx = xDim / 2, hy = yDim / 2;
      let outer = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
      outer = apply2DProfilePosition(entityIndex, parts[2], outer);
      return { outer, holes: [] };
    }
    case 'IFCCIRCLEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Radius)
      const r = parseFloatScalar(parts[3]);
      if (!r) return null;
      const outer = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        outer.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCCIRCLEHOLLOWPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Radius, WallThickness)
      const r = parseFloatScalar(parts[3]);
      const wt = parseFloatScalar(parts[4]);
      if (!r || !wt) return null;
      const ri = r - wt;
      const outer = [], hole = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        outer.push([Math.cos(t) * r, Math.sin(t) * r]);
        // Hole goes in opposite winding so it subtracts
        hole.push([Math.cos(-t) * ri, Math.sin(-t) * ri]);
      }
      const pos = parts[2];
      return {
        outer: apply2DProfilePosition(entityIndex, pos, outer),
        holes: [apply2DProfilePosition(entityIndex, pos, hole)]
      };
    }
    case 'IFCRECTANGLEHOLLOWPROFILEDEF': {
      // (ProfileType, ProfileName, Position, XDim, YDim, WallThickness, InnerFilletRadius, OuterFilletRadius)
      const xDim = parseFloatScalar(parts[3]);
      const yDim = parseFloatScalar(parts[4]);
      const wt = parseFloatScalar(parts[5]);
      if (!xDim || !yDim || !wt) return null;
      const hx = xDim / 2, hy = yDim / 2;
      const ihx = hx - wt, ihy = hy - wt;
      const outer = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
      const hole = [[-ihx, -ihy], [-ihx, ihy], [ihx, ihy], [ihx, -ihy]]; // reversed winding
      return {
        outer: apply2DProfilePosition(entityIndex, parts[2], outer),
        holes: [apply2DProfilePosition(entityIndex, parts[2], hole)]
      };
    }
    case 'IFCISHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, OverallWidth, OverallDepth, WebThickness, FlangeThickness, ...)
      const bf = parseFloatScalar(parts[3]); // flange width
      const h  = parseFloatScalar(parts[4]); // overall depth
      const tw = parseFloatScalar(parts[5]); // web thickness
      const tf = parseFloatScalar(parts[6]); // flange thickness
      if (!bf || !h || !tw || !tf) return null;
      const hx = bf / 2, hy = h / 2, hw = tw / 2;
      const yi = hy - tf;
      const outer = [
        [-hx, -hy], [hx, -hy], [hx, -yi], [hw, -yi],
        [hw,  yi], [hx,  yi], [hx,  hy], [-hx,  hy],
        [-hx, yi], [-hw, yi], [-hw, -yi], [-hx, -yi]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCLSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, Width, Thickness, ...)
      const h = parseFloatScalar(parts[3]);
      const w = parseFloatScalar(parts[4]) || h;
      const t = parseFloatScalar(parts[5]);
      if (!h || !t) return null;
      const outer = [[0, 0], [w, 0], [w, t], [t, t], [t, h], [0, h]];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCTSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, FlangeWidth, WebThickness, FlangeThickness, ...)
      const h = parseFloatScalar(parts[3]);
      const bf = parseFloatScalar(parts[4]);
      const tw = parseFloatScalar(parts[5]);
      const tf = parseFloatScalar(parts[6]);
      if (!h || !bf || !tw || !tf) return null;
      const hx = bf / 2, hw = tw / 2;
      const outer = [
        [-hx, h - tf], [-hx, h], [hx, h], [hx, h - tf],
        [hw, h - tf], [hw, 0], [-hw, 0], [-hw, h - tf]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCCSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, Width, WallThickness, ...)
      const h = parseFloatScalar(parts[3]);
      const w = parseFloatScalar(parts[4]);
      const t = parseFloatScalar(parts[5]);
      if (!h || !w || !t) return null;
      const hx = w / 2, hy = h / 2;
      const outer = [
        [-hx, -hy], [hx, -hy], [hx, -hy + t], [-hx + t, -hy + t],
        [-hx + t, hy - t], [hx, hy - t], [hx, hy], [-hx, hy]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCARBITRARYCLOSEDPROFILEDEF': {
      // (ProfileType, ProfileName, OuterCurve)
      const curveRef = parseRef(parts[2]);
      const outer = resolveCurvePoints2D(entityIndex, curveRef);
      if (!outer || outer.length < 3) return null;
      return { outer, holes: [] };
    }
    case 'IFCARBITRARYPROFILEDEFWITHVOIDS': {
      // (ProfileType, ProfileName, OuterCurve, InnerCurves)
      const curveRef = parseRef(parts[2]);
      const outer = resolveCurvePoints2D(entityIndex, curveRef);
      if (!outer || outer.length < 3) return null;
      const innerRefs = parseRefList(parts[3]);
      const holes = [];
      for (const r of innerRefs) {
        const h = resolveCurvePoints2D(entityIndex, r);
        if (h && h.length >= 3) holes.push(h);
      }
      return { outer, holes };
    }
    default:
      return null;
  }
}

/** Apply IfcAxis2Placement2D (parts ref or '$') to a 2D polygon. */
function apply2DProfilePosition(entityIndex, posRef, polygon) {
  const ref = parseRef(posRef);
  if (!ref) return polygon;
  const pos = entityIndex.byExpressId(ref);
  if (!pos || pos.type !== 'IFCAXIS2PLACEMENT2D') return polygon;
  const posParts = splitParams(pos.params);
  const locId = parseRef(posParts[0]);
  const refDirId = parseRef(posParts[1]);
  const loc = locId ? resolveCoords(entityIndex, locId) : [0, 0];
  const refDir = refDirId ? resolveCoords(entityIndex, refDirId) : [1, 0];
  const cos = refDir[0], sin = refDir[1];
  return polygon.map(([x, y]) => [
    cos * x - sin * y + (loc[0] || 0),
    sin * x + cos * y + (loc[1] || 0)
  ]);
}

/** Resolve a 2D curve (IfcPolyline / IfcIndexedPolyCurve) to [[x,y],...]. */
function resolveCurvePoints2D(entityIndex, curveId) {
  if (!curveId) return null;
  const c = entityIndex.byExpressId(curveId);
  if (!c) return null;
  const parts = splitParams(c.params);

  if (c.type === 'IFCPOLYLINE') {
    const ptRefs = parseRefList(parts[0]);
    const out = [];
    for (const r of ptRefs) {
      const p = entityIndex.byExpressId(r);
      if (!p) continue;
      const coords = p.params.replace(/^\(+|\)+$/g, '').split(',').map(s => parseFloat(s.trim()));
      if (coords.length >= 2) out.push([coords[0], coords[1]]);
    }
    // Drop duplicated closing point if present
    if (out.length >= 2) {
      const first = out[0], last = out[out.length - 1];
      if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
    }
    return out;
  }

  if (c.type === 'IFCINDEXEDPOLYCURVE') {
    // (Points, Segments, SelfIntersect)
    const pointsRef = parseRef(parts[0]);
    if (!pointsRef) return null;
    const ptList = entityIndex.byExpressId(pointsRef);
    if (!ptList || ptList.type !== 'IFCCARTESIANPOINTLIST2D') return null;
    const all = parsePointList(splitParams(ptList.params)[0]);

    // Segments optional: if missing, use points in order
    const segRaw = parts[1];
    if (!segRaw || segRaw === '$' || segRaw === '*') {
      const out = all.map(p => [p[0], p[1]]);
      if (out.length >= 2) {
        const f = out[0], l = out[out.length - 1];
        if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
      }
      return out;
    }

    // Walk segments — handle IfcLineIndex (list of point indices). IfcArcIndex
    // (3-point arcs) gets approximated as a straight line for Phase 1.
    const segList = parseIntNTupleList(segRaw);
    const out = [];
    let lastIdx = null;
    for (const seg of segList) {
      for (const idx of seg) {
        if (idx === lastIdx) continue;
        if (idx < 1 || idx > all.length) continue;
        out.push([all[idx - 1][0], all[idx - 1][1]]);
        lastIdx = idx;
      }
    }
    if (out.length >= 2) {
      const f = out[0], l = out[out.length - 1];
      if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
    }
    return out;
  }

  return null;
}

// -------------------- IfcExtrudedAreaSolid --------------------

/**
 * IFC: IFCEXTRUDEDAREASOLID(SweptArea, Position, ExtrudedDirection, Depth)
 *   SweptArea → IfcProfileDef subtype (rectangle, circle, I-shape, arbitrary, ...)
 *   Position → IfcAxis2Placement3D (extrusion local frame)
 *   ExtrudedDirection → IfcDirection (extrusion vector in profile's local frame)
 *   Depth → real (extrusion length along ExtrudedDirection)
 *
 * Most common solid representation across Revit / Tekla / Civil 3D.
 */
export function extrudedAreaSolidToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCEXTRUDEDAREASOLID') return null;
  const parts = splitParams(entity.params);
  const profileId = parseRef(parts[0]);
  const positionId = parseRef(parts[1]);
  const dirId = parseRef(parts[2]);
  const depth = parseFloatScalar(parts[3]);
  if (!profileId || !depth) return null;

  const profile = resolveProfilePoints(entityIndex, profileId);
  if (!profile || profile.outer.length < 3) return null;

  // Build THREE.Shape (with optional holes) and extrude
  const shape = new THREE.Shape();
  shape.moveTo(profile.outer[0][0], profile.outer[0][1]);
  for (let i = 1; i < profile.outer.length; i++) shape.lineTo(profile.outer[i][0], profile.outer[i][1]);
  shape.closePath();
  for (const hole of profile.holes) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(hole[0][0], hole[0][1]);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
    path.closePath();
    shape.holes.push(path);
  }

  const dir = dirId ? resolveCoords(entityIndex, dirId) : [0, 0, 1];
  const dirVec = new THREE.Vector3(dir[0] || 0, dir[1] || 0, dir[2] || 0);
  if (dirVec.lengthSq() < 1e-12) dirVec.set(0, 0, 1);
  else dirVec.normalize();

  let geom;
  try {
    geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12, steps: 1 });
  } catch (e) {
    // Some profiles (self-intersecting curves, degenerate shapes) make
    // ExtrudeGeometry throw inside earcut. Skip rather than crash the load.
    return null;
  }

  // ExtrudeGeometry extrudes along +Z in shape-local coords. Rotate so that
  // the actual ExtrudedDirection becomes the extrusion axis.
  const z = new THREE.Vector3(0, 0, 1);
  if (Math.abs(z.dot(dirVec) - 1) > 1e-6) {
    const q = new THREE.Quaternion().setFromUnitVectors(z, dirVec);
    geom.applyQuaternion(q);
  }

  // Apply IfcAxis2Placement3D for the solid (Position attribute)
  if (positionId) {
    const m = placement3DToMatrix(entityIndex, positionId);
    geom.applyMatrix4(m);
  }

  geom.computeVertexNormals();
  geom.computeBoundingBox();
  return geom;
}

/** Local copy of placement3DToMatrix (avoids cyclical import with placement.js). */
function placement3DToMatrix(entityIndex, placementId) {
  const e = entityIndex.byExpressId(placementId);
  if (!e || e.type !== 'IFCAXIS2PLACEMENT3D') return new THREE.Matrix4();
  const parts = splitParams(e.params);
  const locId = parseRef(parts[0]);
  const axisId = parseRef(parts[1]);
  const refDirId = parseRef(parts[2]);
  const location = locId ? resolveCoords(entityIndex, locId) : [0, 0, 0];
  const axisVec = axisId ? resolveCoords(entityIndex, axisId) : [0, 0, 1];
  const refDirVec = refDirId ? resolveCoords(entityIndex, refDirId) : [1, 0, 0];
  const z = new THREE.Vector3(axisVec[0], axisVec[1], axisVec[2]).normalize();
  const xRef = new THREE.Vector3(refDirVec[0], refDirVec[1], refDirVec[2]);
  const x = xRef.clone().sub(z.clone().multiplyScalar(z.dot(xRef))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(location[0] || 0, location[1] || 0, location[2] || 0);
  return m;
}

// -------------------- IfcMappedItem helpers (used by geometry-core dispatcher) --------------------

/**
 * Resolve the combined transform for an IFCMAPPEDITEM:
 *   M = (MappingTarget) × inverse(MappingOrigin)
 * Returns { matrix, innerItemRefs } so the caller can recurse into the mapped
 * representation's items.
 */
export function resolveMappedItem(entityIndex, expressId) {
  const item = entityIndex.byExpressId(expressId);
  if (!item || item.type !== 'IFCMAPPEDITEM') return null;
  const parts = splitParams(item.params);
  const sourceRef = parseRef(parts[0]);
  const targetRef = parseRef(parts[1]);
  if (!sourceRef) return null;
  const source = entityIndex.byExpressId(sourceRef);
  if (!source || source.type !== 'IFCREPRESENTATIONMAP') return null;
  const sParts = splitParams(source.params);
  const originId = parseRef(sParts[0]);
  const repId = parseRef(sParts[1]);
  if (!repId) return null;

  const origin = originId ? placement3DToMatrix(entityIndex, originId) : new THREE.Matrix4();
  const target = targetRef ? resolveCartesianTransform(entityIndex, targetRef) : new THREE.Matrix4();

  // Map matrix: target × inverse(origin)
  const matrix = target.clone().multiply(origin.clone().invert());

  const rep = entityIndex.byExpressId(repId);
  if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') return null;
  const repParts = splitParams(rep.params);
  const innerItemRefs = parseRefList(repParts[3]);
  return { matrix, innerItemRefs };
}

/** IfcCartesianTransformationOperator3D → THREE.Matrix4. */
function resolveCartesianTransform(entityIndex, expressId) {
  const e = entityIndex.byExpressId(expressId);
  if (!e) return new THREE.Matrix4();
  // 3D and 3DnonUniform share leading params: (Axis1, Axis2, LocalOrigin, Scale, Axis3)
  const parts = splitParams(e.params);
  const xRefId = parseRef(parts[0]);
  const yRefId = parseRef(parts[1]);
  const originId = parseRef(parts[2]);
  const scale = parseFloatScalar(parts[3]);
  const zRefId = parseRef(parts[4]);
  const origin = originId ? resolveCoords(entityIndex, originId) : [0, 0, 0];
  const xRef = xRefId ? resolveCoords(entityIndex, xRefId) : [1, 0, 0];
  const yRef = yRefId ? resolveCoords(entityIndex, yRefId) : [0, 1, 0];
  const zRef = zRefId ? resolveCoords(entityIndex, zRefId) : null;

  const x = new THREE.Vector3(xRef[0] || 1, xRef[1] || 0, xRef[2] || 0).normalize();
  const y = new THREE.Vector3(yRef[0] || 0, yRef[1] || 1, yRef[2] || 0).normalize();
  let z;
  if (zRef) z = new THREE.Vector3(zRef[0] || 0, zRef[1] || 0, zRef[2] || 1).normalize();
  else z = new THREE.Vector3().crossVectors(x, y).normalize();

  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const m = new THREE.Matrix4().makeBasis(
    x.multiplyScalar(s),
    y.multiplyScalar(s),
    z.multiplyScalar(s)
  );
  m.setPosition(origin[0] || 0, origin[1] || 0, origin[2] || 0);
  return m;
}
