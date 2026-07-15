/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// IFC 4.3 geometric-layer alignment curve evaluator (THREE-free).
//
// Vyhodnocuje IfcCompositeCurve (2D půdorys) a IfcGradientCurve (3D osa =
// půdorys + niveleta) přes IfcCurveSegment:
//   IfcCurveSegment(Transition, Placement, SegmentStart, SegmentLength, ParentCurve)
// ParentCurve je šablona tvaru v LOKÁLNÍM parametrickém prostoru; úsek
// parametru [SegmentStart, SegmentStart+SegmentLength] se kotví tak, aby bod
// t=SegmentStart ležel v Placement.Location a tečna mířila v RefDirection.
//
// Pasti (viz docs/superpowers/plans/2026-07-14-ifc43-alignment-based-view.md):
//   - poslední segment je nulové délky s .DISCONTINUOUS. → přeskočit
//   - CW oblouk = záporná SegmentLength; poloměr IfcCircle vždy kladný
//   - klotoida: κ(t) = t/(A·|A|) — A i SegmentStart mohou být záporné
//   - parametrizace gradient curve = VODOROVNÝ průmět

import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parseWrappedNum } from '../geometry/step-helpers.js';

const EPS_LEN = 1e-9;

function readVec2(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e) return null;
  const m = e.params.match(/\(([^)]*)\)/);
  if (!m) return null;
  const nums = m[1].split(',').map(s => parseFloat(s.trim()));
  return Number.isFinite(nums[0]) && Number.isFinite(nums[1]) ? [nums[0], nums[1]] : null;
}

/** IfcAxis2Placement2D → { loc:[x,y], angle } (default (0,0)/0). */
function readPlacement2D(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e || e.type !== 'IFCAXIS2PLACEMENT2D') return { loc: [0, 0], angle: 0 };
  const parts = splitParams(e.params);
  const loc = readVec2(entityIndex, parseRef(parts[0])) || [0, 0];
  const refDirId = parseRef(parts[1]);
  const rd = refDirId ? readVec2(entityIndex, refDirId) : null;
  return { loc, angle: rd ? Math.atan2(rd[1], rd[0]) : 0 };
}

/** Číselný seznam "(a,b,c)" → [a,b,c]. */
function readNumList(raw) {
  if (!raw || raw === '$') return [];
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  return inner.split(',').map(s => parseFloat(s.trim())).filter(Number.isFinite);
}

/**
 * Lokální evaluátor parent curve. Vrací:
 *   pointAt(t) → [x,y] v lokálním prostoru parent curve
 *   dirAt(t)   → úhel tečny (rad)
 *   toParam(wrapped) → převod SegmentStart/SegmentLength ({value,type}) na
 *                      nativní parametr křivky (zachovává znaménko)
 *   paramToLength(tSpan) → oblouková délka úseku parametru
 */
function localEvaluator(entityIndex, parentId) {
  const e = entityIndex.byExpressId(parentId);
  if (!e) return null;
  const parts = splitParams(e.params);

  if (e.type === 'IFCLINE') {
    const pnt = readVec2(entityIndex, parseRef(parts[0])) || [0, 0];
    const vec = entityIndex.byExpressId(parseRef(parts[1]));
    let ori = [1, 0], mag = 1;
    if (vec && vec.type === 'IFCVECTOR') {
      const vp = splitParams(vec.params);
      ori = readVec2(entityIndex, parseRef(vp[0])) || [1, 0];
      const m = parseWrappedNum(vp[1]);
      if (m && m.value !== 0) mag = m.value;
    }
    const n = Math.hypot(ori[0], ori[1]) || 1;
    const ux = ori[0] / n, uy = ori[1] / n;
    return {
      pointAt: t => [pnt[0] + t * mag * ux, pnt[1] + t * mag * uy],
      dirAt: () => Math.atan2(uy, ux),
      toParam: w => (w.type === 'IFCPARAMETERVALUE') ? w.value : w.value / mag,
      paramToLength: tSpan => Math.abs(tSpan) * mag,
    };
  }

  if (e.type === 'IFCCIRCLE') {
    const pos = readPlacement2D(entityIndex, parseRef(parts[0]));
    const R = parseFloat(parts[1]);
    if (!Number.isFinite(R) || R <= 0) return null;
    const cos = Math.cos(pos.angle), sin = Math.sin(pos.angle);
    return {
      pointAt: th => {
        const lx = R * Math.cos(th), ly = R * Math.sin(th);
        return [pos.loc[0] + lx * cos - ly * sin, pos.loc[1] + lx * sin + ly * cos];
      },
      dirAt: th => pos.angle + th + Math.PI / 2,
      toParam: w => (w.type === 'IFCPARAMETERVALUE') ? w.value : w.value / R,
      paramToLength: thSpan => Math.abs(thSpan) * R,
    };
  }

  if (e.type === 'IFCCLOTHOID') {
    const pos = readPlacement2D(entityIndex, parseRef(parts[0]));
    const A = parseFloat(parts[1]);
    if (!Number.isFinite(A) || A === 0) return null;
    const AA = A * Math.abs(A); // zachovává znaménko — NIKDY A²!
    const cos = Math.cos(pos.angle), sin = Math.sin(pos.angle);
    // Fresnel: ∫₀ᵗ cos/sin(s²/(2·AA)) ds — kompozitní Simpson, sub-krok ≤ 0.25 m.
    const fresnel = t => {
      if (t === 0) return [0, 0];
      const n = Math.max(2, 2 * Math.ceil(Math.abs(t) / 0.5));
      const h = t / n;
      let sx = 1, sy = 0; // f(0): cos(0)=1, sin(0)=0
      for (let i = 1; i < n; i++) {
        const s = i * h, w = (i % 2 === 1) ? 4 : 2, a = (s * s) / (2 * AA);
        sx += w * Math.cos(a); sy += w * Math.sin(a);
      }
      const aT = (t * t) / (2 * AA);
      sx += Math.cos(aT); sy += Math.sin(aT);
      return [(h / 3) * sx, (h / 3) * sy];
    };
    return {
      pointAt: t => {
        const [lx, ly] = fresnel(t);
        return [pos.loc[0] + lx * cos - ly * sin, pos.loc[1] + lx * sin + ly * cos];
      },
      // θ(t) = ∫₀ᵗ κ = t²/(2·AA) — sudá funkce; zrcadlení větví nese liché y(t).
      dirAt: t => pos.angle + (t * t) / (2 * AA),
      toParam: w => w.value, // parametr klotoidy = oblouková délka
      paramToLength: tSpan => Math.abs(tSpan),
    };
  }

  return null; // IFCPOLYNOMIALCURVE — jen niveleta (buildVerticalEval)
}

/**
 * Předpočítá kotvení segmentu na jeho Placement: bod t=SegmentStart sedí
 * v Placement.Location, tečna v t=SegmentStart míří v RefDirection.
 * @returns {{ length, at(s) } | null} — s ∈ [0, length] po obloukové délce.
 */
function buildSegmentEval(entityIndex, segId) {
  const e = entityIndex.byExpressId(segId);
  if (!e || e.type !== 'IFCCURVESEGMENT') return null;
  const parts = splitParams(e.params);
  const placement = readPlacement2D(entityIndex, parseRef(parts[1]));
  const startW = parseWrappedNum(parts[2]);
  const lenW = parseWrappedNum(parts[3]);
  const parent = localEvaluator(entityIndex, parseRef(parts[4]));
  if (!startW || !lenW || !parent) return null;

  const t0 = parent.toParam(startW);
  const tSpan = parent.toParam(lenW);
  const length = parent.paramToLength(tSpan);
  if (length < EPS_LEN) return { length: 0, at: null }; // terminátor — přeskočit

  // Záporná SegmentLength = traverz proti směru parametru: tečna JÍZDY je
  // otočená o π oproti parametrické tečně — kotví se směr jízdy.
  const sign = tSpan < 0 ? -1 : 1;
  const rev = sign < 0 ? Math.PI : 0;
  const p0 = parent.pointAt(t0);
  const d0 = parent.dirAt(t0) + rev;
  const rot = placement.angle - d0;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const paramPerLen = Math.abs(tSpan) / length;

  return {
    length,
    at: s => {
      const t = t0 + sign * s * paramPerLen;
      const p = parent.pointAt(t);
      const dx = p[0] - p0[0], dy = p[1] - p0[1];
      return {
        point2: [placement.loc[0] + dx * cr - dy * sr, placement.loc[1] + dx * sr + dy * cr],
        azimuth: parent.dirAt(t) + rev + rot,
      };
    },
  };
}

/** Sestaví seznam segment evaluátorů + kumulativní staničení. */
function buildSegments(entityIndex, segIds) {
  const segs = [];
  let cum = 0;
  for (const id of segIds) {
    const se = buildSegmentEval(entityIndex, id);
    if (!se || se.length < EPS_LEN) continue;
    segs.push({ start: cum, length: se.length, at: se.at });
    cum += se.length;
  }
  return { segs, total: cum };
}

function evalOnSegments(segs, total, d) {
  if (segs.length === 0) return null;
  const dd = Math.max(0, Math.min(d, total));
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= dd) lo = mid; else hi = mid - 1;
  }
  const seg = segs[lo];
  return seg.at(Math.min(dd - seg.start, seg.length));
}

function makeCurveEval(segs, total, verticalEval) {
  const evalAt = d => {
    const r = evalOnSegments(segs, total, d);
    if (!r) return null;
    const z = verticalEval ? verticalEval(Math.max(0, Math.min(d, total))) : 0;
    return { point: [r.point2[0], r.point2[1], z], azimuth: r.azimuth };
  };
  return {
    length: total,
    is3D: !!verticalEval,
    evalAt,
    sample(step = 1.0) {
      const points = [], stations = [], tangents = [], elementIndex = [];
      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        const n = Math.max(2, Math.min(4000, Math.ceil(seg.length / step) + 1));
        for (let i = (si === 0 ? 0 : 1); i < n; i++) {
          const s = seg.start + (seg.length * i) / (n - 1);
          const r = evalAt(s);
          points.push(r.point);
          stations.push(s);
          tangents.push([Math.cos(r.azimuth), Math.sin(r.azimuth), 0]);
          elementIndex.push(si);
        }
      }
      return { points, stations, tangents, elementIndex };
    },
  };
}

/**
 * Vyhodnotí IfcCompositeCurve nebo IfcGradientCurve.
 * @param {EntityIndex} entityIndex
 * @param {number} curveExpressId
 * @returns {CurveEval|null} — { length, is3D, evalAt(d), sample(step) };
 *   evalAt vrací { point:[x,y,z], azimuth } PŘESNĚ (analyticky, bez interpolace).
 */
export function evaluateCurve(entityIndex, curveExpressId) {
  const e = entityIndex.byExpressId(curveExpressId);
  if (!e) return null;
  if (e.type === 'IFCCOMPOSITECURVE') {
    const parts = splitParams(e.params);
    const { segs, total } = buildSegments(entityIndex, parseRefList(parts[0]));
    if (segs.length === 0) return null;
    return makeCurveEval(segs, total, null);
  }
  if (e.type === 'IFCGRADIENTCURVE') {
    // (Segments, SelfIntersect, BaseCurve, EndPoint) — BaseCurve = 2D půdorys,
    // Segments = vertikální průběh v rovině (staničení, výška).
    const parts = splitParams(e.params);
    const base = entityIndex.byExpressId(parseRef(parts[2]));
    if (!base || base.type !== 'IFCCOMPOSITECURVE') return null;
    const bp = splitParams(base.params);
    const { segs, total } = buildSegments(entityIndex, parseRefList(bp[0]));
    if (segs.length === 0) return null;
    const verticalEval = buildVerticalEval(entityIndex, parseRefList(parts[0]));
    return makeCurveEval(segs, total, verticalEval);
  }
  return null;
}

/**
 * Niveleta: seznam vertikálních IfcCurveSegment → funkce d → z.
 * Souřadný prostor segmentů je (staničení po BaseCurve = vodorovný průmět,
 * výška). Kotvení je plné 2D (posun + rotace) jako u horizontály: tečna
 * segmentu v t=SegmentStart míří ve směru Placement.RefDirection — sklon
 * tedy určuje PLACEMENT, ne parent šablona (reálné exportéry používají
 * horizontální IfcLine šablonu a sklon nesou jen v RefDirection).
 * SegmentLength je délka po skloněné křivce; vodorovný rozsah ≈ ·cos(sklon).
 */
function buildVerticalEval(entityIndex, segIds) {
  const entries = [];
  for (const id of segIds) {
    const e = entityIndex.byExpressId(id);
    if (!e || e.type !== 'IFCCURVESEGMENT') continue;
    const parts = splitParams(e.params);
    const placement = readPlacement2D(entityIndex, parseRef(parts[1]));
    const startW = parseWrappedNum(parts[2]);
    const lenW = parseWrappedNum(parts[3]);
    if (!startW || !lenW || Math.abs(lenW.value) < EPS_LEN) continue; // terminátor
    const parent = entityIndex.byExpressId(parseRef(parts[4]));
    if (!parent) continue;
    const pp = splitParams(parent.params);
    let zAt = null;
    if (parent.type === 'IFCLINE') {
      // Konstantní sklon: po ukotvení je směr segmentu = placement.angle,
      // parent šablona přispívá jen tvarem (přímka) — sklon z placementu.
      const g = Math.tan(placement.angle);
      zAt = d => placement.loc[1] + g * (d - placement.loc[0]);
    } else if (parent.type === 'IFCCIRCLE') {
      // Kruhové zaoblení nivelety („Ausrundung" — OpenRoads/ProVI/KorFin).
      // Kotvení jako u paraboly: rotace = placement.angle − lokální tečna v t0,
      // z(d) Newtonem přes x_world(θ) = d.
      const posP = readPlacement2D(entityIndex, parseRef(pp[0]));
      const R = parseFloat(pp[1]);
      if (Number.isFinite(R) && R > 0) {
        const cosP = Math.cos(posP.angle), sinP = Math.sin(posP.angle);
        const px = th => posP.loc[0] + (R * Math.cos(th)) * cosP - (R * Math.sin(th)) * sinP;
        const py = th => posP.loc[1] + (R * Math.cos(th)) * sinP + (R * Math.sin(th)) * cosP;
        const t0 = (startW.type === 'IFCPARAMETERVALUE') ? startW.value : startW.value / R;
        const spanRaw = (lenW.type === 'IFCPARAMETERVALUE') ? lenW.value : lenW.value / R;
        const rev = spanRaw < 0 ? Math.PI : 0;
        const x0 = px(t0), y0 = py(t0);
        const rot = placement.angle - (posP.angle + t0 + Math.PI / 2 + rev);
        const cr = Math.cos(rot), sr = Math.sin(rot);
        const dir = Math.sign(spanRaw || 1);
        zAt = d => {
          let th = t0 + dir * (d - placement.loc[0]) / R;
          for (let i = 0; i < 4; i++) {
            const xw = placement.loc[0] + (px(th) - x0) * cr - (py(th) - y0) * sr;
            const dpx = -R * Math.sin(th) * cosP - R * Math.cos(th) * sinP;
            const dpy = -R * Math.sin(th) * sinP + R * Math.cos(th) * cosP;
            const dxdth = dpx * cr - dpy * sr;
            if (Math.abs(dxdth) < 1e-12) break;
            th += (d - xw) / dxdth;
          }
          return placement.loc[1] + (px(th) - x0) * sr + (py(th) - y0) * cr;
        };
      }
    } else if (parent.type === 'IFCCLOTHOID') {
      // Vertikální přechodnice (železniční vyhlazení, bSI Rail testset).
      // Reuse horizontálního evaluátoru: parametr = oblouková délka,
      // kotvení rotací, z(d) Newtonem přes x_world(t) = d.
      const le = localEvaluator(entityIndex, parseRef(parts[4]));
      if (le) {
        const t0 = le.toParam(startW);
        const spanT = le.toParam(lenW);
        const dirSign = spanT < 0 ? -1 : 1;
        const rev = spanT < 0 ? Math.PI : 0;
        const p0 = le.pointAt(t0);
        const rot = placement.angle - (le.dirAt(t0) + rev);
        const cr = Math.cos(rot), sr = Math.sin(rot);
        zAt = d => {
          let t = t0 + dirSign * (d - placement.loc[0]);
          for (let i = 0; i < 4; i++) {
            const p = le.pointAt(t);
            const xw = placement.loc[0] + (p[0] - p0[0]) * cr - (p[1] - p0[1]) * sr;
            const dxdt = Math.cos(le.dirAt(t) + rot); // jednotková rychlost (oblouková délka)
            if (Math.abs(dxdt) < 1e-9) break;
            t += (d - xw) / dxdt;
          }
          const p = le.pointAt(t);
          return placement.loc[1] + (p[0] - p0[0]) * sr + (p[1] - p0[1]) * cr;
        };
      }
    } else if (parent.type === 'IFCPOLYNOMIALCURVE') {
      // Parabola: lokálně x(t)=Σcx·tⁱ (typicky t), y(t)=Σcy·tⁱ. Ukotvení
      // rotací rot = placement.angle − sklon lokální tečny v t0; z(d) řešíme
      // Newtonem přes x_world(t) = d (rot je v praxi ~0, 2 iterace stačí).
      const cx = readNumList(pp[1]);
      const cy = readNumList(pp[2]);
      const polyX = cx.length ? (t => cx.reduce((a, c, i) => a + c * Math.pow(t, i), 0)) : (t => t);
      const polyY = t => cy.reduce((a, c, i) => a + c * Math.pow(t, i), 0);
      const polyDx = cx.length ? (t => cx.reduce((a, c, i) => i ? a + i * c * Math.pow(t, i - 1) : a, 0)) : (() => 1);
      const polyDy = t => cy.reduce((a, c, i) => i ? a + i * c * Math.pow(t, i - 1) : a, 0);
      const t0 = startW.value;
      const x0 = polyX(t0), y0 = polyY(t0);
      const rot = placement.angle - Math.atan2(polyDy(t0), polyDx(t0));
      const cr = Math.cos(rot), sr = Math.sin(rot);
      zAt = d => {
        let t = t0 + (d - placement.loc[0]);
        for (let i = 0; i < 3; i++) {
          const xw = placement.loc[0] + (polyX(t) - x0) * cr - (polyY(t) - y0) * sr;
          const dxdt = polyDx(t) * cr - polyDy(t) * sr;
          if (Math.abs(dxdt) < 1e-12) break;
          t += (d - xw) / dxdt;
        }
        return placement.loc[1] + (polyX(t) - x0) * sr + (polyY(t) - y0) * cr;
      };
    }
    if (zAt) {
      const hLen = Math.abs(lenW.value) * Math.abs(Math.cos(placement.angle));
      entries.push({ from: placement.loc[0], to: placement.loc[0] + hLen, zAt });
    } else {
      console.warn(`[curve-evaluator] nepodporovaný parent vertikálního segmentu: ${parent.type} — segment přeskočen (niveleta může být v tomto úseku nepřesná)`);
    }
  }
  entries.sort((a, b) => a.from - b.from);
  if (entries.length === 0) return null;
  return d => {
    if (d <= entries[0].from) return entries[0].zAt(entries[0].from);
    for (let i = entries.length - 1; i >= 0; i--) {
      if (d >= entries[i].from) return entries[i].zAt(Math.min(d, entries[i].to));
    }
    return entries[0].zAt(entries[0].from);
  };
}

/** Memoizovaná varianta — cache na entityIndex (zaniká s indexem). */
export function getCurveEval(entityIndex, id) {
  let cache = entityIndex._curveEvalCache;
  if (!cache) cache = entityIndex._curveEvalCache = new Map();
  if (cache.has(id)) return cache.get(id);
  const ce = evaluateCurve(entityIndex, id);
  cache.set(id, ce);
  return ce;
}
