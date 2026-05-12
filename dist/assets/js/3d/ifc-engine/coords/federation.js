// Federation mode logic — compute per-model offsets to apply to viewer Group.position.
//
// Modes:
//   - 'auto': first-loaded model anchors at world origin; subsequent models
//     get offset = (firstBboxCenter - thisBboxCenter) so all bbox centers align.
//   - 'real-coords': no offset (identity); respects IFC world coords.
//   - 'manual': uses explicit offsets per modelId from `manualOffsets` Map;
//     models without explicit entry default to identity.

/**
 * @param {Map<string, { bboxCenter: [number,number,number] | null }>} modelsCoords
 *        ModelId → coords data. Order matters for 'auto' — first entry is the anchor.
 * @param {'auto' | 'real-coords' | 'manual'} mode
 * @param {Map<string, [number,number,number]> | null} manualOffsets
 *        For 'manual' mode only; ignored otherwise.
 * @returns {Map<string, [number,number,number]>} modelId → offset vector
 */
export function computeOffsets(modelsCoords, mode, manualOffsets) {
  const offsets = new Map();
  if (modelsCoords.size === 0) return offsets;

  if (mode === 'real-coords') {
    for (const modelId of modelsCoords.keys()) {
      offsets.set(modelId, [0, 0, 0]);
    }
    return offsets;
  }

  if (mode === 'manual') {
    for (const modelId of modelsCoords.keys()) {
      const explicit = manualOffsets?.get(modelId);
      offsets.set(modelId, explicit || [0, 0, 0]);
    }
    return offsets;
  }

  // auto mode — first model anchors at origin, others shifted to align bbox centers
  let anchor = null;
  for (const [modelId, coords] of modelsCoords) {
    if (anchor === null) {
      offsets.set(modelId, [0, 0, 0]);
      anchor = coords.bboxCenter;
      continue;
    }
    if (!coords.bboxCenter || !anchor) {
      offsets.set(modelId, [0, 0, 0]);
      continue;
    }
    offsets.set(modelId, [
      anchor[0] - coords.bboxCenter[0],
      anchor[1] - coords.bboxCenter[1],
      anchor[2] - coords.bboxCenter[2],
    ]);
  }
  return offsets;
}
