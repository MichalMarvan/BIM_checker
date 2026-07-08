/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Sdílený DXF export pro řezy modelem.
//
// Dvě veřejné funkce:
//  • buildDxf(curves, plane)              — jeden řez (chování beze změny oproti
//                                            původnímu section-panel.js).
//  • buildMultiSectionDxf(sections, opts) — řada řezů po staničení v jednom DXF,
//                                            každý posunutý v X, s TEXT popiskem.
//
// Obě cesty (knihovna @tarikjabiri/dxf i vestavěný R12 writer) umí polyliny
// i TEXT entity. Projekce do 2D: u svislých řezů X = in-plane vodorovná
// vzdálenost od počátku roviny, Y = nadmořská výška (p[1] + dz). Viz makeProjector.

import { formatStation } from '../ifc-engine/viewer/station-section-visuals.js';

/**
 * Build the DXF for a single section. Prefers @tarikjabiri/dxf — it emits a
 * complete modern AC1021 (AutoCAD 2007, UTF-8) file with proper handles /
 * tables / objects, which AutoCAD opens without the audit flood the hand-rolled
 * R12 writer triggered. Falls back to the bundled R12 writer if the library
 * can't be loaded (offline). Geometry is flattened the same way in both (see
 * makeProjector); consecutive duplicate vertices are dropped so AutoCAD doesn't
 * flag zero-length segments.
 */
export async function buildDxf(curves, plane) {
  const { shapes, layerColor } = cleanShapes(curves, plane);
  if (shapes.length === 0) return null;
  return writeDxf(shapes, layerColor, [], false);
}

/**
 * Build a single DXF holding a whole row of sections (one per station).
 *
 * @param {Array<{station:number, curves:Array, plane:{point:number[], normal:number[]}}>} sections
 *        Řezy — každá `curves` už obohacená `_layer`/`_dz` jako u jednoho řezu.
 * @param {{width:number, height:number, forceR12?:boolean}} opts
 *        `width`/`height` = rozměry rámečku řezu (metry). `forceR12` vynutí
 *        offline R12 writer (přeskočí esm.sh knihovnu — nutné pro testy).
 * @returns {Promise<string|null>} DXF text, nebo null když není co exportovat.
 *
 * Layout: řez i posunut v X o `offsetX = i*(width + width/4)` (konzistentní
 * rozestup nezávislý na bboxu). Y zůstává nadmořská výška. Pod každý řez TEXT
 * `formatStation(station)` na vrstvě POPIS, výška `max(0.5, height/20)`,
 * pozice `[offsetX, minY_řezu − 2*výškaTextu]`.
 */
export async function buildMultiSectionDxf(sections, opts = {}) {
  const list = Array.isArray(sections) ? sections : [];
  if (list.length === 0) return null;

  const width = Number.isFinite(opts.width) ? opts.width : 40;
  const height = Number.isFinite(opts.height) ? opts.height : 20;
  const gap = width / 4;
  const textHeight = Math.max(0.5, height / 20);

  const allShapes = [];
  const layerColor = new Map();
  const labels = [];

  list.forEach((sec, i) => {
    const offsetX = i * (width + gap);
    // Vlastní projektor s počátkem = bod osy tohoto řezu (offset 0).
    const plane = { point: sec.plane?.point, normal: sec.plane?.normal, offset: 0 };
    const { shapes, layerColor: lc } = cleanShapes(sec.curves || [], plane);

    let minY = Infinity;
    for (const s of shapes) {
      const pts = s.pts.map(([x, y]) => {
        if (y < minY) minY = y;
        return [x + offsetX, y];   // posun celého řezu v X
      });
      allShapes.push({ ...s, pts });
    }
    for (const [layer, rgb] of lc) {
      if (!layerColor.has(layer)) layerColor.set(layer, rgb);
    }

    // Popisek staničení — i u prázdného řezu se hodí zobrazit polohu.
    if (!Number.isFinite(minY)) minY = 0;
    labels.push({
      layer: 'POPIS',
      x: offsetX,
      y: minY - 2 * textHeight,
      height: textHeight,
      text: formatStation(sec.station || 0),
    });
  });

  if (allShapes.length === 0 && labels.length === 0) return null;

  return writeDxf(allShapes, layerColor, labels, !!opts.forceR12);
}

/**
 * Zapíše shapes + TEXT popisky do DXF. Zkusí knihovnu (pokud `forceR12` není
 * true), jinak spadne na vestavěný R12 writer. Sdílené oběma veřejnými cestami.
 */
async function writeDxf(shapes, layerColor, labels, forceR12) {
  if (!forceR12) {
    try {
      const m = await import('https://esm.sh/@tarikjabiri/dxf@2.6.2');
      const { DxfWriter, LWPolylineFlags, TrueColor } = m;
      const d = new DxfWriter();
      // CRITICAL: pass an ACI *integer* to addLayer, never a TrueColor object.
      // The library writes the colour straight into LAYER group code 62, which
      // is the AutoCAD Color Index and is only legal in -256..256. A TrueColor
      // there becomes a 24-bit RGB (e.g. 8750469) → out of range → AutoCAD
      // rejects the whole DXFIN ("press Enter", nothing imports). Lenient
      // readers (Rhino, ezdxf) silently tolerate it, which masked the bug.
      for (const [layer, rgb] of layerColor) {
        d.addLayer(layer, rgbToAci(rgb), 'Continuous');
      }
      if (labels.length) d.addLayer('POPIS', 7, 'Continuous');   // vrstva popisků, bílá
      // Entities carry the *exact* element colour via true colour (group 420),
      // which AutoCAD accepts on entities — so the cut keeps real RGB fidelity.
      for (const s of shapes) {
        d.addLWPolyline(
          s.pts.map(([x, y]) => ({ point: { x, y } })),
          { layerName: s.layer, flags: s.closed ? LWPolylineFlags.Closed : 0, trueColor: TrueColor.fromHex(s.rgb.toString(16).padStart(6, '0')) },
        );
      }
      // TEXT: knihovní signatura addText(firstAlignmentPoint, height, value, options).
      for (const lbl of labels) {
        d.addText({ x: lbl.x, y: lbl.y, z: 0 }, lbl.height, lbl.text, { layerName: lbl.layer });
      }
      // AutoCAD prefers CRLF; the library emits LF.
      return d.stringify().replace(/\r?\n/g, '\r\n');
    } catch (e) {
      console.warn('[section] DXF library unavailable, using built-in R12 writer:', e.message);
      return shapesToDxfR12(shapes, layerColor, labels);
    }
  }
  return shapesToDxfR12(shapes, layerColor, labels);
}

/**
 * Project every loop to 2D and discard degenerate geometry that makes
 * AutoCAD abort the import (Rhino merely skips it): dedupe consecutive
 * vertices within 1 mm, drop loops with < 2 distinct vertices or a total
 * length under 1 mm. Returns clean shapes + a layer→colour map, shared by
 * both the library and the R12 fallback writers.
 */
function cleanShapes(curves, plane) {
  const project = makeProjector(plane);
  const layerName = (c) => {
    const type = String(c.ifcType || 'IFC');
    return cleanName(c._layer ? `${c._layer} (${type})` : type);
  };
  const DEDUP = 1e-3;   // 1 mm
  const shapes = [];
  const layerColor = new Map();
  for (const c of curves) {
    const layer = layerName(c);
    const rgb = (c.color ?? 0x808080) & 0xffffff;
    const dz = c._dz || 0;
    for (const loop of (c.loops || [])) {
      const src = loop.points || [];
      const pts = [];
      let prev = null;
      let length = 0;
      for (const p of src) {
        const raw = Array.isArray(p) ? p : [p.x, p.y, p.z];
        const [x, y] = project(raw, dz);
        if (prev) {
          const d = Math.hypot(x - prev[0], y - prev[1]);
          if (d < DEDUP) continue;   // merge coincident / sub-mm vertices
          length += d;
        }
        pts.push([x, y]); prev = [x, y];
      }
      if (pts.length < 2 || length < DEDUP) continue;   // skip degenerate slivers
      if (!layerColor.has(layer)) layerColor.set(layer, rgb);
      shapes.push({ layer, rgb, closed: !!loop.closed && pts.length >= 3, pts });
    }
  }
  return { shapes, layerColor };
}

/**
 * AutoCAD-bulletproof layer name: transliterate diacritics, collapse every
 * non [A-Za-z0-9_-] character (spaces, parens, …) to '_', cap the length.
 * AutoCAD rejects/“repairs” names with spaces, parens or non-ASCII bytes
 * on import even in newer DXF versions — keeping names plain ASCII avoids it.
 */
function cleanName(s) {
  const ascii = String(s).replace(/[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, (c) => DIACRITICS[c] || c);
  const safe = ascii.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return (safe || 'IFC').slice(0, 80);
}

/**
 * Offline fallback writer: a complete AutoCAD R12 (AC1009) DXF from the
 * already-cleaned 2D shapes (same degenerate-free geometry the library path
 * uses) plus optional TEXT labels. R12 needs a HEADER ($ACADVER) and a TABLES
 * section where every referenced linetype (CONTINUOUS) is defined; colours are
 * AutoCAD Color Index (62) and layer names ASCII (R12 is codepage, not UTF-8).
 */
function shapesToDxfR12(shapes, layerColor, labels = []) {
  // ASCII-safe layer names + ACI colours for R12.
  const layers = new Map(); // r12 name → aci
  const r12Name = new Map(); // original → r12 name
  for (const [name, rgb] of layerColor) {
    const safe = sanitizeLayer(name);
    r12Name.set(name, safe);
    if (!layers.has(safe)) layers.set(safe, rgbToAci(rgb));
  }
  // Vrstva POPIS (bílá, ACI 7) — jen když existují TEXT popisky.
  const texts = [];
  for (const lbl of labels) {
    const safe = sanitizeLayer(lbl.layer);
    if (!layers.has(safe)) layers.set(safe, 7);
    texts.push({ layer: safe, x: lbl.x, y: lbl.y, height: lbl.height, text: lbl.text });
  }

  const polylines = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    for (const [X, Y] of s.pts) {
      if (X < minX) minX = X; if (X > maxX) maxX = X;
      if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
    }
    polylines.push({ layer: r12Name.get(s.layer) || sanitizeLayer(s.layer), aci: rgbToAci(s.rgb), closed: s.closed, pts: s.pts });
  }
  for (const t of texts) {
    if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x;
    if (t.y < minY) minY = t.y; if (t.y > maxY) maxY = t.y;
  }
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }

  const out = [];
  const w = (code, val) => { out.push(String(code), String(val)); };

  // HEADER
  w(0, 'SECTION'); w(2, 'HEADER');
  w(9, '$ACADVER'); w(1, 'AC1009');
  w(9, '$INSBASE'); w(10, '0.0'); w(20, '0.0'); w(30, '0.0');
  w(9, '$EXTMIN'); w(10, fmtNum(minX)); w(20, fmtNum(minY)); w(30, '0.0');
  w(9, '$EXTMAX'); w(10, fmtNum(maxX)); w(20, fmtNum(maxY)); w(30, '0.0');
  w(0, 'ENDSEC');

  // TABLES — LTYPE (define CONTINUOUS) + LAYER
  w(0, 'SECTION'); w(2, 'TABLES');
  w(0, 'TABLE'); w(2, 'LTYPE'); w(70, 1);
  w(0, 'LTYPE'); w(2, 'CONTINUOUS'); w(70, 0); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, '0.0');
  w(0, 'ENDTAB');
  w(0, 'TABLE'); w(2, 'LAYER'); w(70, layers.size + 1);
  // Layer 0 is always expected to exist by AutoCAD.
  w(0, 'LAYER'); w(2, '0'); w(70, 0); w(62, 7); w(6, 'CONTINUOUS');
  for (const [name, aci] of layers) {
    w(0, 'LAYER'); w(2, name); w(70, 0); w(62, aci); w(6, 'CONTINUOUS');
  }
  w(0, 'ENDTAB');
  w(0, 'ENDSEC');

  // ENTITIES — old-style POLYLINE / VERTEX / SEQEND (R12) + TEXT
  w(0, 'SECTION'); w(2, 'ENTITIES');
  for (const pl of polylines) {
    w(0, 'POLYLINE'); w(8, pl.layer); w(62, pl.aci); w(66, 1); w(70, pl.closed ? 1 : 0);
    w(10, '0.0'); w(20, '0.0'); w(30, '0.0');
    for (const [X, Y] of pl.pts) {
      w(0, 'VERTEX'); w(8, pl.layer); w(10, fmtNum(X)); w(20, fmtNum(Y)); w(30, '0.0');
    }
    w(0, 'SEQEND'); w(8, pl.layer);
  }
  for (const t of texts) {
    w(0, 'TEXT'); w(8, t.layer); w(10, fmtNum(t.x)); w(20, fmtNum(t.y)); w(30, '0.0'); w(40, fmtNum(t.height)); w(1, t.text);
  }
  w(0, 'ENDSEC');
  w(0, 'EOF');
  // CRLF line endings + trailing CRLF: AutoCAD's DXF reader is line-oriented
  // and expects CRLF on Windows — bare LF makes DXFIN abort ("press Enter,
  // nothing loads"), even though lenient parsers accept LF.
  return out.join('\r\n') + '\r\n';
}

/** 24-bit RGB → nearest AutoCAD Color Index over the 9 standard colours. */
function rgbToAci(rgb) {
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
  if (r > 200 && g > 200 && b > 200) return 7;   // white/light
  if (r > 150 && g < 90 && b < 90) return 1;       // red
  if (r < 90 && g > 150 && b < 90) return 3;       // green
  if (r < 90 && g < 90 && b > 150) return 5;       // blue
  if (r > 150 && g > 150 && b < 90) return 2;       // yellow
  if (r > 150 && g < 90 && b > 150) return 6;       // magenta
  if (r < 90 && g > 150 && b > 150) return 4;       // cyan
  return 8;                                          // grey
}

/**
 * Returns p(3D)→[X,Y] projecting section curves into the drawing plane.
 * Falls back to a passthrough (X=x, Y=z) when no plane is supplied.
 */
function makeProjector(plane) {
  if (!plane || !plane.normal || !plane.point) {
    return (p, dz = 0) => [p[0], p[2] + 0 * dz];
  }
  const n = plane.normal;
  const off = plane.offset || 0;
  // On-plane origin (point shifted by offset along the normal)
  const O = [plane.point[0] + n[0] * off, plane.point[1] + n[1] * off, plane.point[2] + n[2] * off];
  const nUp = Math.abs(n[1]);              // |normal · world-up|, up = three-Y
  if (nUp > 0.99) {
    // Horizontal cut → plan view (X east, Y north), local to origin.
    return (p) => [p[0] - O[0], p[2] - O[2]];
  }
  // Vertical-ish cut → elevation view. In-plane horizontal axis = up × n,
  // normalised in the ground plane: cross((0,1,0), n) = (n.z, 0, -n.x).
  let hx = n[2], hz = -n[0];
  const len = Math.hypot(hx, hz) || 1;
  hx /= len; hz /= len;
  return (p, dz = 0) => {
    const X = (p[0] - O[0]) * hx + (p[2] - O[2]) * hz;  // horizontal in-plane
    const Y = p[1] + dz;                                 // authored IFC Z (= scene-local Y + elevation offset)
    return [X, Y];
  };
}

// DXF reals must carry a decimal point (strict readers reject bare integers
// on 10/20/30/40 codes).
function fmtNum(v) {
  const s = (Math.round(v * 1e5) / 1e5).toString();
  return /[.eE]/.test(s) ? s : s + '.0';
}

// Czech (and common Latin) diacritics → ASCII. R12 DXF is codepage-encoded,
// not UTF-8, so non-ASCII layer names corrupt or block the import.
const DIACRITICS = {
  á: 'a', č: 'c', ď: 'd', é: 'e', ě: 'e', í: 'i', ň: 'n', ó: 'o', ř: 'r',
  š: 's', ť: 't', ú: 'u', ů: 'u', ý: 'y', ž: 'z',
  Á: 'A', Č: 'C', Ď: 'D', É: 'E', Ě: 'E', Í: 'I', Ň: 'N', Ó: 'O', Ř: 'R',
  Š: 'S', Ť: 'T', Ú: 'U', Ů: 'U', Ý: 'Y', Ž: 'Z',
};
/** ASCII, AutoCAD-safe layer name: transliterate diacritics, strip forbidden chars. */
function sanitizeLayer(s) {
  const ascii = String(s).replace(/[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, (c) => DIACRITICS[c] || c);
  return (ascii.replace(/[<>/\\":;?*|,='`]/g, '_').replace(/[^\x20-\x7E]/g, '_').trim() || 'IFC').slice(0, 200);
}
