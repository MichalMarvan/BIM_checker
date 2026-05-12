// IFC Engine — public API facade.
// Phase 0: parser-only. No 3D rendering, no events, no selection.
// Add: events + viewer in Phase 1.

import { EntityIndex } from './parser/entity-index.js';
import { ViewerCore } from './viewer/viewer-core.js';
import { extractPropertiesFor } from './properties/psets.js';
import { extractSpatialHierarchy, collectAllElementIds } from './properties/spatial.js';
import { extractIfcQuantities } from './properties/quantities.js';
import { extractCoords } from './coords/geo-coords.js';
import { computeOffsets } from './coords/federation.js';
import { reprojectPoint, parseEpsgCode, toLatLon } from './coords/crs-reproject.js';
import { findIfcAlignments as _findIfcAlignments, parseIfcAlignment } from './alignment/ifc-alignment-parser.js';
import { computeDiff as _computeDiff } from './diff/diff-engine.js';
import { indexModel, searchChunks, dropModelCache } from './rag/rag-index.js';
import { embed as _embed, onLoadProgress as _onRagLoadProgress } from './rag/rag-embedder.js';
import { parseScheduleCsv } from './schedule/csv-parser.js';
import { parseMsProjectXml } from './schedule/msproject-xml-parser.js';
import { parseP6Xer } from './schedule/p6-xer-parser.js';
import { findIfcWorkSchedules as _findIfcWorkSchedules, parseIfcWorkSchedule } from './schedule/ifc-workschedule-parser.js';
import { computeEntityStatusMap, resolveRuleLinks, STATUS_COLORS } from './schedule/timeline-engine.js';
import { parseLandXmlSurfaces } from './terrain/landxml-surface-parser.js';
import { parseGeoTiff } from './terrain/geotiff-parser.js';
import { findTerrainEntities, extractTerrainFromIfc } from './terrain/ifc-geographic-element-parser.js';
import { PRODUCT_TYPES, PRODUCT_TYPES_INCLUDING_SPATIAL } from './constants.js';
import { extractEntityName, extractEntityGuid } from './parser/entity-name.js';
import { buildStyleIndex } from './geometry/styled-items.js';

let _modelCounter = 0;
function generateModelId() {
  return `m_${Date.now().toString(36)}_${(++_modelCounter).toString(36)}`;
}

export class IfcEngine {
  /**
   * @param {{ workerUrl?: string }} options
   *   workerUrl — path to parser.worker.js (default: relative to engine)
   */
  constructor(options = {}) {
    this._workerUrl = options.workerUrl || new URL('./workers/parser.worker.js', import.meta.url).href;
    this._models = new Map();   // Map<modelId, { meta, index }>
    this._viewer = options.canvas ? new ViewerCore(options.canvas) : null;
    this._coordsCache = new Map();        // modelId → CoordsData
    this._federationMode = 'auto';
    this._manualOffsets = new Map();      // modelId → [x,y,z]
    // Phase 6.9.2 — real-world coords (apply MapConversion)
    this._realWorldEnabled = false;
    this._falseOrigin = null;             // [E, N, H] in IFC frame
    // Phase 6.10 — base CRS for cross-CRS federation
    this._baseCRS = null;                 // 'EPSG:5514' etc; null = no reprojection
  }

  /**
   * Parse and store an IFC file.
   * @param {ArrayBuffer | string} input — file buffer or text
   * @param {{ name: string }} options
   * @returns {Promise<string>} modelId
   */
  async loadIfc(input, options) {
    if (!options || !options.name) {
      throw new Error('loadIfc: options.name is required');
    }
    const text = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);

    const { entities, schema } = await this._parseInWorker(text);
    const entityMap = new Map(entities.map(e => [e.expressId, e]));
    const index = new EntityIndex(entityMap);
    // Build style index once per model: maps geometry item expressId → hex color
    // from IfcStyledItem chain. Geometry-core reads this via index._styleIndex
    // when assembling per-item results.
    index._styleIndex = buildStyleIndex(index);

    const modelId = generateModelId();
    const stats = index.stats();
    const meta = {
      modelId,
      name: options.name,
      schema,
      entityCount: stats.entityCount,
      typeCount: stats.typeCount,
    };
    this._models.set(modelId, { meta, index });
    if (this._viewer) {
      this._viewer.addModel(modelId, index);
      this._viewer._emit('modelLoaded', { modelId, stats: { ...meta } });
    }
    this._recomputeFederation();
    return modelId;
  }

  /**
   * Search entities. All filters are AND-combined.
   *
   * @param {{
   *   modelId?: string,
   *   type?: string,
   *   text?: string,                 // fulltext over Name + GUID + IFC type (case-insensitive)
   *   psetFilters?: Array<{
   *     pset?: string,               // optional Pset name filter (e.g. 'Pset_WallCommon'); undefined = any
   *     property: string,            // property name (case-insensitive)
   *     op: 'eq'|'ne'|'contains'|'gt'|'lt'|'gte'|'lte'|'exists'|'notExists',
   *     value?: string|number|boolean
   *   }>,
   *   limit?: number,                // hard cap on results (default 5000)
   * }} query
   * @returns {Array<{ modelId, expressId, ifcType, name, guid, matchedField? }>}
   */
  search(query = {}) {
    const out = [];
    const targetModels = query.modelId
      ? [this._models.get(query.modelId)].filter(Boolean)
      : [...this._models.values()];

    const text = (query.text || '').trim().toLowerCase();
    const psetFilters = Array.isArray(query.psetFilters) ? query.psetFilters : [];
    const limit = Number.isFinite(query.limit) ? query.limit : 5000;

    for (const { meta, index } of targetModels) {
      let candidates;
      if (query.type) {
        candidates = index.byType(query.type);
      } else {
        candidates = [];
        for (const t of index.types()) {
          if (PRODUCT_TYPES_INCLUDING_SPATIAL.has(t)) candidates.push(...index.byType(t));
        }
      }

      for (const e of candidates) {
        const name = extractEntityName(e.params) || '';
        const guid = extractEntityGuid(e.params) || '';
        const ifcType = e.type;

        let matchedField;
        if (text) {
          if (name.toLowerCase().includes(text)) matchedField = 'name';
          else if (guid.toLowerCase().includes(text)) matchedField = 'guid';
          else if (ifcType.toLowerCase().includes(text)) matchedField = 'type';
          else continue;
        }

        if (psetFilters.length > 0) {
          const props = this.getProperties(meta.modelId, e.expressId);
          if (!props) continue;
          let allPass = true;
          for (const f of psetFilters) {
            if (!_matchPsetFilter(props, f)) { allPass = false; break; }
          }
          if (!allPass) continue;
          if (!matchedField) matchedField = 'pset';
        }

        out.push({ modelId: meta.modelId, expressId: e.expressId, ifcType, name, guid, matchedField });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  /** @returns {ModelMeta[]} */
  getModels() {
    return [...this._models.values()].map(({ meta }) => ({ ...meta }));
  }

  /**
   * @param {string} modelId
   * @returns {ModelMeta | null}
   */
  getStats(modelId) {
    if (modelId == null) {
      // Federation summary — typeCount is the union of types across all models.
      let entityCount = 0;
      const allTypes = new Set();
      for (const { meta, index } of this._models.values()) {
        entityCount += meta.entityCount;
        for (const t of index.types()) allTypes.add(t);
      }
      return { modelCount: this._models.size, entityCount, typeCount: allTypes.size };
    }
    const m = this._models.get(modelId);
    return m ? { ...m.meta } : null;
  }

  /** @param {string} modelId */
  unloadModel(modelId) {
    if (this._viewer) this._viewer.removeModel(modelId);
    this._models.delete(modelId);
    if (this._propsCache) this._propsCache.delete(modelId);
    if (this._spatialCache) this._spatialCache.delete(modelId);
    if (this._availablePropsCache) this._availablePropsCache.clear();  // cache holds aggregate keys
    if (this._qtyCache) {
      for (const k of [...this._qtyCache.keys()]) {
        if (k.startsWith(`${modelId}|`)) this._qtyCache.delete(k);
      }
    }
    // Phase 6.13: drop RAG in-memory chunks; IDB cache stays for next time
    if (this._ragChunks) this._ragChunks.delete(modelId);
    this._coordsCache.delete(modelId);
    this._manualOffsets.delete(modelId);
    this._recomputeFederation();
  }

  /**
   * Fit camera to all loaded models. No-op in parser-only mode (no canvas).
   */
  fitAll() {
    if (this._viewer) this._viewer.fitAll();
  }

  /** Zoom camera toward/away from target. No-op without canvas. */
  zoomBy(factor) {
    if (this._viewer) this._viewer.zoomBy(factor);
  }

  /** Animate camera to a predefined view. No-op without canvas. */
  setViewDirection(spec, opts) {
    if (this._viewer) return this._viewer.setViewDirection(spec, opts);
  }

  /** Swap camera projection type. No-op without canvas. */
  setProjection(type) {
    if (this._viewer) this._viewer.setProjection(type);
  }

  /** Get current camera orientation. Returns null without canvas. */
  getCameraOrientation() {
    return this._viewer ? this._viewer.getCameraOrientation() : null;
  }

  // Phase 6.1.4: viewpoint state snapshot
  getCameraState() { return this._viewer ? this._viewer.getCameraState() : null; }
  setCameraState(s) { if (this._viewer) this._viewer.setCameraState(s); }
  getHiddenEntityIds() { return this._viewer ? this._viewer.getHiddenEntityIds() : []; }
  getOpacityEntries() { return this._viewer ? this._viewer.getOpacityEntries() : []; }
  getHighlightedIds() { return this._viewer ? this._viewer.getHighlightedIds() : []; }

  /** Set section box. No-op without canvas. */
  setSectionBox(min, max) {
    if (this._viewer) this._viewer.setSectionBox(min, max);
  }

  /** Set single-axis section plane. No-op without canvas. */
  setSectionPlane(axis, position, keepPositive) {
    if (this._viewer) this._viewer.setSectionPlane(axis, position, keepPositive);
  }

  /** Set arbitrary section plane from world point + normal. No-op without canvas. */
  setSectionPlaneByNormal(point, normal) {
    if (this._viewer) this._viewer.setSectionPlaneByNormal(point, normal);
  }

  /** Multi-plane: add plane → returns id. */
  addSectionPlane(point, normal) {
    if (!this._viewer) return null;
    return this._viewer.addSectionPlane(point, normal);
  }
  updateSectionPlane(id, opts) {
    if (this._viewer) this._viewer.updateSectionPlane(id, opts);
  }
  removeSectionPlane(id) {
    if (this._viewer) this._viewer.removeSectionPlane(id);
  }
  clearSectionPlanes() {
    if (this._viewer) this._viewer.clearSectionPlanes();
  }
  getSectionPlanes() {
    return this._viewer ? this._viewer.getSectionPlanes() : [];
  }
  // Phase 6.2.1: display modes
  setDisplayMode(mode) { if (this._viewer) this._viewer.setDisplayMode(mode); }
  getDisplayMode() { return this._viewer ? this._viewer.getDisplayMode() : 'solid'; }

  // Phase 6.4.1: pins (3D markup)
  addPin(spec) { return this._viewer ? this._viewer.addPin(spec) : null; }
  updatePin(id, opts) { if (this._viewer) this._viewer.updatePin(id, opts); }
  removePin(id) { if (this._viewer) this._viewer.removePin(id); }
  clearPins() { if (this._viewer) this._viewer.clearPins(); }
  getPins() { return this._viewer ? this._viewer.getPins() : []; }

  // Phase 6.5.1: walk mode (FPS first-person navigation)
  startWalk(opts) { if (this._viewer) this._viewer.startWalk(opts); }
  stopWalk() { if (this._viewer) this._viewer.stopWalk(); }
  isWalking() { return this._viewer ? this._viewer.isWalking() : false; }

  // Phase 6.5.2: screenshots
  takeScreenshot(opts) { return this._viewer ? this._viewer.takeScreenshot(opts) : null; }
  takeViewportScreenshot(opts) { return this._viewer ? this._viewer.takeViewportScreenshot(opts) : null; }

  // Phase 6.7: clash detection
  detectClashes(opts) { return this._viewer ? this._viewer.detectClashes(opts) : Promise.resolve({ clashes: [], stats: {} }); }

  // Phase 6.8.1: section curves (geometric, for DXF export)
  computeSectionCurves(planeIdOrSpec) {
    return this._viewer ? this._viewer.computeSectionCurves(planeIdOrSpec) : [];
  }

  // Phase 6.8.2: alignments (LandXML)
  loadAlignment(xmlText, opts) {
    return this._viewer ? this._viewer.loadAlignment(xmlText, opts) : [];
  }
  getAlignments() {
    return this._viewer ? this._viewer.getAlignments() : [];
  }
  getAlignmentPolyline(id) {
    return this._viewer ? this._viewer.getAlignmentPolyline(id) : [];
  }
  getAlignmentPointAtStation(id, station) {
    return this._viewer ? this._viewer.getAlignmentPointAtStation(id, station) : null;
  }
  /** Phase 6.8.3 — create section plane perpendicular to alignment at station. */
  createSectionAtStation(id, station, perpType) {
    return this._viewer ? this._viewer.createSectionAtStation(id, station, perpType) : null;
  }
  /** Phase 6.8.4 — create alignment from clicked world points (linear / catmull-rom). */
  createFreeCurveFromPoints(worldPoints, opts) {
    return this._viewer ? this._viewer.createFreeCurveFromPoints(worldPoints, opts) : null;
  }
  /** Phase 6.11 — list IfcAlignment entities across loaded models. */
  findIfcAlignments(modelIdFilter) {
    const out = [];
    for (const [modelId, m] of this._models) {
      if (modelIdFilter && modelIdFilter !== modelId) continue;
      const found = _findIfcAlignments(m.index);
      for (const a of found) out.push({ modelId, ...a });
    }
    return out;
  }
  /** Phase 6.11 — load an IfcAlignment by (modelId, expressId) into alignment registry. */
  loadAlignmentFromIfc(modelId, expressId, opts) {
    const m = this._models.get(modelId);
    if (!m || !this._viewer) return null;
    const parsed = parseIfcAlignment(m.index, expressId);
    return this._viewer.addParsedAlignment(parsed, opts);
  }

  /**
   * Phase 6.12.1 — Compare two loaded models entity-by-entity.
   * Returns { added, removed, modified, moved, unchanged_count, stats }.
   * Each entity ref includes modelId so the UI can highlight in scene.
   */
  computeDiff(modelV1Id, modelV2Id, opts = {}) {
    const v1 = this._models.get(modelV1Id);
    const v2 = this._models.get(modelV2Id);
    if (!v1 || !v2) {
      return { added: [], removed: [], modified: [], moved: [], unchanged_count: 0, stats: { error: 'model not found' } };
    }
    const diff = _computeDiff(v1.index, v2.index, opts);
    // Decorate refs with modelId so UI/highlight knows which scene group to color
    const decorate = (entries, modelId, prop = null) => entries.forEach(e => {
      if (prop) {
        if (e[prop]) e[prop].modelId = modelId;
      } else {
        e.modelId = modelId;
      }
    });
    decorate(diff.removed, modelV1Id);
    decorate(diff.added, modelV2Id);
    diff.modified.forEach(e => { e.v1.modelId = modelV1Id; e.v2.modelId = modelV2Id; });
    diff.moved.forEach(e => { e.v1.modelId = modelV1Id; e.v2.modelId = modelV2Id; });
    return diff;
  }

  // -------------------- RAG (Phase 6.13.1) --------------------

  /**
   * Build (or load from cache) the multi-level RAG index for a model.
   * @param {string} modelId
   * @param {(stage: string, n: number, total: number) => void} progressCb
   * @returns {Promise<Array<Chunk>>}
   */
  async indexModelForRag(modelId, progressCb) {
    const m = this._models.get(modelId);
    if (!m) return [];
    if (!this._ragChunks) this._ragChunks = new Map();  // modelId → chunks
    const chunks = await indexModel(modelId, m, progressCb);
    this._ragChunks.set(modelId, chunks);
    return chunks;
  }

  /**
   * Semantic search over indexed chunks. Auto-indexes if not yet built.
   *
   * @param {string} query — natural language question
   * @param {{
   *   modelId?: string,                    // limit to one model
   *   level?: 'entity'|'storey'|'model',  // filter chunk level
   *   k?: number,                          // top-k results (default 10)
   *   autoIndex?: boolean,                 // build index if missing (default true)
   * }} opts
   * @returns {Promise<Array<{chunk, score}>>}
   */
  async semanticSearch(query, opts = {}) {
    if (!query || typeof query !== 'string') return [];
    if (!this._ragChunks) this._ragChunks = new Map();
    // Auto-index models that don't have chunks yet
    const targetIds = opts.modelId ? [opts.modelId] : [...this._models.keys()];
    if (opts.autoIndex !== false) {
      for (const id of targetIds) {
        if (!this._ragChunks.has(id)) {
          await this.indexModelForRag(id);
        }
      }
    }
    // Aggregate chunks across requested models
    let allChunks = [];
    for (const id of targetIds) {
      const c = this._ragChunks.get(id);
      if (c) allChunks = allChunks.concat(c);
    }
    if (allChunks.length === 0) return [];
    const queryVec = await _embed(query);
    return searchChunks(queryVec, allChunks, { k: opts.k || 10, level: opts.level });
  }

  /** Subscribe to RAG model load progress events. */
  onRagLoadProgress(cb) { return _onRagLoadProgress(cb); }

  // -------------------- Basemap (Phase 6.15) --------------------

  /** List available basemap tile providers. */
  getBasemapProviders() {
    if (!this._viewer) return [];
    return this._viewer.constructor.getBasemapProviders();
  }

  /**
   * Show basemap centered on a model's location. Requires the model to have
   * IfcMapConversion + recognizable IfcProjectedCRS.Name (e.g. EPSG:5514).
   *
   * @param {{
   *   provider?: string,           // 'osm'|'humanitarian'|'topo'|'bing_aerial'
   *   modelId?: string,            // default: first georef'd model
   *   opacity?: number,
   *   zoom?: number,               // default 17
   *   gridSize?: number,           // default 5 (NxN tiles)
   *   yPlane?: number,
   * }} opts
   */
  async showBasemap(opts = {}) {
    if (!this._viewer) return;
    let modelId = opts.modelId;
    if (!modelId) {
      for (const id of this._models.keys()) {
        const c = this.getCoords(id);
        if (c?.mapConversion && c?.projectedCRS?.name) { modelId = id; break; }
      }
    }
    if (!modelId) { console.warn('showBasemap: no georeferenced model loaded'); return; }
    const coords = this.getCoords(modelId);
    if (!coords?.mapConversion || !coords?.projectedCRS?.name) {
      console.warn('showBasemap: model lacks IfcMapConversion or IfcProjectedCRS');
      return;
    }
    const mc = coords.mapConversion;
    const modelCrs = parseEpsgCode(coords.projectedCRS.name);
    if (!modelCrs) {
      console.warn(`showBasemap: cannot parse EPSG from ${coords.projectedCRS.name}`);
      return;
    }
    const ll = await toLatLon([mc.eastings, mc.northings], modelCrs);
    if (!ll) { console.warn('showBasemap: reprojection failed'); return; }
    const fo = this._falseOrigin || [mc.eastings, mc.northings, mc.orthogonalHeight];
    // Phase 6.15.2: if a terrain is loaded and projection is desired,
    // pass terrainData (already in alignment frame) so basemap projects tiles
    // onto TIN via clipping.
    let terrain = null;
    if (opts.projectOnTerrain !== false) {
      terrain = this._viewer.getTerrainData?.();
    }
    return this._viewer.showBasemap({
      provider: opts.provider || 'osm',
      centerLatLon: ll,
      centerCrsXY: [mc.eastings, mc.northings],
      modelCrs,
      falseOrigin: fo,
      zoom: opts.zoom || 17,
      gridSize: opts.gridSize || 5,
      opacity: opts.opacity ?? 1,
      yPlane: opts.yPlane ?? 0,
      reprojectFn: reprojectPoint,
      terrain,
    });
  }

  setBasemapOpacity(opacity) { if (this._viewer) this._viewer.setBasemapOpacity(opacity); }
  setBasemapVisible(visible) { if (this._viewer) this._viewer.setBasemapVisible(visible); }
  clearBasemap() { if (this._viewer) this._viewer.clearBasemap(); }
  getBasemapState() {
    return this._viewer ? this._viewer.getBasemapState() : { visible: false };
  }

  // -------------------- Terrain (Phase 6.15.2) --------------------

  /** Parse LandXML XML text → array of terrain surfaces. */
  parseLandXmlSurfaces(xmlText) {
    return parseLandXmlSurfaces(xmlText);
  }

  /** Parse GeoTIFF ArrayBuffer → TerrainData. */
  async parseGeoTiff(arrayBuffer, opts = {}) {
    return parseGeoTiff(arrayBuffer, opts);
  }

  /** Find IfcGeographicElement (and IfcSite fallback) candidates across all models. */
  findTerrainEntities(modelId = null) {
    const out = [];
    const targets = modelId ? [[modelId, this._models.get(modelId)]] : [...this._models.entries()];
    for (const [id, model] of targets) {
      if (!model?.index) continue;
      const candidates = findTerrainEntities(model.index);
      for (const c of candidates) out.push({ ...c, modelId: id });
    }
    return out;
  }

  /** Extract TerrainData from IfcGeographicElement / IfcSite. */
  extractTerrainFromIfc(modelId, expressId) {
    const model = this._models.get(modelId);
    if (!model?.index) return null;
    return extractTerrainFromIfc(model.index, expressId);
  }

  /**
   * Show terrain in the scene.
   * @param {TerrainData} terrainData
   * @param {{ opacity?: number, color?: number, useFalseOrigin?: boolean }} opts
   */
  setTerrain(terrainData, opts = {}) {
    if (!this._viewer || !terrainData) return;
    const useFo = opts.useFalseOrigin !== false;
    const fo = useFo ? (this._falseOrigin || [0, 0, 0]) : [0, 0, 0];
    this._viewer.showTerrain(terrainData, { ...opts, falseOrigin: fo });
  }

  setTerrainOpacity(opacity) { if (this._viewer) this._viewer.setTerrainOpacity(opacity); }
  setTerrainWireframe(show) { if (this._viewer) this._viewer.setTerrainWireframe(show); }
  setTerrainVisible(visible) { if (this._viewer) this._viewer.setTerrainVisible(visible); }
  clearTerrain() { if (this._viewer) this._viewer.clearTerrain(); }
  getTerrainState() {
    return this._viewer ? this._viewer.getTerrainState() : { visible: false };
  }

  // -------------------- 3D Tiles export (Phase 6.16) --------------------

  /**
   * Export loaded models as a 3D Tiles 1.1 bundle (tileset.json + model.glb)
   * placed at the model's georef location in WGS84 ECEF.
   *
   * Requires at least one model with IfcMapConversion + recognizable
   * IfcProjectedCRS so we can compute the lat/lon center for the ECEF root
   * transform.
   *
   * @param {{
   *   modelIds?: string[],         // default: all loaded models
   *   centerLatLon?: {lat, lon, h}, // override georef center
   *   tilesetVersion?: string,
   * }} opts
   * @returns {Promise<{ zipBlob: Blob, tilesetJson: object, info: object }>}
   */
  async exportThreeDTiles(opts = {}) {
    if (!this._viewer) throw new Error('Viewer not initialized');
    const modelIds = opts.modelIds && opts.modelIds.length
      ? opts.modelIds
      : [...this._models.keys()];
    if (modelIds.length === 0) throw new Error('Žádný model k exportu');

    // Determine georef center
    let center = opts.centerLatLon;
    if (!center) {
      for (const id of modelIds) {
        const c = this.getCoords(id);
        if (c?.mapConversion && c?.projectedCRS?.name) {
          const epsg = parseEpsgCode(c.projectedCRS.name);
          if (epsg) {
            const ll = await toLatLon([c.mapConversion.eastings, c.mapConversion.northings], epsg);
            if (ll) {
              center = { lat: ll.lat, lon: ll.lon, h: c.mapConversion.orthogonalHeight ?? 0 };
              break;
            }
          }
        }
      }
    }
    if (!center) {
      throw new Error('Žádný model nemá georef (IfcMapConversion + EPSG). Specifikuj centerLatLon ručně.');
    }

    // Collect viewer groups for those models
    const groups = [];
    for (const id of modelIds) {
      const m = this._viewer._models.get(id);
      if (m?.group) groups.push(m.group);
    }
    if (groups.length === 0) throw new Error('Modely nejsou v scéně');

    // Lazy-load helpers + build
    const { exportObjectsToGlb, computeWorldBbox } = await import('./export/gltf-exporter.js');
    const { buildTileset } = await import('./export/tileset-builder.js');
    const { buildTilesetZip } = await import('./export/zip-builder.js');

    const glb = await exportObjectsToGlb(groups, { binary: true });
    const bboxLocal = computeWorldBbox(groups);
    const tilesetJson = buildTileset({
      modelLatLonHeight: center,
      bboxLocal,
      tilesetVersion: opts.tilesetVersion,
    });
    const zipBlob = await buildTilesetZip({ tilesetJson, glb });

    return {
      zipBlob,
      tilesetJson,
      info: {
        modelCount: modelIds.length,
        glbSize: glb.byteLength,
        zipSize: zipBlob.size,
        center,
        bbox: bboxLocal,
      },
    };
  }

  /** Drop RAG cache for a model (e.g. on unload). */
  async dropRagCache(modelId) {
    if (this._ragChunks) this._ragChunks.delete(modelId);
    await dropModelCache(modelId);
  }

  // -------------------- 4D timeline (Phase 6.14.1) --------------------

  /** Parse CSV text → schedule object (no save). Caller persists separately. */
  parseScheduleCsv(csvText, opts) {
    return parseScheduleCsv(csvText, opts);
  }

  /** Phase 6.14.3 — Parse MS Project XML export → schedule. */
  parseMsProjectXml(xmlText, opts) {
    return parseMsProjectXml(xmlText, opts);
  }

  /** Phase 6.14.3 — Parse Primavera P6 XER text → schedule. */
  parseP6Xer(xerText, opts) {
    return parseP6Xer(xerText, opts);
  }

  /** Phase 6.14.3 — List IfcWorkSchedule entities across loaded models. */
  findIfcWorkSchedules(modelIdFilter) {
    const out = [];
    for (const [modelId, m] of this._models) {
      if (modelIdFilter && modelIdFilter !== modelId) continue;
      const found = _findIfcWorkSchedules(m.index);
      for (const a of found) out.push({ modelId, ...a });
    }
    return out;
  }

  /** Phase 6.14.3 — Parse a specific IfcWorkSchedule into a Schedule object. */
  parseIfcWorkSchedule(modelId, expressId) {
    const m = this._models.get(modelId);
    if (!m) return null;
    return parseIfcWorkSchedule(m.index, expressId);
  }

  /**
   * Phase 6.14.3 — AI auto-suggest entity links for a task using RAG semantic
   * search. Searches by task name (and optional description). Returns top-k
   * matches; caller decides whether to auto-apply.
   *
   * @param {Task} task
   * @param {{ k?: number, modelId?: string }} opts
   * @returns {Promise<Array<{modelId, expressId, score, ifcType, name}>>}
   */
  async aiSuggestTaskLinks(task, opts = {}) {
    if (!task?.name) return [];
    const k = opts.k || 5;
    const results = await this.semanticSearch(task.name, {
      modelId: opts.modelId,
      level: 'entity',
      k,
    });
    return results
      .filter(r => r.chunk.refExpressId != null)
      .map(r => ({
        modelId: r.chunk.modelId,
        expressId: r.chunk.refExpressId,
        score: r.score,
        ifcType: r.chunk.ifcType,
        name: r.chunk.name,
      }));
  }

  /**
   * Set the active schedule + apply status colors at given date.
   * @param {Schedule} schedule
   * @param {string} dateStr — YYYY-MM-DD
   */
  setActiveSchedule(schedule, dateStr) {
    this._activeSchedule = schedule;
    this._timelineDate = dateStr;
    this._applyTimelineColors();
  }

  setTimelineDate(dateStr) {
    this._timelineDate = dateStr;
    this._applyTimelineColors();
  }

  getTimelineState() {
    return {
      schedule: this._activeSchedule || null,
      date: this._timelineDate || null,
    };
  }

  /** Compute status of a single entity at current timeline date. */
  getEntityTimelineStatus(modelId, expressId) {
    if (!this._activeSchedule || !this._timelineDate) return null;
    const map = computeEntityStatusMap(this._activeSchedule, this._timelineDate);
    return map.get(`${modelId}|${expressId}`) || 'not-started';
  }

  /**
   * Resolve rule-based links on a task (e.g. "all IfcWall on storey 2") into
   * concrete entityLinks via engine.search. Caller persists the updated task.
   */
  resolveTaskRuleLinks(task) {
    return resolveRuleLinks(task, this);
  }

  clearTimeline() {
    this._activeSchedule = null;
    this._timelineDate = null;
    if (this._viewer) this._viewer.clearHighlights();
  }

  _applyTimelineColors() {
    if (!this._viewer || !this._activeSchedule || !this._timelineDate) return;
    const map = computeEntityStatusMap(this._activeSchedule, this._timelineDate);
    if (map.size === 0) return;
    const items = [];
    for (const [key, status] of map) {
      const [modelId, expressIdStr] = key.split('|');
      const expressId = parseInt(expressIdStr, 10);
      if (!Number.isFinite(expressId)) continue;
      items.push({ modelId, expressId, color: STATUS_COLORS[status] });
    }
    this._viewer.clearHighlights();
    this._viewer.highlight(items);
  }
  setAlignmentVisible(id, visible) {
    if (this._viewer) this._viewer.setAlignmentVisible(id, visible);
  }
  removeAlignment(id) {
    if (this._viewer) this._viewer.removeAlignment(id);
  }
  clearAlignments() {
    if (this._viewer) this._viewer.clearAlignments();
  }

  // Phase 6 audit fix: facade methods to replace 4 _viewer leak sites in app/.
  pickEntity(x, y) { return this._viewer ? this._viewer.pickEntity(x, y) : null; }
  pickFace(x, y) { return this._viewer ? this._viewer.pickFace(x, y) : null; }
  resize(w, h) { if (this._viewer) this._viewer.resize(w, h); }
  getProjection() { return this._viewer ? this._viewer.getProjection() : 'perspective'; }

  /**
   * Phase 6.2.2 — Color all entities by a property value. Colors come from
   * a fixed categorical palette. Empty/missing values get gray.
   *
   * @param {{ pset?: string, property: string, modelId?: string }} opts
   * @returns {{
   *   valueToColor: Record<string, number>,   // hex per unique value
   *   valueToCount: Record<string, number>,   // entity count per value
   *   matchedTotal: number,
   *   unmatchedTotal: number,
   * }}
   */
  colorByProperty(opts) {
    if (!opts?.property) throw new Error('colorByProperty: property is required');
    if (!this._viewer) return { valueToColor: {}, valueToCount: {}, matchedTotal: 0, unmatchedTotal: 0 };

    const psetFilter = opts.pset ? String(opts.pset).toLowerCase() : null;
    const propLower = String(opts.property).toLowerCase();
    const targetModels = opts.modelId
      ? [this._models.get(opts.modelId)].filter(Boolean)
      : [...this._models.values()];

    // Walk entities, extract value
    const itemsByValue = new Map();
    let unmatchedTotal = 0;
    for (const { meta } of targetModels) {
      const hits = this.search({ modelId: meta.modelId });
      for (const h of hits) {
        const props = this.getProperties(meta.modelId, h.expressId);
        if (!props) { unmatchedTotal++; continue; }
        const value = _findPropertyValue(props, psetFilter, propLower);
        const key = value == null ? '' : String(value);
        let arr = itemsByValue.get(key);
        if (!arr) { arr = []; itemsByValue.set(key, arr); }
        arr.push({ modelId: meta.modelId, expressId: h.expressId });
      }
    }

    // Sort values for stable palette assignment (numeric values numerically, else alpha)
    const allValues = [...itemsByValue.keys()];
    const numericKeys = allValues.filter(k => k !== '' && !Number.isNaN(Number(k)));
    const stringKeys = allValues.filter(k => k !== '' && Number.isNaN(Number(k)));
    numericKeys.sort((a, b) => Number(a) - Number(b));
    stringKeys.sort();
    const orderedKeys = [...stringKeys, ...numericKeys];
    if (allValues.includes('')) orderedKeys.push('');  // empty bucket last

    const valueToColor = {};
    const valueToCount = {};
    const items = [];
    let matchedTotal = 0;
    for (let i = 0; i < orderedKeys.length; i++) {
      const k = orderedKeys[i];
      const color = k === '' ? UNKNOWN_COLOR : COLOR_PALETTE[i % COLOR_PALETTE.length];
      valueToColor[k] = color;
      const arr = itemsByValue.get(k);
      valueToCount[k] = arr.length;
      for (const it of arr) {
        items.push({ ...it, color });
        matchedTotal++;
      }
    }

    this._viewer.clearHighlights();
    this._viewer.highlight(items);
    return { valueToColor, valueToCount, matchedTotal, unmatchedTotal };
  }

  /** Restore original colors. Alias for clearHighlights for clarity. */
  clearColorByProperty() {
    if (this._viewer) this._viewer.clearHighlights();
  }

  /**
   * Phase 6.3.1 — Walk all entities, enumerate unique Pset.Property paths.
   * Cached per (modelId), invalidated on unloadModel.
   *
   * @param {string} [modelId] — optional model scope
   * @returns {Array<{ pset, property, sampleValue, count }>}
   */
  getAvailableProperties(modelId) {
    if (!this._availablePropsCache) this._availablePropsCache = new Map();
    const cacheKey = modelId || '__all__';
    if (this._availablePropsCache.has(cacheKey)) return this._availablePropsCache.get(cacheKey);

    const targetModels = modelId
      ? [this._models.get(modelId)].filter(Boolean)
      : [...this._models.values()];

    // path "Pset|Property" → { pset, property, sampleValue, count }
    const paths = new Map();
    for (const { meta } of targetModels) {
      const hits = this.search({ modelId: meta.modelId });
      for (const h of hits) {
        const props = this.getProperties(meta.modelId, h.expressId);
        if (!props) continue;
        for (const pset of props.propertySets) {
          for (const p of pset.properties) {
            const key = `${pset.name}|${p.name}`;
            let entry = paths.get(key);
            if (!entry) {
              entry = { pset: pset.name, property: p.name, sampleValue: p.value, count: 0 };
              paths.set(key, entry);
            }
            entry.count++;
          }
        }
      }
    }
    const out = [...paths.values()].sort((a, b) =>
      a.pset.localeCompare(b.pset) || a.property.localeCompare(b.property)
    );
    this._availablePropsCache.set(cacheKey, out);
    return out;
  }

  /**
   * Phase 6.3.2 — Quantities for an entity.
   * Returns merged IFC element quantities + computed mesh quantities (if viewer).
   *
   * @param {string} modelId
   * @param {number} expressId
   * @returns {{
   *   ifc: Array<{name, kind, value}>,
   *   computed: {volume, surfaceArea, bboxWidth, bboxHeight, bboxDepth, triangleCount} | null,
   * }}
   */
  getQuantities(modelId, expressId) {
    const m = this._models.get(modelId);
    if (!m) return { ifc: [], computed: null };
    if (!this._qtyCache) this._qtyCache = new Map();
    const key = `${modelId}|${expressId}`;
    if (this._qtyCache.has(key)) return this._qtyCache.get(key);

    const ifc = extractIfcQuantities(m.index, expressId);
    const computed = this._viewer ? this._viewer.computeMeshQuantities(modelId, expressId) : null;
    const result = { ifc, computed };
    this._qtyCache.set(key, result);
    return result;
  }

  /**
   * Discover unique IFC quantity names across all loaded models.
   * @param {string} [modelId]
   * @returns {Array<{name, kind, count, sampleValue}>}
   */
  getAvailableQuantities(modelId) {
    const targetModels = modelId
      ? [this._models.get(modelId)].filter(Boolean)
      : [...this._models.values()];
    const map = new Map();
    for (const { meta } of targetModels) {
      for (const h of this.search({ modelId: meta.modelId })) {
        const q = extractIfcQuantities(this._models.get(meta.modelId).index, h.expressId);
        for (const item of q) {
          const key = item.name;
          let entry = map.get(key);
          if (!entry) {
            entry = { name: item.name, kind: item.kind, count: 0, sampleValue: item.value };
            map.set(key, entry);
          }
          entry.count++;
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Resolve a single Pset.Property value for an entity. Returns null if missing.
   * @param {string} modelId
   * @param {number} expressId
   * @param {string} pset
   * @param {string} property
   * @returns {*}
   */
  getPropertyValue(modelId, expressId, pset, property) {
    const props = this.getProperties(modelId, expressId);
    if (!props) return null;
    const psetLower = pset ? pset.toLowerCase() : null;
    const propLower = property.toLowerCase();
    for (const ps of props.propertySets) {
      if (psetLower && ps.name.toLowerCase() !== psetLower) continue;
      for (const p of ps.properties) {
        if (p.name.toLowerCase() === propLower) return p.value;
      }
    }
    return null;
  }

  setEdgesVisible(visible) {
    if (this._viewer) this._viewer.setEdgesVisible(visible);
  }
  getEdgesVisible() {
    return this._viewer ? this._viewer.getEdgesVisible() : false;
  }
  /** Highlight actual hovered face during pick mode (find coplanar triangles). */
  showSectionGhostFromClient(clientX, clientY) {
    if (!this._viewer) return false;
    // Internal raycast that returns hit + mesh
    const hits = this._viewer._raycastFull(clientX, clientY);
    const first = hits[0];
    if (!first) {
      this._viewer.hideSectionGhost();
      return false;
    }
    this._viewer.showSectionGhostFromHit(first.hit, first.mesh);
    return true;
  }
  hideSectionGhost() {
    if (this._viewer) this._viewer.hideSectionGhost();
  }

  /** Clear section. No-op without canvas. */
  clearSection() {
    if (this._viewer) this._viewer.clearSection();
  }

  /** Get current section state. */
  getSectionState() {
    if (!this._viewer) {
      return { active: false, type: null, min: null, max: null, axis: null, position: null, keepPositive: false };
    }
    return this._viewer.getSectionState();
  }

  /**
   * Get spatial hierarchy tree for a model (cached).
   * Returns null for models without IfcProject.
   *
   * @param {string} modelId
   * @returns {SpatialNode | null}
   */
  getSpatialHierarchy(modelId) {
    const m = this._models.get(modelId);
    if (!m) return null;
    if (!this._spatialCache) this._spatialCache = new Map();
    if (this._spatialCache.has(modelId)) return this._spatialCache.get(modelId);
    const tree = extractSpatialHierarchy(m.index);
    this._spatialCache.set(modelId, tree);
    return tree;
  }

  /**
   * Collect all leaf element expressIds under a spatial node.
   * @param {SpatialNode} node
   * @returns {number[]}
   */
  collectElementsInSpatial(node) {
    return collectAllElementIds(node);
  }

  /**
   * Extract IFC PropertySets + attributes for one entity.
   * Result is cached per (modelId, expressId).
   *
   * @param {string} modelId
   * @param {number} expressId
   * @returns {ExtractedProperties | null}
   */
  getProperties(modelId, expressId) {
    const m = this._models.get(modelId);
    if (!m) return null;
    if (!this._propsCache) this._propsCache = new Map();
    let modelCache = this._propsCache.get(modelId);
    if (!modelCache) {
      modelCache = new Map();
      this._propsCache.set(modelId, modelCache);
    }
    if (modelCache.has(expressId)) return modelCache.get(expressId);
    const props = extractPropertiesFor(m.index, expressId);
    modelCache.set(expressId, props);
    return props;
  }

  /**
   * Highlight a list of entities. No-op without canvas.
   * @param {Array<{ modelId, expressId, color? }>} items
   * @param {number|string} [defaultColor]
   */
  highlight(items, defaultColor) {
    if (this._viewer) this._viewer.highlight(items, defaultColor);
  }

  /** Clear all highlights. No-op without canvas. */
  clearHighlights() {
    if (this._viewer) this._viewer.clearHighlights();
  }

  // Visibility / opacity (entity context bar)
  hideEntities(items) { if (this._viewer) this._viewer.hideEntities(items); }
  isolateEntities(items) { if (this._viewer) this._viewer.isolateEntities(items); }
  showAll() { if (this._viewer) this._viewer.showAll(); }
  setEntityOpacity(items, alpha) { if (this._viewer) this._viewer.setEntityOpacity(items, alpha); }
  getEntityOpacity(modelId, expressId) {
    return this._viewer ? this._viewer.getEntityOpacity(modelId, expressId) : 1;
  }
  findSameTypeIds(modelId, expressId) {
    return this._viewer ? this._viewer.findSameTypeIds(modelId, expressId) : [];
  }

  /** Move camera to fit one entity. No-op without canvas. */
  focusEntity(modelId, expressId) {
    if (this._viewer) this._viewer.focusEntity(modelId, expressId);
  }

  /** Subscribe to viewer events. No-op without canvas. */
  on(event, callback) {
    if (this._viewer) this._viewer.on(event, callback);
  }

  /** Unsubscribe from viewer events. */
  off(event, callback) {
    if (this._viewer) this._viewer.off(event, callback);
  }

  /**
   * Get extracted geo-coords for a model (cached).
   * @param {string} modelId
   * @returns {CoordsData | null}
   */
  getCoords(modelId) {
    const m = this._models.get(modelId);
    if (!m) return null;
    if (this._coordsCache.has(modelId)) return this._coordsCache.get(modelId);
    const coords = extractCoords(m.index);
    this._coordsCache.set(modelId, coords);
    return coords;
  }

  /**
   * Set federation mode: 'auto' (align bbox centers), 'real-coords' (respect IFC world),
   * or 'manual' (use setModelOffset).
   * @param {'auto' | 'real-coords' | 'manual'} mode
   */
  setFederationMode(mode) {
    if (mode !== 'auto' && mode !== 'real-coords' && mode !== 'manual') {
      throw new Error(`Invalid federation mode: ${mode}`);
    }
    this._federationMode = mode;
    this._recomputeFederation();
  }

  /**
   * Set explicit offset for a model (used in 'manual' mode).
   * @param {string} modelId
   * @param {[number, number, number]} offset
   */
  setModelOffset(modelId, offset) {
    this._manualOffsets.set(modelId, [offset[0], offset[1], offset[2]]);
    if (this._federationMode === 'manual') this._recomputeFederation();
  }

  /**
   * Get current world position of a model's THREE.Group.
   * Useful for inspecting federation state. No-op without canvas.
   *
   * @param {string} modelId
   * @returns {[number, number, number] | null}
   */
  getModelPosition(modelId) {
    if (!this._viewer) return null;
    const m = this._viewer._models.get(modelId);
    if (!m) return null;
    return m.group.position.toArray();
  }

  /**
   * Get metadata for a single entity. Replaces private _models.get(modelId).index.byExpressId
   * access in app vrstva and tool-executor.
   *
   * @param {string} modelId
   * @param {number} expressId
   * @returns {{ modelId, expressId, ifcType, name, guid } | null}
   */
  getEntityMeta(modelId, expressId) {
    const m = this._models.get(modelId);
    if (!m) return null;
    const entity = m.index.byExpressId(expressId);
    if (!entity) return null;
    return {
      modelId,
      expressId,
      ifcType: entity.type,
      name: extractEntityName(entity.params),
      guid: extractEntityGuid(entity.params),
    };
  }

  /**
   * Get type-bucketed entity counts for a model — used by tree UI for hierarchy.
   * Only returns IFC product types with geometry (excludes spatial containers
   * IfcSite/IfcBuilding/IfcBuildingStorey/IfcSpace, geometry primitives,
   * relationships, properties). For spatial hierarchy use a separate API in Phase 5.2+.
   *
   * @param {string} modelId
   * @returns {{ [ifcType]: { count: number, expressIds: number[] } }}
   */
  getEntityTypes(modelId) {
    const m = this._models.get(modelId);
    if (!m) return {};
    const out = {};
    for (const t of m.index.types()) {
      if (!PRODUCT_TYPES.has(t)) continue;
      const entities = m.index.byType(t);
      out[t] = {
        count: entities.length,
        expressIds: entities.map(e => e.expressId),
      };
    }
    return out;
  }

  /** Internal: compute + apply federation offsets per current mode. */
  _recomputeFederation() {
    if (!this._viewer) return;
    // If real-world coords mode is on, re-apply georef transforms instead
    if (this._realWorldEnabled) {
      this._applyRealWorldCoords();
      return;
    }
    const modelsCoords = new Map();
    for (const modelId of this._models.keys()) {
      modelsCoords.set(modelId, this.getCoords(modelId) || { bboxCenter: null });
    }
    const offsets = computeOffsets(modelsCoords, this._federationMode, this._manualOffsets);
    for (const [modelId, offset] of offsets) {
      this._viewer.applyFederationOffset(modelId, offset);
    }
  }

  /**
   * Phase 6.9.2 — Toggle real-world coords mode.
   *
   * When enabled, each model with IfcMapConversion is positioned via that
   * transform (with optional false origin subtraction for WebGL precision).
   * Models without MapConversion stay at origin.
   *
   * When disabled, federation offsets per current mode are reapplied.
   *
   * @param {boolean} enabled
   * @param {{ falseOrigin?: 'auto' | [number,number,number] | null }} [opts]
   */
  setRealWorldCoords(enabled, opts = {}) {
    this._realWorldEnabled = !!enabled;
    if (enabled) {
      let fo;
      if (Array.isArray(opts.falseOrigin)) fo = opts.falseOrigin;
      else if (opts.falseOrigin === null) fo = null;
      else fo = this._computeAutoFalseOrigin();  // default: auto
      this._falseOrigin = fo;
      this._applyRealWorldCoords();
    } else {
      this._falseOrigin = null;
      // Reset all groups + recompute regular federation
      for (const modelId of this._models.keys()) {
        if (this._viewer) this._viewer.resetGroupTransform(modelId);
      }
      this._recomputeFederation();
    }
    if (this._viewer) this._viewer.fitAll();
  }

  /** @returns {{enabled: boolean, falseOrigin: [number,number,number]|null}} */
  getRealWorldCoords() {
    return { enabled: !!this._realWorldEnabled, falseOrigin: this._falseOrigin };
  }

  _applyRealWorldCoords() {
    if (!this._viewer) return;
    for (const modelId of this._models.keys()) {
      const c = this.getCoords(modelId);
      if (c?.mapConversion) {
        this._viewer.applyGeorefTransform(modelId, c.mapConversion, this._falseOrigin);
      } else {
        // Models without MapConversion stay at default transform (origin)
        this._viewer.resetGroupTransform(modelId);
      }
    }
  }

  /**
   * Phase 6.10 — Re-apply with cross-CRS reprojection. For each model:
   *   - if model's CRS == baseCRS: identity (use mapConversion as-is)
   *   - if different CRS: reproject (eastings, northings) to base CRS
   *   - apply resulting effective MapConversion + false origin
   *
   * Async because reprojection may need to fetch CRS def from epsg.io
   * on first use of an unknown EPSG code.
   */
  async _applyRealWorldCoordsCrossCRS() {
    if (!this._viewer || !this._baseCRS) {
      this._applyRealWorldCoords();
      return;
    }
    for (const modelId of this._models.keys()) {
      const c = this.getCoords(modelId);
      if (!c?.mapConversion) {
        this._viewer.resetGroupTransform(modelId);
        continue;
      }
      const modelCRS = parseEpsgCode(c.projectedCRS?.name);
      let effectiveMc = c.mapConversion;
      if (modelCRS && modelCRS !== this._baseCRS) {
        // Reproject the MapConversion translation to base CRS
        const reprojected = await reprojectPoint(
          [c.mapConversion.eastings, c.mapConversion.northings, c.mapConversion.orthogonalHeight],
          modelCRS,
          this._baseCRS,
        );
        if (reprojected) {
          effectiveMc = {
            ...c.mapConversion,
            eastings: reprojected[0],
            northings: reprojected[1],
            orthogonalHeight: reprojected[2],
          };
        }
      }
      this._viewer.applyGeorefTransform(modelId, effectiveMc, this._falseOrigin);
    }
  }

  /**
   * Set the base CRS for federation. When real-world coords mode is on,
   * each model's MapConversion offsets are reprojected to this CRS before
   * placement. Setting null disables reprojection (each model uses its
   * own CRS literally).
   * @param {string|null} epsg — 'EPSG:5514' etc. or null
   */
  async setBaseCRS(epsg) {
    this._baseCRS = epsg ? parseEpsgCode(epsg) : null;
    if (this._realWorldEnabled) {
      await this._applyRealWorldCoordsCrossCRS();
    }
  }

  getBaseCRS() {
    return this._baseCRS;
  }

  /** Auto-detect base CRS from first model's IfcProjectedCRS.Name. */
  detectBaseCRS() {
    for (const modelId of this._models.keys()) {
      const c = this.getCoords(modelId);
      const code = parseEpsgCode(c?.projectedCRS?.name);
      if (code) return code;
    }
    return null;
  }

  /**
   * Reproject any [E, N, H] in a source CRS to the base CRS (or arbitrary
   * target CRS if specified). Convenience for app/AI tools.
   */
  async reprojectPoint(point, fromCRS, toCRS) {
    return reprojectPoint(point, fromCRS, toCRS || this._baseCRS);
  }

  /**
   * Convert point in given CRS to WGS84 lat/lon.
   * @param {[E,N,H?]} point
   * @param {string} fromCRS
   * @returns {Promise<{lat, lon}|null>}
   */
  async pointToLatLon(point, fromCRS) {
    return toLatLon(point, fromCRS);
  }

  /** Returns first MapConversion's E/N/H as auto false-origin, or [0,0,0]. */
  _computeAutoFalseOrigin() {
    for (const modelId of this._models.keys()) {
      const c = this.getCoords(modelId);
      if (c?.mapConversion) {
        const mc = c.mapConversion;
        return [mc.eastings || 0, mc.northings || 0, mc.orthogonalHeight || 0];
      }
    }
    return [0, 0, 0];
  }

  /** Raycast at client coords; returns [x,y,z] or null. No-op without canvas. */
  raycastPoint(clientX, clientY) {
    if (!this._viewer) return null;
    return this._viewer.raycastPoint(clientX, clientY);
  }

  /** Distance between two 3D points. */
  measureDistance(p1, p2) {
    if (!this._viewer) return 0;
    return this._viewer.measureDistance(p1, p2);
  }

  /** Angle at vertex p2 in degrees. */
  measureAngle(p1, p2, p3) {
    if (!this._viewer) return 0;
    return this._viewer.measureAngle(p1, p2, p3);
  }

  /** Polygon area. */
  measureArea(points) {
    if (!this._viewer) return 0;
    return this._viewer.measureArea(points);
  }

  /** Lazy MeasureVisuals access. */
  getMeasureVisuals() {
    if (!this._viewer) return null;
    return this._viewer.getMeasureVisuals();
  }
  showMeasureSnapPreview(point, type) {
    if (this._viewer) this._viewer.showMeasureSnapPreview(point, type);
  }
  hideMeasureSnapPreview() {
    if (this._viewer) this._viewer.hideMeasureSnapPreview();
  }
  snapToVertex(clientX, clientY, thresholdPx) {
    return this._viewer ? this._viewer.snapToVertex(clientX, clientY, thresholdPx) : null;
  }
  /** Phase 6.6.1: multi-type snap */
  snapAt(clientX, clientY, opts) {
    return this._viewer ? this._viewer.snapAt(clientX, clientY, opts) : null;
  }
  measureFaceAreaAtClient(clientX, clientY) {
    return this._viewer ? this._viewer.measureFaceAreaAtClient(clientX, clientY) : null;
  }

  /** Cleanup all state. */
  dispose() {
    if (this._viewer) this._viewer.dispose();
    this._models.clear();
    this._propsCache = null;
    this._coordsCache.clear();
    this._manualOffsets.clear();
  }

  // --- private ---

  _parseInWorker(text) {

    return new Promise((resolve, reject) => {
      const worker = new Worker(this._workerUrl, { type: 'module' });
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('parser worker timeout (60s)'));
      }, 60000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        if (e.data && e.data.ok) resolve(e.data);
        else reject(new Error(e.data?.error || 'worker returned not-ok'));
      };
      worker.onerror = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(new Error(e.message || 'worker error'));
      };
      worker.postMessage({ cmd: 'parse', text });
    });
  }


}

// Phase 6.2.2 — categorical color palette for color-by-property.
// 15 distinct hues, picked for visual separation and reasonable contrast on
// the dark scene background. Empty values fall back to UNKNOWN_COLOR (gray).
const COLOR_PALETTE = [
  0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6,
  0xec4899, 0x06b6d4, 0x84cc16, 0xf97316, 0x6366f1,
  0xa855f7, 0x14b8a6, 0xeab308, 0x22c55e, 0xd946ef,
];
const UNKNOWN_COLOR = 0x6b7280;

function _findPropertyValue(props, psetFilter, propLower) {
  for (const pset of props.propertySets) {
    if (psetFilter && pset.name.toLowerCase() !== psetFilter) continue;
    for (const p of pset.properties) {
      if (p.name.toLowerCase() === propLower) return p.value;
    }
  }
  return null;
}

function _matchPsetFilter(props, filter) {
  const propName = String(filter.property || '').toLowerCase();
  const psetFilter = filter.pset ? String(filter.pset).toLowerCase() : null;
  for (const pset of props.propertySets) {
    if (psetFilter && pset.name.toLowerCase() !== psetFilter) continue;
    for (const p of pset.properties) {
      if (p.name.toLowerCase() !== propName) continue;
      return _matchOp(p.value, filter.op, filter.value);
    }
  }
  return filter.op === 'notExists';
}

function _matchOp(actual, op, expected) {
  if (op === 'exists') return actual != null;
  if (op === 'notExists') return actual == null;
  if (actual == null) return false;
  if (op === 'eq') return String(actual) === String(expected);
  if (op === 'ne') return String(actual) !== String(expected);
  if (op === 'contains') return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  const a = Number(actual), b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === 'gt') return a > b;
  if (op === 'lt') return a < b;
  if (op === 'gte') return a >= b;
  if (op === 'lte') return a <= b;
  return false;
}

// Re-export AI tool integration surface — BIM_checker imports from here.
export { TOOL_DEFINITIONS } from './ai-tools/tool-defs.js';
export { createExecutor } from './ai-tools/tool-executor.js';
