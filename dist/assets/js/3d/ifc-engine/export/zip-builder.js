// Phase 6.16 — Bundle a 3D Tiles output (tileset.json + model.glb + optional
// extras) into a single ZIP blob for download.
//
// Uses JSZip from esm.sh (lazy-loaded on first use).

let _JSZip = null;
async function _loadJSZip() {
  if (_JSZip) return _JSZip;
  const mod = await import('https://esm.sh/jszip@3.10.1');
  _JSZip = mod.default || mod;
  return _JSZip;
}

/**
 * Build a ZIP blob containing the 3D Tiles bundle.
 * @param {{
 *   tilesetJson: object,           // tileset.json data
 *   glb: ArrayBuffer,              // model.glb binary
 *   extras?: Array<{path: string, content: string|ArrayBuffer}>,
 * }} opts
 * @returns {Promise<Blob>}
 */
export async function buildTilesetZip(opts) {
  const JSZip = await _loadJSZip();
  const zip = new JSZip();
  zip.file('tileset.json', JSON.stringify(opts.tilesetJson, null, 2));
  zip.file('model.glb', opts.glb);
  if (opts.extras) {
    for (const e of opts.extras) zip.file(e.path, e.content);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
