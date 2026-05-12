// Raycaster-based selection: convert client (x,y) to NDC, intersect scene,
// return first model mesh hit.
//
// Model meshes are identified by mesh.userData.modelId (set in viewer.addModel).
// Other scene contents (lights, helper objects) are filtered out.

import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

/**
 * Hit test the scene at canvas-relative (clientX, clientY).
 *
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX — page-relative x (e.g. event.clientX)
 * @param {number} clientY — page-relative y
 * @returns {{ modelId, expressId, ifcType, point, distance } | null}
 */
export function selectAt(scene, camera, canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

  _raycaster.setFromCamera(_ndc, camera);
  const hits = _raycaster.intersectObjects(scene.children, true);

  for (const hit of hits) {
    const mesh = hit.object;
    if (!mesh.isMesh) continue;
    const ud = mesh.userData;
    if (!ud || !ud.modelId) continue;
    // Compute world-space face normal: transform local face.normal by mesh's
    // inverse-transpose world matrix. For uniform scale + rotation (our case),
    // the world matrix can be applied directly to the normal then re-normalized.
    let worldNormal = null;
    if (hit.face && hit.face.normal) {
      worldNormal = hit.face.normal.clone()
        .transformDirection(mesh.matrixWorld)
        .normalize();
    }
    return {
      modelId: ud.modelId,
      expressId: ud.expressId,
      ifcType: ud.ifcType,
      point: hit.point.clone(),
      normal: worldNormal,
      distance: hit.distance,
    };
  }
  return null;
}
