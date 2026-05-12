// 27 view spec entries: 26 named (6 faces + 12 edges + 8 corners) + 'iso' alias.
// Each spec describes camera direction (target → camera) as unit vector + camera up vector.

import * as THREE from 'three';

const RAW_SPECS = {
  'top':    { dir: [0, 1, 0],   up: [0, 0, -1] },
  'bottom': { dir: [0, -1, 0],  up: [0, 0, 1] },
  'front':  { dir: [0, 0, 1],   up: [0, 1, 0] },
  'back':   { dir: [0, 0, -1],  up: [0, 1, 0] },
  'left':   { dir: [-1, 0, 0],  up: [0, 1, 0] },
  'right':  { dir: [1, 0, 0],   up: [0, 1, 0] },

  'edge-tf':   { dir: [0, 1, 1],   up: [0, 1, -1] },
  'edge-tb':   { dir: [0, 1, -1],  up: [0, 1, 1] },
  'edge-tl':   { dir: [-1, 1, 0],  up: [1, 1, 0] },
  'edge-tr':   { dir: [1, 1, 0],   up: [-1, 1, 0] },
  'edge-bf':   { dir: [0, -1, 1],  up: [0, 1, 1] },
  'edge-bb':   { dir: [0, -1, -1], up: [0, 1, -1] },
  'edge-bl':   { dir: [-1, -1, 0], up: [1, -1, 0] },
  'edge-br':   { dir: [1, -1, 0],  up: [-1, -1, 0] },
  'edge-fl':   { dir: [-1, 0, 1],  up: [0, 1, 0] },
  'edge-fr':   { dir: [1, 0, 1],   up: [0, 1, 0] },
  'edge-bl-z': { dir: [-1, 0, -1], up: [0, 1, 0] },
  'edge-br-z': { dir: [1, 0, -1],  up: [0, 1, 0] },

  'iso-tfr': { dir: [1, 1, 1],    up: [0, 1, 0] },
  'iso-tfl': { dir: [-1, 1, 1],   up: [0, 1, 0] },
  'iso-tbr': { dir: [1, 1, -1],   up: [0, 1, 0] },
  'iso-tbl': { dir: [-1, 1, -1],  up: [0, 1, 0] },
  'iso-bfr': { dir: [1, -1, 1],   up: [0, 1, 0] },
  'iso-bfl': { dir: [-1, -1, 1],  up: [0, 1, 0] },
  'iso-bbr': { dir: [1, -1, -1],  up: [0, 1, 0] },
  'iso-bbl': { dir: [-1, -1, -1], up: [0, 1, 0] },

  'iso':     { dir: [1, 1, 1],    up: [0, 1, 0] },
};

const SPECS = {};
for (const [key, raw] of Object.entries(RAW_SPECS)) {
  SPECS[key] = {
    dir: new THREE.Vector3(...raw.dir).normalize(),
    up:  new THREE.Vector3(...raw.up).normalize(),
  };
}

export const VIEW_SPEC_NAMES = Object.keys(SPECS);

export function getViewSpec(name) {
  return SPECS[name] || null;
}
