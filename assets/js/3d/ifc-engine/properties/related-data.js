// Extract non-occurrence IFC data linked to an element:
// type property sets, material associations, and classifications.

import { splitParams } from '../parser/step-parser.js';
import { decodeIFCString } from '../parser/ifc-decoder.js';
import { parseRef, parseRefList } from '../geometry/step-helpers.js';
import { extractPropertySet } from './psets.js';

const _relatedIndexCache = new WeakMap();

function unquoteString(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = String(raw).match(/^'(.*)'$/s);
  if (!m) return null;
  return decodeIFCString(m[1].replace(/''/g, "'"));
}

function refList(raw) {
  return raw ? parseRefList(raw) : [];
}

function numberValue(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function getRelatedIndex(entityIndex) {
  let cached = _relatedIndexCache.get(entityIndex);
  if (cached) return cached;

  cached = {
    typeByElement: new Map(),
    materialsByElement: new Map(),
    classificationsByElement: new Map(),
  };

  for (const rel of entityIndex.byType('IfcRelDefinesByType')) {
    const parts = splitParams(rel.params);
    const relatedRefs = refList(parts[4]);
    const typeRef = parseRef(parts[5]);
    if (!typeRef) continue;
    for (const expressId of relatedRefs) {
      addToIndex(cached.typeByElement, expressId, typeRef);
    }
  }

  for (const rel of entityIndex.byType('IfcRelAssociatesMaterial')) {
    const parts = splitParams(rel.params);
    const relatedRefs = refList(parts[4]);
    const materialRef = parseRef(parts[5]);
    if (!materialRef) continue;
    for (const expressId of relatedRefs) {
      addToIndex(cached.materialsByElement, expressId, materialRef);
    }
  }

  for (const rel of entityIndex.byType('IfcRelAssociatesClassification')) {
    const parts = splitParams(rel.params);
    const relatedRefs = refList(parts[4]);
    const classificationRef = parseRef(parts[5]);
    if (!classificationRef) continue;
    for (const expressId of relatedRefs) {
      addToIndex(cached.classificationsByElement, expressId, classificationRef);
    }
  }

  _relatedIndexCache.set(entityIndex, cached);
  return cached;
}

function addToIndex(index, expressId, value) {
  let arr = index.get(expressId);
  if (!arr) {
    arr = [];
    index.set(expressId, arr);
  }
  if (!arr.includes(value)) arr.push(value);
}

function extractTypePropertySets(entityIndex, expressId) {
  const index = getRelatedIndex(entityIndex);
  const typeRefs = index.typeByElement.get(expressId) || [];
  const out = [];

  for (const typeId of typeRefs) {
    const typeEntity = entityIndex.byExpressId(typeId);
    if (!typeEntity) continue;
    const parts = splitParams(typeEntity.params);
    const typeName = unquoteString(parts[2]) || `${typeEntity.type} #${typeId}`;
    const psetRefs = refList(parts[5]);
    for (const psetId of psetRefs) {
      const pset = extractPropertySet(entityIndex, psetId);
      if (!pset) continue;
      out.push({
        ...pset,
        source: 'type',
        typeId,
        typeName,
        typeClass: typeEntity.type,
      });
    }
  }

  return out;
}

function extractMaterials(entityIndex, expressId) {
  const index = getRelatedIndex(entityIndex);
  const refs = collectRefsForElementAndTypes(index.materialsByElement, index.typeByElement, expressId);
  return refs
    .map(ref => parseMaterialDefinition(entityIndex, ref, new Set()))
    .filter(Boolean);
}

function parseMaterialDefinition(entityIndex, materialId, seen) {
  if (!materialId || seen.has(materialId)) return null;
  seen.add(materialId);

  const entity = entityIndex.byExpressId(materialId);
  if (!entity) return null;
  const parts = splitParams(entity.params);

  if (entity.type === 'IFCMATERIAL') {
    return {
      type: entity.type,
      expressId: materialId,
      name: unquoteString(parts[0]) || `#${materialId}`,
      description: unquoteString(parts[1]) || '',
      category: unquoteString(parts[2]) || '',
    };
  }

  if (entity.type === 'IFCMATERIALLIST') {
    const materials = refList(parts[0])
      .map(ref => parseMaterialDefinition(entityIndex, ref, new Set(seen)))
      .filter(Boolean);
    return {
      type: entity.type,
      expressId: materialId,
      name: materials.map(m => m.name).filter(Boolean).join(', ') || `#${materialId}`,
      materials,
    };
  }

  if (entity.type === 'IFCMATERIALLAYER') {
    const material = parseMaterialDefinition(entityIndex, parseRef(parts[0]), new Set(seen));
    const layerName = unquoteString(parts[3]) || material?.name || `Vrstva #${materialId}`;
    return {
      type: entity.type,
      expressId: materialId,
      name: layerName,
      materialName: material?.name || '',
      thickness: numberValue(parts[1]),
      category: unquoteString(parts[5]) || material?.category || '',
      material,
    };
  }

  if (entity.type === 'IFCMATERIALLAYERSET') {
    const layers = refList(parts[0])
      .map(ref => parseMaterialDefinition(entityIndex, ref, new Set(seen)))
      .filter(Boolean);
    return {
      type: entity.type,
      expressId: materialId,
      name: unquoteString(parts[1]) || layers.map(l => l.name).filter(Boolean).join(', ') || `#${materialId}`,
      description: unquoteString(parts[2]) || '',
      layers,
    };
  }

  if (entity.type === 'IFCMATERIALLAYERSETUSAGE') {
    const layerSet = parseMaterialDefinition(entityIndex, parseRef(parts[0]), new Set(seen));
    return layerSet ? { ...layerSet, type: entity.type, usage: true } : null;
  }

  if (entity.type === 'IFCMATERIALCONSTITUENT') {
    const material = parseMaterialDefinition(entityIndex, parseRef(parts[2]), new Set(seen));
    return {
      type: entity.type,
      expressId: materialId,
      name: unquoteString(parts[0]) || material?.name || `Složka #${materialId}`,
      materialName: material?.name || '',
      fraction: numberValue(parts[3]),
      category: unquoteString(parts[4]) || material?.category || '',
      material,
    };
  }

  if (entity.type === 'IFCMATERIALCONSTITUENTSET') {
    const constituents = refList(parts[2])
      .map(ref => parseMaterialDefinition(entityIndex, ref, new Set(seen)))
      .filter(Boolean);
    return {
      type: entity.type,
      expressId: materialId,
      name: unquoteString(parts[0]) || constituents.map(c => c.name).filter(Boolean).join(', ') || `#${materialId}`,
      constituents,
    };
  }

  if (entity.type === 'IFCMATERIALPROFILE') {
    const material = parseMaterialDefinition(entityIndex, parseRef(parts[1]), new Set(seen));
    return {
      type: entity.type,
      expressId: materialId,
      name: unquoteString(parts[2]) || material?.name || `Profil #${materialId}`,
      materialName: material?.name || '',
      category: unquoteString(parts[4]) || material?.category || '',
      material,
    };
  }

  if (entity.type === 'IFCMATERIALPROFILESET') {
    const profiles = refList(parts[2])
      .map(ref => parseMaterialDefinition(entityIndex, ref, new Set(seen)))
      .filter(Boolean);
    return {
      type: entity.type,
      expressId: materialId,
      name: unquoteString(parts[0]) || profiles.map(p => p.name).filter(Boolean).join(', ') || `#${materialId}`,
      profiles,
    };
  }

  if (entity.type === 'IFCMATERIALPROFILESETUSAGE') {
    const profileSet = parseMaterialDefinition(entityIndex, parseRef(parts[0]), new Set(seen));
    return profileSet ? { ...profileSet, type: entity.type, usage: true } : null;
  }

  const firstName = parts.map(unquoteString).find(Boolean);
  return {
    type: entity.type,
    expressId: materialId,
    name: firstName || `#${materialId}`,
  };
}

function extractClassifications(entityIndex, expressId) {
  const index = getRelatedIndex(entityIndex);
  const refs = collectRefsForElementAndTypes(index.classificationsByElement, index.typeByElement, expressId);
  return refs
    .map(ref => parseClassification(entityIndex, ref, new Set()))
    .filter(Boolean);
}

function collectRefsForElementAndTypes(valueByEntity, typeByElement, expressId) {
  const out = [];
  for (const ref of valueByEntity.get(expressId) || []) {
    if (!out.includes(ref)) out.push(ref);
  }
  for (const typeId of typeByElement.get(expressId) || []) {
    for (const ref of valueByEntity.get(typeId) || []) {
      if (!out.includes(ref)) out.push(ref);
    }
  }
  return out;
}

function parseClassification(entityIndex, classificationId, seen) {
  if (!classificationId || seen.has(classificationId)) return null;
  seen.add(classificationId);

  const entity = entityIndex.byExpressId(classificationId);
  if (!entity) return null;
  const parts = splitParams(entity.params);

  if (entity.type === 'IFCCLASSIFICATIONREFERENCE') {
    const source = parseClassification(entityIndex, parseRef(parts[3]), seen);
    return {
      type: entity.type,
      expressId: classificationId,
      uri: unquoteString(parts[0]) || '',
      code: unquoteString(parts[1]) || '',
      name: unquoteString(parts[2]) || '',
      system: source?.name || source?.system || '',
      source,
    };
  }

  if (entity.type === 'IFCCLASSIFICATION') {
    const name = unquoteString(parts[3]) || unquoteString(parts[0]) || `#${classificationId}`;
    return {
      type: entity.type,
      expressId: classificationId,
      system: name,
      name,
      edition: unquoteString(parts[1]) || '',
      uri: unquoteString(parts[5]) || '',
    };
  }

  const firstName = parts.map(unquoteString).find(Boolean);
  return {
    type: entity.type,
    expressId: classificationId,
    name: firstName || `#${classificationId}`,
    system: '',
    code: '',
    uri: '',
  };
}

/**
 * Extract linked data that is not stored directly as occurrence PSet values.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} expressId
 * @returns {{typePropertySets: Array, materials: Array, classifications: Array}}
 */
export function extractRelatedData(entityIndex, expressId) {
  return {
    typePropertySets: extractTypePropertySets(entityIndex, expressId),
    materials: extractMaterials(entityIndex, expressId),
    classifications: extractClassifications(entityIndex, expressId),
  };
}
