// Phase 9 (niveleta) — Vertikální profil (výškový průběh) z LandXML <ProfAlign>.
//
// LandXML popisuje niveletu jako uspořádanou posloupnost dětí <ProfAlign>:
//   <PVI>sta elev</PVI>                                  — vrcholový bod (tangenta)
//   <ParaCurve length="L">sta elev</ParaCurve>           — symetrická parabola
//   <UnsymParaCurve lengthIn="L1" lengthOut="L2">sta elev</UnsymParaCurve>
//   <CircCurve length="L" radius="R">sta elev</CircCurve> — kruhový oblouk (InfraModel)
// Staničení + výška jsou v TEXTOVÉM uzlu ("sta elev"), délky/poloměr v atributech.
//
// Výstup:
//   buildVerticalProfile(profAlignEl, unitScale=1) → { entries, staStart, staEnd } | null
//     entries = [{ type:'pvi'|'para'|'unsympara'|'circ', station, elevation,
//                  length?, lengthIn?, lengthOut?, radius? }] seřazené dle station.
//     Vrací null, pokud je platných bodů méně než 2.
//   elevationAt(profile, station) → number
//     Mimo rozsah vrací krajní výšku (žádná extrapolace tangentou).
//
// Matematika (spády g = poměr Δelev/Δsta mezi sousedními vrcholy):
//   - tangenty mezi vrcholy: lineární interpolace,
//   - ParaCurve: symetrická parabola (BVC = pvi_sta − L/2),
//   - UnsymParaCurve: AASHTO nesymetrická parabola s offsetem vrcholu e,
//   - CircCurve: kruhový oblouk v rovině (staničení, výška), R = abs(radius),
//     tečný na oba spády v bodech pvi_sta ± L/2.

const EPS = 1e-9;

/**
 * Sestaví vertikální profil z DOM elementu <ProfAlign>.
 * @param {Element|null} profAlignEl
 * @param {number} [unitScale=1] — převod jednotek (sta/výška/délky) na metry.
 * @returns {{ entries: Array, staStart: number, staEnd: number, warnings: string[] } | null}
 */
export function buildVerticalProfile(profAlignEl, unitScale = 1) {
  if (!profAlignEl) return null;
  const scale = Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 1;

  const entries = [];
  for (const child of profAlignEl.children) {
    const local = localName(child);
    let type = null;
    if (local === 'PVI') type = 'pvi';
    else if (local === 'ParaCurve') type = 'para';
    else if (local === 'UnsymParaCurve') type = 'unsympara';
    else if (local === 'CircCurve') type = 'circ';
    else continue;

    const se = parseStaElev(child.textContent, scale);
    if (!se) continue;

    const entry = { type, station: se.station, elevation: se.elevation };
    if (type === 'para') {
      entry.length = attrLen(child, 'length', scale);
    } else if (type === 'unsympara') {
      entry.lengthIn = attrLen(child, 'lengthIn', scale);
      entry.lengthOut = attrLen(child, 'lengthOut', scale);
    } else if (type === 'circ') {
      entry.length = attrLen(child, 'length', scale);
      // radius: záporné znaménko je konvence (vydutý/vypuklý) → použij abs.
      const r = parseFloat(child.getAttribute('radius'));
      entry.radius = Number.isFinite(r) ? Math.abs(r) * scale : 0;
    }
    entries.push(entry);
  }

  entries.sort((a, b) => a.station - b.station);
  if (entries.length < 2) return null;

  const warnings = [];
  clampCurveLengths(entries, warnings);

  return {
    entries,
    staStart: entries[0].station,
    staEnd: entries[entries.length - 1].station,
    warnings,
  };
}

/**
 * Vrátí výšku (elevaci) na daném staničení.
 * @param {ReturnType<typeof buildVerticalProfile>} profile
 * @param {number} station
 * @returns {number}
 */
export function elevationAt(profile, station) {
  if (!profile) return 0;
  // Přímá výšková funkce (IFC business niveleta) — obchází PVI entries.
  if (typeof profile.zAt === 'function') return profile.zAt(station);
  if (!profile.entries || profile.entries.length === 0) return 0;
  const e = profile.entries;

  // Mimo rozsah → krajní výška (bez extrapolace tangentou).
  if (station <= e[0].station) return e[0].elevation;
  if (station >= e[e.length - 1].station) return e[e.length - 1].elevation;

  // Najdi interval [i, i+1] mezi sousedními vrcholy.
  let i = 0;
  while (i < e.length - 1 && e[i + 1].station <= station) i++;

  const prev = e[i];
  const cur = e[i + 1];

  // Zkontroluj, zda staničení leží uvnitř svislé křivky u některého vrcholu.
  // Křivka je umístěna u vrcholu (PVI) a zasahuje do sousedních tangent.
  // "cur" je vrchol na konci intervalu; "prev" je vrchol na začátku intervalu.
  // Křivka u vrcholu "cur" (její vstupní větev) zasahuje do tohoto intervalu.
  const curveCur = curveAt(cur, e, i + 1);
  if (curveCur && station >= curveCur.bvc) {
    return evalCurve(curveCur, station);
  }
  // Křivka u vrcholu "prev" (její výstupní větev) zasahuje do tohoto intervalu.
  const curvePrev = curveAt(prev, e, i);
  if (curvePrev && station <= curvePrev.evc) {
    return evalCurve(curvePrev, station);
  }

  // Jinak lineární tangenta mezi vrcholy.
  const g = grade(prev, cur);
  return prev.elevation + g * (station - prev.station);
}

// ---------------------------------------------------------------------------
// Vnitřní pomocné funkce
// ---------------------------------------------------------------------------

function localName(node) {
  return node.localName || node.nodeName;
}

function parseStaElev(text, scale) {
  if (!text) return null;
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }
  return { station: parts[0] * scale, elevation: parts[1] * scale };
}

function attrLen(node, name, scale) {
  const v = parseFloat(node.getAttribute(name));
  return Number.isFinite(v) ? v * scale : 0;
}

/** Spád (grade) mezi dvěma vrcholy = Δelev / Δsta. */
function grade(a, b) {
  const dSta = b.station - a.station;
  return Math.abs(dSta) < EPS ? 0 : (b.elevation - a.elevation) / dSta;
}

/**
 * Zkrátí délky křivek tak, aby nepřekročily vzdálenost k sousednímu PVI.
 * Křivka symetrická/kruhová zabírá po L/2 na každou stranu vrcholu;
 * nesymetrická zabírá lengthIn dozadu a lengthOut dopředu.
 */
function clampCurveLengths(entries, warnings) {
  for (let i = 0; i < entries.length; i++) {
    const cur = entries[i];
    if (cur.type === 'pvi') continue;
    const distPrev = i > 0 ? cur.station - entries[i - 1].station : Infinity;
    const distNext = i < entries.length - 1 ? entries[i + 1].station - cur.station : Infinity;

    if (cur.type === 'unsympara') {
      if (cur.lengthIn > distPrev + EPS) {
        warnings.push(`Nesymetrická parabola na staničení ${cur.station.toFixed(2)}: vstupní délka ${cur.lengthIn.toFixed(2)} m překračuje vzdálenost k předchozímu vrcholu (${distPrev.toFixed(2)} m) — zkráceno.`);
        cur.lengthIn = distPrev;
      }
      if (cur.lengthOut > distNext + EPS) {
        warnings.push(`Nesymetrická parabola na staničení ${cur.station.toFixed(2)}: výstupní délka ${cur.lengthOut.toFixed(2)} m překračuje vzdálenost k dalšímu vrcholu (${distNext.toFixed(2)} m) — zkráceno.`);
        cur.lengthOut = distNext;
      }
    } else {
      // symetrická parabola nebo kruhový oblouk — L/2 na každou stranu
      const half = cur.length / 2;
      const maxHalf = Math.min(distPrev, distNext);
      if (half > maxHalf + EPS) {
        const label = cur.type === 'circ' ? 'Kruhový oblouk' : 'Symetrická parabola';
        warnings.push(`${label} na staničení ${cur.station.toFixed(2)}: délka ${cur.length.toFixed(2)} m překračuje dostupnou vzdálenost k sousednímu vrcholu — zkráceno na ${(maxHalf * 2).toFixed(2)} m.`);
        cur.length = maxHalf * 2;
      }
    }
  }
}

/**
 * Sestaví geometrii svislé křivky u vrcholu `pvi` (index `idx` v poli entries).
 * Vrátí null, pokud vrchol není křivka nebo nemá sousedy pro spády.
 * @returns {{ kind, bvc, evc, ... } | null}
 */
function curveAt(pvi, entries, idx) {
  if (pvi.type === 'pvi') return null;
  const prev = entries[idx - 1];
  const next = entries[idx + 1];
  if (!prev || !next) return null; // krajní křivka bez obou tangent → tangenta

  const g1 = grade(prev, pvi);
  const g2 = grade(pvi, next);

  if (pvi.type === 'unsympara') {
    const L1 = pvi.lengthIn;
    const L2 = pvi.lengthOut;
    if (L1 <= EPS && L2 <= EPS) return null;
    const bvc = pvi.station - L1;
    const evc = pvi.station + L2;
    const eOff = (L1 + L2) > EPS ? (L1 * L2 / (2 * (L1 + L2))) * (g2 - g1) : 0;
    return {
      kind: 'unsympara',
      bvc, evc,
      pviSta: pvi.station, pviElev: pvi.elevation,
      elevBvc: pvi.elevation - g1 * L1,
      elevEvc: pvi.elevation + g2 * L2,
      g1, g2, L1, L2, eOff,
    };
  }

  const L = pvi.length;
  if (L <= EPS) return null;
  const half = L / 2;
  const bvc = pvi.station - half;
  const evc = pvi.station + half;
  const elevBvc = pvi.elevation - half * g1;
  const elevEvc = pvi.elevation + half * g2;

  if (pvi.type === 'circ') {
    return buildCircular(bvc, evc, elevBvc, elevEvc, g1, g2, pvi.radius,
      pvi.station, pvi.elevation);
  }
  // symetrická parabola
  return { kind: 'para', bvc, evc, elevBvc, g1, g2, L };
}

/**
 * Kruhový oblouk v rovině (staničení, výška), tečný na oba spády v tečných
 * bodech (bvc, elevBvc) a (evc, elevEvc). R = abs(radius) (záporné znaménko je
 * jen konvence vydutý/vypuklý).
 *
 * Oblouk je symetricky rozdělen ve staničení vrcholu (PVI): první polovina je
 * tečná na spád g1 v bodě BVC, druhá polovina tečná na spád g2 v bodě EVC.
 * Střed každé poloviny leží kolmo na příslušnou tečnu ve vzdálenosti R. Tím je
 * zajištěna tečnost na oba spády i spojitost ve vrcholu.
 */
function buildCircular(bvc, evc, elevBvc, elevEvc, g1, g2, radius, pviSta, pviElev) {
  const R = Math.abs(radius);
  if (R <= EPS) {
    // bez platného poloměru → chovej se jako lineární tangenta úseku
    return { kind: 'lineseg', bvc, evc, elevBvc, elevEvc };
  }
  // Strana prohnutí: vydutý (sag) pro g2>g1, vypuklý (crest) pro g2<g1.
  // Pro rovné tečny (g1=g2) je znaménko libovolné (test hlídá jen velikost).
  const sign = (g2 - g1) >= 0 ? 1 : -1;
  const th1 = Math.atan(g1);
  const th2 = Math.atan(g2);
  // Střed první poloviny: kolmo na tečnu g1 v bodě (bvc, elevBvc).
  const c1x = bvc - Math.sin(th1) * R * sign;
  const c1y = elevBvc + Math.cos(th1) * R * sign;
  // Střed druhé poloviny: kolmo na tečnu g2 v bodě (evc, elevEvc).
  const c2x = evc - Math.sin(th2) * R * sign;
  const c2y = elevEvc + Math.cos(th2) * R * sign;
  return {
    kind: 'circ',
    bvc, evc, elevBvc, elevEvc, pviSta,
    c1x, c1y, c2x, c2y, R,
  };
}

/**
 * Výška bodu na kružnici (střed cx,cy, poloměr R) na daném staničení x.
 * Vybere průsečík na téže straně jako referenční výška `elevHint`.
 */
function circleY(cx, cy, R, x, elevHint) {
  const dx = x - cx;
  const disc = R * R - dx * dx;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const yUp = cy + root;
  const yDown = cy - root;
  // vyber kořen blíž k referenční výšce (spojitá větev oblouku)
  return Math.abs(yUp - elevHint) <= Math.abs(yDown - elevHint) ? yUp : yDown;
}

/** Vyhodnotí výšku uvnitř svislé křivky na daném staničení. */
function evalCurve(c, station) {
  if (c.kind === 'para') {
    const x = station - c.bvc;
    return c.elevBvc + c.g1 * x + ((c.g2 - c.g1) / (2 * c.L)) * x * x;
  }
  if (c.kind === 'unsympara') {
    if (station <= c.pviSta) {
      // větev 1 (od BVC, délka L1)
      const x1 = station - c.bvc;
      const t = c.L1 > EPS ? x1 / c.L1 : 0;
      return c.elevBvc + c.g1 * x1 + c.eOff * t * t;
    }
    // větev 2 (zrcadlově od EVC, délka L2)
    const x2 = station - c.pviSta;
    const rem = c.L2 - x2;
    const t = c.L2 > EPS ? rem / c.L2 : 0;
    return c.elevEvc - c.g2 * rem + c.eOff * t * t;
  }
  if (c.kind === 'circ') {
    // rozděleno ve vrcholu: první polovina okolo středu c1, druhá okolo c2
    if (station <= c.pviSta) {
      const y = circleY(c.c1x, c.c1y, c.R, station, c.elevBvc);
      if (y !== null) return y;
    } else {
      const y = circleY(c.c2x, c.c2y, c.R, station, c.elevEvc);
      if (y !== null) return y;
    }
    // fallback: lineárně mezi tečnými body
    return lerpSeg(c, station);
  }
  // lineseg
  return lerpSeg(c, station);
}

function lerpSeg(c, station) {
  const span = c.evc - c.bvc;
  const t = span > EPS ? (station - c.bvc) / span : 0;
  return c.elevBvc + t * (c.elevEvc - c.elevBvc);
}
