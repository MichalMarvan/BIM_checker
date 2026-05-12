// Phase 6.8.2 — LandXML alignment parser.
//
// Parses LandXML 1.2 <Alignment> with <CoordGeom> containing <Line>, <Curve>,
// and <Spiral> elements. Returns alignment metadata + raw element list with
// geometric parameters; discretization to polyline is in discretize.js.
//
// Coordinate convention:
//   LandXML default is (Northing, Easting) — but Czech surveying convention
//   often writes "Y X" meaning (East, North). We expose a `swapXY` option;
//   default false (LandXML standard interpretation).
//
// 3D handling:
//   Element <Start>/<End>/<Center> may be 2-coord (planar) or 3-coord (with Z).
//   If only 2D, alignment is treated as flat (Z=0) and Profile <ProfAlign>
//   should be combined externally — out of MVP scope.

/**
 * Parse LandXML text → array of alignment objects.
 * @param {string} xmlText
 * @param {{ swapXY?: boolean }} [opts]
 * @returns {Array<Alignment>}
 */
export function parseLandXmlAlignments(xmlText, opts = {}) {
  const swapXY = !!opts.swapXY;
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const errors = doc.getElementsByTagName('parsererror');
  if (errors.length > 0) {
    throw new Error('LandXML parse error: ' + errors[0].textContent);
  }
  const alignments = [];
  for (const aNode of doc.getElementsByTagName('Alignment')) {
    const name = aNode.getAttribute('name') || 'Alignment';
    const length = parseFloat(aNode.getAttribute('length')) || 0;
    const staStart = parseFloat(aNode.getAttribute('staStart')) || 0;

    const elements = [];
    const cg = aNode.getElementsByTagName('CoordGeom')[0];
    if (cg) {
      let cumStation = staStart;
      for (const child of cg.children) {
        const tag = child.tagName;
        if (tag === 'Line') {
          const e = parseLine(child, cumStation, swapXY);
          if (e) { elements.push(e); cumStation += e.length; }
        } else if (tag === 'Curve') {
          const e = parseCurve(child, cumStation, swapXY);
          if (e) { elements.push(e); cumStation += e.length; }
        } else if (tag === 'Spiral') {
          const e = parseSpiral(child, cumStation, swapXY);
          if (e) { elements.push(e); cumStation += e.length; }
        }
      }
    }

    alignments.push({
      name,
      length: length || (elements[elements.length - 1]?.endStation - staStart) || 0,
      staStart,
      elements,
    });
  }
  return alignments;
}

function parseXyz(text, swapXY) {
  if (!text) return null;
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || parts.some(n => !Number.isFinite(n))) return null;
  const a = parts[0];
  const b = parts[1];
  const c = parts[2] != null ? parts[2] : 0;
  // LandXML default: <Start>N E [Z]</Start>. Internally we use (x=E, y=N, z=Z)
  // so the alignment lives in the XY plane like the IFC viewer's world space
  // (after Z-up to Y-up rotation, IFC X→world X, IFC Y→world Z, IFC Z→world Y;
  // but alignment Z (elevation) maps to world Y).
  // swapXY=true reads as (E, N, Z) instead of (N, E, Z) — Czech custom.
  const x = swapXY ? a : b;       // East
  const y = swapXY ? b : a;       // North (becomes alignment "y", world Z after IFC rotation)
  const z = c;                    // Elevation (becomes world Y after IFC rotation)
  return [x, y, z];
}

function readPoint(node, tag, swapXY) {
  const el = node.getElementsByTagName(tag)[0];
  return el ? parseXyz(el.textContent, swapXY) : null;
}

function parseLine(node, station, swapXY) {
  const start = readPoint(node, 'Start', swapXY);
  const end = readPoint(node, 'End', swapXY);
  if (!start || !end) return null;
  const length = parseFloat(node.getAttribute('length'))
    || Math.hypot(end[0] - start[0], end[1] - start[1]);
  return {
    type: 'line',
    startStation: station,
    endStation: station + length,
    length,
    start, end,
  };
}

function parseCurve(node, station, swapXY) {
  const start = readPoint(node, 'Start', swapXY);
  const end = readPoint(node, 'End', swapXY);
  const center = readPoint(node, 'Center', swapXY);
  if (!start || !end || !center) return null;
  const radius = parseFloat(node.getAttribute('radius'))
    || Math.hypot(start[0] - center[0], start[1] - center[1]);
  const length = parseFloat(node.getAttribute('length')) || estimateArcLength(start, end, center);
  // rot: 'cw' (clockwise) or 'ccw'
  const rot = (node.getAttribute('rot') || 'cw').toLowerCase();
  return {
    type: 'curve',
    startStation: station,
    endStation: station + length,
    length,
    start, end, center, radius,
    rotation: rot === 'cw' ? 'cw' : 'ccw',
  };
}

function estimateArcLength(start, end, center) {
  const ang1 = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const ang2 = Math.atan2(end[1] - center[1], end[0] - center[0]);
  let delta = ang2 - ang1;
  // Normalize to (-π, π]
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  return Math.abs(delta) * radius;
}

function parseSpiral(node, station, swapXY) {
  const start = readPoint(node, 'Start', swapXY);
  const end = readPoint(node, 'End', swapXY);
  const pi = readPoint(node, 'PI', swapXY);  // intersection point (optional)
  if (!start || !end) return null;
  const length = parseFloat(node.getAttribute('length')) || Math.hypot(end[0] - start[0], end[1] - start[1]);
  // Radii: "INF" or numeric; entry spiral has radiusStart=INF and radiusEnd=R;
  // exit spiral has radiusStart=R and radiusEnd=INF
  const parseRadius = (s) => {
    if (!s || s.toUpperCase() === 'INF' || s.toUpperCase() === 'INFINITY') return Infinity;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : Infinity;
  };
  const radiusStart = parseRadius(node.getAttribute('radiusStart'));
  const radiusEnd = parseRadius(node.getAttribute('radiusEnd'));
  const dirStart = parseFloat(node.getAttribute('dirStart'));
  const rot = (node.getAttribute('rot') || 'cw').toLowerCase();
  // spiType: usually "clothoid" — only one we support
  const spiType = (node.getAttribute('spiType') || 'clothoid').toLowerCase();
  return {
    type: 'spiral',
    startStation: station,
    endStation: station + length,
    length,
    start, end, pi,
    radiusStart, radiusEnd,
    dirStart: Number.isFinite(dirStart) ? dirStart : null,
    rotation: rot === 'cw' ? 'cw' : 'ccw',
    spiType,
  };
}
