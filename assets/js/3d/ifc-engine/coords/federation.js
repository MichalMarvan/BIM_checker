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

/** Max reziduum (m) mezi středem osy a bbox středem modelu po posunu. */
export const MAP_SHIFT_MAX_RESIDUAL_M = 50000;

/**
 * LandXML osy bývají v mapových souřadnicích (S-JTSK), zatímco model může mít
 * geometrii lokálně + IfcMapConversion (LoGeoRef50 varianta 1). Rozhodne, zda
 * osu posunout inverzí MapConversion do lokálního framu modelu: posun se
 * aplikuje jen tehdy, když osu k modelu skutečně PŘIBLÍŽÍ (varianta 2 s
 * nulovými offsety i lokální XML zůstávají beze změny).
 *
 * Rotaci/scale MapConversion neřešíme (typicky 0/1) — jen warn.
 *
 * @param {[number,number,number]|null} axisCenter — bod osy v jejích souřadnicích
 * @param {[number,number,number]|null} modelCenter — bbox střed modelu (IFC frame)
 * @param {{eastings,northings,orthogonalHeight,rotationDeg,scale}|null} mapConversion
 * @returns {[number,number,number]|null} posun k přičtení, nebo null
 */
export function mapToLocalShift(axisCenter, modelCenter, mapConversion) {
  if (!axisCenter || !modelCenter || !mapConversion) return null;
  const E = mapConversion.eastings || 0;
  const N = mapConversion.northings || 0;
  const H = mapConversion.orthogonalHeight || 0;
  if (E === 0 && N === 0) return null;
  const dRaw = Math.hypot(axisCenter[0] - modelCenter[0], axisCenter[1] - modelCenter[1]);
  const dShifted = Math.hypot(axisCenter[0] - E - modelCenter[0], axisCenter[1] - N - modelCenter[1]);
  // Posun musí osu k modelu skutečně USADIT (reziduum u legitimního páru je
  // v jednotkách km), ne jen zlepšit — prohozená (N,E) osa se posunem
  // „zlepší" o stovky km a stále leží v nesmyslu.
  if (dShifted >= dRaw || dShifted > MAP_SHIFT_MAX_RESIDUAL_M) return null;
  if (Math.abs(mapConversion.rotationDeg || 0) > 0.01 || Math.abs((mapConversion.scale || 1) - 1) > 1e-9) {
    console.warn('[federation] MapConversion má rotaci/scale — osa posunuta jen translací, může být natočená');
  }
  return [-E, -N, -H];
}
