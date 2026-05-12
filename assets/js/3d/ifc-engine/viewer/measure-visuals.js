// In-scene markers + lines + polygon fill + HTML overlay labels.

import * as THREE from 'three';

const MARKER_COLOR = 0x4facfe;
const LINE_COLOR = 0x4facfe;
const POLY_FILL_COLOR = 0x4facfe;
const POLY_FILL_OPACITY = 0.18;

function formatValue(type, value) {
  if (type === 'distance') return `${value.toFixed(2)} m`;
  if (type === 'angle') return `${value.toFixed(1)}°`;
  if (type === 'area') return `${value.toFixed(2)} m²`;
  return String(value);
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
  }

  /** Add a permanent marker for a clicked point during in-progress measurement. */
  addInProgressPoint(point) {
    const geom = new THREE.SphereGeometry(0.07, 16, 16);
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
  }

  /** Remove all in-progress markers (call when measurement completes / resets). */
  clearInProgressPoints() {
    for (const m of this._inProgressPoints) {
      this._scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this._inProgressPoints = [];
  }

  _ensureSnapPreview() {
    if (this._snapPreview) return;
    const geom = new THREE.SphereGeometry(0.08, 20, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: SNAP_PREVIEW_COLOR,
      transparent: true,
      opacity: 0.85,
      depthTest: false,  // always visible on top
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 999;
    mesh.visible = false;
    mesh.userData = { measureSnapPreview: true };
    this._scene.add(mesh);
    this._snapPreview = mesh;
  }

  /** Show hover snap marker at world point (for measure pick mode). */
  showSnapPreview(point, type) {
    this._ensureSnapPreview();
    this._snapPreview.position.set(point[0] ?? point.x, point[1] ?? point.y, point[2] ?? point.z);
    this._snapPreview.visible = true;
    // Color by snap type for visual feedback
    const color = SNAP_TYPE_COLORS[type] || SNAP_PREVIEW_COLOR;
    if (this._snapPreview.material.color.getHex() !== color) {
      this._snapPreview.material.color.setHex(color);
    }
  }

  hideSnapPreview() {
    if (this._snapPreview) this._snapPreview.visible = false;
  }

  addMeasurement(id, type, points, value) {
    const subgroup = new THREE.Group();
    subgroup.userData = { measureSubgroup: true, id };

    for (const p of points) {
      const geom = new THREE.SphereGeometry(0.05, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.userData = { measureMarker: true };
      subgroup.add(mesh);
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
    labelDiv.textContent = formatValue(type, value);
    this._labelContainer.appendChild(labelDiv);

    const anchor = type === 'distance'
      ? [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2, (points[0][2] + points[1][2]) / 2]
      : type === 'angle'
        ? [...points[1]]
        : centroid(points);

    this._measurements.set(id, { type, points, value, subgroup, labelDiv, anchor });
  }

  removeMeasurement(id) {
    const m = this._measurements.get(id);
    if (!m) return;
    this._group.remove(m.subgroup);
    m.subgroup.traverse(obj => {
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

  updateLabels() {
    if (this._measurements.size === 0) return;
    const rect = this._canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const v = new THREE.Vector3();

    for (const [, m] of this._measurements) {
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
    if (this._labelContainer.parentElement) {
      this._labelContainer.parentElement.removeChild(this._labelContainer);
    }
    this._scene.remove(this._group);
  }
}
