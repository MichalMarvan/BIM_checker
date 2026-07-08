// Visual indicator for section box / plane.
// Renders 6 semi-transparent face meshes + 12-edge wireframe inside the scene.

import * as THREE from 'three';

const FACE_COLOR = 0x4facfe;
const FACE_OPACITY = 0.12;
const EDGE_COLOR = 0x4facfe;
const VISUAL_RENDER_ORDER = 100;
const HANDLE_COUNT = 6;          // matches the 6 face placeholders

// Gizmo rukojeť — screen-constant velikost (vzory xeokit / iTwin.js).
const HANDLE_COLOR = 0x2563eb;         // stejná modrá jako ořezová rovina
const HANDLE_DISC_COLOR = 0xdbeafe;    // klidový tint disku (color multiply textury)
const HANDLE_DISC_COLOR_HOVER = 0xffffff; // hover: zesvětlit disk na plný jas
const HANDLE_RENDER_ORDER = VISUAL_RENDER_ORDER + 3;  // ≥ 103, nad plochami/wire/ghost
const HANDLE_HOVER_SCALE = 1.1;        // hover bump proti uloženému base scale
// Cílová obrazovková velikost: disk ~36 px průměr, celá šipka ~64 px.
// Geometrie disku má poloměr 1 (průměr 2). Válec šipky délka 1.4 + 2× kužel 0.5 = 2.4
// (délka podél normály). group.scale = s/2 → disk průměr = s, šipka délka = 1.2·s.
// Pro disk ≈ 36 px volíme base scale s = 36·worldPerPixel; šipka pak ≈ 43 px —
// aby vyšla ~64 px, prodlužujeme geometrii šipky faktorem ARROW_LEN_K níže.
const HANDLE_DISC_PX = 36;
// Poměr šipka/disk: chceme šipku ~64 px při disku 36 px → válec+kužely v poměru
// délky ku průměru disku = 64/36 ≈ 1.78. Při group.scale=s/2 a průměru disku=s
// musí délka šipky v lokálních jednotkách být 1.78·2 = 3.56.
const ARROW_HALF_LEN = 1.78;           // polovina délky šipky (od středu k hrotu) v lokálních jed.
const ARROW_SHAFT_R = 0.12;            // poloměr válce (dřík)
const ARROW_CONE_R = 0.3;              // poloměr základny kužele (hrot)
const ARROW_CONE_LEN = 0.5;            // délka kužele
const PICKER_R = 1.75;                 // neviditelný picker = 1.75× poloměr disku (=1)

/**
 * Canvas texture: a filled disc with a scissors glyph — the drag grip drawn
 * at each section plane's centre. depthTest is disabled on the material so it
 * reads as a gizmo floating over the geometry.
 */
function makeScissorsTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const r = S / 2;
  // Disc
  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#2563eb';
  ctx.stroke();
  // Scissors glyph
  ctx.fillStyle = '#1e293b';
  ctx.font = `${Math.round(S * 0.56)}px "Segoe UI Symbol", "Noto Sans Symbols2", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✂', r, r + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export class SectionVisuals {
  constructor(scene) {
    this._scene = scene;
    this._group = new THREE.Group();
    this._group.userData = { sectionVisuals: true };
    this._scene.add(this._group);
    this._visible = false;
    this._faces = [];
    this._handles = [];
    this._wire = null;
    this._buildPlaceholder();
    this._buildHandles();
    this._ghost = null;  // ghost preview mesh, lazy
    this._hoveredHandleId = null;  // id hoverované rukojeti (kompozice s updateHandleScale)
    this.hide();
  }

  /**
   * Postav rukojeti — jedna THREE.Group na rovinu:
   *  - disk ✂ (stávající canvas textura, CircleGeometry(1, 48)),
   *  - oboustranná šipka podél lokální Z (= normála po lookAt): válec + 2 kužely,
   *  - neviditelný picker (CircleGeometry(1.75), opacity 0) — jediný pick target.
   * Materiály disku i šipky jsou KLONOVANÉ per skupina, aby hover zvýraznil jen
   * jednu rovinu. Textura disku je sdílená (jedna canvas textura pro všechny).
   */
  _buildHandles() {
    const tex = makeScissorsTexture();
    this._handleTex = tex;   // sdílená textura — dispose jednou
    for (let i = 0; i < HANDLE_COUNT; i++) {
      const group = new THREE.Group();
      group.visible = false;
      group.userData = { sectionHandleGroup: true, baseScale: 1 };

      // Disk se scissors glyphem — leží v rovině XY, normála podél lokální Z.
      const discMat = new THREE.MeshBasicMaterial({
        map: tex,
        color: HANDLE_DISC_COLOR,   // klidový tint, hover zesvětlí na bílou
        transparent: true,
        depthTest: false,   // gizmo: vždy viditelný, i za geometrií
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), discMat);
      disc.renderOrder = HANDLE_RENDER_ORDER;
      group.add(disc);

      // Oboustranná šipka podél lokální Z. Geometrie válce/kužele míří defaultně
      // podél Y → rotujeme o +90° kolem X, tím se lokální Y srovná na lokální Z.
      const arrowMat = new THREE.MeshBasicMaterial({
        color: HANDLE_COLOR,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      });
      const shaftLen = 2 * (ARROW_HALF_LEN - ARROW_CONE_LEN);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(ARROW_SHAFT_R, ARROW_SHAFT_R, shaftLen, 12),
        arrowMat,
      );
      shaft.rotation.x = Math.PI / 2;   // Y → Z
      shaft.renderOrder = HANDLE_RENDER_ORDER;
      group.add(shaft);

      // Kužel k +Z: základna dole (−Y v lokálu kužele), hrot nahoru (+Y).
      // Po rotaci +90° kolem X míří hrot na +Z; posun na +ARROW_HALF_LEN.
      const coneGeom = new THREE.ConeGeometry(ARROW_CONE_R, ARROW_CONE_LEN, 16);
      const conePos = new THREE.Mesh(coneGeom, arrowMat);
      conePos.rotation.x = Math.PI / 2;
      conePos.position.z = ARROW_HALF_LEN - ARROW_CONE_LEN / 2;
      conePos.renderOrder = HANDLE_RENDER_ORDER;
      group.add(conePos);

      // Kužel k −Z: hrot míří na −Z → rotace −90° kolem X.
      const coneNeg = new THREE.Mesh(coneGeom, arrowMat);
      coneNeg.rotation.x = -Math.PI / 2;
      coneNeg.position.z = -(ARROW_HALF_LEN - ARROW_CONE_LEN / 2);
      coneNeg.renderOrder = HANDLE_RENDER_ORDER;
      group.add(coneNeg);

      // Neviditelný picker — větší hit target. Musí zůstat visible=true, jinak
      // raycast mine; neviditelnost přes opacity 0.
      const pickMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const picker = new THREE.Mesh(new THREE.CircleGeometry(PICKER_R, 24), pickMat);
      picker.renderOrder = HANDLE_RENDER_ORDER;
      picker.visible = true;
      picker.userData = { sectionHandle: true };
      group.add(picker);

      group.userData.disc = disc;
      group.userData.arrowMat = arrowMat;
      group.userData.discMat = discMat;
      group.userData.picker = picker;

      this._handles.push(group);
      this._group.add(group);
    }
  }

  /**
   * Ploché pole picker meshů — pro přímý raycast (Task 10 přepojí pick sem).
   * Vrací jen pickery viditelných rukojetí (jejich skupina je visible).
   */
  getHandlePickers() {
    return this._handles
      .filter(g => g.visible)
      .map(g => g.userData.picker);
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
    this._lastPlaneSize = SIZE;   // clamp velikosti rukojeti v updateHandleScale
    const THREE_NS = this._faces[0].position.constructor; // Vector3 from Three.js
    for (let i = 0; i < this._faces.length; i++) {
      const f = this._faces[i];
      const g = this._handles[i];
      const entry = planes[i];
      if (!entry) {
        f.visible = false;
        if (g) g.visible = false;
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
      // The quad is a passive indicator only (it must NOT capture drags, or it
      // would steal orbit over its whole 25 m span). Drag/click grabs the
      // scissors handle instead — so don't tag the face as a pick target.
      f.userData.sectionPlaneId = entry.id;
      f.userData.sectionFace = false;
      // Rukojeť (skupina) ve středu roviny — orientace lookAt podél normály,
      // takže lokální Z = normála (osa šipky). Velikost řeší updateHandleScale.
      if (g) {
        g.position.copy(pos);
        g.lookAt(pos.clone().add(n));
        g.visible = true;
        g.userData.sectionPlaneId = entry.id;
        g.userData.picker.userData.sectionPlaneId = entry.id;
      }
    }
    this._group.visible = true;
    this._visible = true;
  }

  /**
   * Přepočet screen-constant velikosti rukojetí — volat každý frame z render
   * smyčky (Task 10). Cíl: disk ≈ 36 px průměr na obrazovce, šipka ≈ 64 px.
   * @param {THREE.Camera} camera perspektivní nebo ortho kamera
   * @param {number} viewportHeightPx výška viewportu v pixelech
   */
  updateHandleScale(camera, viewportHeightPx) {
    if (!camera || !viewportHeightPx) return;
    const vh = viewportHeightPx;
    const maxSize = 0.4 * (this._lastPlaneSize || 50);
    for (const g of this._handles) {
      if (!g.visible) continue;
      let worldPerPixel;
      if (camera.isPerspectiveCamera) {
        const dist = camera.position.distanceTo(g.position);
        worldPerPixel = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / vh;
      } else {
        worldPerPixel = ((camera.top - camera.bottom) / camera.zoom) / vh;
      }
      // s = obrazovkový průměr disku v world jednotkách; group.scale = s/2
      // (disk poloměr 1 → průměr 2 → world průměr = 2·(s/2) = s).
      let s = HANDLE_DISC_PX * worldPerPixel;
      s = Math.min(Math.max(s, 0.05), maxSize);
      const base = s / 2;
      g.userData.baseScale = base;
      // Kompozice s hoverem: běží každý frame a přepisuje scale, proto musí sám
      // aplikovat hover ×1.1 na uloženém id (jinak by smazal bump ze setHandleHover).
      const hovered = this._hoveredHandleId != null
        && g.userData.sectionPlaneId === this._hoveredHandleId;
      g.scale.setScalar(hovered ? base * HANDLE_HOVER_SCALE : base);
    }
  }

  /**
   * Zvýraznění rukojeti pod kurzorem: disk zesvětlit + scale ×1.1 proti
   * uloženému base scale; ostatní vrátit na base scale a původní barvu.
   * @param {string|null} planeId id hoverované roviny, nebo null = zrušit hover
   */
  setHandleHover(planeId) {
    // Ulož id — updateHandleScale ho každý frame znovu aplikuje na scale
    // (jinak by per-frame reset scale hover bump smazal). Barvu řešíme hned tady.
    this._hoveredHandleId = planeId != null ? planeId : null;
    for (const g of this._handles) {
      if (!g.visible) continue;
      const base = g.userData.baseScale || 1;
      const hovered = planeId != null && g.userData.sectionPlaneId === planeId;
      if (hovered) {
        g.userData.discMat.color.setHex(HANDLE_DISC_COLOR_HOVER);
        g.scale.setScalar(base * HANDLE_HOVER_SCALE);
      } else {
        g.userData.discMat.color.setHex(HANDLE_DISC_COLOR);
        g.scale.setScalar(base);
      }
    }
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
    // Rukojeti = skupiny s vnořenými meshi (disk, dřík, 2 kužely, picker).
    // Geometrie i materiály uvolnit; textura disku je sdílená → jednou zvlášť.
    const seenMat = new Set();
    const seenGeom = new Set();
    for (const g of this._handles) {
      g.traverse(o => {
        if (!o.isMesh) return;
        if (o.geometry && !seenGeom.has(o.geometry)) {
          seenGeom.add(o.geometry);
          o.geometry.dispose();
        }
        if (o.material && !seenMat.has(o.material)) {
          seenMat.add(o.material);
          o.material.dispose();
        }
      });
    }
    if (this._handleTex) this._handleTex.dispose();
    this._wire.geometry.dispose();
    this._wire.material.dispose();
    this._scene.remove(this._group);
  }
}
