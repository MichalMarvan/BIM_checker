/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Čistý registr měření — drží stav měření jako objekty engine, bez závislosti
// na Three.js. Hodnotu a jednotku počítá z čisté matematiky (measure-math).
// Vizualizaci ani DOM neřeší — to reconciluje viewer-core přes onChange.

import { distance, angle, polygonArea } from './measure-math.js';

// Kopie pole bodů [[x,y,z],...] tak, aby vnější kód nemohl mutovat interní stav.
function clonePoints(points) {
  return points.map(p => [p[0], p[1], p[2]]);
}

// Kopie coords [x,y,z] nebo null — stejná ochrana proti mutaci jako u points.
function cloneCoords(coords) {
  return Array.isArray(coords) ? [coords[0], coords[1], coords[2]] : null;
}

// Spočítá hodnotu a jednotku podle typu měření.
// edge se počítá jako vzdálenost dvou bodů (jednotka m).
function computeValueUnit(type, points) {
  if (type === 'distance' || type === 'edge') {
    return { value: distance(points[0], points[1]), unit: 'm' };
  }
  if (type === 'angle') {
    return { value: angle(points[0], points[1], points[2]), unit: '°' };
  }
  if (type === 'area') {
    return { value: polygonArea(points), unit: 'm²' };
  }
  if (type === 'point') {
    return { value: null, unit: '' };
  }
  return { value: 0, unit: '' };
}

export class MeasureRegistry {
  /**
   * @param {{ onChange?: () => void }} [opts] callback volaný po každé mutaci.
   */
  constructor({ onChange } = {}) {
    this._onChange = onChange || null;
    this._items = new Map();  // id → { id, type, points, value, unit, label, visible, modelId }
    this._counter = 0;
  }

  // Interní — volá onChange, pokud je nastaven.
  _emit() {
    if (this._onChange) this._onChange();
  }

  /**
   * Přidá měření, spočítá hodnotu/jednotku, vrátí id `ms_<n>`.
   * Volitelný `id` zachová stabilní identitu (restore z persistence, pohledy) —
   * čítač se posune za jeho číselný sufix, aby další auto-id nekolidovalo.
   * @param {{ type:'distance'|'edge'|'angle'|'area'|'point', points:number[][], label?:string, modelId?:string, id?:string, coords?:number[] }} spec
   * @returns {string} id
   */
  add({ type, points, label = '', modelId = null, id = null, coords = null }) {
    let useId = id;
    if (useId) {
      const m = /^ms_(\d+)$/.exec(useId);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > this._counter) this._counter = n;
      }
    } else {
      useId = `ms_${++this._counter}`;
    }
    const stored = clonePoints(points);
    const { value, unit } = computeValueUnit(type, stored);
    this._items.set(useId, {
      id: useId, type, points: stored, value, unit,
      label, visible: true, modelId, coords: cloneCoords(coords),
    });
    this._emit();
    return useId;
  }

  /**
   * Vrátí seznam měření jako kopie (body i celé objekty), aby vnější mutace
   * neovlivnila interní stav.
   * @returns {Array<{ id, type, points, value, unit, label, visible, modelId, coords }>}
   */
  list() {
    const out = [];
    for (const m of this._items.values()) {
      out.push({
        id: m.id, type: m.type, points: clonePoints(m.points),
        value: m.value, unit: m.unit, label: m.label,
        visible: m.visible, modelId: m.modelId, coords: cloneCoords(m.coords),
      });
    }
    return out;
  }

  /** Vrátí kopii jednoho měření dle id, nebo null. */
  get(id) {
    const m = this._items.get(id);
    if (!m) return null;
    return {
      id: m.id, type: m.type, points: clonePoints(m.points),
      value: m.value, unit: m.unit, label: m.label,
      visible: m.visible, modelId: m.modelId, coords: cloneCoords(m.coords),
    };
  }

  /** Odebere měření dle id. */
  remove(id) {
    if (this._items.delete(id)) this._emit();
  }

  /** Odebere všechna měření. */
  clear() {
    if (this._items.size === 0) return;
    this._items.clear();
    this._emit();
  }

  /** Nastaví viditelnost měření. */
  setVisible(id, visible) {
    const m = this._items.get(id);
    if (!m) return;
    m.visible = !!visible;
    this._emit();
  }

  /** Aktualizuje měnitelné vlastnosti měření (zatím jen label). */
  update(id, { label } = {}) {
    const m = this._items.get(id);
    if (!m) return;
    if (label !== undefined) m.label = label;
    this._emit();
  }
}
