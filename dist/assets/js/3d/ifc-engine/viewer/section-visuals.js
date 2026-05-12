// Visual indicator for section box / plane.
// Renders 6 semi-transparent face meshes + 12-edge wireframe inside the scene.

import * as THREE from 'three';

const FACE_COLOR = 0x4facfe;
const FACE_OPACITY = 0.12;
const EDGE_COLOR = 0x4facfe;
const VISUAL_RENDER_ORDER = 100;

export class SectionVisuals {
  constructor(scene) {
    this._scene = scene;
    this._group = new THREE.Group();
    this._group.userData = { sectionVisuals: true };
    this._scene.add(this._group);
    this._visible = false;
    this._faces = [];
    this._wire = null;
    this._buildPlaceholder();
    this._ghost = null;  // ghost preview mesh, lazy
    this.hide();
  }

  _ensureGhost() {
    if (this._ghost) return;
    // Distinct visual style: more opaque + dashed-like edges via wireframe
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,             // amber/yellow — distinct from regular planes
      transparent: true,
      opacity: 0.30,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = VISUAL_RENDER_ORDER + 2;
    mesh.visible = false;
    mesh.userData = { sectionGhost: true };
    this._scene.add(mesh);
    this._ghost = mesh;
  }

  /** Show ghost preview at a point with given normal (size in world units). */
  showGhost(point, normal, size = 10) {
    this._ensureGhost();
    this._ghost.scale.set(size, size, 1);
    this._ghost.position.copy(point);
    this._ghost.lookAt(point.clone().add(normal));
    this._ghost.visible = true;
  }

  /**
   * Show ghost as actual hovered face — array of triangles in world coords.
   * Each triangle = [Vector3, Vector3, Vector3]. Replaces the rectangular
   * floating-plane ghost with a precise face highlight.
   */
  showFaceHighlight(triangles) {
    this._ensureGhost();
    // Build BufferGeometry from triangles
    const positions = new Float32Array(triangles.length * 9);
    for (let i = 0; i < triangles.length; i++) {
      const [a, b, c] = triangles[i];
      positions[i * 9 + 0] = a.x; positions[i * 9 + 1] = a.y; positions[i * 9 + 2] = a.z;
      positions[i * 9 + 3] = b.x; positions[i * 9 + 4] = b.y; positions[i * 9 + 5] = b.z;
      positions[i * 9 + 6] = c.x; positions[i * 9 + 7] = c.y; positions[i * 9 + 8] = c.z;
    }
    // Dispose previous geometry if present
    if (this._ghost.geometry) this._ghost.geometry.dispose();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    this._ghost.geometry = geom;
    this._ghost.position.set(0, 0, 0);
    this._ghost.scale.set(1, 1, 1);
    this._ghost.rotation.set(0, 0, 0);
    this._ghost.visible = true;
  }

  hideGhost() {
    if (this._ghost) this._ghost.visible = false;
  }

  _buildPlaceholder() {
    const mat = new THREE.MeshBasicMaterial({
      color: FACE_COLOR,
      transparent: true,
      opacity: FACE_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (let i = 0; i < 6; i++) {
      const geom = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geom, mat.clone());
      mesh.renderOrder = VISUAL_RENDER_ORDER;
      this._faces.push(mesh);
      this._group.add(mesh);
    }
    const wireMat = new THREE.LineBasicMaterial({ color: EDGE_COLOR });
    this._wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), wireMat);
    this._wire.renderOrder = VISUAL_RENDER_ORDER + 1;
    this._group.add(this._wire);
  }

  showBox(min, max) {
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const sx = max[0] - min[0];
    const sy = max[1] - min[1];
    const sz = max[2] - min[2];

    this._faces[0].position.set(min[0], cy, cz);
    this._faces[0].rotation.set(0, Math.PI / 2, 0);
    this._faces[0].scale.set(sz, sy, 1);
    this._faces[1].position.set(max[0], cy, cz);
    this._faces[1].rotation.set(0, Math.PI / 2, 0);
    this._faces[1].scale.set(sz, sy, 1);
    this._faces[2].position.set(cx, min[1], cz);
    this._faces[2].rotation.set(Math.PI / 2, 0, 0);
    this._faces[2].scale.set(sx, sz, 1);
    this._faces[3].position.set(cx, max[1], cz);
    this._faces[3].rotation.set(Math.PI / 2, 0, 0);
    this._faces[3].scale.set(sx, sz, 1);
    this._faces[4].position.set(cx, cy, min[2]);
    this._faces[4].rotation.set(0, 0, 0);
    this._faces[4].scale.set(sx, sy, 1);
    this._faces[5].position.set(cx, cy, max[2]);
    this._faces[5].rotation.set(0, 0, 0);
    this._faces[5].scale.set(sx, sy, 1);

    this._wire.position.set(cx, cy, cz);
    this._wire.scale.set(sx, sy, sz);
    this._wire.visible = true;

    for (const f of this._faces) f.visible = true;
    this._group.visible = true;
    this._visible = true;
  }

  showPlane(axis, position, keepPositive) {
    for (const f of this._faces) f.visible = false;
    this._wire.visible = false;
    const face = this._faces[0];

    const SIZE = 1000;
    face.scale.set(SIZE, SIZE, 1);

    if (axis === 'x') {
      face.position.set(position, 0, 0);
      face.rotation.set(0, Math.PI / 2, 0);
    } else if (axis === 'y') {
      face.position.set(0, position, 0);
      face.rotation.set(Math.PI / 2, 0, 0);
    } else {
      face.position.set(0, 0, position);
      face.rotation.set(0, 0, 0);
    }
    face.visible = true;
    this._group.visible = true;
    this._visible = true;
  }

  /**
   * Show a plane through `point` with `normal` (THREE.Vector3 in world coords).
   * Used for "section by face click" arbitrary-plane mode.
   */
  showArbitraryPlane(point, normal) {
    for (const f of this._faces) f.visible = false;
    this._wire.visible = false;
    const face = this._faces[0];
    const SIZE = 1000;
    face.scale.set(SIZE, SIZE, 1);
    face.position.copy(point);
    // Orient plane so its normal matches the given normal — lookAt aligns Z to target.
    face.lookAt(point.clone().add(normal));
    face.visible = true;
    this._group.visible = true;
    this._visible = true;
  }

  /**
   * Render multiple section planes (Phase 5.x multi-plane mode).
   * Each entry: { id, point, normal, offset, visible }. Up to 6 planes
   * (we have 6 face placeholders).
   */
  showMultiPlanes(planes, size = 50) {
    this._wire.visible = false;
    const SIZE = size;
    const THREE_NS = this._faces[0].position.constructor; // Vector3 from Three.js
    for (let i = 0; i < this._faces.length; i++) {
      const f = this._faces[i];
      const entry = planes[i];
      if (!entry) {
        f.visible = false;
        continue;
      }
      const p = new THREE_NS(...entry.point);
      const n = new THREE_NS(...entry.normal).normalize();
      // Apply offset along normal
      const pos = p.clone().add(n.clone().multiplyScalar(entry.offset || 0));
      f.scale.set(SIZE, SIZE, 1);
      f.position.copy(pos);
      f.lookAt(pos.clone().add(n));
      f.visible = true;
    }
    this._group.visible = true;
    this._visible = true;
  }

  hide() {
    this._group.visible = false;
    this._visible = false;
  }

  dispose() {
    for (const f of this._faces) {
      f.geometry.dispose();
      f.material.dispose();
    }
    this._wire.geometry.dispose();
    this._wire.material.dispose();
    this._scene.remove(this._group);
  }
}
