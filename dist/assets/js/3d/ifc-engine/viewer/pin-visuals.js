// Phase 6.4.1 — 3D markup pin visuals.
//
// Manages a THREE.Group of pin markers added to the scene. Pin types:
//   point  — sphere at world coord
//   line   — line segment between 2 world coords + small spheres at endpoints
//   bbox   — wireframe box from min/max world coords
//   entity — sphere positioned at the entity's bbox center (computed from mesh)
//
// Pin scale stays roughly visible at all camera distances via per-frame
// rescale (called from main render loop tick).
//
// Pin object shape:
//   { id, type, color, label?, point|from+to|min+max|modelId+expressId }

import * as THREE from 'three';

const DEFAULT_POINT_RADIUS_PX = 18;   // target screen pixels for point marker
const POINT_BASE_RADIUS = 0.5;        // world units; scaled per-frame

const POINT_GEOM = new THREE.SphereGeometry(POINT_BASE_RADIUS, 16, 12);

function makeColoredMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false,
  });
}

function makeLineMaterial(color) {
  return new THREE.LineBasicMaterial({
    color, linewidth: 2,
    transparent: true, opacity: 0.95,
    depthTest: false,
  });
}

export class PinVisuals {
  constructor(viewerCore) {
    this._viewer = viewerCore;
    this._group = new THREE.Group();
    this._group.name = 'PinVisuals';
    this._group.renderOrder = 110;  // above section ghost (102) and edges
    viewerCore._scene.add(this._group);
    this._pinNodes = new Map();  // id → THREE.Object3D (root for that pin)
  }

  addPin(pin) {
    if (this._pinNodes.has(pin.id)) this.removePin(pin.id);
    const root = new THREE.Group();
    root.userData = { pinId: pin.id, pinType: pin.type };
    const color = pin.color ?? 0xef4444;

    if (pin.type === 'point') {
      const m = new THREE.Mesh(POINT_GEOM, makeColoredMaterial(color));
      m.position.set(...(pin.point || [0, 0, 0]));
      m.userData.pinScalable = true;
      root.add(m);
    } else if (pin.type === 'line') {
      const from = new THREE.Vector3(...(pin.from || [0, 0, 0]));
      const to = new THREE.Vector3(...(pin.to || [0, 0, 0]));
      const lineGeom = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(lineGeom, makeLineMaterial(color));
      line.userData.pinDisposable = true;
      root.add(line);
      // Endpoint spheres so user sees clear anchors
      for (const p of [from, to]) {
        const s = new THREE.Mesh(POINT_GEOM, makeColoredMaterial(color));
        s.position.copy(p);
        s.scale.setScalar(0.5);
        s.userData.pinScalable = true;
        root.add(s);
      }
    } else if (pin.type === 'bbox') {
      const min = new THREE.Vector3(...(pin.min || [0, 0, 0]));
      const max = new THREE.Vector3(...(pin.max || [1, 1, 1]));
      const box = new THREE.Box3(min, max);
      const helper = new THREE.Box3Helper(box, color);
      // Box3Helper material is shared internal LineBasicMaterial — replace so
      // we can dispose cleanly + control depth/transparency.
      helper.material = makeLineMaterial(color);
      helper.userData.pinDisposable = true;
      root.add(helper);
    } else if (pin.type === 'entity') {
      // Position at entity bbox center; computed from viewer model meshes
      const center = this._computeEntityCenter(pin.modelId, pin.expressId);
      const m = new THREE.Mesh(POINT_GEOM, makeColoredMaterial(color));
      if (center) m.position.copy(center);
      m.userData.pinScalable = true;
      root.add(m);
    } else {
      console.warn(`PinVisuals: unknown pin.type "${pin.type}"`);
    }
    this._group.add(root);
    this._pinNodes.set(pin.id, root);
  }

  removePin(id) {
    const node = this._pinNodes.get(id);
    if (!node) return;
    this._disposeNode(node);
    this._group.remove(node);
    this._pinNodes.delete(id);
  }

  clear() {
    for (const node of this._pinNodes.values()) {
      this._disposeNode(node);
      this._group.remove(node);
    }
    this._pinNodes.clear();
  }

  /** Scale pin point markers per-frame so they stay roughly constant pixel size. */
  updateScale(camera, canvas) {
    if (!camera || !canvas) return;
    const targetWorldRadius = (clientPx) => {
      // Approximate world-units-per-pixel at given depth using FOV (or ortho).
      // For pins we use distance from camera to pin as depth.
      // Simpler heuristic: same "unit per pixel" math as measure-visuals.
      // We compute per pin below; this just returns the desired pixel target.
      return clientPx; // unused; we compute inline below
    };
    void targetWorldRadius; // silence linter

    const isOrtho = camera.isOrthographicCamera;
    const heightPx = canvas.clientHeight || canvas.height || 1;

    this._group.traverse(obj => {
      if (!obj.userData?.pinScalable) return;
      let scale = 1;
      if (isOrtho) {
        // ortho: world units per pixel = (top - bottom) / (heightPx * zoom)
        const worldPerPx = (camera.top - camera.bottom) / (heightPx * camera.zoom);
        scale = (DEFAULT_POINT_RADIUS_PX * worldPerPx) / POINT_BASE_RADIUS;
      } else {
        const dist = camera.position.distanceTo(obj.getWorldPosition(new THREE.Vector3()));
        const fov = camera.fov * (Math.PI / 180);
        const worldPerPx = (2 * Math.tan(fov / 2) * dist) / heightPx;
        scale = (DEFAULT_POINT_RADIUS_PX * worldPerPx) / POINT_BASE_RADIUS;
      }
      // Preserve per-pin baseline scale (e.g. 0.5 for line endpoints)
      const baseScale = obj.userData.pinBaseScale || (obj.scale.x === 0.5 ? 0.5 : 1);
      if (!obj.userData.pinBaseScale) obj.userData.pinBaseScale = baseScale;
      obj.scale.setScalar(scale * baseScale);
    });
  }

  _computeEntityCenter(modelId, expressId) {
    const model = this._viewer._models.get(modelId);
    if (!model) return null;
    const meshes = model.meshes.filter(m =>
      m.userData.modelId === modelId && m.userData.expressId === expressId);
    if (meshes.length === 0) return null;
    const bbox = new THREE.Box3();
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      const meshBox = new THREE.Box3().setFromObject(mesh);
      bbox.union(meshBox);
    }
    if (bbox.isEmpty()) return null;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    return center;
  }

  _disposeNode(node) {
    node.traverse(o => {
      if (o.userData?.pinDisposable && o.geometry) o.geometry.dispose();
      if (o.material && o.material !== POINT_GEOM) {
        // Don't dispose shared POINT_GEOM material refs — but the materials we
        // created via makeColoredMaterial/makeLineMaterial are unique per mesh.
        try { o.material.dispose(); } catch {}
      }
    });
  }
}
