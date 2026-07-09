// In-scene markers + lines + polygon fill + HTML overlay labels.

import * as THREE from 'three';
import { screenScale } from './screen-scale.js';

const MARKER_COLOR = 0x4facfe;
const LINE_COLOR = 0x4facfe;
const POLY_FILL_COLOR = 0x4facfe;
const POLY_FILL_OPACITY = 0.18;

// Barvy osových čar ΔXYZ schodiště podle pořadí úseků (p0 → osa X → osa výšky → p1).
const DELTA_SEG1_COLOR = 0xef4444;  // červená — 1. úsek (podél world X)
const DELTA_SEG2_COLOR = 0x22c55e;  // zelená — 2. úsek (podél world Y = výška)
const DELTA_SEG3_COLOR = 0x3b82f6;  // modrá — 3. úsek (podél world Z)

// Barvy pomocných čar (rubber-band táhlo, zvýraznění hrany).
const RUBBER_BAND_COLOR = 0x4facfe;
const EDGE_HIGHLIGHT_COLOR = 0x10b981;

// Kratší úseky než 1 cm ve schodišti ΔXYZ vynecháme (šum, degenerované čáry).
const DELTA_MIN_SEGMENT = 0.01;

function formatValue(type, value) {
  if (type === 'distance' || type === 'edge') return `${value.toFixed(2)} m`;
  if (type === 'angle') return `${value.toFixed(1)}°`;
  if (type === 'area') return `${value.toFixed(2)} m²`;
  return String(value);
}

// Obvod uzavřeného polygonu (včetně uzavírací hrany posledního na první bod).
function perimeter(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return sum;
}

// Sestaví innerHTML dvouřádkového popisku. Do innerHTML jdou POUZE číselné
// toFixed hodnoty a statické řetězce — žádný uživatelský vstup (XSS bezpečné).
function buildLabelHTML(type, points, value) {
  if ((type === 'distance' || type === 'edge') && points.length >= 2) {
    const p0 = points[0];
    const p1 = points[1];
    // IFC konvence: ΔX z world X, ΔY z world Z (půdorys), Δv z world Y (výška).
    const dx = Math.abs(p1[0] - p0[0]).toFixed(3);
    const dy = Math.abs(p0[2] - p1[2]).toFixed(3);
    const dv = Math.abs(p1[1] - p0[1]).toFixed(3);
    return `<div>${value.toFixed(3)} m</div>`
      + `<div class="measure-label__sub">ΔX ${dx} · ΔY ${dy} · Δv ${dv}</div>`;
  }
  if (type === 'area' && points.length >= 3) {
    const per = perimeter(points).toFixed(2);
    return `<div>${value.toFixed(2)} m²</div>`
      + `<div class="measure-label__sub">obvod ${per} m</div>`;
  }
  return null;
}

function centroid(points) {
  const c = [0, 0, 0];
  for (const p of points) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= points.length; c[1] /= points.length; c[2] /= points.length;
  return c;
}

const SNAP_PREVIEW_COLOR = 0xfacc15;  // amber — distinct from final markers
// Phase 6.6.1: per-type color so user can tell which snap is active
const SNAP_TYPE_COLORS = {
  vertex: 0xef4444,         // red — corner
  midpoint: 0xa855f7,       // purple — midpoint
  center: 0x06b6d4,         // cyan — center
  edge: 0x10b981,           // green — on edge
  perpendicular: 0xf97316,  // orange — perpendicular foot
  intersection: 0xeab308,   // yellow — intersection
  surface: 0x94a3b8,        // gray — fallback
};

// Hex barva → CSS řetězec pro canvas (#rrggbb).
function hexToCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// Kreslení obrysu tvaru daného typu na 2D kontext canvasu 64×64.
// Souřadnice odpovídají brief specifikaci (roh, vrchol, ...).
function drawGlyphPath(ctx, type) {
  ctx.beginPath();
  switch (type) {
    case 'vertex':  // čtverec
      ctx.rect(12, 12, 40, 40);
      break;
    case 'midpoint':  // trojúhelník vrcholem nahoru
      ctx.moveTo(32, 12);
      ctx.lineTo(52, 52);
      ctx.lineTo(12, 52);
      ctx.closePath();
      break;
    case 'center':  // kružnice r 20
      ctx.arc(32, 32, 20, 0, Math.PI * 2);
      break;
    case 'edge':  // bowtie ⋈ — dva trojúhelníky špičkami k sobě
      ctx.moveTo(12, 16); ctx.lineTo(32, 32); ctx.lineTo(12, 48); ctx.closePath();
      ctx.moveTo(52, 16); ctx.lineTo(32, 32); ctx.lineTo(52, 48); ctx.closePath();
      break;
    case 'perpendicular':  // pravoúhlá značka (L + malý čtverec)
      ctx.moveTo(16, 12); ctx.lineTo(16, 48); ctx.lineTo(52, 48);
      ctx.moveTo(16, 32); ctx.lineTo(32, 32); ctx.lineTo(32, 48);
      break;
    case 'intersection':  // × dvě diagonály
      ctx.moveTo(14, 14); ctx.lineTo(50, 50);
      ctx.moveTo(50, 14); ctx.lineTo(14, 50);
      break;
    case 'surface':  // plná tečka r 6
    default:
      ctx.arc(32, 32, 6, 0, Math.PI * 2);
      break;
  }
}

// Vytvoří CanvasTexture s glyfem typu: tmavé halo (černá cesta lineWidth+3)
// pod barevným obrysem, ať je značka čitelná na libovolném pozadí.
function makeSnapGlyphTexture(type) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const filled = (type === 'surface');
  const color = hexToCss(SNAP_TYPE_COLORS[type] || SNAP_PREVIEW_COLOR);

  if (filled) {
    // Plná tečka: halo obrysem, pak výplň barvou.
    drawGlyphPath(ctx, type);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    // Halo — stejná cesta černá silnější.
    drawGlyphPath(ctx, type);
    ctx.lineWidth = 2.5 + 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    // Barevný obrys.
    drawGlyphPath(ctx, type);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class MeasureVisuals {
  constructor(scene, canvas, camera) {
    this._scene = scene;
    this._canvas = canvas;
    this._camera = camera;

    this._labelContainer = document.createElement('div');
    this._labelContainer.className = 'measure-labels';
    canvas.parentElement.appendChild(this._labelContainer);

    this._group = new THREE.Group();
    this._group.userData = { measureVisuals: true };
    scene.add(this._group);

    this._measurements = new Map();
    this._snapPreview = null;  // hover marker for pick mode
    this._inProgressPoints = [];  // markers for clicks already made in current measurement
    this._rubberBand = null;  // čárkované táhlo mezi posledním bodem a kurzorem
    this._edgeHighlight = null;  // zvýraznění hrany pod kurzorem

    // Registr škálovatelných objektů pro screen-constant velikost.
    // Prvky: { obj, px } — sprity i mesh markery. Update je pak levný.
    this._scalables = new Set();
    // Cache textur a materiálů glyfů dle typu snapu (jednou vytvořit, jednou disposovat).
    this._glyphTextures = new Map();  // type → THREE.CanvasTexture
    this._glyphMaterials = new Map(); // type → THREE.SpriteMaterial
  }

  // Vrátí (a případně vytvoří) SpriteMaterial pro daný typ snapu z cache.
  _glyphMaterial(type) {
    let mat = this._glyphMaterials.get(type);
    if (mat) return mat;
    let tex = this._glyphTextures.get(type);
    if (!tex) {
      tex = makeSnapGlyphTexture(type);
      this._glyphTextures.set(type, tex);
    }
    mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    this._glyphMaterials.set(type, mat);
    return mat;
  }

  /** Add a permanent marker for a clicked point during in-progress measurement. */
  addInProgressPoint(point) {
    // Jednotková koule — velikost řeší updateScreenScale (screen-constant, ~8 px).
    const geom = new THREE.SphereGeometry(1, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: MARKER_COLOR,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(point[0] ?? point.x, point[1] ?? point.y, point[2] ?? point.z);
    mesh.renderOrder = 998;
    mesh.userData = { measureInProgressPoint: true };
    this._scene.add(mesh);
    this._inProgressPoints.push(mesh);
    this._scalables.add({ obj: mesh, px: 8 });
  }

  /** Remove all in-progress markers (call when measurement completes / resets). */
  clearInProgressPoints() {
    for (const m of this._inProgressPoints) {
      this._scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      this._unregisterScalable(m);
    }
    this._inProgressPoints = [];
  }

  // Odebere objekt z registru škálovatelných (položky drží { obj, px }).
  _unregisterScalable(obj) {
    for (const entry of this._scalables) {
      if (entry.obj === obj) {
        this._scalables.delete(entry);
        break;
      }
    }
  }

  _ensureSnapPreview() {
    if (this._snapPreview) return;
    // Snap preview = sprite s glyfem dle typu (materiál se mění při showSnapPreview).
    const sprite = new THREE.Sprite(this._glyphMaterial('surface'));
    sprite.renderOrder = 999;
    sprite.visible = false;
    sprite.userData = { measureSnapPreview: true };
    this._scene.add(sprite);
    this._snapPreview = sprite;
    this._scalables.add({ obj: sprite, px: 14 });
  }

  /** Show hover snap marker at world point (for measure pick mode). */
  showSnapPreview(point, type) {
    this._ensureSnapPreview();
    this._snapPreview.position.set(point[0] ?? point.x, point[1] ?? point.y, point[2] ?? point.z);
    this._snapPreview.visible = true;
    // Glyf dle typu snapu — přepni cachovaný materiál (mapy nedisposujeme).
    const glyphType = SNAP_TYPE_COLORS[type] ? type : 'surface';
    const mat = this._glyphMaterial(glyphType);
    if (this._snapPreview.material !== mat) {
      this._snapPreview.material = mat;
    }
  }

  hideSnapPreview() {
    if (this._snapPreview) this._snapPreview.visible = false;
  }

  _ensureRubberBand() {
    if (this._rubberBand) return;
    // Buffer pro 2 body — pozice přepisujeme in-place (bez realokace).
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineDashedMaterial({
      color: RUBBER_BAND_COLOR, dashSize: 0.3, gapSize: 0.15, depthTest: false,
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 997;
    line.visible = false;
    line.userData = { measureRubberBand: true };
    this._scene.add(line);
    this._rubberBand = line;
  }

  /** Zobrazí čárkované táhlo z bodu `from` do bodu `to` (world souřadnice). */
  showRubberBand(from, to) {
    this._ensureRubberBand();
    const pos = this._rubberBand.geometry.getAttribute('position');
    pos.setXYZ(0, from[0] ?? from.x, from[1] ?? from.y, from[2] ?? from.z);
    pos.setXYZ(1, to[0] ?? to.x, to[1] ?? to.y, to[2] ?? to.z);
    pos.needsUpdate = true;
    // Čárkování se počítá z délky segmentů — nutné po každé změně pozic.
    this._rubberBand.computeLineDistances();
    this._rubberBand.visible = true;
  }

  hideRubberBand() {
    if (this._rubberBand) this._rubberBand.visible = false;
  }

  _ensureEdgeHighlight() {
    if (this._edgeHighlight) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: EDGE_HIGHLIGHT_COLOR, depthTest: false });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 998;
    line.visible = false;
    line.userData = { measureEdgeHighlight: true };
    this._scene.add(line);
    this._edgeHighlight = line;
  }

  /** Zvýrazní hranu mezi body `a` a `b` (world souřadnice). */
  showEdgeHighlight(a, b) {
    this._ensureEdgeHighlight();
    const pos = this._edgeHighlight.geometry.getAttribute('position');
    pos.setXYZ(0, a[0] ?? a.x, a[1] ?? a.y, a[2] ?? a.z);
    pos.setXYZ(1, b[0] ?? b.x, b[1] ?? b.y, b[2] ?? b.z);
    pos.needsUpdate = true;
    this._edgeHighlight.visible = true;
  }

  hideEdgeHighlight() {
    if (this._edgeHighlight) this._edgeHighlight.visible = false;
  }

  addMeasurement(id, type, points, value) {
    const subgroup = new THREE.Group();
    subgroup.userData = { measureSubgroup: true, id };

    for (const p of points) {
      // Jednotková koule — screen-constant velikost řeší updateScreenScale (~8 px).
      const geom = new THREE.SphereGeometry(1, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.userData = { measureMarker: true };
      subgroup.add(mesh);
      this._scalables.add({ obj: mesh, px: 8 });
    }

    if (points.length >= 2) {
      const positions = [];
      for (let i = 0; i < points.length - 1; i++) {
        positions.push(...points[i], ...points[i + 1]);
      }
      if (type === 'area' && points.length >= 3) {
        positions.push(...points[points.length - 1], ...points[0]);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: LINE_COLOR });
      const line = new THREE.LineSegments(geom, mat);
      subgroup.add(line);
    }

    // ΔXYZ schodiště pro vzdálenost/hranu: p0 → (x1,y0,z0) → (x1,y1,z0) → p1.
    // Barvy dle pořadí úseku: X červená, výška (world Y) zelená, world Z modrá.
    if ((type === 'distance' || type === 'edge') && points.length >= 2) {
      const p0 = points[0];
      const p1 = points[1];
      const cornerX = [p1[0], p0[1], p0[2]];  // po ose X
      const cornerXY = [p1[0], p1[1], p0[2]]; // po ose výšky (world Y)
      const segments = [
        { from: p0, to: cornerX, color: DELTA_SEG1_COLOR },
        { from: cornerX, to: cornerXY, color: DELTA_SEG2_COLOR },
        { from: cornerXY, to: p1, color: DELTA_SEG3_COLOR },
      ];
      for (const seg of segments) {
        const len = Math.hypot(
          seg.to[0] - seg.from[0], seg.to[1] - seg.from[1], seg.to[2] - seg.from[2],
        );
        if (len < DELTA_MIN_SEGMENT) continue;  // vynech úseky kratší 1 cm
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(
          [...seg.from, ...seg.to], 3,
        ));
        const mat = new THREE.LineBasicMaterial({
          color: seg.color, transparent: true, opacity: 0.7, depthTest: false,
        });
        const axisLine = new THREE.Line(geom, mat);
        subgroup.add(axisLine);
      }
    }

    if (type === 'area' && points.length >= 3) {
      const vertices = new Float32Array(points.length * 3);
      points.forEach((p, i) => {
        vertices[i * 3] = p[0];
        vertices[i * 3 + 1] = p[1];
        vertices[i * 3 + 2] = p[2];
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      const indices = [];
      for (let i = 1; i < points.length - 1; i++) {
        indices.push(0, i, i + 1);
      }
      geom.setIndex(indices);
      const mat = new THREE.MeshBasicMaterial({
        color: POLY_FILL_COLOR,
        transparent: true,
        opacity: POLY_FILL_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fill = new THREE.Mesh(geom, mat);
      subgroup.add(fill);
    }

    this._group.add(subgroup);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'measure-label';
    // Dvouřádkový popisek pro distance/edge/area; jinak prostý text.
    // innerHTML obsahuje jen číselné toFixed hodnoty (XSS bezpečné).
    const html = buildLabelHTML(type, points, value);
    if (html !== null) {
      labelDiv.innerHTML = html;
    } else {
      labelDiv.textContent = formatValue(type, value);
    }
    this._labelContainer.appendChild(labelDiv);

    const anchor = (type === 'distance' || type === 'edge')
      ? [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2, (points[0][2] + points[1][2]) / 2]
      : type === 'angle'
        ? [...points[1]]
        : centroid(points);

    this._measurements.set(id, { type, points, value, subgroup, labelDiv, anchor, visible: true });
  }

  /**
   * Nastaví viditelnost celého měření — skryje 3D podskupinu i HTML popisek.
   * Skrytá měření se v updateLabels nepřepočítávají ani nezobrazují.
   */
  setMeasurementVisible(id, visible) {
    const m = this._measurements.get(id);
    if (!m) return;
    m.visible = !!visible;
    m.subgroup.visible = m.visible;
    m.labelDiv.style.display = m.visible ? '' : 'none';
  }

  removeMeasurement(id) {
    const m = this._measurements.get(id);
    if (!m) return;
    this._group.remove(m.subgroup);
    m.subgroup.traverse(obj => {
      if (obj.userData && obj.userData.measureMarker) this._unregisterScalable(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    if (m.labelDiv && m.labelDiv.parentElement) m.labelDiv.parentElement.removeChild(m.labelDiv);
    this._measurements.delete(id);
  }

  clearAll() {
    for (const id of [...this._measurements.keys()]) {
      this.removeMeasurement(id);
    }
  }

  /**
   * Přeškáluje snap preview i markery na screen-constant velikost.
   * Voláno z render smyčky každý snímek — proto levné (jen iterace registru).
   * @param {THREE.Camera} camera aktivní kamera
   * @param {number} viewportHeightPx výška viewportu v pixelech
   */
  updateScreenScale(camera, viewportHeightPx) {
    if (this._scalables.size === 0) return;
    const wp = new THREE.Vector3();
    for (const { obj, px } of this._scalables) {
      if (!obj.visible) continue;
      obj.getWorldPosition(wp);
      const s = screenScale(camera, wp, viewportHeightPx, px);
      if (obj.isSprite) {
        obj.scale.set(s, s, 1);
      } else {
        // Mesh s jednotkovým poloměrem: průměr = 2·poloměr, proto /2.
        obj.scale.setScalar(s / 2);
      }
    }
  }

  updateLabels() {
    if (this._measurements.size === 0) return;
    const rect = this._canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const v = new THREE.Vector3();

    for (const [, m] of this._measurements) {
      // Skrytá měření nepřepočítávat ani nezobrazovat.
      if (m.visible === false) continue;
      v.set(m.anchor[0], m.anchor[1], m.anchor[2]);
      v.project(this._camera);
      const screenX = (v.x * 0.5 + 0.5) * w;
      const screenY = (-v.y * 0.5 + 0.5) * h;
      if (v.z > 1) {
        m.labelDiv.style.display = 'none';
      } else {
        m.labelDiv.style.display = '';
        m.labelDiv.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%)`;
      }
    }
  }

  dispose() {
    this.clearAll();
    this.clearInProgressPoints();
    if (this._snapPreview) {
      this._scene.remove(this._snapPreview);
      this._unregisterScalable(this._snapPreview);
      this._snapPreview = null;
    }
    if (this._rubberBand) {
      this._scene.remove(this._rubberBand);
      this._rubberBand.geometry.dispose();
      this._rubberBand.material.dispose();
      this._rubberBand = null;
    }
    if (this._edgeHighlight) {
      this._scene.remove(this._edgeHighlight);
      this._edgeHighlight.geometry.dispose();
      this._edgeHighlight.material.dispose();
      this._edgeHighlight = null;
    }
    // Cachované glyf materiály a textury disposujeme jednou zde.
    for (const mat of this._glyphMaterials.values()) mat.dispose();
    for (const tex of this._glyphTextures.values()) tex.dispose();
    this._glyphMaterials.clear();
    this._glyphTextures.clear();
    this._scalables.clear();
    if (this._labelContainer.parentElement) {
      this._labelContainer.parentElement.removeChild(this._labelContainer);
    }
    this._scene.remove(this._group);
  }
}
