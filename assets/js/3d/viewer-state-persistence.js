/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */

// Orchestrátor persistence stavu vieweru (měření + řezné roviny) per model.
// Vrstva stránky (viewer-page) — spojuje engine (facáda) se store v IndexedDB.
//
// Chování (spec D3):
//  - Uložení: onViewerStateChange → (při restore se ignoruje) → debounce 1000 ms
//    → pro každý načtený model s obsahovým hashem sestav dokument a statePut.
//    Body měření se ukládají model-lokálně (world souřadnice se rozbijí při jiné
//    federaci). Řezné roviny patří JEN do dokumentu kotevního modelu (první
//    v getModels()) — vážou se k federaci jako celku.
//  - Restore: po každém úspěšném načtení modelu (viewer-page zavolá
//    restoreModelState) — z dokumentu daného modelu obnoví měření (model-lokál →
//    world) a JEN z dokumentu kotevního modelu obnoví řezné roviny. Po dobu
//    restore je nastavený flag `restoring`, aby change-callback neukládal
//    mezistav; na konci se vynutí jeden save (sync id + prázdný stav).
//  - Prázdný stav se ukládá taky (prázdná pole) — jinak by se smazané věci po
//    reloadu vracely.

import { stateGet, statePut } from './ifc-engine/state/viewer-state-store.js';

const SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 1000;

// Modulová instance orchestrátoru — jen jeden viewer na stránku. Drží flag
// restoring a debounce timer, aby restore a save nešly proti sobě.
let _orch = null;

class StatePersistence {
  constructor(engine) {
    this._engine = engine;
    // Počítadlo místo booleanu — dávkové načítání (CONCURRENT_LOADS) může
    // spustit více restore() současně; save se má potlačit, dokud NEDOBĚHNOU
    // všechny (jinak by adds pozdějšího restore prosákly do uloženého stavu).
    this._restoreDepth = 0;
    this._saveTimer = null;
  }

  get _restoring() { return this._restoreDepth > 0; }

  // Zaregistruj change-callback s debounce. Při restore se save neplánuje.
  init() {
    this._engine.onViewerStateChange(() => {
      if (this._restoring) return;
      this._scheduleSave();
    });
  }

  _scheduleSave() {
    // Nové vyvolání ruší předchozí naplánovaný save (poslední stav vyhrává).
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._saveNow().catch(e => console.warn('[viewer-state] save failed:', e));
    }, SAVE_DEBOUNCE_MS);
  }

  // Vrátí id kotevního modelu = první načtený model, nebo null.
  _anchorModelId() {
    const models = this._engine.getModels() || [];
    return models.length ? models[0].modelId : null;
  }

  /**
   * Sestav a ulož dokumenty pro všechny načtené modely, které mají hash.
   * Měření patří do dokumentu svého modelu; řezné roviny jen do dokumentu
   * kotevního modelu. Prázdné stavy se ukládají také (smazané zůstane smazané).
   */
  async _saveNow() {
    const engine = this._engine;
    const models = engine.getModels() || [];
    const anchorId = models.length ? models[0].modelId : null;

    // Měření rozděl podle modelId; roviny sesbírej jednou (patří kotvě).
    const measurements = engine.getMeasurements() || [];
    const byModel = new Map();       // modelId → měření[]
    for (const m of measurements) {
      const mid = m.modelId;
      if (!byModel.has(mid)) byModel.set(mid, []);
      byModel.get(mid).push(m);
    }

    for (const model of models) {
      const modelId = model.modelId;
      const hash = engine.getModelContentHash(modelId);
      // Měření bez hashe (model bez hashe) se neukládají — spec D3.
      if (!hash) continue;

      const isAnchor = modelId === anchorId;
      const doc = {
        schemaVersion: SCHEMA_VERSION,
        measurements: this._serializeMeasurements(modelId, byModel.get(modelId) || []),
        sectionPlanes: isAnchor ? this._serializeSectionPlanes(modelId) : [],
      };
      await statePut(hash, doc);
    }
  }

  // Měření modelu → dokumentové položky (body model-lokálně).
  _serializeMeasurements(modelId, items) {
    const engine = this._engine;
    const out = [];
    for (const m of items) {
      const localPoints = m.points.map(p => engine.worldToModelLocal(modelId, p) || p);
      out.push({
        id: m.id, type: m.type, points: localPoints,
        label: m.label, visible: m.visible, value: m.value, unit: m.unit,
      });
    }
    return out;
  }

  // Řezné roviny → dokumentové položky vůči kotevnímu modelu (point model-lokál,
  // normal jen rotací přes Dir variantu).
  _serializeSectionPlanes(anchorModelId) {
    const engine = this._engine;
    const planes = engine.getSectionPlanes() || [];
    const out = [];
    for (const p of planes) {
      const localPoint = engine.worldToModelLocal(anchorModelId, p.point) || p.point;
      const localNormal = engine.worldToModelLocalDir(anchorModelId, p.normal) || p.normal;
      out.push({
        name: p.name, point: localPoint, normal: localNormal,
        offset: p.offset, visible: p.visible,
      });
    }
    return out;
  }

  /**
   * Obnov stav modelu z persistence. Měření vždy (dokument daného modelu),
   * řezné roviny jen když je model kotevní. Po dobu restore je nastavený flag,
   * aby change-callback neukládal mezistav; na konci se vynutí jeden save.
   * @param {string} modelId
   * @param {string} contentHash
   */
  async restore(modelId, contentHash) {
    if (!contentHash) return;
    this._restoreDepth++;
    try {
      const doc = await stateGet(contentHash);
      if (doc) {
        this._restoreMeasurements(modelId, doc.measurements || []);
        // Roviny obnovuje JEN dokument kotevního modelu — jinak by se při
        // načtení druhého+ modelu duplikovaly roviny už obnovené z kotvy.
        if (modelId === this._anchorModelId()) {
          this._restoreSectionPlanes(modelId, doc.sectionPlanes || []);
        }
      }
    } finally {
      this._restoreDepth--;
    }
    // Vynuť jeden save i pro prázdný/nový stav — sjednotí uložené id a zajistí,
    // že smazané položky zůstanou smazané po dalším reloadu.
    await this._saveNow().catch(e => console.warn('[viewer-state] post-restore save failed:', e));
  }

  _restoreMeasurements(modelId, items) {
    const engine = this._engine;
    for (const m of items) {
      const worldPoints = (m.points || []).map(p => engine.modelLocalToWorld(modelId, p) || p);
      // id se zachovává (stabilní reference z pohledů); registry čítač se posune.
      const id = engine.addMeasurement({
        id: m.id, type: m.type, points: worldPoints,
        label: m.label || '', modelId,
      });
      if (id && m.visible === false) engine.setMeasurementVisible(id, false);
    }
  }

  _restoreSectionPlanes(anchorModelId, planes) {
    const engine = this._engine;
    for (const p of planes) {
      const worldPoint = engine.modelLocalToWorld(anchorModelId, p.point) || p.point;
      const worldNormal = engine.modelLocalToWorldDir(anchorModelId, p.normal) || p.normal;
      const id = engine.addSectionPlane(worldPoint, worldNormal);
      if (id) {
        engine.updateSectionPlane(id, {
          offset: Number.isFinite(p.offset) ? p.offset : 0,
          visible: p.visible !== false,
          name: p.name,
        });
      }
    }
  }
}

/**
 * Inicializuj persistenci — zaregistruj change-callback s debounce. Volá se
 * z viewer-page po vytvoření enginu. Idempotentní pro daný engine.
 * @param {object} engine facáda IfcEngine
 */
export function initStatePersistence(engine) {
  if (_orch && _orch._engine === engine) return _orch;
  _orch = new StatePersistence(engine);
  _orch.init();
  return _orch;
}

/**
 * Obnov uložený stav pro právě načtený model. Volá se z viewer-page po každém
 * úspěšném loadu (po federation bake, aby model-lokální transformace seděly).
 * @param {object} engine facáda IfcEngine
 * @param {string} modelId
 * @param {string} contentHash
 * @returns {Promise<void>}
 */
export async function restoreModelState(engine, modelId, contentHash) {
  const orch = (_orch && _orch._engine === engine) ? _orch : initStatePersistence(engine);
  return orch.restore(modelId, contentHash);
}
