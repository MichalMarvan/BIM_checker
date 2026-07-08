// Staniční řezy — vizuální MARKERY (žádné ořezové roviny).
//
// Pro každé staničení vykreslí tenký oranžový obdélníkový rámeček kolmý na osu
// (LineLoop width×height, střed = bod osy, osy rámečku = hAxis × world-up)
// + popisek staničení (canvas-texture sprite) u horní hrany rámečku.
//
// Body/normály/hAxis jsou už ve světových souřadnicích (převod alignment→world
// dělá viewer-core, viz createStationSections). Tento modul pracuje přímo se
// scénou (žádná -π/2 rotace jako u alignment-visuals — vstup je už world frame).

import * as THREE from 'three';

const FRAME_COLOR = 0xf59e0b;          // oranžová — odlišná od modrých ořezových rovin
const FRAME_RENDER_ORDER = 101;        // nad modelem
const LABEL_RENDER_ORDER = 102;

/** Formátuje staničení v metrech na 'km 1,250'. */
export function formatStation(m) {
  return 'km ' + (m / 1000).toFixed(3).replace('.', ',');
}

/**
 * Canvas texture: bílý text na poloprůhledné tmavé pilulce.
 * Vrací { texture, aspect } — aspect = width/height pro správný poměr spritu.
 */
function makeLabelTexture(text) {
  const pad = 24;
  const fontSize = 64;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  const textW = Math.ceil(measure.measureText(text).width);
  const w = textW + pad * 2;
  const h = fontSize + pad * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // Poloprůhledná tmavá pilulka
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, h);
  ctx.arc(r, r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(15,23,42,0.78)';
  ctx.fill();
  // Bílý text
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return { texture: tex, aspect: w / h };
}

export class StationSectionVisuals {
  constructor(scene) {
    this._scene = scene;
    // alignmentId → { group, frames: THREE.LineLoop[], labels: THREE.Sprite[] }
    this._byId = new Map();
  }

  /**
   * Nastaví (nahradí) markery pro danou osu.
   * @param {string} alignmentId
   * @param {Array<{station,point,normal,hAxis}>} items — vše ve world frame
   * @param {{width:number, height:number}} dims
   */
  set(alignmentId, items, { width, height }) {
    this.remove(alignmentId);
    if (!items || !items.length) return;

    const group = new THREE.Group();
    group.userData = { stationSectionAlignmentId: alignmentId };
    const frames = [];
    const labels = [];

    const halfW = width / 2;
    const halfH = height / 2;
    const up = new THREE.Vector3(0, 1, 0);

    for (const item of items) {
      const center = new THREE.Vector3(item.point[0], item.point[1], item.point[2]);
      const h = new THREE.Vector3(item.hAxis[0], item.hAxis[1], item.hAxis[2]).normalize();
      // Čtyři rohy obdélníku: střed ± halfW·h ± halfH·up
      const corners = [
        [-halfW, -halfH],
        [halfW, -halfH],
        [halfW, halfH],
        [-halfW, halfH],
      ].map(([u, v]) =>
        center.clone()
          .add(h.clone().multiplyScalar(u))
          .add(up.clone().multiplyScalar(v))
      );
      const positions = new Float32Array(corners.length * 3);
      for (let i = 0; i < corners.length; i++) {
        positions[i * 3] = corners[i].x;
        positions[i * 3 + 1] = corners[i].y;
        positions[i * 3 + 2] = corners[i].z;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: FRAME_COLOR,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      });
      const frame = new THREE.LineLoop(geom, mat);
      frame.renderOrder = FRAME_RENDER_ORDER;
      group.add(frame);
      frames.push(frame);

      // Popisek u horní hrany rámečku (billboard sprite, velikost ve scéně).
      const { texture, aspect } = makeLabelTexture(formatStation(item.station));
      const labelMat = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
      });
      const label = new THREE.Sprite(labelMat);
      const labelH = height / 6;
      label.scale.set(labelH * aspect, labelH, 1);
      // Nad horní hranou rámečku (world-up), aby popisek nekolidoval s rámečkem.
      const labelPos = center.clone().add(up.clone().multiplyScalar(halfH + labelH * 0.7));
      label.position.copy(labelPos);
      label.renderOrder = LABEL_RENDER_ORDER;
      group.add(label);
      labels.push(label);
    }

    this._scene.add(group);
    this._byId.set(alignmentId, { group, frames, labels });
  }

  remove(alignmentId) {
    const entry = this._byId.get(alignmentId);
    if (!entry) return;
    for (const f of entry.frames) {
      f.geometry.dispose();
      f.material.dispose();
    }
    for (const l of entry.labels) {
      if (l.material.map) l.material.map.dispose();
      l.material.dispose();
    }
    this._scene.remove(entry.group);
    this._byId.delete(alignmentId);
  }

  clear() {
    for (const id of [...this._byId.keys()]) this.remove(id);
  }

  setVisible(alignmentId, visible) {
    const entry = this._byId.get(alignmentId);
    if (entry) entry.group.visible = !!visible;
  }

  dispose() {
    this.clear();
  }
}
