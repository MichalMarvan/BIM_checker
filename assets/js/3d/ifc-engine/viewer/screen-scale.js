/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Screen-constant velikost: kolik world jednotek připadá na jeden pixel v místě
// world bodu. Čistý modul — jen čtení vlastností kamery + Math, žádný import three
// (testy mockují kamery jako prosté objekty). Slouží gizmo rukojetím řezu,
// měřicím značkám a face-pick kurzoru.

/** Vrátí [x, y, z] z pole nebo objektu {x, y, z}. */
function xyz(worldPos) {
  if (Array.isArray(worldPos)) return worldPos;
  return [worldPos.x, worldPos.y, worldPos.z];
}

/**
 * World jednotky na pixel v místě world bodu.
 * @param {object} camera perspektivní ({isPerspectiveCamera, fov, position})
 *   nebo ortho ({top, bottom, zoom, position}). Nevyžaduje instanci THREE.Camera.
 * @param {number[]|{x,y,z}} worldPos bod, ke kterému se počítá vzdálenost (perspektiva)
 * @param {number} viewportHeightPx výška viewportu v pixelech
 * @returns {number} world jednotek na pixel
 */
export function worldPerPixel(camera, worldPos, viewportHeightPx) {
  const vh = viewportHeightPx;
  if (camera.isPerspectiveCamera) {
    const [px, py, pz] = xyz(worldPos);
    const c = camera.position;
    // Vzdálenost počítáme ručně přes hypot — kamera je jen objekt s vlastnostmi.
    const dist = Math.hypot(c.x - px, c.y - py, c.z - pz);
    return (2 * dist * Math.tan((camera.fov * Math.PI / 180) / 2)) / vh;
  }
  // Ortho: pixelová velikost je konstantní, nezávisí na vzdálenosti.
  return ((camera.top - camera.bottom) / camera.zoom) / vh;
}

/**
 * Cílová world velikost prvku, aby na obrazovce zabral ~targetPx pixelů, s clampem.
 * @param {object} camera viz worldPerPixel
 * @param {number[]|{x,y,z}} worldPos bod prvku
 * @param {number} viewportHeightPx výška viewportu v pixelech
 * @param {number} targetPx cílová obrazovková velikost v pixelech
 * @param {{min?:number, max?:number}} [opts] clamp meze (default min=0.01, max=Infinity)
 * @returns {number} clamp(targetPx * worldPerPixel(...), min, max)
 */
export function screenScale(camera, worldPos, viewportHeightPx, targetPx, { min = 0.01, max = Infinity } = {}) {
  const s = targetPx * worldPerPixel(camera, worldPos, viewportHeightPx);
  return Math.min(Math.max(s, min), max);
}
