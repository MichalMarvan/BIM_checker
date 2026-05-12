// Phase 6.10 — proj4js wrapper for cross-CRS coordinate reprojection.
//
// Lazy-loaded proj4js (~50KB gzipped) from esm.sh. Bundles built-in defs
// for the most common CRSs encountered in CZ infrastructure projects;
// unknown EPSG codes are auto-fetched from epsg.io as fallback.
//
// All public functions accept and return [E, N, H] (or [lon, lat, h] for
// geographic CRSs) tuples. Heights pass through unchanged unless caller
// supplies a vertical-datum-aware definition.

let _proj4Promise = null;
const _knownDefs = new Map();   // epsgCode → defString
const _registeredCodes = new Set(); // codes already passed to proj4.defs()

// ---- Built-in defs ----
// Sources: epsg.io, proj4js project
_knownDefs.set('EPSG:4326',
  '+proj=longlat +datum=WGS84 +no_defs +type=crs');
_knownDefs.set('EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs');
_knownDefs.set('EPSG:5514',
  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs');
_knownDefs.set('EPSG:5513',
  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +axis=swu +no_defs +type=crs');
// EPSG:32633 = WGS84 / UTM zone 33N (CZ + central Europe)
_knownDefs.set('EPSG:32633',
  '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs +type=crs');
// EPSG:32634 = UTM 34N
_knownDefs.set('EPSG:32634',
  '+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs +type=crs');
// EPSG:25833 = ETRS89 / UTM 33N (German/EU geodetic standard)
_knownDefs.set('EPSG:25833',
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

async function loadProj4() {
  if (!_proj4Promise) {
    _proj4Promise = import('https://esm.sh/proj4@2.11.0').then(m => m.default || m);
  }
  return _proj4Promise;
}

function normalizeEpsgCode(name) {
  if (!name) return null;
  const m = String(name).trim().match(/EPSG[:\s]*(\d+)/i);
  return m ? `EPSG:${m[1]}` : null;
}

/** Parse 'EPSG:5514' or 'epsg 5514' or 'S-JTSK / Krovak East North' to canonical 'EPSG:5514'. */
export function parseEpsgCode(crsName) {
  return normalizeEpsgCode(crsName);
}

/** Returns true if we have a built-in or already-fetched def for this code. */
export function hasDefinition(epsgCode) {
  return _knownDefs.has(epsgCode);
}

/**
 * Try to load a definition from epsg.io for an unknown code. Returns the
 * proj4 def string or null on failure. Caches result.
 */
async function fetchEpsgDef(epsgCode) {
  if (_knownDefs.has(epsgCode)) return _knownDefs.get(epsgCode);
  const num = epsgCode.replace(/^EPSG:/, '');
  try {
    const url = `https://epsg.io/${num}.proj4`;
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const def = (await res.text()).trim();
    if (!def || def.length < 5) return null;
    _knownDefs.set(epsgCode, def);
    return def;
  } catch {
    return null;
  }
}

async function ensureRegistered(proj4, epsgCode) {
  if (_registeredCodes.has(epsgCode)) return true;
  let def = _knownDefs.get(epsgCode);
  if (!def) def = await fetchEpsgDef(epsgCode);
  if (!def) return false;
  proj4.defs(epsgCode, def);
  _registeredCodes.add(epsgCode);
  return true;
}

/**
 * Reproject a single point [E, N] or [E, N, H] from one CRS to another.
 * Heights pass through unchanged (this is geometric reprojection, not
 * datum-shift on heights).
 *
 * @param {[number,number]|[number,number,number]} point
 * @param {string} fromCrs — 'EPSG:5514' etc.
 * @param {string} toCrs
 * @returns {Promise<[number,number,number]|null>}
 */
export async function reprojectPoint(point, fromCrs, toCrs) {
  const from = normalizeEpsgCode(fromCrs);
  const to = normalizeEpsgCode(toCrs);
  if (!from || !to || !point || point.length < 2) return null;
  if (from === to) {
    return [point[0], point[1], point[2] || 0];
  }
  const proj4 = await loadProj4();
  const okFrom = await ensureRegistered(proj4, from);
  const okTo = await ensureRegistered(proj4, to);
  if (!okFrom || !okTo) return null;
  try {
    const [x, y] = proj4(from, to, [point[0], point[1]]);
    return [x, y, point[2] || 0];
  } catch (err) {
    console.warn(`reprojectPoint ${from}→${to} failed:`, err);
    return null;
  }
}

/**
 * Convert a projected coordinate to WGS84 lat/lon.
 * @param {[number,number]} eastNorth
 * @param {string} fromCrs
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
export async function toLatLon(eastNorth, fromCrs) {
  const out = await reprojectPoint(eastNorth, fromCrs, 'EPSG:4326');
  if (!out) return null;
  return { lon: out[0], lat: out[1] };
}

/** Convert WGS84 lat/lon to a projected CRS. */
export async function fromLatLon(lat, lon, toCrs) {
  return reprojectPoint([lon, lat], 'EPSG:4326', toCrs);
}
