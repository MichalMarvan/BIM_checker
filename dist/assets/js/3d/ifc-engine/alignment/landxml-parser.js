// Phase 6.8.2 / Phase 9 (niveleta) — LandXML alignment parser.
//
// Parsuje LandXML 1.x <Alignment> s <CoordGeom> obsahujícím <Line>, <Curve>
// a <Spiral>. Vrací metadata os + surový seznam elementů s geometrickými
// parametry; diskretizace do polyline je v discretize.js.
//
// Návratová hodnota:
//   parseLandXmlAlignments(xmlText, opts) → { alignments, warnings, meta }
//     meta = { version, flavor: 'generic'|'inframodel'|'hexml',
//              units: { linearUnit, toMeters, dirToRadians }, suggestSwapXY }
//     každá osa nově má `verticalProfile` (nullable, z vertical-profile.js)
//     a `hasProfile: boolean`.
//   warnings = pole česky formulovaných stringů.
//
// Souřadnicová konvence:
//   LandXML defaultně píše (Northing, Easting) — česká zeměměřická praxe ale
//   často píše "Y X" ve smyslu (East, North). Volba `swapXY` (default false)
//   přepne čtení na (E, N). Heuristika `suggestSwapXY` v meta doporučí přednastavení.
//
// 3D:
//   <Start>/<End>/<Center> mohou být 2-souřadnicové (rovinné) nebo 3 (se Z).
//   Výška se primárně bere z <Profile>/<ProfAlign> (niveleta).

import { buildVerticalProfile } from './vertical-profile.js';

const GAP_SNAP = 0.001; // 1 mm — mezery/překryvy pod tuto hranici přichytit

/**
 * Parsuje LandXML text → { alignments, warnings, meta }.
 * @param {string} xmlText
 * @param {{ swapXY?: boolean }} [opts]
 * @returns {{ alignments: Array, warnings: string[], meta: object }}
 */
export function parseLandXmlAlignments(xmlText, opts = {}) {
  const swapXY = !!opts.swapXY;
  const warnings = [];

  // (1) Detekce formátu — před parsováním XML kvůli IFC (STEP) textu.
  const trimmed = (xmlText || '').replace(/^﻿/, '').trimStart();
  if (trimmed.startsWith('ISO-10303-21')) {
    throw new Error('Toto je IFC (STEP), ne LandXML — použijte tlačítko Z IFC.');
  }

  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const errors = doc.getElementsByTagName('parsererror');
  if (errors.length > 0) {
    throw new Error('LandXML parse error: ' + errors[0].textContent);
  }

  const root = doc.documentElement;
  if (!root) {
    throw new Error('Prázdný nebo neplatný XML dokument.');
  }
  const rootLocal = localName(root);
  const ns = (root.namespaceURI || '').toLowerCase();
  const rootLower = rootLocal.toLowerCase();

  // OKSTRA (německý dopravní formát) — namespace nebo root.
  if (ns.includes('okstra') || rootLower.includes('okstra')) {
    throw new Error('OKSTRA (německý formát) není podporován.');
  }

  // Podporujeme jen LandXML a HeXML (LandXML sémantika alignmentů).
  if (rootLocal !== 'LandXML' && rootLocal !== 'HeXML') {
    throw new Error(`Neznámý kořenový element „${rootLocal}“ — očekáván LandXML nebo HeXML.`);
  }

  // Flavor: inframodel (namespace buildingsmart.fi/inframodel nebo FeatureDictionary).
  let flavor = 'generic';
  if (rootLocal === 'HeXML') {
    flavor = 'hexml';
  }
  const featureDicts = doc.getElementsByTagNameNS('*', 'FeatureDictionary');
  let hasInframodelDict = false;
  for (const fd of featureDicts) {
    if ((fd.getAttribute('name') || '').toLowerCase().includes('inframodel')) {
      hasInframodelDict = true;
      break;
    }
  }
  if (ns.includes('inframodel') || hasInframodelDict) {
    flavor = 'inframodel';
    warnings.push('InfraModel — výškové oblouky kruhové, úhly v gonech.');
  }

  const version = root.getAttribute('version') || null;

  // (3) Jednotky — linearUnit → toMeters, directionUnit/angularUnit → dirToRadians.
  const units = parseUnits(doc, warnings);
  const { toMeters, dirToRadians } = units;

  // (2) + (7)-(9) parsuj osy (namespace-agnostic přes getElementsByTagNameNS).
  const alignments = [];
  const alignNodes = doc.getElementsByTagNameNS('*', 'Alignment');
  let suggestSwapXY = false;
  let firstRawPoint = null;

  for (const aNode of alignNodes) {
    const name = aNode.getAttribute('name') || 'Alignment';
    const length = numAttr(aNode, 'length') * toMeters;
    const staStart = numAttr(aNode, 'staStart') * toMeters;

    const cg = firstChildNS(aNode, 'CoordGeom');
    const elements = [];
    if (cg) {
      let cumStation = staStart;
      let prevEnd = null;
      for (const child of Array.from(cg.children)) {
        const tag = localName(child);
        let e = null;
        if (tag === 'Line') e = parseLine(child, cumStation, swapXY, toMeters);
        else if (tag === 'Curve') e = parseCurve(child, cumStation, swapXY, toMeters, warnings);
        else if (tag === 'Spiral') e = parseSpiral(child, cumStation, swapXY, toMeters, dirToRadians, warnings);
        else continue;
        if (!e) continue;

        // (9) suggestSwapXY z RAW prvního tokenu první osy (před swapem).
        if (firstRawPoint === null && e._rawFirst) {
          firstRawPoint = e._rawFirst;
        }

        // (6) mezera/překryv mezi elementy — přichytit do 1 mm, jinak warning.
        if (prevEnd && e.start) {
          const gap = Math.hypot(e.start[0] - prevEnd[0], e.start[1] - prevEnd[1]);
          if (gap > GAP_SNAP) {
            warnings.push(`Mezera mezi prvky osy „${name}“ na staničení ${cumStation.toFixed(2)}: ${(gap * 1000).toFixed(1)} mm.`);
          } else if (gap > 0) {
            // přichytit — začátek prvku na konec předchozího
            e.start = prevEnd.slice();
          }
        }

        delete e._rawFirst;
        elements.push(e);
        cumStation += e.length;
        prevEnd = e.end;
      }
    }

    // (7) Vertikální profil — Profile/ProfAlign, první vyhrává; ProfSurf warning.
    const profileResult = parseProfiles(aNode, name, toMeters, warnings);

    const effLength = length || ((elements.length ? elements[elements.length - 1].endStation : staStart) - staStart) || 0;
    alignments.push({
      name,
      length: effLength,
      staStart,
      elements,
      verticalProfile: profileResult,
      hasProfile: profileResult !== null,
    });
  }

  // (9) suggestSwapXY heuristika z RAW prvního bodu první osy (před swapem):
  //   |první token| < |druhý token| a oba v rozsahu 10⁵–1,4·10⁶ (abs).
  if (firstRawPoint) {
    const a = Math.abs(firstRawPoint[0]);
    const b = Math.abs(firstRawPoint[1]);
    const inRange = (v) => v >= 1e5 && v <= 1.4e6;
    if (a < b && inRange(a) && inRange(b)) {
      suggestSwapXY = true;
    }
  }

  const meta = {
    version,
    flavor,
    units: { linearUnit: units.linearUnit, toMeters, dirToRadians },
    suggestSwapXY,
  };

  return { alignments, warnings, meta };
}

// ---------------------------------------------------------------------------
// Jednotky
// ---------------------------------------------------------------------------

function parseUnits(doc, warnings) {
  const result = { linearUnit: 'meter', toMeters: 1, dirToRadians: 1 };
  const unitsEl = doc.getElementsByTagNameNS('*', 'Units')[0];
  if (!unitsEl) return result;

  // <Metric ...> nebo <Imperial ...> — vezmi první rozpoznaný dětský uzel.
  let sys = null;
  for (const child of Array.from(unitsEl.children)) {
    const ln = localName(child);
    if (ln === 'Metric' || ln === 'Imperial') { sys = child; break; }
  }
  if (!sys) return result;

  const linearUnit = (sys.getAttribute('linearUnit') || 'meter').trim();
  const lu = linearUnit.toLowerCase();
  if (lu === 'foot' || lu === 'feet') {
    result.toMeters = 0.3048;
    warnings.push('Jednotky v anglosaských stopách (foot) — převedeno na metry.');
  } else if (lu === 'ussurveyfoot' || lu === 'us survey foot') {
    result.toMeters = 1200 / 3937;
    warnings.push('Jednotky v US survey stopách (USSurveyFoot) — převedeno na metry.');
  } else if (lu !== 'meter' && lu !== 'metre') {
    warnings.push(`Neznámá délková jednotka „${linearUnit}“ — předpokládám metry.`);
  }
  result.linearUnit = linearUnit;

  // Směrová/úhlová jednotka: directionUnit (preferováno) nebo angularUnit.
  const dirUnit = (sys.getAttribute('directionUnit') || sys.getAttribute('angularUnit') || 'radians').trim();
  const du = dirUnit.toLowerCase();
  if (du === 'decimal degrees' || du === 'degrees' || du === 'degree') {
    result.dirToRadians = Math.PI / 180;
    warnings.push('Úhlové jednotky ve stupních — převedeno na radiány.');
  } else if (du === 'grads' || du === 'grad' || du === 'gon' || du === 'gons' || du === 'gradians') {
    result.dirToRadians = Math.PI / 200;
    warnings.push('Úhlové jednotky v gonech (grads) — převedeno na radiány.');
  } else if (du !== 'radians' && du !== 'radian') {
    warnings.push(`Neznámá úhlová jednotka „${dirUnit}“ — předpokládám radiány.`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Body a geometrie
// ---------------------------------------------------------------------------

/**
 * Rozparsuje "N E [Z]" text. Vrací { xyz, raw } kde raw jsou syrové tokeny
 * (před swapem, pro heuristiku), xyz je [x=E, y=N, z] v metrech.
 */
function parseXyz(text, swapXY, toMeters) {
  if (!text) return null;
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const a = parts[0];
  const b = parts[1];
  const c = Number.isFinite(parts[2]) ? parts[2] : 0;
  // LandXML default: <Start>N E [Z]</Start>. Interně (x=E, y=N, z=Z).
  const x = (swapXY ? a : b) * toMeters; // East
  const y = (swapXY ? b : a) * toMeters; // North
  const z = c * toMeters;                // Elevation
  return { xyz: [x, y, z], raw: [a, b] };
}

function readPoint(node, tag, swapXY, toMeters) {
  const el = firstChildNS(node, tag);
  return el ? parseXyz(el.textContent, swapXY, toMeters) : null;
}

function parseLine(node, station, swapXY, toMeters) {
  const s = readPoint(node, 'Start', swapXY, toMeters);
  const e = readPoint(node, 'End', swapXY, toMeters);
  if (!s || !e) return null;
  const start = s.xyz;
  const end = e.xyz;
  const length = numAttr(node, 'length') * toMeters
    || Math.hypot(end[0] - start[0], end[1] - start[1]);
  return {
    type: 'line',
    startStation: station,
    endStation: station + length,
    length,
    start, end,
    _rawFirst: s.raw,
  };
}

function parseCurve(node, station, swapXY, toMeters, warnings) {
  const s = readPoint(node, 'Start', swapXY, toMeters);
  const e = readPoint(node, 'End', swapXY, toMeters);
  const c = readPoint(node, 'Center', swapXY, toMeters);
  if (!s || !e || !c) return null;
  const start = s.xyz;
  const end = e.xyz;
  const center = c.xyz;

  // (4) Radius přepočti z dist(Center, Start); atribut jen ověř (> 0,1 % → warning).
  const geomRadius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  const attrRadius = numAttr(node, 'radius') * toMeters;
  let radius = geomRadius;
  if (attrRadius > 0 && geomRadius > 0) {
    const rel = Math.abs(attrRadius - geomRadius) / geomRadius;
    if (rel > 0.001) {
      warnings.push(`Poloměr oblouku (staničení ${station.toFixed(2)}): atribut ${attrRadius.toFixed(3)} m se liší od geometrie ${geomRadius.toFixed(3)} m o ${(rel * 100).toFixed(2)} %.`);
    }
  } else if (attrRadius > 0 && geomRadius <= 0) {
    radius = attrRadius;
  }

  const length = numAttr(node, 'length') * toMeters || estimateArcLength(start, end, center);

  // (4) rot: 'cw' / 'ccw'. Chybí → dopočítat z cross produktu (Start−C)×(End−C).
  const rotAttr = (node.getAttribute('rot') || '').trim().toLowerCase();
  let rotation;
  if (rotAttr === 'cw' || rotAttr === 'ccw') {
    rotation = rotAttr;
  } else {
    const sx = start[0] - center[0];
    const sy = start[1] - center[1];
    const ex = end[0] - center[0];
    const ey = end[1] - center[1];
    const cross = sx * ey - sy * ex;
    rotation = cross > 0 ? 'ccw' : 'cw';
    warnings.push(`Chybějící rot u oblouku (staničení ${station.toFixed(2)}) — dopočítáno z geometrie: ${rotation}.`);
  }

  return {
    type: 'curve',
    startStation: station,
    endStation: station + length,
    length,
    start, end, center, radius,
    rotation,
    _rawFirst: s.raw,
  };
}

function estimateArcLength(start, end, center) {
  const ang1 = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const ang2 = Math.atan2(end[1] - center[1], end[0] - center[0]);
  let delta = ang2 - ang1;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  return Math.abs(delta) * radius;
}

function parseSpiral(node, station, swapXY, toMeters, dirToRadians, warnings) {
  const s = readPoint(node, 'Start', swapXY, toMeters);
  const e = readPoint(node, 'End', swapXY, toMeters);
  const piP = readPoint(node, 'PI', swapXY, toMeters);
  if (!s || !e) return null;
  const start = s.xyz;
  const end = e.xyz;
  const pi = piP ? piP.xyz : null;

  const length = numAttr(node, 'length') * toMeters
    || Math.hypot(end[0] - start[0], end[1] - start[1]);

  const parseRadius = (str) => {
    if (!str) return Infinity;
    const up = str.toUpperCase();
    if (up === 'INF' || up === 'INFINITY') return Infinity;
    const n = parseFloat(str);
    return Number.isFinite(n) ? n * toMeters : Infinity;
  };
  const radiusStart = parseRadius(node.getAttribute('radiusStart'));
  const radiusEnd = parseRadius(node.getAttribute('radiusEnd'));

  const dirStartRaw = parseFloat(node.getAttribute('dirStart'));
  const dirStart = Number.isFinite(dirStartRaw) ? dirStartRaw * dirToRadians : null;

  const rotAttr = (node.getAttribute('rot') || 'cw').trim().toLowerCase();
  const rotation = rotAttr === 'ccw' ? 'ccw' : 'cw';

  // (5) spiType case-insensitive; jiný než clothoid → warning „aproximováno klotoidou“.
  const spiType = (node.getAttribute('spiType') || 'clothoid').trim().toLowerCase();
  if (spiType !== 'clothoid') {
    warnings.push(`Přechodnice typu „${spiType}“ (staničení ${station.toFixed(2)}) — aproximováno klotoidou.`);
  }

  return {
    type: 'spiral',
    startStation: station,
    endStation: station + length,
    length,
    start, end, pi,
    radiusStart, radiusEnd,
    dirStart,
    rotation,
    spiType,
    _rawFirst: s.raw,
  };
}

// ---------------------------------------------------------------------------
// Vertikální profil (niveleta)
// ---------------------------------------------------------------------------

/**
 * Najde <Profile>/<ProfAlign> osy, sestaví vertikální profil (první vyhrává).
 * ProfSurf → warning (terén, ne návrhová niveleta). Víc ProfAlign → warning.
 * (8) StaEquation přítomna → warning; geometrie se NEpřepočítává.
 * @returns {object|null}
 */
function parseProfiles(aNode, name, toMeters, warnings) {
  // (8) StaEquation — staniční rovnice ignorovány.
  if (childNS(aNode, 'StaEquation').length > 0) {
    warnings.push(`Osa „${name}“: staniční rovnice ignorovány (zobrazovací staničení se může lišit).`);
  }

  const profiles = childNS(aNode, 'Profile');
  const profAligns = [];
  let hasProfSurf = false;
  for (const prof of profiles) {
    for (const pa of childNS(prof, 'ProfAlign')) profAligns.push(pa);
    if (childNS(prof, 'ProfSurf').length > 0) hasProfSurf = true;
  }
  // ProfAlign může být i přímo pod Alignment (bez obalu Profile).
  for (const pa of childNS(aNode, 'ProfAlign')) {
    if (!profAligns.includes(pa)) profAligns.push(pa);
  }

  if (profAligns.length === 0) {
    if (hasProfSurf) {
      warnings.push(`Osa „${name}“: soubor obsahuje jen povrchový profil (ProfSurf) — terén, ne návrhovou niveletu.`);
    }
    return null;
  }

  if (profAligns.length > 1) {
    const others = profAligns.slice(1)
      .map((pa) => pa.getAttribute('name') || '(bez názvu)')
      .join(', ');
    warnings.push(`Osa „${name}“: nalezeno více nivelet (ProfAlign) — použita první, ostatní ignorovány: ${others}.`);
  }

  const profile = buildVerticalProfile(profAligns[0], toMeters);
  if (profile && Array.isArray(profile.warnings) && profile.warnings.length) {
    for (const w of profile.warnings) warnings.push(w);
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------

function localName(node) {
  return node.localName || node.nodeName;
}

/** Přímí potomci daného local name (namespace-agnostic). */
function childNS(node, name) {
  const out = [];
  for (const child of Array.from(node.children)) {
    if (localName(child) === name) out.push(child);
  }
  return out;
}

/** První přímý potomek daného local name, nebo null. */
function firstChildNS(node, name) {
  for (const child of Array.from(node.children)) {
    if (localName(child) === name) return child;
  }
  return null;
}

/** Parsuje číselný atribut; vrací 0 při chybě. */
function numAttr(node, name) {
  const v = parseFloat(node.getAttribute(name));
  return Number.isFinite(v) ? v : 0;
}
