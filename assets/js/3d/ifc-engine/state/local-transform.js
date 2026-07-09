/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */

// Čistá transformace bodu maticí 4×4 — bez THREE, aby šla testovat izolovaně
// a použít i mimo scénu (persistence měření model-lokálně).
//
// `matrixElements` je column-major pole 16 čísel přesně jako
// THREE.Matrix4.elements: sloupec 0 = indexy 0..3, sloupec 1 = 4..7 atd.
// Aplikace na bod [x,y,z] (implicitní w=1) dá:
//   x' = m0*x + m4*y + m8*z  + m12
//   y' = m1*x + m5*y + m9*z  + m13
//   z' = m2*x + m6*y + m10*z + m14
// Perspektivní dělení (w') je záměrně vynecháno — pro rigidní transformace
// (rotace + posun) a uniformní/neuniformní škálování je w' vždy 1, takže
// výsledek se shoduje s THREE.Vector3.applyMatrix4. To pokrývá všechny
// matrixWorld skupin modelů (rotace Z-up→Y-up, lengthScale, federační posun).

/**
 * @param {[number,number,number]} point — [x,y,z]
 * @param {ArrayLike<number>} matrixElements — column-major mat4 (16 prvků)
 * @returns {[number,number,number]}
 */
export function transformPointByMatrix(point, matrixElements) {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const m = matrixElements;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
