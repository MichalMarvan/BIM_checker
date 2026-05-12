// Phase 6.15.2 — GeoTIFF heightmap parser → TerrainData.
//
// Uses `geotiff@2` from esm.sh (lazy-loaded on first use). Reads a single-band
// elevation raster (DTM/DEM), samples to a regular grid, builds triangulated
// TIN.
//
// GeoTIFF carries its own georeferencing (ModelTiepoint + ModelPixelScale or
// ModelTransformation tags, plus EPSG code in GeoKeys). For Phase 6.15.2 MVP
// we extract:
//   - raster width × height
//   - elevation values (single-band Float32 array)
//   - bbox in CRS coordinates (from origin + pixel size × width/height)
//   - EPSG code (best-effort from GeoKeys)
//
// Caller is expected to either:
//   (a) ensure GeoTIFF CRS == model CRS, OR
//   (b) reproject the bbox corners via engine.reprojectPoint (left for future).
//
// To keep terrain mesh size manageable, we downsample to maxResolution (default
// 256×256) by simple decimation. Higher fidelity could use bilinear sampling.

let _geotiffLib = null;
async function _loadGeoTiff() {
  if (_geotiffLib) return _geotiffLib;
  _geotiffLib = await import('https://esm.sh/geotiff@2.1.3');
  return _geotiffLib;
}

/**
 * Parse GeoTIFF ArrayBuffer → TerrainData.
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ maxResolution?: number, name?: string }} opts
 * @returns {Promise<{ name, vertices, triangles, bbox, epsg }>}
 */
export async function parseGeoTiff(arrayBuffer, opts = {}) {
  const maxResolution = Math.max(8, opts.maxResolution || 256);
  const { fromArrayBuffer } = await _loadGeoTiff();
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const origin = image.getOrigin();      // [x, y] of top-left pixel
  const resolution = image.getResolution();  // [px_w, px_h]  (px_h is typically negative)
  const geoKeys = image.getGeoKeys();

  // Extract EPSG code (ProjectedCSTypeGeoKey or GeographicTypeGeoKey)
  let epsg = null;
  if (geoKeys?.ProjectedCSTypeGeoKey) epsg = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
  else if (geoKeys?.GeographicTypeGeoKey) epsg = `EPSG:${geoKeys.GeographicTypeGeoKey}`;

  // Read full raster — caller can downsample below
  const rasters = await image.readRasters({ samples: [0] });
  const elev = rasters[0];

  // Decimate to keep mesh size manageable
  const step = Math.max(1, Math.ceil(Math.max(width, height) / maxResolution));
  const cols = Math.floor(width / step);
  const rows = Math.floor(height / step);

  const vertices = [];
  const triangles = [];
  const px = resolution[0];
  const py = resolution[1];

  // Build grid vertices (row-major, top to bottom)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ix = c * step;
      const iy = r * step;
      const x = origin[0] + ix * px;
      const y = origin[1] + iy * py;   // py is typically negative
      const z = elev[iy * width + ix];
      vertices.push({ x, y, z: Number.isFinite(z) ? z : 0 });
    }
  }

  // Triangulate grid cells (2 triangles per quad)
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;
      triangles.push([a, b, e]);
      triangles.push([a, e, d]);
    }
  }

  const minX = Math.min(origin[0], origin[0] + width * px);
  const maxX = Math.max(origin[0], origin[0] + width * px);
  const minY = Math.min(origin[1], origin[1] + height * py);
  const maxY = Math.max(origin[1], origin[1] + height * py);

  return {
    name: opts.name || 'GeoTIFF terrain',
    vertices,
    triangles,
    bbox: { minX, minY, maxX, maxY },
    epsg,
    sourceResolution: { width, height, sampled: { cols, rows, step } },
  };
}
