// Three.js scene + camera + render loop + InstancedMesh management.
// Phase 1: scene/camera/lights/renderer + addModel (per-entity Mesh) + removeModel.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PostPipeline } from './post/pipeline.js';
import { EdgesPass } from './post/edges-pass.js';
import { SSAOPass } from './post/ssao-pass.js';
import { buildEntityGeometry } from '../geometry/geometry-core.js';
import { extractFeatureEdges } from '../geometry/mesh-types.js';
import { selectAt } from './selection.js';
import { getViewSpec } from './camera-presets.js';
import { animateCameraTo } from './camera-animation.js';
import { SectionVisuals } from './section-visuals.js';
import { MeasureVisuals } from './measure-visuals.js';
import { PinVisuals } from './pin-visuals.js';
import { WalkMode } from './walk-mode.js';
import { captureCanvas, captureViewport } from './screenshot.js';
import { detectClashes as _detectClashes } from './clash-detector.js';
import { computeSectionCurves as _computeSectionCurves } from './section-curves.js';
import { BasemapVisuals, getProviders as _getProviders } from './basemap.js';
import { TerrainVisuals } from './terrain.js';
import { AlignmentVisuals } from './alignment-visuals.js';
import { parseLandXmlAlignments } from '../alignment/landxml-parser.js';
import { sampleAlignment, pointAtStation } from '../alignment/discretize.js';
import { distance, angle, polygonArea } from './measure-math.js';

// Per-frame scratch (no allocations in render loop).
const _clipSize = new THREE.Vector3();

// Per-IFC-type material colors. Common BIM convention: walls light gray,
// columns dark blue, beams brown, doors amber, windows light blue, roof red, etc.
// Unknown types fall back to neutral gray.
const IFC_TYPE_COLORS = {
  IFCWALL:                0xd1d5db,  // light gray
  IFCWALLSTANDARDCASE:    0xd1d5db,
  IFCSLAB:                0xb0b0b0,  // concrete gray
  IFCCOLUMN:              0x4b5563,  // slate
  IFCBEAM:                0x92400e,  // dark brown
  IFCMEMBER:              0x92400e,  // structural member (brown)
  IFCDOOR:                0xd97706,  // amber/wood
  IFCWINDOW:              0x93c5fd,  // light blue
  IFCROOF:                0xb91c1c,  // dark red
  IFCSTAIR:               0xf59e0b,  // orange
  IFCSTAIRFLIGHT:         0xf59e0b,
  IFCRAILING:             0x6b7280,  // mid gray
  IFCFURNISHINGELEMENT:   0xa78bfa,  // purple
  IFCBUILDINGELEMENTPROXY: 0x94a3b8, // slate
  IFCCURTAINWALL:         0x60a5fa,  // sky blue
  IFCPLATE:               0xcbd5e1,  // light slate
  IFCCOVERING:            0xe5e7eb,  // pale gray
  IFCRAMP:                0xf59e0b,
  IFCRAMPFLIGHT:          0xf59e0b,
};
const DEFAULT_COLOR = 0x9ca3af;

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color: DEFAULT_COLOR,
  side: THREE.DoubleSide,
  metalness: 0.0,         // BIM elements aren't metallic — kill PBR specular spots
  roughness: 0.92,        // very matte, eliminates per-mesh shiny hot-spots
  flatShading: false,
  // Push fill polygons back a hair in the depth buffer so the coplanar
  // feature-edge LineSegments win the depth test. Without this, edge lines
  // sit at exactly the surface depth and ~half their fragments z-fail,
  // leaving broken/dotted outlines (Trimble-style edges need solid lines).
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

// EdgesGeometry threshold for the lazy snap-edge data + selection overlays.
// 45° hides tessellation seams from triangulated civil/IFC geometry while
// keeping real corner edges. Bulk-of-scene edges come from screen-space
// EdgesPass which works in pixels regardless of triangulation.
const EDGE_THRESHOLD_DEG = 45;
const EDGE_COLOR = 0x111111;
const EDGE_MAX_OPACITY = 0.95;

/**
 * Compute a Box3 over the supplied meshes' WORLD bboxes, robust to a small
 * number of mesh outliers with corrupt / garbage coordinates.
 *
 * Two-stage filter:
 *   1. Drop meshes whose own bbox extent exceeds 100× the median extent
 *      (these are typically the IFC parser's mis-decoded geometries with
 *      random vertex coords blowing up to km / mm scale).
 *   2. Drop centres outside the 2.5%/97.5% per-axis percentile.
 *
 * Returns null when no mesh survives.
 */
export function computeRobustBbox(meshes) {
  const entries = [];
  const extents = [];
  for (const mesh of meshes) {
    if (!mesh || !mesh.geometry) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox;
    if (!local || local.isEmpty()) continue;
    const wb = local.clone().applyMatrix4(mesh.matrixWorld);
    if (wb.isEmpty()) continue;
    const cx = (wb.min.x + wb.max.x) / 2;
    const cy = (wb.min.y + wb.max.y) / 2;
    const cz = (wb.min.z + wb.max.z) / 2;
    const ex = Math.max(wb.max.x - wb.min.x, wb.max.y - wb.min.y, wb.max.z - wb.min.z);
    entries.push({ wb, cx, cy, cz, ex });
    extents.push(ex);
  }
  if (entries.length === 0) return null;

  extents.sort((a, b) => a - b);
  const medianExt = extents[Math.floor(extents.length * 0.5)] || 0;
  const extentCap = Math.max(medianExt * 100, 1000); // never below 1 km cap
  const sized = entries.filter(e => e.ex <= extentCap);
  if (sized.length === 0) return null;

  const filterByPercentile = (values, lo, hi) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return [sorted[Math.floor(sorted.length * lo)], sorted[Math.floor(sorted.length * hi)]];
  };
  const [xLo, xHi] = filterByPercentile(sized.map(e => e.cx), 0.025, 0.975);
  const [yLo, yHi] = filterByPercentile(sized.map(e => e.cy), 0.025, 0.975);
  const [zLo, zHi] = filterByPercentile(sized.map(e => e.cz), 0.025, 0.975);
  const keep = sized.filter(e =>
    e.cx >= xLo && e.cx <= xHi &&
    e.cy >= yLo && e.cy <= yHi &&
    e.cz >= zLo && e.cz <= zHi
  );
  if (keep.length === 0) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const e of keep) {
    if (e.wb.min.x < minX) minX = e.wb.min.x;
    if (e.wb.min.y < minY) minY = e.wb.min.y;
    if (e.wb.min.z < minZ) minZ = e.wb.min.z;
    if (e.wb.max.x > maxX) maxX = e.wb.max.x;
    if (e.wb.max.y > maxY) maxY = e.wb.max.y;
    if (e.wb.max.z > maxZ) maxZ = e.wb.max.z;
  }
  return new THREE.Box3(
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ)
  );
}

export class ViewerCore {
  /**
   * @param {HTMLCanvasElement} canvas — target canvas; renderer will write here
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0xf5f6f8);  // light gray — Trimble/Navisworks/Revit BIM convention

    const aspect = canvas.width / canvas.height || 1;
    this._camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100000);
    this._camera.position.set(10, 10, 10);
    this._camera.lookAt(0, 0, 0);

    // Note: `antialias: false` on the canvas because the canvas-bound default
    // framebuffer is only used for the final blit pass (a fullscreen triangle
    // covering every pixel — no MSAA-needing edges). Scene-geometry MSAA
    // happens inside PostPipeline's sceneRT via `samples: 4` (WebGL2
    // multisample renderbuffer + implicit resolve). This way the same MSAA
    // budget applies whether we render direct or through post passes.
    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    this._renderer.localClippingEnabled = true;
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(canvas.width, canvas.height, false);

    // Post-processing pipeline. Fáze B: transparent wrapper. Fáze D: edges
    // pass registered below — replaces the per-mesh EdgesGeometry overlay
    // (which only caught >45° creases, missed silhouettes on tessellated
    // curves, and cost double geometry memory per mesh).
    const _pipelineSize = this._renderer.getDrawingBufferSize(new THREE.Vector2());
    this._pipeline = new PostPipeline(this._renderer, _pipelineSize.x, _pipelineSize.y);
    // Pass order matters: SSAO darkens scene first, edges draw over the
    // already-AO-modulated colour. The other way round would draw edges
    // and then multiply them down with AO, washing them out.
    this._ssaoPass = new SSAOPass(this._pipeline, this._camera);
    this._pipeline.addPass(this._ssaoPass);
    this._edgesPass = new EdgesPass(this._pipeline, this._camera);
    this._pipeline.addPass(this._edgesPass);
    // Keep tone mapping linear so per-IFC-type and IfcStyledItem colors
    // render at their authored saturation. ACES Filmic compresses highlights
    // and desaturates — looks great for cinematic content but turns BIM
    // category colors pastel, which the team uses as visual identifiers.
    this._renderer.toneMapping = THREE.NoToneMapping;
    this._renderer.toneMappingExposure = 1.0;

    // Image-based lighting: a procedural RoomEnvironment baked into a PMREM
    // texture. Assigning to scene.environment gives every MeshStandardMaterial
    // soft IBL reflections, so small TIN surface bumps and inconsistent face
    // normals no longer cause stark "kocourkov" patches — the surface samples
    // light from all directions instead of one harsh sun. Generated once;
    // disposed in dispose().
    try {
      const pmremGenerator = new THREE.PMREMGenerator(this._renderer);
      const roomEnv = new RoomEnvironment();
      // Soft IBL contribution — fills shadow side and adds subtle "skylight"
      // ambient. With directionals carrying most of the saturation,
      // intensity 0.35 is enough to lift the shadow areas without flattening.
      this._scene.environment = pmremGenerator.fromScene(roomEnv, 0.15).texture;
      this._scene.environmentIntensity = 0.35;
      roomEnv.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      pmremGenerator.dispose();
    } catch (e) {
      console.warn('[viewer-core] PMREM env init failed (falling back to lights only):', e);
    }

    this._controls = new OrbitControls(this._camera, canvas);
    // CAD/Revit-style precise navigation: no inertia, 1:1 pointer→camera
    // mapping. Damping made the view drift after releasing the mouse,
    // which felt like lag during quick check-and-move workflows.
    this._controls.enableDamping = false;
    this._controls.rotateSpeed = 0.85;
    this._controls.zoomSpeed = 1.15;
    this._controls.panSpeed = 0.9;
    this._controls.zoomToCursor = true;
    // Touch: 1-finger rotate, 2-finger pinch-zoom + pan
    this._controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    // Prevent browser touch gestures (scroll, pinch-zoom page) from interfering
    canvas.style.touchAction = 'none';

    // Trimble-Connect / Navisworks-style strong directional shading: cylinders
    // read as cylinders, decks have clear light/shadow sides, edges crisp.
    // Triangle-teeth artefacts on tightly-tessellated trims are tackled in
    // mesh-types.js via tighter vertex merging — keeping the directionals
    // gives much more important shape definition than the loss costs us.
    const hemi = new THREE.HemisphereLight(0xf0f3f7, 0xa89e92, 0.45);
    this._scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(120, 220, 80);
    this._scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-150, 80, -100);
    this._scene.add(fillLight);

    // Models registry (Task 7 fills these)
    this._models = new Map();  // modelId → { group, meshes }

    // Cached union bbox of all loaded models — used by _updateCameraClipPlanes
    // to compute scene-diagonal-relative near/far each frame. Recomputed on
    // add/remove model (mesh count rarely changes, so the per-frame cost is
    // just bbox.getSize + a few comparisons). null = no models loaded.
    this._sceneBbox = null;

    this._highlights = new Map();   // mesh → original color hex (AI-tool highlight)
    this._listeners = new Map();    // eventName → Set<callback>

    // Persistent UI selection (separate from AI-tool highlight). Click-to-select,
    // multi-select with Ctrl, box-select with Shift+drag. Hover is a transient
    // single-mesh marker shown while the cursor is over an element.
    this._selected = new Map();     // 'modelId:expressId' → { mesh, origColor }
    this._hoveredKey = null;        // 'modelId:expressId' | null
    this._hoverOrigColor = null;    // mesh.material.color hex before hover
    this._hoveredMesh = null;

    this._section = {
      active: false, type: null, planes: [],
      min: null, max: null, axis: null, position: null, keepPositive: false,
    };
    this._sectionVisuals = null;
    this._measureVisuals = null;
    this._pinVisuals = null;
    this._pinIdCounter = 0;
    this._pins = new Map(); // id → pin spec
    this._walkMode = null;
    // Phase 6.15 — basemap (lazy)
    this._basemap = null;
    this._terrain = null;
    // Phase 6.8.2 — alignment registry
    this._alignmentVisuals = null;
    this._alignmentIdCounter = 0;
    this._alignments = new Map(); // id → { meta, sampled }

    // Multi-plane section state — list of arbitrary planes added via face-pick.
    // Each entry: { id, point: [x,y,z], normal: [x,y,z], offset, visible, plane: THREE.Plane }
    this._sectionPlanesList = [];
    this._sectionIdCounter = 0;

    // Edge outlines visibility toggle (true by default).
    this._edgesVisible = true;

    // Topology feature edges (Trimble-style element outlines) — ON by
    // default: boundary + sharp-crease line layer drawn over the solid
    // fill. Was OFF while weld-degenerated triangles spammed false edges;
    // that root cause is fixed in mergeVerticesInPlace.
    this._featureEdgesVisible = true;

    // Display mode: 'solid' (default) | 'xray' | 'hidden-line' | 'wireframe' | 'transparent'.
    // Phase 6 audit fix: per-entity opacity is now tracked separately from
    // mode opacity, so setDisplayMode no longer wipes user overrides.
    this._displayMode = 'solid';
    // Map<mesh, alpha> — explicit per-entity opacity overrides set via
    // setEntityOpacity. Composed with display mode in _applyDisplayMode (the
    // smaller of the two wins, so user overrides only ever make things MORE
    // transparent than the mode default).
    this._entityOpacity = new Map();

    // Click handler — emits 'entityClicked' on hit, 'selectionCleared' on miss.
    // Drag-vs-click discrimination so OrbitControls drag doesn't trigger select.
    let _downPos = null;
    canvas.addEventListener('pointerdown', (e) => {
      _downPos = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('click', (event) => {
      if (_downPos) {
        const dx = event.clientX - _downPos.x;
        const dy = event.clientY - _downPos.y;
        _downPos = null;
        if (dx * dx + dy * dy > 25) return;  // 5px threshold²
      }
      const hit = this.selectAt(event.clientX, event.clientY);
      if (hit) this._emit('entityClicked', hit);
      else this._emit('selectionCleared');
    });

    // Dblclick handler — fokus kamery + emits 'entityDoubleClicked' (Spec sekce 6)
    canvas.addEventListener('dblclick', (event) => {
      const hit = this.selectAt(event.clientX, event.clientY);
      if (hit) {
        this.focusEntity(hit.modelId, hit.expressId);
        this._emit('entityDoubleClicked', hit);
      }
    });

    // Render loop
    this._raf = null;
    this._startRenderLoop();
  }

  _startRenderLoop() {
    const render = () => {
      if (this._walkMode && this._walkMode.isActive()) this._walkMode.tick();
      else this._controls.update();
      // Adapt camera near/far to scene size + current zoom. Cheap (one bbox
      // read + distanceTo); only re-uploads the projection matrix on drift
      // >5%. Keeps far/near ratio low enough for stable SSAO + edge depth.
      this._updateCameraClipPlanes();
      if (this._measureVisuals) this._measureVisuals.updateLabels();
      if (this._pinVisuals) this._pinVisuals.updateScale(this._camera, this._canvas);
      this._pipeline.render(this._scene, this._camera);
      this._raf = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Lazy-build the per-mesh EdgesGeometry (BufferGeometry of line segments)
   * used by snap modes and by selection-highlight overlays. Cached on
   * `mesh.userData.edgeGeom`; created with a 45° threshold to skip
   * tessellation noise while keeping real corner edges.
   */
  _lazyEdgeGeometry(mesh) {
    if (mesh.userData?.edgeGeom) return mesh.userData.edgeGeom;
    if (!mesh.geometry) return null;
    const eg = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEG);
    mesh.userData = mesh.userData || {};
    mesh.userData.edgeGeom = eg;
    return eg;
  }

  /**
   * Create a LineSegments overlay for the supplied mesh (lazy — only built
   * when something visible needs it, e.g. selection highlight). Adds it as
   * a sibling of the mesh inside the same innerGroup so it inherits the
   * model's rotation/scale automatically. Returns the LineSegments.
   */
  _ensureSelectionEdgesFor(mesh) {
    if (mesh.userData?.edges) return mesh.userData.edges;
    const eg = this._lazyEdgeGeometry(mesh);
    if (!eg) return null;
    const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({
      color: EDGE_COLOR,
      transparent: true,
      opacity: EDGE_MAX_OPACITY,
      depthTest: true,
    }));
    // Mesh has already been applyMatrix4'd in addModel; copy that transform
    // so the overlay sits on the same world placement.
    edges.applyMatrix4(mesh.matrix);
    edges.userData = { isEdgeOutline: true, parentExpressId: mesh.userData?.expressId };
    mesh.userData.edges = edges;
    mesh.parent?.add(edges);
    return edges;
  }

  _disposeSelectionEdgesFor(mesh) {
    const edges = mesh.userData?.edges;
    if (!edges) return;
    edges.parent?.remove(edges);
    if (edges.material) edges.material.dispose();
    // Note: edges.geometry === mesh.userData.edgeGeom is shared with the
    // lazy snap cache — only dispose the LineSegments wrapper's references,
    // not the underlying BufferGeometry (snap may still need it).
    mesh.userData.edges = null;
  }

  /**
   * Add a parsed model to the scene as 1 Mesh per IFC product entity.
   * @param {string} modelId
   * @param {EntityIndex} entityIndex
   * @param {{ lengthScale?: number }} [opts] — lengthScale = IFC global length
   *        unit to metres (e.g., 0.001 for MILLIMETRE). Applied via group.scale
   *        so the entire model ends up in metres regardless of IFC declaration.
   */
  addModel(modelId, entityIndex, opts = {}) {
    if (this._models.has(modelId)) {
      this.removeModel(modelId);
    }
    const lengthScale = (opts && typeof opts.lengthScale === 'number' && opts.lengthScale > 0) ? opts.lengthScale : 1;

    const group = new THREE.Group();
    group.userData = { modelId };
    // IFC files are Z-up by convention; Three.js scene uses Y-up. Rotate the
    // model group -90° around X so IFC's +Z (up) maps to Three.js's +Y (up).
    // This keeps OrbitControls + view-cube + presets working with their default
    // Y-up assumptions without per-system overrides.
    group.rotation.x = -Math.PI / 2;
    if (lengthScale !== 1) group.scale.setScalar(lengthScale);

    // Inner group sits inside the rotation/scale group. We use it to host a
    // baseline-centering offset (see end of addModel) so the public `group`
    // remains free for federation to overwrite m.group.position without
    // wiping the centering.
    const innerGroup = new THREE.Group();
    group.add(innerGroup);

    // Two-pass: first build all candidate items so we can compute the median
    // bbox extent, then drop outliers (parser garbage that would otherwise
    // occlude the real geometry as a giant invisible occluder).
    // Phase 4b — Trimble-style topology feature edges. We attach a per-mesh
    // LineSegments child to each mesh. Why per-mesh (not one merged per
    // model): merging requires pre-baking world coords into the LineSegments
    // vertex buffer. At Civil 3D / S-JTSK magnitudes (~10^6 m) that overflows
    // f32 precision (the buffer is Float32Array). Per-mesh attached children
    // inherit mesh.matrix automatically, so the f32 buffer stays in mesh-local
    // (small) and the huge translation lives in the JS-side f64 matrix — same
    // precision story as the meshes themselves. Trade-off is +1 draw call per
    // mesh; one shared LineBasicMaterial keeps the per-element memory tiny.
    const featureEdgesList = [];
    const featureEdgesMaterial = new THREE.LineBasicMaterial({
      // Trimble-Connect-style element outlines: thin, dark, near-opaque.
      // The earlier 0x333333/0.35 "sketch" tuning compensated for false
      // edges emitted by weld-degenerated triangles (since fixed in
      // mergeVerticesInPlace) — with topology clean, full-strength lines
      // read as crisp element borders without tinting the fill colours
      // (fills are pushed back via polygonOffset on DEFAULT_MATERIAL).
      color: 0x2a2a2e,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
      depthWrite: false,
    });

    const candidates = [];
    for (const ifcType of entityIndex.types()) {
      const entities = entityIndex.byType(ifcType);
      const typeColor = IFC_TYPE_COLORS[ifcType] ?? DEFAULT_COLOR;
      for (const entity of entities) {
        const result = buildEntityGeometry(entityIndex, entity.expressId);
        if (!result || result.items.length === 0) continue;
        for (const item of result.items) {
          if (!item.bufferGeometry.boundingBox) item.bufferGeometry.computeBoundingBox();
          const bb = item.bufferGeometry.boundingBox;
          const ext = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) : 0;
          candidates.push({ entity, ifcType, item, result, typeColor, ext });
        }
      }
    }
    const sortedExt = candidates.map(c => c.ext).filter(Number.isFinite).sort((a, b) => a - b);
    const medianExt = sortedExt[Math.floor(sortedExt.length / 2)] || 0;
    // Cap is 100× median, but never below 1km / lengthScale (so mm-unit files
    // get a cap of 1,000,000 units which is still 1km in scene-local).
    const cap = Math.max(medianExt * 100, 1000 / Math.max(lengthScale, 1e-6));
    const accepted = sortedExt.length > 0 ? candidates.filter(c => c.ext <= cap) : candidates;
    const skipped = candidates.length - accepted.length;
    if (skipped > 0) {
      console.warn(`[viewer] addModel: skipped ${skipped} outlier mesh items (extent > ${cap.toFixed(0)}, median ${medianExt.toFixed(2)})`);
    }
    const meshes = [];

    for (const { entity, ifcType, item, result, typeColor } of accepted) {
      // The original two-loop entity iteration is now flattened above; render
      // a single mesh + edges per accepted item below.
      {
        {
          // Clone material per mesh so highlight can mutate color without
          // affecting other meshes (Phase 2 selection prep).
          // Color priority: per-vertex `color` attribute (IfcIndexedColourMap)
          // → IfcStyledItem (item.color) → IFC_TYPE_COLORS → DEFAULT_COLOR.
          const material = DEFAULT_MATERIAL.clone();
          const hasVertexColors = item.bufferGeometry?.getAttribute?.('color');
          if (hasVertexColors) {
            material.vertexColors = true;
            // Vertex colors multiply with material.color; keep it white so the
            // palette values pass through unchanged.
            material.color.setHex(0xffffff);
          } else {
            const color = item.color ?? typeColor;
            material.color.setHex(color);
          }
          if (this._section.active && this._section.planes.length > 0) {
            material.clippingPlanes = this._section.planes;
            material.clipShadows = true;
          }
          // Compose the full per-mesh transform without baking anything into
          // the vertex buffer. Three pieces in order: entity placement
          // (result.matrix) × IfcMappedItem chain (item.parentMatrix from
          // expandItems) × per-mesh centroid translation (localOrigin from
          // the parser). Keeping all three out of the float32 buffer is what
          // preserves precision for Civil 3D / Tekla files with absolute
          // S-JTSK coords or huge mapped-item offsets.
          const combinedMatrix = result.matrix.clone();
          if (item.parentMatrix) combinedMatrix.multiply(item.parentMatrix);
          const lo = item.bufferGeometry?.userData?.localOrigin;
          if (lo && (lo[0] || lo[1] || lo[2])) {
            combinedMatrix.multiply(new THREE.Matrix4().makeTranslation(lo[0], lo[1], lo[2]));
          }
          const mesh = new THREE.Mesh(item.bufferGeometry, material);
          mesh.applyMatrix4(combinedMatrix);
          mesh.userData = { modelId, ifcType, expressId: entity.expressId };
          innerGroup.add(mesh);
          meshes.push(mesh);

          // Topology-based feature edges (Phase 4b). Buffer stays in mesh-
          // local frame; the LineSegments is parented to `mesh` so it picks
          // up mesh.matrix automatically without re-baking huge translations
          // into a Float32Array (which would lose ~10 cm of accuracy at
          // S-JTSK magnitudes and visibly drift off the mesh surface).
          const localEdges = extractFeatureEdges(item.bufferGeometry);
          if (localEdges.length > 0) {
            const edgeGeom = new THREE.BufferGeometry();
            edgeGeom.setAttribute('position', new THREE.BufferAttribute(localEdges, 3));
            const edgeLines = new THREE.LineSegments(edgeGeom, featureEdgesMaterial);
            edgeLines.userData = { isFeatureEdges: true, expressId: entity.expressId };
            // Follows the engine-wide toggle (default ON — Trimble-style
            // element outlines); setFeatureEdgesVisible flips the whole
            // layer and the state survives subsequent loads.
            edgeLines.visible = this._featureEdgesVisible === true;
            mesh.add(edgeLines);
            featureEdgesList.push(edgeLines);
          }

          // Edge outlines now live in the screen-space EdgesPass — no per-mesh
          // LineSegments overlay. Selection highlight + snap helpers lazily
          // build per-mesh EdgesGeometry on first use (see
          // _ensureSelectionEdgesFor / _lazyEdgeGeometry below) so we don't
          // pay the memory cost up front for elements the user never touches.
        }
      }
    }

    // Float32 precision is handled at the parser level: every geometry
    // builder in mesh-types.js subtracts a per-mesh centroid in double
    // precision before Float32Array conversion, and viewer-core folds that
    // centroid into mesh.matrix above. Vertex buffers stay small (extent of
    // a single mesh), so triangles with vertices differing by a few microns
    // survive intact even when the original IFC coords are at S-JTSK
    // magnitude ~750000.
    // We keep innerGroup as a structural layer; federation writes to
    // m.group.position freely without touching meshes.

    this._scene.add(group);
    this._models.set(modelId, {
      group, innerGroup, meshes,
      featureEdges: featureEdgesList,
      featureEdgesMaterial,
    });
    if (this._displayMode !== 'solid') this._applyDisplayMode();
    this._recomputeSceneBbox();
  }

  /**
   * Toggle the per-mesh topology feature-edge LineSegments. Each leaf mesh
   * gets one attached child during addModel; this flips visibility on all
   * of them. Hidden = silhouette/depth pass only (cleaner sketch look);
   * visible = silhouette + structural drawing lines (Trimble-style).
   */
  setFeatureEdgesVisible(visible) {
    this._featureEdgesVisible = !!visible;
    for (const m of this._models.values()) {
      if (m.featureEdges) {
        for (const lines of m.featureEdges) lines.visible = this._featureEdgesVisible;
      }
    }
  }

  /**
   * Remove a model from the scene + dispose its geometries and materials.
   */
  removeModel(modelId) {
    const m = this._models.get(modelId);
    if (!m) return;
    this._scene.remove(m.group);
    for (const mesh of m.meshes) {
      // Drop opacity tracking for removed meshes (Map keeps references alive)
      if (this._entityOpacity) this._entityOpacity.delete(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      // Lazy snap-edge BufferGeometry — may have been built on first snap
      // query or selection. Selection LineSegments (if still attached) get
      // disposed by the group.traverse() below.
      if (mesh.userData?.edgeGeom) mesh.userData.edgeGeom.dispose();
    }
    // Dispose any lingering selection-edge LineSegments (a selected mesh
    // gets one attached; on removeModel we may bypass the deselect path).
    m.group.traverse(obj => {
      if (!obj.userData?.isEdgeOutline) return;
      // edges.geometry is shared with mesh.userData.edgeGeom (already
      // disposed above); only drop the material here.
      if (obj.material) obj.material.dispose();
    });
    // Phase 4b — feature-edge LineSegments (per-mesh children). The shared
    // material is disposed once at the model level; per-line geometries each
    // own their position buffer and must be disposed individually.
    if (m.featureEdges) {
      for (const lines of m.featureEdges) {
        if (lines.geometry) lines.geometry.dispose();
      }
    }
    if (m.featureEdgesMaterial) m.featureEdgesMaterial.dispose();
    this._models.delete(modelId);
    this._recomputeSceneBbox();
  }

  /**
   * Recompute the union bbox cache of all loaded models. Cheap (one pass over
   * meshes), but only worth running when the model set changes — addModel /
   * removeModel call this; the render loop just reads the cached bbox.
   */
  _recomputeSceneBbox() {
    const allMeshes = [];
    for (const { meshes } of this._models.values()) {
      for (const mesh of meshes) allMeshes.push(mesh);
    }
    // computeRobustBbox reads mesh.matrixWorld; addModel only sets mesh.matrix
    // (via applyMatrix4) — matrixWorld stays stale until the next render. Force
    // a fresh traversal so a bbox recompute right after addModel sees current
    // transforms instead of identity-matrix garbage for the just-added meshes.
    this._scene.updateMatrixWorld(true);
    this._sceneBbox = allMeshes.length > 0 ? computeRobustBbox(allMeshes) : null;
  }

  /**
   * Set camera near/far based on scene size + current camera-to-target distance.
   *
   * Why: the constructor defaults (0.1, 100000) give a far/near ratio of 1e6.
   * Perspective z-buffer is nonlinear → at that ratio, depth precision in the
   * far half of the frustum drops to a couple of bits, causing:
   *   - SSAO acne (depth-compare can't resolve adjacent samples reliably)
   *   - Inconsistent screen-space edge thresholds (depth-Laplacian fires
   *     differently at different camera distances)
   *
   * After centering / federation, model coords are scene-local (small), so we
   * can derive a tight frustum from scene.diag and camDist. Target ratio ~1e4.
   *
   * Called every frame after controls.update() — cost is bbox.getSize +
   * distanceTo + 2 comparisons; updateProjectionMatrix only fires when the
   * values drifted by >5%, so we don't thrash MVP recomputes.
   */
  _updateCameraClipPlanes() {
    if (!this._sceneBbox || this._sceneBbox.isEmpty()) return;
    const size = this._sceneBbox.getSize(_clipSize);
    const diag = size.length();
    if (!Number.isFinite(diag) || diag <= 0) return;

    const camDist = this._camera.position.distanceTo(this._controls.target);

    let near, far;
    if (this._camera.isPerspectiveCamera) {
      // Perspective depth precision is proportional to `near` and falls off
      // with distance² — a fixed small near (0.01) gives ~4 mm resolvable
      // depth at 25 m, which makes mm-thick coplanar IFC layers (waterproofing
      // on deck slabs, pavement courses) z-fight into stripe moiré. Scale
      // near with camera distance: camDist/100 resolves ~0.2 mm at any zoom
      // while never clipping closer than 1% of the orbit distance. diag/5000
      // and the 0.01 floor keep tiny models and extreme close-ups sane.
      near = Math.max(diag / 5000, camDist / 100, 0.01);
      // far = camDist + 2× diag gives margin even when zoomed inside the model.
      far = camDist + diag * 2.0;
    } else if (this._camera.isOrthographicCamera) {
      // Ortho z is linear → big range is fine for precision, just pick a
      // window centered around the target that covers the scene from any angle.
      near = -diag * 5;
      far = camDist + diag * 5;
    } else {
      return;
    }

    // Only update when drift >5% on either bound — avoids re-uploading the
    // projection matrix every frame for camera moves that don't change framing.
    const nearChanged = Math.abs(this._camera.near - near) / Math.max(Math.abs(near), 1e-3) > 0.05;
    const farChanged = Math.abs(this._camera.far - far) / Math.max(Math.abs(far), 1) > 0.05;
    if (nearChanged || farChanged) {
      this._camera.near = near;
      this._camera.far = far;
      this._camera.updateProjectionMatrix();
    }
  }

  /**
   * Fit camera to encompass all loaded models.
   * Computes union bbox across model meshes, positions camera at distance to see entire scene.
   */
  fitAll() {
    const allMeshes = [];
    for (const { meshes } of this._models.values()) {
      for (const mesh of meshes) allMeshes.push(mesh);
    }
    const box = computeRobustBbox(allMeshes);
    if (!box) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = this._fitDistance(maxDim, 1.5);

    const direction = new THREE.Vector3(1, 1, 1).normalize();
    this._camera.position.copy(center).add(direction.multiplyScalar(distance));
    this._camera.lookAt(center);
    this._controls.target.copy(center);
    this._controls.update();

    // Scale SSAO radius to scene size — 1.5% of the bounding-sphere radius
    // is the sweet spot for BIM/civil models: small enough to stay inside
    // surface details (cavities, contact zones) but large enough to be
    // visible at sensible zoom levels.
    if (this._ssaoPass) {
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      this._ssaoPass.setRadius(Math.max(0.05, sphere.radius * 0.015));
    }
  }

  /**
   * Zoom camera toward/away from controls.target by factor.
   * factor > 1 → closer (distance / factor); factor < 1 → farther.
   */
  zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (this._camera.isOrthographicCamera) {
      // Ortho zoom is via camera.zoom; position has no effect on projection.
      this._camera.zoom *= factor;
      this._camera.updateProjectionMatrix();
      this._controls.update();
      return;
    }
    const target = this._controls.target;
    const offset = this._camera.position.clone().sub(target);
    offset.divideScalar(factor);
    this._camera.position.copy(target).add(offset);
    this._controls.update();
  }

  /**
   * Compute camera distance + adjust ortho frustum so that an object of
   * `maxDim` size fits the view. Pure helper used by fitAll + focusEntity.
   * Padding > 1 leaves margin around the bbox.
   */
  _fitDistance(maxDim, padding = 1.5) {
    if (this._camera.isOrthographicCamera) {
      // Set ortho frustum to bbox + padding; reset zoom so the framing is exact.
      const aspect = this._canvas.width / this._canvas.height || 1;
      const halfH = (maxDim / 2) * padding;
      const halfW = halfH * aspect;
      this._camera.left = -halfW;
      this._camera.right = halfW;
      this._camera.top = halfH;
      this._camera.bottom = -halfH;
      this._camera.zoom = 1;
      this._camera.updateProjectionMatrix();
      // Distance doesn't affect projection in ortho but keep camera comfortably
      // outside near plane and within far plane.
      return Math.max(maxDim * 3, 1);
    }
    // PerspectiveCamera: distance derived from FOV.
    const fov = this._camera.fov * (Math.PI / 180);
    return (maxDim / 2) / Math.tan(fov / 2) * padding;
  }

  /**
   * Animate camera to a predefined view direction.
   * @param {string} spec — one of 26 view names from camera-presets.js
   * @param {{ animate?: boolean, duration?: number }} opts
   */
  setViewDirection(spec, opts = {}) {
    const viewSpec = getViewSpec(spec);
    if (!viewSpec) return;
    const target = this._controls.target;
    const distance = this._camera.position.distanceTo(target);
    const targetPos = target.clone().add(viewSpec.dir.clone().multiplyScalar(distance));
    const targetUp = viewSpec.up.clone();
    const duration = opts.animate === false ? 0 : (opts.duration ?? 400);
    return animateCameraTo(this._camera, this._controls, targetPos, targetUp, duration);
  }

  /**
   * Swap camera projection. Preserves position, target, up, and framing.
   */
  setProjection(type) {
    if (type !== 'perspective' && type !== 'orthographic') return;
    const isPerspective = this._camera.isPerspectiveCamera;
    const isOrthographic = this._camera.isOrthographicCamera;
    if (type === 'perspective' && isPerspective) return;
    if (type === 'orthographic' && isOrthographic) return;

    const target = this._controls.target.clone();
    const position = this._camera.position.clone();
    const up = this._camera.up.clone();
    const aspect = this._canvas.width / this._canvas.height || 1;
    const distance = position.distanceTo(target);

    if (type === 'orthographic') {
      const fov = (this._camera.fov || 50) * Math.PI / 180;
      const height = 2 * Math.tan(fov / 2) * distance;
      const width = height * aspect;
      // Ortho near MUST be negative (or very small) so geometry "behind" camera
      // along the view direction stays visible during orbit. Unlike perspective,
      // ortho is parallel projection — distance from camera doesn't affect
      // visibility, only near/far frustum bounds. Wide range here gives
      // ~0.012 unit depth precision over 200km range — fine for BIM models.
      this._camera = new THREE.OrthographicCamera(
        -width / 2, width / 2, height / 2, -height / 2, -100000, 100000
      );
    } else {
      this._camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100000);
    }
    this._camera.position.copy(position);
    this._camera.up.copy(up);
    this._camera.lookAt(target);

    // Re-bind controls to new camera (OrbitControls captures camera reference).
    this._controls.dispose();
    this._controls = new OrbitControls(this._camera, this._canvas);
    this._controls.target.copy(target);
    this._controls.enableDamping = false;
    this._controls.rotateSpeed = 0.85;
    this._controls.zoomSpeed = 1.15;
    this._controls.panSpeed = 0.9;
    this._controls.zoomToCursor = true;
    this._controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this._controls.update();

    // MeasureVisuals stores a camera reference at construction; update it so
    // HTML overlay labels project through the new (active) camera.
    if (this._measureVisuals) this._measureVisuals._camera = this._camera;
    // The new camera was constructed with the legacy hard-coded (0.1, 100000)
    // bounds. Pull them in immediately so the first post-switch frame already
    // has the dynamic near/far instead of waiting one render-loop tick.
    this._updateCameraClipPlanes();
  }

  /**
   * Returns normalized direction vector from controls.target toward camera.
   * Used by view cube widget to sync its rotation with main camera.
   */
  getCameraOrientation() {
    return this._camera.position.clone().sub(this._controls.target).normalize();
  }

  /**
   * Hit test at client coords; returns SelectionHit or null.
   */
  selectAt(clientX, clientY) {
    return selectAt(this._scene, this._camera, this._canvas, clientX, clientY);
  }

  /**
   * Phase 6 audit fix — public hit-test for app code that previously reached
   * into _viewer.selectAt(). Returns plain objects (no THREE types).
   * @returns {{modelId, expressId, ifcType, point: [number,number,number]} | null}
   */
  pickEntity(clientX, clientY) {
    const hit = this.selectAt(clientX, clientY);
    if (!hit) return null;
    return {
      modelId: hit.modelId,
      expressId: hit.expressId,
      ifcType: hit.ifcType,
      point: [hit.point.x, hit.point.y, hit.point.z],
    };
  }

  /**
   * Like pickEntity but also returns face normal (for section pick mode).
   * @returns {{modelId, expressId, ifcType, point:[x,y,z], normal:[x,y,z]|null} | null}
   */
  pickFace(clientX, clientY) {
    const hit = this.selectAt(clientX, clientY);
    if (!hit) return null;
    return {
      modelId: hit.modelId,
      expressId: hit.expressId,
      ifcType: hit.ifcType,
      point: [hit.point.x, hit.point.y, hit.point.z],
      normal: hit.normal ? [hit.normal.x, hit.normal.y, hit.normal.z] : null,
    };
  }

  /** Resize renderer + camera frustum/aspect to match container. */
  resize(w, h) {
    if (!w || !h) return;
    this._renderer.setSize(w, h, false);
    // Pipeline RTs are sized in drawing-buffer pixels (pixelRatio applied),
    // not CSS pixels — fetch the post-setSize buffer size from the renderer.
    const buf = this._renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this._pipeline) this._pipeline.resize(buf.x, buf.y);
    if (this._camera.isPerspectiveCamera) {
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    } else if (this._camera.isOrthographicCamera) {
      const aspect = w / h;
      const halfH = (this._camera.top - this._camera.bottom) / 2;
      const halfW = halfH * aspect;
      this._camera.left = -halfW;
      this._camera.right = halfW;
      this._camera.updateProjectionMatrix();
    }
  }

  /** @returns {'perspective'|'orthographic'} */
  getProjection() {
    return this._camera.isOrthographicCamera ? 'orthographic' : 'perspective';
  }

  /**
   * Full raycast — returns array of { hit (raw THREE intersect), mesh }.
   * Used by section pick mode to access hit.face for triangle traversal.
   */
  _raycastFull(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this._camera);
    const hits = raycaster.intersectObjects(this._scene.children, true);
    const out = [];
    for (const hit of hits) {
      const mesh = hit.object;
      if (!mesh.isMesh) continue;
      const ud = mesh.userData;
      if (!ud || !ud.modelId) continue;
      out.push({ hit, mesh });
      break;  // first model mesh only
    }
    return out;
  }

  /**
   * Highlight a list of entities by changing their mesh.material.color.
   * Stores original colors in _highlights so clearHighlights can restore.
   *
   * @param {Array<{ modelId, expressId, color? }>} items
   * @param {number|string} [defaultColor=0xfacc15] — used if item.color absent
   */
  highlight(items, defaultColor = 0xfacc15) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const mesh = this._findMesh(item.modelId, item.expressId);
      if (!mesh) continue;
      // Save original (only on first highlight; nested highlights keep first save)
      if (!this._highlights.has(mesh)) {
        this._highlights.set(mesh, mesh.material.color.getHex());
      }
      const color = item.color ?? defaultColor;
      mesh.material.color.set(color);
    }
    if (this._displayMode !== 'solid') this._applyDisplayMode();
  }

  /** Restore all highlighted meshes to their original colors. */
  clearHighlights() {
    for (const [mesh, hex] of this._highlights) {
      mesh.material.color.setHex(hex);
    }
    this._highlights.clear();
    if (this._displayMode !== 'solid') this._applyDisplayMode();
  }

  // -------------------- Persistent UI selection + hover --------------------

  /**
   * @param {Array<{modelId, expressId}>} items
   * @param {'replace'|'add'|'remove'|'toggle'} [mode='replace']
   */
  selectEntities(items, mode = 'replace') {
    const SELECT_COLOR = 0xff8c00;       // orange overlay
    const SELECT_EDGE_COLOR = 0xff4500;  // brighter outline
    const arr = Array.isArray(items) ? items : [];

    const _deselect = (rec) => {
      rec.mesh.material.color.setHex(rec.origColor);
      // Dispose the lazy selection-edge overlay. Edge highlight on selected
      // items is per-mesh LineSegments (so we get a sharp coloured outline);
      // everything else relies on screen-space EdgesPass.
      this._disposeSelectionEdgesFor(rec.mesh);
    };

    if (mode === 'replace') {
      for (const rec of this._selected.values()) _deselect(rec);
      this._selected.clear();
    }

    for (const it of arr) {
      const key = it.modelId + ':' + it.expressId;
      if (mode === 'remove') {
        const rec = this._selected.get(key);
        if (rec) {
          _deselect(rec);
          this._selected.delete(key);
        }
        continue;
      }
      if (mode === 'toggle' && this._selected.has(key)) {
        _deselect(this._selected.get(key));
        this._selected.delete(key);
        continue;
      }
      if (this._selected.has(key)) continue;  // already selected, skip add
      const mesh = this._findMesh(it.modelId, it.expressId);
      if (!mesh) continue;
      const rec = {
        mesh,
        origColor: mesh.material.color.getHex(),
      };
      this._selected.set(key, rec);
      mesh.material.color.setHex(SELECT_COLOR);
      const edges = this._ensureSelectionEdgesFor(mesh);
      if (edges) edges.material.color.setHex(SELECT_EDGE_COLOR);
    }
    this._emit('selectionChanged', this.getSelectedEntities());
  }

  clearSelection() {
    this.selectEntities([], 'replace');
  }

  getSelectedEntities() {
    const out = [];
    for (const [key, rec] of this._selected) {
      const [modelId, expressId] = key.split(':');
      out.push({
        modelId,
        expressId: parseInt(expressId, 10),
        ifcType: rec.mesh.userData?.ifcType || null,
      });
    }
    return out;
  }

  isSelected(modelId, expressId) {
    return this._selected.has(modelId + ':' + expressId);
  }

  /**
   * Set / clear the hover marker. Pass null to clear. One mesh at a time.
   */
  setHoverEntity(item) {
    const HOVER_COLOR = 0x60a5fa;  // light blue overlay
    const newKey = item ? item.modelId + ':' + item.expressId : null;
    if (newKey === this._hoveredKey) return;
    // Restore previously hovered mesh, unless it's selected (selection wins)
    if (this._hoveredMesh && this._hoverOrigColor !== null && !this._selected.has(this._hoveredKey)) {
      this._hoveredMesh.material.color.setHex(this._hoverOrigColor);
    }
    this._hoveredKey = null;
    this._hoveredMesh = null;
    this._hoverOrigColor = null;
    if (!newKey) return;
    // Don't override selection visuals
    if (this._selected.has(newKey)) {
      this._hoveredKey = newKey;
      return;
    }
    const mesh = this._findMesh(item.modelId, item.expressId);
    if (!mesh) return;
    this._hoveredKey = newKey;
    this._hoveredMesh = mesh;
    this._hoverOrigColor = mesh.material.color.getHex();
    mesh.material.color.setHex(HOVER_COLOR);
  }

  /**
   * Frustum/box pick: returns entities whose bounding-box center projects
   * inside the screen-space rectangle defined by two client points.
   * Center-only test (no extent crossing) — fast and good enough for
   * typical BIM building elements.
   */
  pickInBox(clientX1, clientY1, clientX2, clientY2) {
    const rect = this._canvas.getBoundingClientRect();
    const xMin = Math.min(clientX1, clientX2);
    const xMax = Math.max(clientX1, clientX2);
    const yMin = Math.min(clientY1, clientY2);
    const yMax = Math.max(clientY1, clientY2);
    const ndcMinX = (xMin - rect.left) / rect.width * 2 - 1;
    const ndcMaxX = (xMax - rect.left) / rect.width * 2 - 1;
    const ndcMinY = -((yMax - rect.top) / rect.height * 2 - 1);
    const ndcMaxY = -((yMin - rect.top) / rect.height * 2 - 1);

    const tmp = new THREE.Vector3();
    const out = [];
    for (const { meshes } of this._models.values()) {
      for (const mesh of meshes) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        mesh.updateMatrixWorld();
        mesh.geometry.boundingBox.getCenter(tmp);
        tmp.applyMatrix4(mesh.matrixWorld);
        tmp.project(this._camera);
        if (tmp.z < -1 || tmp.z > 1) continue;
        if (tmp.x < ndcMinX || tmp.x > ndcMaxX) continue;
        if (tmp.y < ndcMinY || tmp.y > ndcMaxY) continue;
        out.push({ modelId: mesh.userData.modelId, expressId: mesh.userData.expressId });
      }
    }
    return out;
  }

  // -------------------- Visibility / opacity --------------------

  /** Set mesh.visible=false for all meshes matching given items. */
  hideEntities(items) {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      const mesh = this._findMesh(it.modelId, it.expressId);
      if (mesh) mesh.visible = false;
    }
  }

  /** Hide everything except the given entities (isolate mode). */
  isolateEntities(items) {
    if (!Array.isArray(items)) return;
    const keep = new Set(items.map(it => `${it.modelId}|${it.expressId}`));
    for (const { meshes } of this._models.values()) {
      for (const mesh of meshes) {
        const key = `${mesh.userData.modelId}|${mesh.userData.expressId}`;
        mesh.visible = keep.has(key);
      }
    }
  }

  /** Restore visibility of all meshes (undo hide/isolate). */
  showAll() {
    for (const { meshes } of this._models.values()) {
      for (const mesh of meshes) mesh.visible = true;
    }
  }

  /**
   * Set per-entity opacity (alpha 0-1). 1 = fully opaque, 0 = invisible.
   * Sets material.transparent + opacity. Edge outlines stay opaque.
   */
  setEntityOpacity(items, alpha) {
    if (!Array.isArray(items)) return;
    const a = Math.max(0, Math.min(1, alpha));
    for (const it of items) {
      const mesh = this._findMesh(it.modelId, it.expressId);
      if (!mesh) continue;
      // Track in the override map (alpha=1 = no override)
      if (a < 1) this._entityOpacity.set(mesh, a);
      else this._entityOpacity.delete(mesh);
    }
    // Re-apply mode so opacity composes correctly with current display mode
    this._applyDisplayMode();
  }

  /** Get current opacity of an entity (1 if no override). */
  getEntityOpacity(modelId, expressId) {
    const mesh = this._findMesh(modelId, expressId);
    if (!mesh) return 1;
    return this._entityOpacity.get(mesh) ?? 1;
  }

  /** Find all expressIds in a model that share the same IFC type as given entity. */
  findSameTypeIds(modelId, expressId) {
    const m = this._models.get(modelId);
    if (!m) return [];
    const meta = this.getEntityMeta(modelId, expressId);
    if (!meta) return [];
    const sameType = m.index.byType(meta.ifcType) || [];
    return sameType.map(e => e.expressId);
  }

  // -------------------- Display modes (Phase 6.2.1) --------------------

  /**
   * Set global display mode. Composes with per-entity opacity overrides
   * (the more-transparent value wins) — switching to xray/transparent will
   * NOT erase user opacity settings; switching back to solid restores them.
   * @param {'solid'|'xray'|'hidden-line'|'wireframe'|'transparent'} mode
   */
  setDisplayMode(mode) {
    const valid = ['solid', 'xray', 'hidden-line', 'wireframe', 'transparent'];
    if (!valid.includes(mode)) throw new Error(`Invalid display mode: ${mode}`);
    this._displayMode = mode;
    this._applyDisplayMode();
  }

  getDisplayMode() { return this._displayMode; }

  _applyDisplayMode() {
    const mode = this._displayMode;
    const highlightedMeshes = this._highlights;  // Map<mesh, originalHex>

    for (const { meshes, group } of this._models.values()) {
      for (const mesh of meshes) {
        const isHighlighted = highlightedMeshes.has(mesh);
        const mat = mesh.material;

        // Compute mode-driven opacity baseline
        let modeAlpha = 1;
        let modeWireframe = false;
        let modeVisible = true;
        if (mode === 'xray') {
          if (!isHighlighted) modeAlpha = 0.15;
        } else if (mode === 'hidden-line') {
          modeVisible = false;
        } else if (mode === 'wireframe') {
          modeWireframe = true;
        } else if (mode === 'transparent') {
          modeAlpha = 0.5;
        }

        // Compose with per-entity opacity override (more transparent wins)
        const overrideAlpha = this._entityOpacity.get(mesh);
        const finalAlpha = overrideAlpha !== null && overrideAlpha !== undefined
          ? Math.min(modeAlpha, overrideAlpha)
          : modeAlpha;

        mat.wireframe = modeWireframe;
        mat.visible = modeVisible;
        mat.transparent = finalAlpha < 1;
        mat.opacity = finalAlpha;
        mat.depthWrite = finalAlpha >= 1;
        mat.needsUpdate = true;
      }
      // Screen-space EdgesPass: force on for hidden-line (it's the only thing
      // visible in that mode), off for wireframe (mesh wireframe already
      // shows every edge), else honour the user toggle.
      const edgesShouldShow =
        mode === 'hidden-line' ? true :
        mode === 'wireframe' ? false :
        this._edgesVisible;
      if (this._edgesPass) this._edgesPass.enabled = edgesShouldShow;
      // Selection-overlay LineSegments stay visible in all modes — they mark
      // explicit user picks. No need to traverse + toggle; the lazy ones
      // already default to visible when created.
    }
  }

  /**
   * Set 6-plane axis-aligned section box. Models clip to KEEP everything INSIDE the box.
   */
  setSectionBox(min, max) {
    if (!Array.isArray(min) || !Array.isArray(max) || min.length !== 3 || max.length !== 3) {
      throw new Error('setSectionBox: min and max must be 3-element arrays');
    }
    const planes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -min[0]),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), max[0]),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -min[1]),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), max[1]),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -min[2]),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), max[2]),
    ];
    this._section = {
      active: true, type: 'box', planes,
      min: [...min], max: [...max],
      axis: null, position: null, keepPositive: false,
    };
    this._applyPlanesToAllMeshes(planes);
    this._ensureVisuals();
    this._sectionVisuals.showBox(min, max);
  }

  /**
   * Set single-axis section plane.
   */
  setSectionPlane(axis, position, keepPositive = false) {
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
      throw new Error("setSectionPlane: axis must be 'x', 'y', or 'z'");
    }
    if (!Number.isFinite(position)) {
      throw new Error('setSectionPlane: position must be finite number');
    }
    const normalDir = keepPositive ? 1 : -1;
    const normalVec = axis === 'x' ? new THREE.Vector3(normalDir, 0, 0)
                    : axis === 'y' ? new THREE.Vector3(0, normalDir, 0)
                    :                new THREE.Vector3(0, 0, normalDir);
    const constant = keepPositive ? -position : position;
    const planes = [new THREE.Plane(normalVec, constant)];
    this._section = {
      active: true, type: 'plane', planes,
      min: null, max: null,
      axis, position, keepPositive,
    };
    this._applyPlanesToAllMeshes(planes);
    this._ensureVisuals();
    this._sectionVisuals.showPlane(axis, position, keepPositive);
  }

  /**
   * Set arbitrary section plane from world-space point + normal vector.
   * Cuts model on the side opposite to the normal (keeps the half-space the
   * normal points away from). Used for "section by face click" UX where user
   * picks a face and the plane snaps to it.
   *
   * @param {[number,number,number]|THREE.Vector3} point — point on the plane (world coords)
   * @param {[number,number,number]|THREE.Vector3} normal — plane normal (world coords, unit vector)
   */
  setSectionPlaneByNormal(point, normal) {
    const p = Array.isArray(point) ? new THREE.Vector3(...point) : point.clone();
    const n = Array.isArray(normal) ? new THREE.Vector3(...normal) : normal.clone();
    if (!Number.isFinite(p.x) || !Number.isFinite(n.x) || n.length() === 0) {
      throw new Error('setSectionPlaneByNormal: point + normal must be valid Vector3');
    }
    n.normalize();
    // Plane equation: n · X + constant = 0; for plane passing through p, constant = -n·p.
    const constant = -n.dot(p);
    const planes = [new THREE.Plane(n, constant)];
    this._section = {
      active: true, type: 'plane-arbitrary', planes,
      min: null, max: null,
      axis: null, position: null, keepPositive: false,
      point: [p.x, p.y, p.z], normal: [n.x, n.y, n.z],
    };
    this._applyPlanesToAllMeshes(planes);
    this._ensureVisuals();
    this._sectionVisuals.showArbitraryPlane(p, n);
  }

  /** Disable all clipping. */
  clearSection() {
    this._section = {
      active: false, type: null, planes: [],
      min: null, max: null, axis: null, position: null, keepPositive: false,
    };
    this._applyPlanesToAllMeshes([]);
    if (this._sectionVisuals) this._sectionVisuals.hide();
  }

  /** Returns deep copy of section state. */
  getSectionState() {
    return {
      active: this._section.active,
      type: this._section.type,
      min: this._section.min ? [...this._section.min] : null,
      max: this._section.max ? [...this._section.max] : null,
      axis: this._section.axis,
      position: this._section.position,
      keepPositive: this._section.keepPositive,
    };
  }

  // -------------------- Multi-plane section API --------------------

  /**
   * Add a section plane defined by world point + normal (e.g. picked from face).
   * Returns the plane id for later updates/removal. Multiple planes accumulate
   * (clipping is the intersection of all visible plane half-spaces).
   * @returns {string} id
   */
  addSectionPlane(point, normal) {
    const p = Array.isArray(point) ? point.slice() : [point.x, point.y, point.z];
    const n = Array.isArray(normal) ? normal.slice() : [normal.x, normal.y, normal.z];
    const id = `sp_${++this._sectionIdCounter}`;
    const entry = {
      id, name: `Řez ${this._sectionIdCounter}`,
      point: p, normal: n, offset: 0, visible: true,
      plane: this._buildPlane(p, n, 0),
    };
    this._sectionPlanesList.push(entry);
    this._refreshSectionPlanes();
    return id;
  }

  /** Update an existing plane's offset / visibility / name / flip. */
  updateSectionPlane(id, opts = {}) {
    const e = this._sectionPlanesList.find(p => p.id === id);
    if (!e) return;
    if (Number.isFinite(opts.offset)) e.offset = opts.offset;
    if (typeof opts.visible === 'boolean') e.visible = opts.visible;
    if (typeof opts.name === 'string') e.name = opts.name;
    if (opts.flip === true) {
      e.normal = [-e.normal[0], -e.normal[1], -e.normal[2]];
    }
    e.plane = this._buildPlane(e.point, e.normal, e.offset);
    this._refreshSectionPlanes();
  }

  /** Remove a single plane by id. */
  removeSectionPlane(id) {
    this._sectionPlanesList = this._sectionPlanesList.filter(p => p.id !== id);
    this._refreshSectionPlanes();
  }

  /** Remove all multi-plane sections. */
  clearSectionPlanes() {
    this._sectionPlanesList = [];
    this._refreshSectionPlanes();
  }

  /** Returns shallow copy of plane list (no THREE.Plane refs leaked). */
  getSectionPlanes() {
    return this._sectionPlanesList.map(p => ({
      id: p.id, name: p.name, point: [...p.point], normal: [...p.normal],
      offset: p.offset, visible: p.visible,
    }));
  }

  /** Internal: build THREE.Plane from point + normal + offset along normal. */
  _buildPlane(point, normal, offset) {
    const n = new THREE.Vector3(...normal).normalize();
    const p = new THREE.Vector3(...point).add(n.clone().multiplyScalar(offset));
    return new THREE.Plane(n, -n.dot(p));
  }

  /** Internal: collect all visible planes + apply to mesh materials + visuals. */
  _refreshSectionPlanes() {
    const visible = this._sectionPlanesList.filter(p => p.visible);
    const planes = visible.map(e => e.plane);
    this._applyPlanesToAllMeshes(planes);
    if (planes.length > 0) {
      this._ensureVisuals();
      this._sectionVisuals.showMultiPlanes(visible, this._computeSceneVisualSize());
    } else if (this._sectionVisuals) {
      this._sectionVisuals.hide();
    }
  }

  /** Fixed visual size for section-plane preview rectangles.
   *  Tuned for typical BIM scale (10–50 m models). User-configurable later. */
  _computeSceneVisualSize() {
    return 25;  // 25 × 25 m
  }

  /**
   * Highlight the actual hovered face during pick-face mode by collecting
   * coplanar triangles from the hit mesh. point + normal in WORLD coords.
   * Caller passes the SelectionHit so we have mesh ref via raycaster face.
   */
  showSectionGhostFromHit(hit, mesh) {
    this._ensureVisuals();
    if (!hit || !mesh || !mesh.geometry) {
      this._sectionVisuals.hideGhost();
      return;
    }
    const triangles = this._collectCoplanarTriangles(mesh, hit);
    if (triangles.length === 0) {
      this._sectionVisuals.hideGhost();
      return;
    }
    this._sectionVisuals.showFaceHighlight(triangles);
  }

  hideSectionGhost() {
    if (this._sectionVisuals) this._sectionVisuals.hideGhost();
  }

  /**
   * Find triangles in mesh that lie on the same plane as the hit triangle.
   * Returns array of [Vector3, Vector3, Vector3] world-space triangles.
   */
  _collectCoplanarTriangles(mesh, hit) {
    const geom = mesh.geometry;
    const positionAttr = geom.attributes.position;
    if (!positionAttr) return [];
    const indexAttr = geom.index;
    const triCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;
    if (!hit.face || !hit.face.normal) return [];

    mesh.updateMatrixWorld();
    const matrix = mesh.matrixWorld;

    // Reference plane: hit.point + hit.face normal (world space, already in hit)
    const refNormal = hit.face.normal.clone().transformDirection(matrix).normalize();
    const refPoint = hit.point.clone();
    const NORMAL_EPS = 0.01;   // dot product threshold (cos ~ 8°)
    const PLANE_EPS_RATIO = 0.001; // plane distance tolerance, fraction of bbox diag

    // Compute bbox diag to scale plane epsilon so it works for both 1m and 100m models
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const diag = bb ? Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) : 1;
    const planeEps = Math.max(0.001, diag * PLANE_EPS_RATIO);

    const triangles = [];
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const triNormal = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

    for (let t = 0; t < triCount; t++) {
      let ia, ib, ic;
      if (indexAttr) {
        ia = indexAttr.getX(t * 3);
        ib = indexAttr.getX(t * 3 + 1);
        ic = indexAttr.getX(t * 3 + 2);
      } else {
        ia = t * 3; ib = t * 3 + 1; ic = t * 3 + 2;
      }
      va.fromBufferAttribute(positionAttr, ia).applyMatrix4(matrix);
      vb.fromBufferAttribute(positionAttr, ib).applyMatrix4(matrix);
      vc.fromBufferAttribute(positionAttr, ic).applyMatrix4(matrix);

      e1.subVectors(vb, va);
      e2.subVectors(vc, va);
      triNormal.crossVectors(e1, e2);
      if (triNormal.lengthSq() < 1e-12) continue;
      triNormal.normalize();

      // Same orientation (allow either direction)?
      const dot = Math.abs(triNormal.dot(refNormal));
      if (dot < 1 - NORMAL_EPS) continue;

      // On same plane? Distance from refPoint along refNormal.
      const dist = Math.abs(refNormal.dot(va.clone().sub(refPoint)));
      if (dist > planeEps) continue;

      triangles.push([va.clone(), vb.clone(), vc.clone()]);
    }
    return triangles;
  }

  // -------------------- Edge outlines --------------------

  /** Toggle the screen-space edges pass on/off. */
  setEdgesVisible(visible) {
    this._edgesVisible = !!visible;
    if (this._edgesPass) this._edgesPass.enabled = this._edgesVisible;
    // Selection-overlay LineSegments (the orange highlight on selected items)
    // stay visible regardless — they're per-mesh and the user explicitly
    // selected them.
  }

  /** Returns current edge visibility. */
  getEdgesVisible() {
    return this._edgesVisible;
  }

  _applyPlanesToAllMeshes(planes) {
    for (const { meshes } of this._models.values()) {
      for (const mesh of meshes) {
        mesh.material.clippingPlanes = planes;
        mesh.material.clipShadows = planes.length > 0;
        mesh.material.needsUpdate = true;
      }
    }
  }

  _ensureVisuals() {
    if (!this._sectionVisuals) {
      this._sectionVisuals = new SectionVisuals(this._scene);
    }
  }

  /** Raycast at client coords; returns world-space [x,y,z] of first mesh hit, or null. */
  raycastPoint(clientX, clientY) {
    const hit = selectAt(this._scene, this._camera, this._canvas, clientX, clientY);
    if (!hit || !hit.point) return null;
    return [hit.point.x, hit.point.y, hit.point.z];
  }

  /** Pure math — Euclidean distance. */
  measureDistance(p1, p2) { return distance(p1, p2); }

  /** Pure math — angle at vertex p2 in degrees. */
  measureAngle(p1, p2, p3) { return angle(p1, p2, p3); }

  /** Pure math — polygon area via best-fit plane projection. */
  measureArea(points) { return polygonArea(points); }

  /** Lazy-init MeasureVisuals; returns instance. */
  getMeasureVisuals() {
    if (!this._measureVisuals) {
      this._measureVisuals = new MeasureVisuals(this._scene, this._canvas, this._camera);
    }
    return this._measureVisuals;
  }

  /** Show measure snap-point hover preview at world point. */
  showMeasureSnapPreview(point, type) {
    this.getMeasureVisuals().showSnapPreview(point, type);
  }
  hideMeasureSnapPreview() {
    if (this._measureVisuals) this._measureVisuals.hideSnapPreview();
  }

  /**
   * Find the nearest vertex (in screen space) of the hovered mesh within
   * `thresholdPx` of the cursor. Returns world-space [x,y,z] or null.
   * Used for snap-to-vertex during measure.
   */
  snapToVertex(clientX, clientY, thresholdPx = 18) {
    const hits = this._raycastFull(clientX, clientY);
    if (hits.length === 0) return null;
    const { mesh } = hits[0];
    const geom = mesh.geometry;
    const positionAttr = geom.attributes.position;
    if (!positionAttr) return null;

    mesh.updateMatrixWorld();
    const matrix = mesh.matrixWorld;
    const rect = this._canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const camera = this._camera;
    const v = new THREE.Vector3();
    let bestDist2 = thresholdPx * thresholdPx;
    let bestPoint = null;

    for (let i = 0; i < positionAttr.count; i++) {
      v.fromBufferAttribute(positionAttr, i).applyMatrix4(matrix);
      const proj = v.clone().project(camera);
      const sx = (proj.x * 0.5 + 0.5) * w + rect.left;
      const sy = (-proj.y * 0.5 + 0.5) * h + rect.top;
      const dx = sx - clientX;
      const dy = sy - clientY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestPoint = [v.x, v.y, v.z];
      }
    }
    return bestPoint;
  }

  /**
   * Phase 6.6.1 — Multi-type snap (vertex / midpoint / center / edge /
   * perpendicular / intersection). Returns null if no snap within threshold.
   *
   * @param {number} clientX
   * @param {number} clientY
   * @param {{
   *   enabled?: Array<'vertex'|'midpoint'|'center'|'edge'|'perpendicular'|'intersection'>,
   *   thresholdPx?: number,
   *   lastPoint?: [number, number, number],   // for perpendicular
   * }} opts
   * @returns {{ point: [number, number, number], type: string, distancePx: number } | null}
   */
  snapAt(clientX, clientY, opts = {}) {
    const enabled = new Set(opts.enabled || ['vertex', 'midpoint', 'center', 'edge']);
    const thresholdPx = opts.thresholdPx ?? 18;
    const hits = this._raycastFull(clientX, clientY);
    if (hits.length === 0) return null;
    const { hit, mesh } = hits[0];

    mesh.updateMatrixWorld();
    const matrix = mesh.matrixWorld;
    const rect = this._canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const camera = this._camera;

    const projectToScreen = (p) => {
      const proj = p.clone().project(camera);
      return {
        x: (proj.x * 0.5 + 0.5) * w + rect.left,
        y: (-proj.y * 0.5 + 0.5) * h + rect.top,
      };
    };
    const screenDist2 = (p) => {
      const s = projectToScreen(p);
      const dx = s.x - clientX, dy = s.y - clientY;
      return dx * dx + dy * dy;
    };

    // Priority order — earlier types win ties
    const PRIORITY = ['vertex', 'intersection', 'midpoint', 'center', 'perpendicular', 'edge'];
    const candidates = []; // { point, type, dist2 }

    // Vertex candidates
    if (enabled.has('vertex')) {
      const positionAttr = mesh.geometry.attributes.position;
      if (positionAttr) {
        const v = new THREE.Vector3();
        for (let i = 0; i < positionAttr.count; i++) {
          v.fromBufferAttribute(positionAttr, i).applyMatrix4(matrix);
          const d2 = screenDist2(v);
          if (d2 < thresholdPx * thresholdPx) {
            candidates.push({ point: [v.x, v.y, v.z], type: 'vertex', dist2: d2 });
          }
        }
      }
    }

    // Edge / midpoint / perpendicular / nearest-on-edge candidates
    // Lazy-build EdgesGeometry on demand (snap may be the first consumer
    // for a given mesh). Apply the mesh's worldMatrix to the edge buffer
    // because the underlying BufferGeometry is in mesh-local space.
    const edgeGeom = this._lazyEdgeGeometry(mesh);
    if (edgeGeom && edgeGeom.attributes?.position) {
      const ePos = edgeGeom.attributes.position;
      mesh.updateMatrixWorld();
      const eMatrix = mesh.matrixWorld;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();

      // For perpendicular: precompute lastPoint as Vector3
      const lp = opts.lastPoint ? new THREE.Vector3(...opts.lastPoint) : null;

      // Collect screen-space segments for intersection check (only if needed)
      const segs = (enabled.has('intersection')) ? [] : null;

      for (let i = 0; i < ePos.count; i += 2) {
        a.fromBufferAttribute(ePos, i).applyMatrix4(eMatrix);
        b.fromBufferAttribute(ePos, i + 1).applyMatrix4(eMatrix);

        if (enabled.has('midpoint')) {
          const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
          const d2 = screenDist2(mid);
          if (d2 < thresholdPx * thresholdPx) {
            candidates.push({ point: [mid.x, mid.y, mid.z], type: 'midpoint', dist2: d2 });
          }
        }

        if (enabled.has('edge')) {
          // Closest point on segment to the cursor in 3D using ray.distanceToSegment
          const ndcX = ((clientX - rect.left) / w) * 2 - 1;
          const ndcY = -((clientY - rect.top) / h) * 2 + 1;
          const ray = new THREE.Raycaster();
          ray.setFromCamera({ x: ndcX, y: ndcY }, camera);
          const closest = new THREE.Vector3();
          ray.ray.distanceSqToSegment(a, b, null, closest);
          const d2 = screenDist2(closest);
          if (d2 < thresholdPx * thresholdPx) {
            candidates.push({ point: [closest.x, closest.y, closest.z], type: 'edge', dist2: d2 });
          }
        }

        if (enabled.has('perpendicular') && lp) {
          // Foot of perpendicular from lp onto segment ab
          const ab = new THREE.Vector3().subVectors(b, a);
          const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(lp, a).dot(ab) / ab.lengthSq()));
          const foot = new THREE.Vector3().copy(ab).multiplyScalar(t).add(a);
          const d2 = screenDist2(foot);
          if (d2 < thresholdPx * thresholdPx) {
            candidates.push({ point: [foot.x, foot.y, foot.z], type: 'perpendicular', dist2: d2 });
          }
        }

        if (segs) {
          const sa = projectToScreen(a);
          const sb = projectToScreen(b);
          segs.push({ a3: a.clone(), b3: b.clone(), sa, sb });
        }
      }

      // Intersection: only segments whose screen extent passes near the cursor
      if (segs && segs.length > 1) {
        const near = segs.filter(s => {
          const cx = (s.sa.x + s.sb.x) * 0.5;
          const cy = (s.sa.y + s.sb.y) * 0.5;
          const dx = cx - clientX, dy = cy - clientY;
          return dx * dx + dy * dy < (thresholdPx * 4) * (thresholdPx * 4);
        });
        for (let i = 0; i < near.length; i++) {
          for (let j = i + 1; j < near.length; j++) {
            const isect = _intersectSegmentsScreen(near[i].sa, near[i].sb, near[j].sa, near[j].sb);
            if (!isect) continue;
            const dx = isect.x - clientX, dy = isect.y - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 >= thresholdPx * thresholdPx) continue;
            // Lift screen-intersection back into 3D using midpoint between two
            // segments' closest 3D points (approximation — works for actual
            // intersections, ~ok for near-misses).
            const mid3 = _segmentSegmentClosestMidpoint(near[i].a3, near[i].b3, near[j].a3, near[j].b3);
            if (!mid3) continue;
            candidates.push({ point: [mid3.x, mid3.y, mid3.z], type: 'intersection', dist2: d2 });
          }
        }
      }
    }

    // Center candidate: centroid of coplanar triangles around the hit
    if (enabled.has('center')) {
      const tris = this._collectCoplanarTriangles(mesh, hit);
      if (tris.length > 0) {
        let cx = 0, cy = 0, cz = 0, n = 0;
        for (const [a, b, c] of tris) {
          cx += (a.x + b.x + c.x);
          cy += (a.y + b.y + c.y);
          cz += (a.z + b.z + c.z);
          n += 3;
        }
        if (n > 0) {
          const center = new THREE.Vector3(cx / n, cy / n, cz / n);
          const d2 = screenDist2(center);
          if (d2 < thresholdPx * thresholdPx) {
            candidates.push({ point: [center.x, center.y, center.z], type: 'center', dist2: d2 });
          }
        }
      }
    }

    if (candidates.length === 0) return null;

    // Pick by priority first, then closest within type
    candidates.sort((a, b) => {
      const pa = PRIORITY.indexOf(a.type);
      const pb = PRIORITY.indexOf(b.type);
      if (pa !== pb) return pa - pb;
      return a.dist2 - b.dist2;
    });
    const best = candidates[0];
    return { point: best.point, type: best.type, distancePx: Math.sqrt(best.dist2) };
  }

  /**
   * Compute total area of a face hit at client coords — collects coplanar
   * triangles from the mesh and sums triangle areas.
   * Returns { area, triangles } or null if no hit.
   */
  measureFaceAreaAtClient(clientX, clientY) {
    const hits = this._raycastFull(clientX, clientY);
    if (hits.length === 0) return null;
    const { hit, mesh } = hits[0];
    const triangles = this._collectCoplanarTriangles(mesh, hit);
    if (triangles.length === 0) return null;
    let area = 0;
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cross = new THREE.Vector3();
    for (const [a, b, c] of triangles) {
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      cross.crossVectors(e1, e2);
      area += cross.length() * 0.5;
    }
    return { area, triangles };
  }

  /**
   * Event emitter API.
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(callback);
  }

  /** Remove a listener. */
  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) set.delete(callback);
  }

  /** Internal: dispatch event to all listeners. */
  _emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try { cb(payload); } catch (err) { console.error(`listener for ${event} threw:`, err); }
    }
  }

  /** Internal: find a mesh by (modelId, expressId). Returns null if missing. */
  _findMesh(modelId, expressId) {
    const m = this._models.get(modelId);
    if (!m) return null;
    return m.meshes.find(mesh => mesh.userData.expressId === expressId) || null;
  }

  /**
   * Move camera to fit a single entity's bbox in view.
   * No animation — snaps. (Smoothing in Phase 6+.)
   *
   * @param {string} modelId
   * @param {number} expressId
   */
  focusEntity(modelId, expressId) {
    const mesh = this._findMesh(modelId, expressId);
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);  // guard against zero-size
    const distance = this._fitDistance(maxDim, 2.0);  // 2× padding (more space around target)

    const direction = new THREE.Vector3(1, 1, 1).normalize();
    this._camera.position.copy(center).add(direction.multiplyScalar(distance));
    this._camera.lookAt(center);
    this._controls.target.copy(center);
    this._controls.update();
  }

  /**
   * Apply a translation offset to a model's THREE.Group.
   * Used by federation logic to align/separate models in scene.
   *
   * @param {string} modelId
   * @param {[number, number, number]} offset
   */
  applyFederationOffset(modelId, offset) {
    const m = this._models.get(modelId);
    if (!m) return;
    // Reset matrix mode if previously set by applyGeorefTransform
    if (!m.group.matrixAutoUpdate) {
      m.group.matrixAutoUpdate = true;
      m.group.rotation.set(-Math.PI / 2, 0, 0);
      m.group.scale.set(1, 1, 1);
    }
    m.group.position.set(offset[0], offset[1], offset[2]);
  }

  /**
   * Phase 6.9.2 — Apply IFC MapConversion to position model in real-world
   * coords. The transform built in IFC frame is:
   *   T(eastings, northings, height) · Rz(rotationDeg) · S(scale)
   * Then the false origin is subtracted (in IFC frame) to keep coords near
   * 0 for WebGL float precision. Finally, premultiplied by the IFC→Three
   * Y-up rotation that the model group normally has.
   *
   * @param {string} modelId
   * @param {{eastings, northings, orthogonalHeight, rotationDeg, scale}} mc
   * @param {[number,number,number]|null} falseOrigin — subtracted in IFC frame
   */
  applyGeorefTransform(modelId, mc, falseOrigin) {
    const m = this._models.get(modelId);
    if (!m || !mc) return;
    const E = mc.eastings || 0;
    const N = mc.northings || 0;
    const H = mc.orthogonalHeight || 0;
    const rot = (mc.rotationDeg || 0) * Math.PI / 180;
    const s = mc.scale || 1;

    // M = T · Rz · S in IFC frame
    const mat = new THREE.Matrix4().makeRotationZ(rot);
    mat.scale(new THREE.Vector3(s, s, s));
    mat.setPosition(E, N, H);

    // Subtract false origin (in IFC frame)
    if (falseOrigin) {
      const T = new THREE.Matrix4().makeTranslation(
        -(falseOrigin[0] || 0), -(falseOrigin[1] || 0), -(falseOrigin[2] || 0)
      );
      mat.premultiply(T);
    }

    // IFC Z-up → Three.js Y-up rotation (the rotation normally applied as
    // group.rotation.x = -π/2)
    const ifcToThree = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    mat.premultiply(ifcToThree);

    m.group.matrixAutoUpdate = false;
    m.group.matrix.copy(mat);
    m.group.matrixWorldNeedsUpdate = true;
  }

  /** Revert group matrix back to default IFC→Three rotation + zero offset. */
  resetGroupTransform(modelId) {
    const m = this._models.get(modelId);
    if (!m) return;
    m.group.matrixAutoUpdate = true;
    m.group.position.set(0, 0, 0);
    m.group.rotation.set(-Math.PI / 2, 0, 0);
    m.group.scale.set(1, 1, 1);
    m.group.updateMatrix();
  }

  // -------------------- Screenshot (Phase 6.5.2) --------------------

  takeScreenshot(opts) {
    return captureCanvas(this, opts || {});
  }

  /** Phase 6.7 — clash detection. */
  detectClashes(opts) {
    return _detectClashes(this, opts || {});
  }

  // -------------------- Alignments (Phase 6.8.2) --------------------

  _ensureAlignmentVisuals() {
    if (!this._alignmentVisuals) this._alignmentVisuals = new AlignmentVisuals(this);
  }

  /**
   * Load LandXML text → returns array of alignment ids (one per <Alignment> in file).
   * @param {string} xmlText
   * @param {{ swapXY?: boolean, chordTol?: number }} [opts]
   */
  loadAlignment(xmlText, opts = {}) {
    const parsed = parseLandXmlAlignments(xmlText, opts);
    this._ensureAlignmentVisuals();
    const ids = [];
    for (const a of parsed) {
      const id = `align_${++this._alignmentIdCounter}`;
      const sampled = sampleAlignment(a, opts);
      this._alignments.set(id, { meta: a, sampled });
      this._alignmentVisuals.add(id, sampled);
      ids.push(id);
    }
    return ids;
  }

  /** @returns {Array<{id, name, length, staStart, staEnd, elementCount}>} */
  getAlignments() {
    const out = [];
    for (const [id, a] of this._alignments) {
      const stations = a.sampled.stations;
      out.push({
        id,
        name: a.meta.name,
        length: a.meta.length,
        staStart: stations[0] || 0,
        staEnd: stations[stations.length - 1] || 0,
        elementCount: a.meta.elements.length,
      });
    }
    return out;
  }

  /** Returns full polyline points for an alignment (world coords, IFC Z-up). */
  getAlignmentPolyline(alignmentId) {
    const a = this._alignments.get(alignmentId);
    return a ? a.sampled.points.map(p => [...p]) : [];
  }

  /**
   * Phase 6.11 — Add a pre-parsed IFC alignment to the registry.
   * Engine layer parses the IFC entities (it has entityIndex) and passes
   * the parsed alignment object here.
   */
  addParsedAlignment(parsedAlignment, opts = {}) {
    if (!parsedAlignment || !parsedAlignment.elements?.length) return null;
    const sampled = sampleAlignment(parsedAlignment, opts);
    this._ensureAlignmentVisuals();
    const id = `align_ifc_${++this._alignmentIdCounter}`;
    this._alignments.set(id, { meta: parsedAlignment, sampled });
    this._alignmentVisuals.add(id, sampled);
    return id;
  }

  // -------------------- Basemap (Phase 6.15) --------------------

  _ensureBasemap() {
    if (!this._basemap) this._basemap = new BasemapVisuals(this);
    return this._basemap;
  }

  async showBasemap(opts) {
    const bm = this._ensureBasemap();
    return bm.show(opts);
  }

  setBasemapOpacity(opacity) {
    if (this._basemap) this._basemap.setOpacity(opacity);
  }

  setBasemapVisible(visible) {
    if (this._basemap) this._basemap.setVisible(visible);
  }

  clearBasemap() {
    if (this._basemap) this._basemap.clear();
  }

  getBasemapState() {
    return this._basemap ? this._basemap.getState() : { provider: null, opacity: 0, tileCount: 0, visible: false };
  }

  static getBasemapProviders() {
    return _getProviders();
  }

  // -------------------- Terrain (Phase 6.15.2) --------------------

  _ensureTerrain() {
    if (!this._terrain) this._terrain = new TerrainVisuals(this);
    return this._terrain;
  }

  showTerrain(terrainData, opts) {
    const t = this._ensureTerrain();
    t.show(terrainData, opts);
  }

  setTerrainOpacity(opacity) { if (this._terrain) this._terrain.setOpacity(opacity); }
  setTerrainWireframe(show) { if (this._terrain) this._terrain.setWireframe(show); }
  setTerrainVisible(visible) { if (this._terrain) this._terrain.setVisible(visible); }
  clearTerrain() { if (this._terrain) this._terrain.clear(); }

  getTerrainData() { return this._terrain ? this._terrain.getTerrainData() : null; }
  getTerrainState() { return this._terrain ? this._terrain.getState() : { visible: false }; }

  /**
   * Phase 6.8.4 — Create a free-form alignment from a list of clicked world
   * points. Useful when the user wants to take sections along an arbitrary
   * curve (e.g. existing utility line, drainage path) without LandXML.
   *
   * @param {Array<[x,y,z]>} worldPoints — clicked points in Three.js world coords
   * @param {{
   *   name?: string,
   *   interpolation?: 'linear'|'catmull-rom',
   * }} opts
   * @returns {string|null} alignment id, null on failure
   */
  createFreeCurveFromPoints(worldPoints, opts = {}) {
    if (!Array.isArray(worldPoints) || worldPoints.length < 2) return null;

    // World (Three.js Y-up) → alignment frame (IFC Z-up): (x, y, z) → (x, -z, y)
    // After alignment-visuals applies group rotation -π/2 around X:
    //   (x, -z, y) → (x, y, z) — back to world. Stations preserved (rotation rigid).
    const alignFrame = worldPoints.map(p => [p[0], -p[2], p[1]]);

    const interpolation = opts.interpolation || 'linear';
    let positions;
    if (interpolation === 'catmull-rom' && alignFrame.length >= 4) {
      const v3s = alignFrame.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(v3s, false, 'catmullrom', 0.5);
      const N = 50 * (alignFrame.length - 1);
      const pts = curve.getPoints(N);
      positions = pts.map(p => [p.x, p.y, p.z]);
    } else {
      // Linear: keep input points as-is
      positions = alignFrame.map(p => [...p]);
    }

    // Compute stations + tangents
    const stations = [0];
    for (let i = 1; i < positions.length; i++) {
      stations.push(stations[i - 1] + Math.hypot(
        positions[i][0] - positions[i - 1][0],
        positions[i][1] - positions[i - 1][1],
        positions[i][2] - positions[i - 1][2],
      ));
    }
    const tangents = [];
    for (let i = 0; i < positions.length; i++) {
      let dx, dy, dz;
      if (i === 0) {
        dx = positions[1][0] - positions[0][0];
        dy = positions[1][1] - positions[0][1];
        dz = positions[1][2] - positions[0][2];
      } else if (i === positions.length - 1) {
        dx = positions[i][0] - positions[i - 1][0];
        dy = positions[i][1] - positions[i - 1][1];
        dz = positions[i][2] - positions[i - 1][2];
      } else {
        dx = (positions[i + 1][0] - positions[i - 1][0]) / 2;
        dy = (positions[i + 1][1] - positions[i - 1][1]) / 2;
        dz = (positions[i + 1][2] - positions[i - 1][2]) / 2;
      }
      const len = Math.hypot(dx, dy, dz) || 1;
      tangents.push([dx / len, dy / len, dz / len]);
    }

    const sampled = { points: positions, stations, tangents, elementIndex: positions.map(() => 0) };
    const length = stations[stations.length - 1] || 0;
    const meta = {
      name: opts.name || `Volná křivka ${this._alignmentIdCounter + 1}`,
      length,
      staStart: 0,
      elements: [{
        type: 'free',
        interpolation,
        controlPoints: alignFrame,
        startStation: 0,
        endStation: length,
        length,
      }],
    };

    this._ensureAlignmentVisuals();
    const id = `align_free_${++this._alignmentIdCounter}`;
    this._alignments.set(id, { meta, sampled });
    this._alignmentVisuals.add(id, sampled);
    return id;
  }

  /**
   * Create a section plane perpendicular to an alignment at a given station.
   *
   * @param {string} alignmentId
   * @param {number} station — linear distance along alignment
   * @param {'plan'|'3d'|'longitudinal'} perpType
   *   plan         — vertical plane perpendicular to horizontal projection
   *                  of tangent (classic cross-section, ⟂ k půdorysu)
   *   3d           — true 3D perpendicular (includes vertical slope)
   *   longitudinal — vertical plane CONTAINING the alignment (podélný řez)
   * @returns {string|null} section plane id, or null if alignment/station bad
   */
  createSectionAtStation(alignmentId, station, perpType = 'plan') {
    const a = this._alignments.get(alignmentId);
    if (!a) return null;
    const sp = pointAtStation(a.sampled, station);
    if (!sp) return null;

    // Alignment frame (X=East, Y=North, Z=Elev) → world frame after the
    // -π/2 X rotation applied by alignment-visuals (matches IFC model group):
    //   alignment (x, y, z) → world (x, z, -y)
    const [px, py, pz] = sp.point;
    const [tx, ty, tz] = sp.tangent;
    const worldPoint = [px, pz, -py];
    const worldTangent = [tx, tz, -ty];

    let normal;
    if (perpType === '3d') {
      const len = Math.hypot(worldTangent[0], worldTangent[1], worldTangent[2]);
      normal = len > 1e-9 ? worldTangent.map(c => c / len) : [1, 0, 0];
    } else if (perpType === 'longitudinal') {
      // Plane contains tangent + world up; normal = cross(tangent, up).
      // up = (0, 1, 0). cross(t, up) = (-t.z, 0, t.x) but we want a horizontal
      // perpendicular to tangent — verified for east-going alignment yields
      // (0, 0, 1) → which is alignment-north direction in world.
      const [a, _b, c] = worldTangent;
      const len = Math.hypot(c, a);
      normal = len > 1e-9 ? [-c / len, 0, a / len] : [0, 0, 1];
    } else {
      // 'plan' — horizontal projection of tangent (drop world Y component)
      const [a, _b, c] = worldTangent;
      const len = Math.hypot(a, c);
      normal = len > 1e-9 ? [a / len, 0, c / len] : [1, 0, 0];
    }

    return this.addSectionPlane(worldPoint, normal);
  }

  /** Returns {point, tangent} at a given station, or null if alignment unknown. */
  getAlignmentPointAtStation(alignmentId, station) {
    const a = this._alignments.get(alignmentId);
    if (!a) return null;
    const pt = pointAtStation(a.sampled, station);
    if (!pt) return null;
    if (this._alignmentVisuals) this._alignmentVisuals.setActiveStation(alignmentId, station);
    return pt;
  }

  setAlignmentVisible(alignmentId, visible) {
    if (this._alignmentVisuals) this._alignmentVisuals.setVisible(alignmentId, visible);
  }

  removeAlignment(alignmentId) {
    this._alignments.delete(alignmentId);
    if (this._alignmentVisuals) this._alignmentVisuals.remove(alignmentId);
  }

  clearAlignments() {
    this._alignments.clear();
    if (this._alignmentVisuals) this._alignmentVisuals.clear();
  }

  /**
   * Phase 6.8.1 — Compute section curves for a plane (by id or full spec).
   * Returns per-entity loops that can be exported to DXF.
   */
  computeSectionCurves(planeIdOrSpec) {
    let spec;
    if (typeof planeIdOrSpec === 'string') {
      const e = this._sectionPlanesList.find(p => p.id === planeIdOrSpec);
      if (!e) return [];
      spec = { plane: e.plane };
    } else {
      spec = planeIdOrSpec;
    }
    return _computeSectionCurves(this, spec);
  }

  takeViewportScreenshot(opts) {
    const container = this._canvas.parentElement || this._canvas;
    return captureViewport(container, opts || {});
  }

  // -------------------- Walk mode (Phase 6.5.1) --------------------

  _ensureWalkMode() {
    if (!this._walkMode) this._walkMode = new WalkMode(this);
  }

  startWalk(opts = {}) {
    this._ensureWalkMode();
    if (typeof opts.gravity === 'boolean') this._walkMode.setGravityEnabled(opts.gravity);
    this._walkMode.start();
  }

  stopWalk() {
    if (this._walkMode) this._walkMode.stop();
  }

  isWalking() {
    return !!this._walkMode?.isActive();
  }

  // -------------------- Pins (Phase 6.4.1) --------------------

  _ensurePinVisuals() {
    if (!this._pinVisuals) this._pinVisuals = new PinVisuals(this);
  }

  /**
   * Add a pin to the scene.
   * @param {{
   *   id?: string, type: 'point'|'line'|'bbox'|'entity',
   *   color?: number, label?: string,
   *   point?: [x,y,z], from?: [x,y,z], to?: [x,y,z],
   *   min?: [x,y,z], max?: [x,y,z],
   *   modelId?: string, expressId?: number,
   * }} spec
   * @returns {string} pin id
   */
  addPin(spec) {
    this._ensurePinVisuals();
    const id = spec.id || `pin_${++this._pinIdCounter}`;
    const pin = { ...spec, id };
    this._pins.set(id, pin);
    this._pinVisuals.addPin(pin);
    return id;
  }

  updatePin(id, opts) {
    const existing = this._pins.get(id);
    if (!existing) return;
    const merged = { ...existing, ...opts, id };
    this._pins.set(id, merged);
    this._pinVisuals.addPin(merged); // re-creates the node
  }

  removePin(id) {
    if (!this._pinVisuals) return;
    this._pins.delete(id);
    this._pinVisuals.removePin(id);
  }

  clearPins() {
    if (!this._pinVisuals) return;
    this._pins.clear();
    this._pinVisuals.clear();
  }

  /** @returns {Array<pinSpec>} */
  getPins() {
    return [...this._pins.values()];
  }

  // -------------------- Computed quantities (Phase 6.3.2) --------------------

  /**
   * Compute geometric quantities (volume, surfaceArea, bbox dims, triangleCount)
   * from an entity's mesh geometry. Aggregates across all meshes if entity has
   * multiple representations.
   *
   * Volume uses signed-tetrahedron formula — only correct for closed manifold
   * meshes. Open meshes give an approximate / signed result.
   *
   * @param {string} modelId
   * @param {number} expressId
   * @returns {{volume, surfaceArea, bboxWidth, bboxHeight, bboxDepth, triangleCount} | null}
   */
  computeMeshQuantities(modelId, expressId) {
    const m = this._models.get(modelId);
    if (!m) return null;
    const meshes = m.meshes.filter(mesh =>
      mesh.userData.modelId === modelId && mesh.userData.expressId === expressId);
    if (meshes.length === 0) return null;

    let volume = 0;
    let surfaceArea = 0;
    let triangleCount = 0;
    const bbox = new THREE.Box3();

    for (const mesh of meshes) {
      const geom = mesh.geometry;
      if (!geom) continue;
      const pos = geom.attributes.position;
      if (!pos) continue;
      const idx = geom.index;
      const triCount = idx ? idx.count / 3 : pos.count / 3;
      triangleCount += triCount;

      // Bbox in world coords (mesh has matrixWorld from group rotation + transforms)
      mesh.updateMatrixWorld(true);
      const meshBox = new THREE.Box3().setFromBufferAttribute(pos);
      meshBox.applyMatrix4(mesh.matrixWorld);
      bbox.union(meshBox);

      // Volume + surface area in LOCAL coords (model units, pre-rotation).
      // Group rotation is rigid (no scale), so volume/area are preserved.
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const ab = new THREE.Vector3();
      const ac = new THREE.Vector3();
      const cross = new THREE.Vector3();

      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3)     : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0);
        b.fromBufferAttribute(pos, i1);
        c.fromBufferAttribute(pos, i2);
        // Volume: signed tetra (origin, a, b, c) = (a · (b × c)) / 6
        ab.copy(b).sub(a);
        ac.copy(c).sub(a);
        cross.crossVectors(ab, ac);
        surfaceArea += cross.length() * 0.5;
        // Signed tetra vol from origin: a · (b × c) / 6
        // Use position vectors directly for signed volume sum.
        const v = a.x * (b.y * c.z - b.z * c.y)
                + a.y * (b.z * c.x - b.x * c.z)
                + a.z * (b.x * c.y - b.y * c.x);
        volume += v;
      }
    }
    volume = Math.abs(volume) / 6;

    return {
      volume,
      surfaceArea,
      bboxWidth: bbox.isEmpty() ? 0 : bbox.max.x - bbox.min.x,
      bboxHeight: bbox.isEmpty() ? 0 : bbox.max.y - bbox.min.y,
      bboxDepth: bbox.isEmpty() ? 0 : bbox.max.z - bbox.min.z,
      triangleCount,
    };
  }

  // -------------------- State snapshot (Phase 6.1.4 viewpoints) --------------------

  getCameraState() {
    const pos = this._camera.position;
    const tgt = this._controls.target;
    const up = this._camera.up;
    const state = {
      position: [pos.x, pos.y, pos.z],
      target: [tgt.x, tgt.y, tgt.z],
      up: [up.x, up.y, up.z],
      projection: this._camera.isOrthographicCamera ? 'orthographic' : 'perspective',
    };
    if (this._camera.isPerspectiveCamera) state.fov = this._camera.fov;
    if (this._camera.isOrthographicCamera) state.zoom = this._camera.zoom;
    return state;
  }

  setCameraState(state) {
    if (!state) return;
    if (state.projection === 'orthographic' && this._camera.isPerspectiveCamera) {
      this.setProjection('orthographic');
    } else if (state.projection === 'perspective' && this._camera.isOrthographicCamera) {
      this.setProjection('perspective');
    }
    if (Array.isArray(state.position)) this._camera.position.set(...state.position);
    if (Array.isArray(state.up)) this._camera.up.set(...state.up);
    if (Array.isArray(state.target)) this._controls.target.set(...state.target);
    if (this._camera.isOrthographicCamera && typeof state.zoom === 'number') {
      this._camera.zoom = state.zoom;
    }
    this._camera.updateProjectionMatrix();
    this._controls.update();
  }

  /** @returns {Array<{modelId, expressId}>} entities currently hidden. */
  getHiddenEntityIds() {
    const out = [];
    for (const { meshes } of this._models.values()) {
      for (const mesh of meshes) {
        if (mesh.visible === false) {
          out.push({ modelId: mesh.userData.modelId, expressId: mesh.userData.expressId });
        }
      }
    }
    return out;
  }

  /**
   * @returns {Array<{modelId, expressId, alpha}>} entities with explicit
   * per-entity opacity overrides (NOT mode-driven opacity).
   */
  getOpacityEntries() {
    const out = [];
    for (const [mesh, alpha] of this._entityOpacity) {
      out.push({
        modelId: mesh.userData.modelId,
        expressId: mesh.userData.expressId,
        alpha,
      });
    }
    return out;
  }

  /** @returns {Array<{modelId, expressId, color}>} currently highlighted entities. */
  getHighlightedIds() {
    const out = [];
    for (const mesh of this._highlights.keys()) {
      out.push({
        modelId: mesh.userData.modelId,
        expressId: mesh.userData.expressId,
        color: mesh.material.color.getHex(),
      });
    }
    return out;
  }

  /** Cleanup — stop render loop, dispose renderer + all model geometries. */
  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    for (const modelId of [...this._models.keys()]) {
      this.removeModel(modelId);
    }
    this._controls.dispose();
    // PostPipeline.dispose() disposes registered passes too (including EdgesPass).
    if (this._pipeline) this._pipeline.dispose();
    this._renderer.dispose();
  }
}

// ---- Phase 6.6.1 snap helpers ----

/** Returns 2D intersection point of segments (sa→sb) and (sa2→sb2) or null. */
function _intersectSegmentsScreen(sa, sb, sa2, sb2) {
  const d1x = sb.x - sa.x, d1y = sb.y - sa.y;
  const d2x = sb2.x - sa2.x, d2y = sb2.y - sa2.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-6) return null;
  const dx = sa2.x - sa.x, dy = sa2.y - sa.y;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: sa.x + d1x * t, y: sa.y + d1y * t };
}

/** Midpoint of the closest pair of points on two 3D segments. */
function _segmentSegmentClosestMidpoint(a1, b1, a2, b2) {
  const d1 = b1.clone().sub(a1);
  const d2 = b2.clone().sub(a2);
  const r = a1.clone().sub(a2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) { s = 0; t = 0; }
  else if (a < 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = d1.dot(r);
    if (e < 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      if (Math.abs(denom) < 1e-9) s = 0;
      else s = Math.max(0, Math.min(1, (b * f - c * e) / denom));
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const p1 = d1.multiplyScalar(s).add(a1);
  const p2 = d2.multiplyScalar(t).add(a2);
  return p1.add(p2).multiplyScalar(0.5);
}
