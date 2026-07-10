/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */

// Čistá matematika bounding boxu z pole bodů. Bez závislosti na Three.js —
// pracuje s prostými poli [x, y, z]. Používá focusAlignment pro zaměření kamery.

/** Ověří, že prvek je pole tří konečných čísel. */
function isValidPoint(p) {
  return Array.isArray(p) && p.length >= 3
    && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
}

/**
 * Spočítá bounding box z pole bodů [x, y, z].
 * Neplatné prvky přeskočí; když nezůstane žádný platný bod, vrací null.
 * @param {Array<[number, number, number]>} points
 * @returns {{ min: number[], max: number[], center: number[], maxDim: number } | null}
 */
export function bboxFromPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let count = 0;

  for (const p of points) {
    if (!isValidPoint(p)) continue;
    for (let a = 0; a < 3; a++) {
      if (p[a] < min[a]) min[a] = p[a];
      if (p[a] > max[a]) max[a] = p[a];
    }
    count++;
  }

  if (count === 0) return null;

  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const maxDim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);

  return { min, max, center, maxDim };
}
