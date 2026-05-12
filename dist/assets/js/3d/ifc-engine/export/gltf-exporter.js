// Phase 6.16 — GLB export from viewer scene.
//
// Wraps THREE.GLTFExporter (loaded dynamically from local node_modules) to
// produce a GLB binary blob from one or more model groups.
//
// IMPORTANT — coordinate frame: model groups in the viewer have
// `rotation.x = -π/2` so that IFC alignment frame (E, N, Z with Z-up)
// becomes Three.js world frame (X, Y, Z with Y-up). When we export those
// groups, the GLB content is therefore in Three's Y-up frame. 3D Tiles
// consumers (Cesium etc.) automatically apply Y→Z rotation to glTF content
// before placing it in the tileset's Z-up local frame, so the model lands
// back in its alignment frame at the tile root — exactly where the ECEF
// transform expects it.

let _GLTFExporterClass = null;
async function _loadExporter() {
  if (_GLTFExporterClass) return _GLTFExporterClass;
  const mod = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  _GLTFExporterClass = mod.GLTFExporter;
  return _GLTFExporterClass;
}

/**
 * Export an array of THREE.Object3D (typically model groups) as a single
 * GLB binary.
 *
 * @param {THREE.Object3D[]} objects
 * @param {{ binary?: boolean, embedImages?: boolean, onlyVisible?: boolean }} opts
 * @returns {Promise<ArrayBuffer>} binary GLB
 */
export async function exportObjectsToGlb(objects, opts = {}) {
  if (!Array.isArray(objects) || objects.length === 0) {
    throw new Error('exportObjectsToGlb: at least one object required');
  }
  const Exporter = await _loadExporter();
  const exporter = new Exporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      objects,
      (gltf) => {
        // With binary:true, gltf is an ArrayBuffer
        if (gltf instanceof ArrayBuffer) resolve(gltf);
        else reject(new Error('GLTFExporter did not return ArrayBuffer (binary mode expected)'));
      },
      (err) => reject(err),
      {
        binary: true,
        embedImages: opts.embedImages !== false,
        onlyVisible: opts.onlyVisible !== false,
        includeCustomExtensions: true,
      },
    );
  });
}

/**
 * Compute world-space bounding box of a list of objects (post-transform).
 * Returns {min:[x,y,z], max:[x,y,z]} in Three.js Y-up world frame.
 * Used as the tile bounding volume.
 */
export function computeWorldBbox(objects) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let any = false;
  for (const obj of objects) {
    obj.updateMatrixWorld(true);
    obj.traverse(child => {
      if (!child.isMesh || !child.geometry) return;
      const geo = child.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox.clone();
      bb.applyMatrix4(child.matrixWorld);
      if (bb.min.x < minX) minX = bb.min.x;
      if (bb.min.y < minY) minY = bb.min.y;
      if (bb.min.z < minZ) minZ = bb.min.z;
      if (bb.max.x > maxX) maxX = bb.max.x;
      if (bb.max.y > maxY) maxY = bb.max.y;
      if (bb.max.z > maxZ) maxZ = bb.max.z;
      any = true;
    });
  }
  if (!any) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
