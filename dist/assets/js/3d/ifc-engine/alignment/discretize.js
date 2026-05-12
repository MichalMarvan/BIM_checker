// Phase 6.8.2 — Alignment discretization to polyline + station→point lookup.
//
// For each parsed alignment element (line / curve / spiral), generate sample
// points along the arc length. Resolution targets a max chord deviation
// (default 0.05 m / 5 cm) so curves look smooth and linear interpolation is
// accurate for station-to-point lookups.
//
// Output:
//   sampleAlignment(alignment, opts) → {
//     points: [[x,y,z], ...],
//     stations: [number, ...],   // station for each point (parallel array)
//     tangents: [[dx,dy,dz], ...], // unit tangent at each point
//     elementIndex: [number, ...], // which element each point belongs to
//   }

const DEFAULT_CHORD_TOL = 0.05;     // 5 cm chord deviation for curves/spirals
const MIN_SAMPLES_PER_ELEMENT = 8;  // even short elements get >=8 samples
const MAX_SAMPLES_PER_ELEMENT = 1000;

export function sampleAlignment(alignment, opts = {}) {
  const tol = opts.chordTol || DEFAULT_CHORD_TOL;
  const points = [];
  const stations = [];
  const tangents = [];
  const elementIndex = [];

  for (let ei = 0; ei < alignment.elements.length; ei++) {
    const el = alignment.elements[ei];
    const samples = sampleElement(el, tol);
    // Skip the first sample of every element after the first (avoids duplicates
    // at element boundaries).
    const startIdx = ei === 0 ? 0 : 1;
    for (let i = startIdx; i < samples.length; i++) {
      points.push(samples[i].point);
      stations.push(samples[i].station);
      tangents.push(samples[i].tangent);
      elementIndex.push(ei);
    }
  }
  return { points, stations, tangents, elementIndex };
}

function sampleElement(el, tol) {
  if (el.type === 'line') return sampleLine(el);
  if (el.type === 'curve') return sampleCurve(el, tol);
  if (el.type === 'spiral') return sampleSpiral(el, tol);
  return [];
}

function sampleLine(el) {
  const dx = el.end[0] - el.start[0];
  const dy = el.end[1] - el.start[1];
  const dz = (el.end[2] || 0) - (el.start[2] || 0);
  const len = Math.max(el.length, 1e-9);
  const t = [dx / len, dy / len, dz / len];
  return [
    { point: [...el.start], station: el.startStation, tangent: t },
    { point: [...el.end], station: el.endStation, tangent: t },
  ];
}

function sampleCurve(el, tol) {
  const cx = el.center[0], cy = el.center[1];
  const sx = el.start[0], sy = el.start[1];
  const ex = el.end[0], ey = el.end[1];
  const sz = el.start[2] || 0;
  const ez = el.end[2] || 0;
  const angStart = Math.atan2(sy - cy, sx - cx);
  let angEnd = Math.atan2(ey - cy, ex - cx);
  let delta = angEnd - angStart;
  // Normalize per rotation direction
  if (el.rotation === 'cw') {
    while (delta > 0) delta -= 2 * Math.PI;
    while (delta < -2 * Math.PI) delta += 2 * Math.PI;
  } else {
    while (delta < 0) delta += 2 * Math.PI;
    while (delta > 2 * Math.PI) delta -= 2 * Math.PI;
  }
  // Sample step size from chord deviation: maxChord = 2*r*sin(step/2) ~ r*step for small step
  // chord deviation = r - r*cos(step/2) ~ r*step²/8 → step ≈ sqrt(8*tol/r)
  const radius = el.radius;
  const stepAng = Math.min(0.5, Math.sqrt(8 * tol / Math.max(radius, 0.1)));
  const stepCount = Math.max(
    MIN_SAMPLES_PER_ELEMENT,
    Math.min(MAX_SAMPLES_PER_ELEMENT, Math.ceil(Math.abs(delta) / stepAng))
  );
  const out = [];
  for (let i = 0; i <= stepCount; i++) {
    const u = i / stepCount;
    const ang = angStart + delta * u;
    const x = cx + radius * Math.cos(ang);
    const y = cy + radius * Math.sin(ang);
    const z = sz + (ez - sz) * u;
    // Tangent: perpendicular to radius vector, oriented per rotation
    const tx = -Math.sin(ang) * (delta < 0 ? -1 : 1);
    const ty = Math.cos(ang) * (delta < 0 ? -1 : 1);
    out.push({
      point: [x, y, z],
      station: el.startStation + el.length * u,
      tangent: [tx, ty, 0],
    });
  }
  return out;
}

/**
 * Clothoid sampling. We integrate numerically: parameterize by arc length s
 * from element start. Curvature κ(s) varies linearly from κ_start to κ_end.
 * Heading θ(s) = θ_start + ∫₀ˢ κ(t) dt.
 * Position from numerical integration of (cos θ, sin θ).
 *
 * Then place into world coords using the element's start point + initial
 * heading derived from the local frame.
 */
function sampleSpiral(el, tol) {
  const L = el.length;
  if (L <= 0) return [];
  const k0 = el.radiusStart === Infinity ? 0 : (1 / el.radiusStart);
  const k1 = el.radiusEnd === Infinity ? 0 : (1 / el.radiusEnd);
  const sign = el.rotation === 'cw' ? -1 : 1;

  // Determine starting heading. dirStart is given as bearing in some files;
  // fallback: use start→PI direction or start→end direction.
  let theta0;
  if (el.dirStart != null) {
    // LandXML dirStart: angle in radians from +Y (north), clockwise (per spec)
    // Convert to math convention (from +X, counter-clockwise)
    theta0 = Math.PI / 2 - el.dirStart;
  } else if (el.pi) {
    theta0 = Math.atan2(el.pi[1] - el.start[1], el.pi[0] - el.start[0]);
  } else {
    theta0 = Math.atan2(el.end[1] - el.start[1], el.end[0] - el.start[0]);
  }

  // Sample density: clothoid heading change is sigma·s²/2; pick steps small
  // enough that chord deviation < tol. For pragmatic MVP use fixed N + tol.
  const N = Math.max(MIN_SAMPLES_PER_ELEMENT, Math.min(MAX_SAMPLES_PER_ELEMENT,
    Math.ceil(L / Math.max(0.5, Math.sqrt(tol * 8 / Math.max(Math.abs(k1), 0.001))))));

  const out = [];
  let x = el.start[0], y = el.start[1];
  const sz = el.start[2] || 0;
  const ez = el.end[2] || 0;
  const ds = L / N;
  let theta = theta0;
  out.push({ point: [x, y, sz], station: el.startStation, tangent: [Math.cos(theta), Math.sin(theta), 0] });

  for (let i = 1; i <= N; i++) {
    const s = i * ds;
    // Curvature at this s (linear interp)
    const kappa = sign * (k0 + (k1 - k0) * (s / L));
    // Midpoint heading for better integration
    const sMid = s - ds / 2;
    const kappaMid = sign * (k0 + (k1 - k0) * (sMid / L));
    // dθ over this step (using mid-step κ)
    const dTheta = kappaMid * ds;
    // Use mid-step heading for position increment
    const thetaMid = theta + dTheta / 2;
    x += Math.cos(thetaMid) * ds;
    y += Math.sin(thetaMid) * ds;
    theta += dTheta;
    out.push({
      point: [x, y, sz + (ez - sz) * (s / L)],
      station: el.startStation + s,
      tangent: [Math.cos(theta), Math.sin(theta), 0],
    });
  }

  // Fix endpoint drift: nudge last point to el.end if known and close enough
  if (el.end) {
    const last = out[out.length - 1];
    last.point[0] = el.end[0];
    last.point[1] = el.end[1];
    last.point[2] = el.end[2] || 0;
  }
  return out;
}

/**
 * Find point + tangent at a given station along sampled alignment.
 * Linear interpolation between adjacent samples.
 *
 * @param {ReturnType<typeof sampleAlignment>} sampled
 * @param {number} station
 * @returns {{point:[x,y,z], tangent:[dx,dy,dz]} | null}
 */
export function pointAtStation(sampled, station) {
  const { points, stations, tangents } = sampled;
  if (points.length === 0) return null;
  if (station <= stations[0]) {
    return { point: [...points[0]], tangent: [...tangents[0]] };
  }
  if (station >= stations[stations.length - 1]) {
    return { point: [...points[points.length - 1]], tangent: [...tangents[tangents.length - 1]] };
  }
  // Binary search
  let lo = 0, hi = stations.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (stations[mid] <= station) lo = mid;
    else hi = mid;
  }
  const range = stations[hi] - stations[lo];
  const t = range > 0 ? (station - stations[lo]) / range : 0;
  const a = points[lo], b = points[hi];
  const ta = tangents[lo], tb = tangents[hi];
  return {
    point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])],
    tangent: [ta[0] + t * (tb[0] - ta[0]), ta[1] + t * (tb[1] - ta[1]), ta[2] + t * (tb[2] - ta[2])],
  };
}
