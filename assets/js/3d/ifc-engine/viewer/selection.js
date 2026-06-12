// Raycaster-based selection: convert client (x,y) to NDC, intersect scene,
// return first model mesh hit.
//
// Model meshes are identified by mesh.userData.modelId (set in viewer.addModel).
// Other scene contents (lights, helper objects) are filtered out.

import * as THREE from 'three';
import { resolveMergedFace } from './merged-model.js';

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

/**
 * THREE.Raycaster does NOT skip invisible meshes — hidden elements would
 * still swallow clicks and block picking whatever is behind them. Treat a
 * mesh as pickable only when it (and its ancestors) are visible and it is
 * not faded out to (near-)full transparency via the opacity slider.
 */
export function isPickable(obj) {
  const mat = obj.material;
  if (mat && mat.transparent && mat.opacity <= 0.02) return false;
  let o = obj;
  while (o) {
    if (o.visible === false) return false;
    o = o.parent;
  }
  return true;
}

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
    if (!isPickable(mesh)) continue;
    const ud = mesh.userData;
    if (!ud || !ud.modelId) continue;

    // Merged-geometry models carry one mesh for all elements — resolve the
    // element from the triangle-range table by raycast faceIndex.
    let expressId = ud.expressId;
    let ifcType = ud.ifcType;
    if (ud.merged && ud.mergedTable) {
      const row = resolveMergedFace(ud.mergedTable, hit.faceIndex);
      if (!row) continue;
      // Hidden / faded-out elements must not swallow picks (mirror of the
      // mesh-level isPickable rule, evaluated per element here).
      const hide = mesh.geometry.getAttribute('elemHide');
      if (hide && hide.array[row.vertStart] > 0.98) continue;
      expressId = row.expressId;
      ifcType = row.ifcType;
    }

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
      expressId,
      ifcType,
      point: hit.point.clone(),
      normal: worldNormal,
      distance: hit.distance,
    };
  }
  return null;
}
