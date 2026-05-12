// Phase 6.15.2 — Terrain display + projection helpers.
//
// TerrainVisuals manages the terrain itself (TIN mesh) in the scene. The
// basemap.js module uses the same TerrainData to clip basemap tiles and
// project tile textures onto the terrain surface.
//
// TerrainData shape (canonical across all parsers):
//   { name: string,
//     vertices: Array<{x, y, z}>,      // in alignment frame (E, N, Z)
//     triangles: Array<[i0, i1, i2]>,  // vertex indices, CCW
//     bbox?: {minX, minY, minZ, maxX, maxY, maxZ},
//     epsg?: string }                  // CRS hint
//
// Vertices are interpreted in alignment frame (group has -π/2 X rotation).

import * as THREE from 'three';
import { terrainBbox } from '../terrain/landxml-surface-parser.js';

export class TerrainVisuals {
  constructor(viewerCore) {
    this._viewer = viewerCore;
    this._group = new THREE.Group();
    this._group.name = 'TerrainVisuals';
    this._group.userData = { isTerrain: true };
    this._group.rotation.x = -Math.PI / 2;
    viewerCore._scene.add(this._group);
    this._mesh = null;
    this._wireMesh = null;
    this._terrainData = null;
    this._falseOrigin = [0, 0, 0];
    this._opacity = 0.6;
    this._showWire = false;
  }

  /**
   * Set terrain data + show it.
   * @param {TerrainData} terrainData
   * @param {{ falseOrigin?: [E,N,H], opacity?: number, color?: number }} opts
   */
  show(terrainData, opts = {}) {
    this.clear();
    if (!terrainData || !terrainData.vertices?.length || !terrainData.triangles?.length) return;
    this._terrainData = terrainData;
    this._falseOrigin = opts.falseOrigin || [0, 0, 0];
    this._opacity = opts.opacity ?? 0.6;
    const color = (Number(opts.color) | 0) || 0x6b7280;

    const fo = this._falseOrigin;
    const positions = new Float32Array(terrainData.vertices.length * 3);
    for (let i = 0; i < terrainData.vertices.length; i++) {
      const v = terrainData.vertices[i];
      positions[i * 3] = v.x - fo[0];
      positions[i * 3 + 1] = v.y - fo[1];
      positions[i * 3 + 2] = v.z - fo[2];
    }
    const indices = new Uint32Array(terrainData.triangles.length * 3);
    for (let i = 0; i < terrainData.triangles.length; i++) {
      const t = terrainData.triangles[i];
      indices[i * 3] = t[0];
      indices[i * 3 + 1] = t[1];
      indices[i * 3 + 2] = t[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      color,
      transparent: this._opacity < 1,
      opacity: this._opacity,
      side: THREE.DoubleSide,
      depthWrite: this._opacity >= 1,
    });
    this._mesh = new THREE.Mesh(geo, mat);
    this._mesh.renderOrder = -2;
    this._group.add(this._mesh);

    if (this._showWire) this._addWire(geo);
  }

  _addWire(geo) {
    if (this._wireMesh) {
      this._group.remove(this._wireMesh);
      this._wireMesh.geometry.dispose();
      this._wireMesh.material.dispose();
    }
    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.4 });
    this._wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    this._wireMesh.renderOrder = -1;
    this._group.add(this._wireMesh);
  }

  setOpacity(opacity) {
    this._opacity = opacity;
    if (this._mesh) {
      this._mesh.material.opacity = opacity;
      this._mesh.material.transparent = opacity < 1;
      this._mesh.material.depthWrite = opacity >= 1;
      this._mesh.material.needsUpdate = true;
    }
  }

  setWireframe(show) {
    this._showWire = !!show;
    if (!this._mesh) return;
    if (show && !this._wireMesh) this._addWire(this._mesh.geometry);
    else if (!show && this._wireMesh) {
      this._group.remove(this._wireMesh);
      this._wireMesh.geometry.dispose();
      this._wireMesh.material.dispose();
      this._wireMesh = null;
    }
  }

  setVisible(visible) { this._group.visible = !!visible; }

  clear() {
    if (this._mesh) {
      this._group.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
    if (this._wireMesh) {
      this._group.remove(this._wireMesh);
      this._wireMesh.geometry.dispose();
      this._wireMesh.material.dispose();
      this._wireMesh = null;
    }
    this._terrainData = null;
  }

  getTerrainData() { return this._terrainData; }

  getState() {
    if (!this._terrainData) return { visible: false };
    const bbox = terrainBbox(this._terrainData);
    return {
      visible: this._group.visible && !!this._mesh,
      name: this._terrainData.name,
      vertexCount: this._terrainData.vertices.length,
      triangleCount: this._terrainData.triangles.length,
      bbox,
      opacity: this._opacity,
      wireframe: this._showWire,
    };
  }
}
