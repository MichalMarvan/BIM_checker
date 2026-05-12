// Phase 6.15 — Basemap (background map tiles).
//
// Lightweight tile fetcher (no extra lib): builds a NxN grid of textured
// planes in the scene, positioned in world coords below the model.
//
// Tile math (Web Mercator EPSG:3857):
//   tileX = floor((lon + 180) / 360 * 2^Z)
//   tileY = floor((1 - log(tan(lat * PI/180) + 1/cos(lat * PI/180)) / PI) / 2 * 2^Z)
//
// Tile width at lat L, zoom Z (in meters):
//   tileMeters = 156543.03 * cos(L) / 2^Z   // 156543.03 = world circumference / 256
//
// Position in scene:
//   For each tile, compute its center in lat/lon → reproject to model's
//   CRS via engine.reprojectPoint → subtract false origin → place flat
//   plane at that XYZ (with appropriate world rotation since model
//   group has -π/2 X rotation).

import * as THREE from 'three';
import { clipTriangleToRect, fanTriangulate } from '../terrain/triangle-clip.js';

const TILE_PROVIDERS = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
  humanitarian: {
    name: 'OSM Humanitarian',
    url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© OpenStreetMap France',
  },
  topo: {
    name: 'OpenTopoMap',
    url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution: '© OpenStreetMap, SRTM | Map: OpenTopoMap (CC-BY-SA)',
  },
  bing_aerial: {
    name: 'Bing Aerial',
    // Bing-style quadkey URL — works without API key for static tiles
    url: (z, x, y) => `https://ecn.t3.tiles.virtualearth.net/tiles/a${tileToQuadkey(x, y, z)}.jpeg?g=14245`,
    maxZoom: 19,
    attribution: '© Microsoft Bing Maps',
  },
};

export function getProviders() {
  return Object.entries(TILE_PROVIDERS).map(([id, p]) => ({ id, name: p.name, attribution: p.attribution }));
}

function tileToQuadkey(x, y, z) {
  let key = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    key += digit;
  }
  return key;
}

function tileUrl(providerId, x, y, z) {
  const p = TILE_PROVIDERS[providerId];
  if (!p) return null;
  if (typeof p.url === 'function') return p.url(z, x, y);
  return p.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

// Lat/lon → tile XY at given zoom
function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

// Tile XY → lat/lon of NW corner at given zoom
function tileToLatLon(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lon = x / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

// Tile width in meters at given lat + zoom
function tileMeters(lat, zoom) {
  return 156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}

export class BasemapVisuals {
  constructor(viewerCore) {
    this._viewer = viewerCore;
    this._group = new THREE.Group();
    this._group.name = 'BasemapVisuals';
    this._group.userData = { isBasemap: true };
    // Match model group rotation so basemap shares world space
    this._group.rotation.x = -Math.PI / 2;
    viewerCore._scene.add(this._group);
    this._provider = null;
    this._opacity = 1.0;
    this._tileMeshes = [];
    this._loader = new THREE.TextureLoader();
    this._loader.crossOrigin = 'anonymous';
  }

  /**
   * Show basemap centered on the given model (or first georef'd model).
   *
   * @param {{
   *   provider: string,
   *   centerLatLon: {lat, lon},
   *   centerCrsXY: [E, N],   // model CRS coords for the center
   *   modelCrs: string,       // EPSG:5514 etc — for reprojecting tile corners
   *   falseOrigin: [E, N, H]|null,  // subtract for WebGL precision
   *   zoom?: number,          // default 17
   *   gridSize?: number,      // default 5 (NxN tiles)
   *   opacity?: number,
   *   reprojectFn: (point, fromCrs, toCrs) => Promise<[E,N,H]>,
   *   yPlane?: number,        // world Y for the plane (terrain elevation)
   *   terrain?: TerrainData,  // optional — project tiles onto TIN via clipping
   * }} opts
   */
  async show(opts) {
    this.clear();
    if (!opts || !opts.centerLatLon || !opts.modelCrs) return;
    const provider = opts.provider || 'osm';
    const zoom = opts.zoom || 17;
    const gridSize = opts.gridSize || 5;
    const opacity = opts.opacity ?? 1.0;
    const yPlane = opts.yPlane ?? 0;
    this._provider = provider;
    this._opacity = opacity;

    const { lat, lon } = opts.centerLatLon;
    const tw = tileMeters(lat, zoom);
    const center = latLonToTile(lat, lon, zoom);
    const half = Math.floor(gridSize / 2);
    const fo = opts.falseOrigin || [0, 0, 0];
    const terrain = opts.terrain;

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tx = center.x + dx;
        const ty = center.y + dy;
        const url = tileUrl(provider, tx, ty, zoom);
        if (!url) continue;
        const nw = tileToLatLon(tx, ty, zoom);
        const se = tileToLatLon(tx + 1, ty + 1, zoom);
        const centerLatLon = { lat: (nw.lat + se.lat) / 2, lon: (nw.lon + se.lon) / 2 };

        const reprojected = await opts.reprojectFn([centerLatLon.lon, centerLatLon.lat], 'EPSG:4326', opts.modelCrs);
        if (!reprojected) continue;
        const [tileCenterE, tileCenterN] = reprojected;
        const tileMinE = tileCenterE - tw / 2;
        const tileMinN = tileCenterN - tw / 2;
        const tileMaxE = tileCenterE + tw / 2;
        const tileMaxN = tileCenterN + tw / 2;
        const localE = tileCenterE - fo[0];
        const localN = tileCenterN - fo[1];

        const mat = new THREE.MeshBasicMaterial({
          transparent: opacity < 1, opacity,
          depthWrite: false, side: THREE.DoubleSide,
        });

        let mesh;
        if (terrain) {
          const geom = _buildTerrainTileGeometry(terrain, {
            minX: tileMinE, minY: tileMinN, maxX: tileMaxE, maxY: tileMaxN,
          }, fo);
          if (!geom) continue;  // tile has no terrain coverage
          mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(0, 0, 0);
        } else {
          const planeGeom = new THREE.PlaneGeometry(tw, tw);
          mesh = new THREE.Mesh(planeGeom, mat);
          mesh.position.set(localE, localN, yPlane);
        }
        mesh.renderOrder = -1;
        this._group.add(mesh);
        this._tileMeshes.push(mesh);

        this._loader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            mat.map = tex;
            mat.needsUpdate = true;
          },
          undefined,
          (err) => console.warn(`Tile load failed ${url}:`, err),
        );
      }
    }
  }

  setOpacity(opacity) {
    this._opacity = opacity;
    for (const m of this._tileMeshes) {
      m.material.opacity = opacity;
      m.material.transparent = opacity < 1;
      m.material.needsUpdate = true;
    }
  }

  clear() {
    for (const m of this._tileMeshes) {
      this._group.remove(m);
      m.geometry.dispose();
      if (m.material.map) m.material.map.dispose();
      m.material.dispose();
    }
    this._tileMeshes = [];
  }

  getState() {
    return {
      provider: this._provider,
      opacity: this._opacity,
      tileCount: this._tileMeshes.length,
      visible: this._tileMeshes.length > 0,
    };
  }

  setVisible(visible) {
    this._group.visible = !!visible;
  }
}

// -------------------- Terrain projection helper --------------------

/**
 * Build a BufferGeometry consisting of all terrain triangles clipped to a
 * tile rect. Each output vertex carries UV = (xy - tileMin) / tileSize so the
 * tile texture maps correctly. Positions are pre-shifted by falseOrigin.
 * Returns null if no triangles fall within the rect.
 */
function _buildTerrainTileGeometry(terrain, rect, falseOrigin) {
  const tileSizeX = rect.maxX - rect.minX;
  const tileSizeY = rect.maxY - rect.minY;
  const positions = [];
  const uvs = [];
  const indices = [];
  const fo = falseOrigin || [0, 0, 0];

  for (const tri of terrain.triangles) {
    const a = terrain.vertices[tri[0]];
    const b = terrain.vertices[tri[1]];
    const c = terrain.vertices[tri[2]];
    if (!a || !b || !c) continue;
    // Quick reject: if all three points outside rect on same side, skip
    if ((a.x < rect.minX && b.x < rect.minX && c.x < rect.minX) ||
        (a.x > rect.maxX && b.x > rect.maxX && c.x > rect.maxX) ||
        (a.y < rect.minY && b.y < rect.minY && c.y < rect.minY) ||
        (a.y > rect.maxY && b.y > rect.maxY && c.y > rect.maxY)) continue;

    const clipped = clipTriangleToRect([a, b, c], rect);
    if (clipped.length < 3) continue;
    const subTris = fanTriangulate(clipped);
    for (const t of subTris) {
      const baseIdx = positions.length / 3;
      for (const v of t) {
        positions.push(v.x - fo[0], v.y - fo[1], v.z - fo[2]);
        // UV: u = (x - minX) / tileSizeX, v = 1 - (y - minY) / tileSizeY
        // (1 - v because tile texture is top-down whereas our Y is north-up)
        const u = (v.x - rect.minX) / tileSizeX;
        const vv = 1 - (v.y - rect.minY) / tileSizeY;
        uvs.push(u, vv);
      }
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    }
  }

  if (indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geo.computeVertexNormals();
  return geo;
}
