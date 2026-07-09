/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// guid-resolve — převod IFC GlobalId (22-znakový GUID) na expressId.
// EntityIndex si při stavbě drží mapu _byGuid (Map<guid, expressId>); tady
// jen vybereme hledané GUIDy. Iterujeme přes vstupní GUIDy (jich bývá málo),
// ne přes celý index.

/**
 * Přeloží zadané GUIDy na expressId pomocí GUID-indexu v EntityIndex.
 * Chybějící (neznámé) GUIDy se do výsledné mapy nezanesou.
 *
 * @param {import('./entity-index.js').EntityIndex} entityIndex
 * @param {Iterable<string>} guids — hledané IFC GlobalId
 * @returns {Map<string, number>} Map<guid, expressId> jen pro nalezené GUIDy
 */
export function resolveGuidsInIndex(entityIndex, guids) {
  const out = new Map();
  if (!entityIndex || !guids) return out;
  const byGuid = entityIndex._byGuid;
  if (!byGuid) return out;
  for (const guid of guids) {
    const expressId = byGuid.get(guid);
    // _byGuid drží jen validní expressId (čísla), takže stačí test na undefined.
    if (expressId !== undefined) out.set(guid, expressId);
  }
  return out;
}
