// Phase 6.8.2 — Alignment scene visualization.
//
// One THREE.Group per loaded alignment. Renders:
//   - polyline (yellow line) along sampled points
//   - station tick markers every TICK_INTERVAL meters (small cones)
//   - optional active-station marker (highlighted sphere)
//
// LandXML alignment lives in IFC world coords (X=East, Y=North, Z=Elevation).
// The IFC viewer rotates the model group -π/2 around X to convert IFC Z-up to
// Three.js Y-up. We do the SAME for alignments so they coexist in the same
// world space as the loaded models.

import * as THREE from 'three';

const ALIGNMENT_COLOR = 0xfbbf24;          // amber
const ACTIVE_COLOR = 0xef4444;
const TICK_COLOR = 0xfbbf24;
const TICK_INTERVAL = 100;                  // station marker every 100m

export class AlignmentVisuals {
  constructor(viewerCore) {
    this._viewer = viewerCore;
    this._byId = new Map();   // alignmentId → { group, sampled, polylineMesh, ticks, activeMarker }
  }

  /** Add or replace an alignment in the scene. */
  add(alignmentId, sampled) {
    this.remove(alignmentId);
    const group = new THREE.Group();
    // Match IFC group rotation so alignment shares world space with model
    group.rotation.x = -Math.PI / 2;
    group.userData = { alignmentId };

    // Polyline
    const positions = new Float32Array(sampled.points.length * 3);
    for (let i = 0; i < sampled.points.length; i++) {
      positions[i * 3] = sampled.points[i][0];
      positions[i * 3 + 1] = sampled.points[i][1];
      positions[i * 3 + 2] = sampled.points[i][2];
    }
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: ALIGNMENT_COLOR,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 105;
    line.userData = { alignmentDisposable: true };
    group.add(line);

    // Station ticks
    const ticks = [];
    const tickGeom = new THREE.SphereGeometry(0.3, 8, 6);
    const tickMat = new THREE.MeshBasicMaterial({ color: TICK_COLOR, depthTest: false });
    const stations = sampled.stations;
    const startSta = stations[0] || 0;
    const endSta = stations[stations.length - 1] || 0;
    let nextTick = Math.ceil(startSta / TICK_INTERVAL) * TICK_INTERVAL;
    for (; nextTick <= endSta; nextTick += TICK_INTERVAL) {
      const pt = _pointAt(sampled, nextTick);
      if (!pt) continue;
      const m = new THREE.Mesh(tickGeom, tickMat);
      m.position.set(pt.point[0], pt.point[1], pt.point[2]);
      m.renderOrder = 106;
      m.userData = { tickStation: nextTick, alignmentDisposable: false };
      group.add(m);
      ticks.push(m);
    }

    // Active station marker (initially hidden)
    const activeMat = new THREE.MeshBasicMaterial({ color: ACTIVE_COLOR, depthTest: false });
    const active = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), activeMat);
    active.visible = false;
    active.renderOrder = 107;
    active.userData = { alignmentDisposable: true };
    group.add(active);

    this._viewer._scene.add(group);
    this._byId.set(alignmentId, { group, sampled, line, ticks, activeMarker: active });
  }

  setActiveStation(alignmentId, station) {
    const entry = this._byId.get(alignmentId);
    if (!entry) return;
    if (station == null) {
      entry.activeMarker.visible = false;
      return;
    }
    const pt = _pointAt(entry.sampled, station);
    if (!pt) {
      entry.activeMarker.visible = false;
      return;
    }
    entry.activeMarker.position.set(pt.point[0], pt.point[1], pt.point[2]);
    entry.activeMarker.visible = true;
  }

  setVisible(alignmentId, visible) {
    const entry = this._byId.get(alignmentId);
    if (entry) entry.group.visible = !!visible;
  }

  remove(alignmentId) {
    const entry = this._byId.get(alignmentId);
    if (!entry) return;
    entry.group.traverse(o => {
      if (o.geometry && o.userData?.alignmentDisposable) o.geometry.dispose();
      if (o.material && o.userData?.alignmentDisposable) o.material.dispose();
    });
    this._viewer._scene.remove(entry.group);
    this._byId.delete(alignmentId);
  }

  clear() {
    for (const id of [...this._byId.keys()]) this.remove(id);
  }
}

// Lightweight inline point-at-station — duplicated from discretize.js to keep
// this module standalone (no circular deps).
function _pointAt(sampled, station) {
  const { points, stations } = sampled;
  if (!points.length) return null;
  if (station <= stations[0]) return { point: [...points[0]] };
  if (station >= stations[stations.length - 1]) return { point: [...points[points.length - 1]] };
  let lo = 0, hi = stations.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (stations[mid] <= station) lo = mid;
    else hi = mid;
  }
  const range = stations[hi] - stations[lo];
  const t = range > 0 ? (station - stations[lo]) / range : 0;
  const a = points[lo], b = points[hi];
  return { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])] };
}
