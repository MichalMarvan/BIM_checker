// EntityIndex — secondary indexes over the entities of one model.
// Provides O(1) lookups by expressId, type (case-insensitive), and GUID.
//
// Two storage modes behind one API:
//  - Map mode: Map<expressId, RawEntity> (parseStepText output, .bimcache
//    restore, tests). Type and GUID indexes are built eagerly, as before.
//  - store mode: EntityStore over a StepByteIndex (file kept as bytes, no
//    object per entity). byType() walks the store's counting-sort position
//    index, the GUID index is built lazily on first use from the first
//    attribute of root entities only, and compact() copies the survivors into
//    a plain Map (strings) and releases the bytes — after compact() the index
//    IS in Map mode and nothing references the file buffer any more.

import { IFC_ROOT_TYPES, IFC_NON_ROOT_TYPES } from './ifc-root-types.js';
import { StepByteIndex } from './byte-lexer.js';
import { EntityStore, firstAttrStringOf } from './entity-store.js';

// Konzervativní tvar IfcGloballyUniqueId: 22 znaků base64 abecedy IFC, první
// znak 0–3 (128 bitů UUID = 21×6 + 2 bity). Používá se jen pro typy, které
// nejsou ve schématu známé jako podtyp IfcRoot.
const STRICT_GUID_RE = /^[0-3][0-9A-Za-z_$]{21}$/;

// Types compact() keeps regardless of GUID (see compact()).
const KEEP_TYPE = /^IFC(PROPERTY|ELEMENTQUANTITY|QUANTITY|PHYSICAL|MATERIAL|CLASSIFICATION|SIUNIT|UNIT|DERIVEDUNIT|MONETARYUNIT|MEASUREWITHUNIT|MAPCONVERSION|PROJECTEDCRS|COORDINATEREFERENCESYSTEM|ALIGNMENT|OWNERHISTORY|APPLICATION|PERSON|ORGANIZATION|ACTORROLE|PRESENTATIONLAYER)/;

// GUID eligibility of a type: 0 = never, 1 = root (first string attr is the
// GlobalId), 2 = unknown type (strict GUID shape only).
function guidClassOf(type) {
  if (IFC_ROOT_TYPES.has(type)) {
    return 1;
  }
  if (IFC_NON_ROOT_TYPES.has(type)) {
    return 0;
  }
  return 2;
}

function guidFromFirstAttr(cls, s) {
  if (s === null || cls === 0) {
    return null;
  }
  if (cls === 1) {
    return s;
  }
  return STRICT_GUID_RE.test(s) ? s : null;
}

/**
 * GUID k indexaci, nebo null.
 *  - podtyp IfcRoot (dle schémat IFC2X3/IFC4/IFC4X3): první atribut je GlobalId —
 *    indexuje se i nestandardní délka/abeceda (reálné soubory je mají a
 *    compact() by je jinak zahodil)
 *  - známý ne-root typ (IfcPropertySingleValue, IfcQuantityLength, …): nikdy
 *  - typ mimo schémata (vlastní/novější): fallback na přísný tvar GUID
 *    (22 znaků, abeceda, první znak 0–3)
 */
export function extractGuid(type, params) {
  const cls = guidClassOf(type);
  if (cls === 0) {
    return null;
  }
  return guidFromFirstAttr(cls, firstAttrStringOf(params));
}

export class EntityIndex {
  /**
   * @param {Map<number, RawEntity> | EntityStore | StepByteIndex} entities —
   *   output of parseStepText, or the byte index from indexStepBytes
   */
  constructor(entities) {
    this._guidMap = null;       // Map<guid, expressId>
    this._guidDuplicates = 0;   // počet přepsání existujícího GUID (poslední vyhrává)
    if (entities instanceof StepByteIndex) {
      entities = new EntityStore(entities);
    }
    if (entities instanceof EntityStore) {
      this._store = entities;
      this._byId = entities;
      this._byType = null;
      return;
    }
    this._store = null;
    this._byId = entities;
    this._byType = new Map();   // Map<UPPERCASE_TYPE, Set<expressId>>
    this._guidMap = new Map();

    for (const [id, entity] of entities) {
      // Index by type
      let typeSet = this._byType.get(entity.type);
      if (!typeSet) {
        typeSet = new Set();
        this._byType.set(entity.type, typeSet);
      }
      typeSet.add(id);

      // Index by GUID — schema-aware (viz extractGuid)
      const guid = extractGuid(entity.type, entity.params);
      if (guid !== null) {
        this._addGuid(guid, id);
      }
    }
  }

  _addGuid(guid, id) {
    if (this._guidMap.has(guid)) {
      this._guidDuplicates++;
    }
    this._guidMap.set(guid, id);
  }

  /**
   * Map<guid, expressId>. In store mode it is built on first access by
   * reading the first attribute of root-eligible entities straight from the
   * bytes (entity order, so duplicates resolve "last wins" like Map mode).
   */
  get _byGuid() {
    if (this._guidMap) {
      return this._guidMap;
    }
    const store = this._store;
    const ix = store.index;
    const cls = new Uint8Array(ix.typeNames.length);
    for (let t = 0; t < cls.length; t++) {
      cls[t] = guidClassOf(ix.typeNames[t]);
    }
    this._guidMap = new Map();
    const { typeIdx, ids, count } = ix;
    for (let i = 0; i < count; i++) {
      const c = cls[typeIdx[i]];
      if (c === 0) {
        continue;
      }
      const guid = guidFromFirstAttr(c, store.firstAttrString(i));
      if (guid !== null) {
        this._addGuid(guid, ids[i]);
      }
    }
    return this._guidMap;
  }

  /** @returns {RawEntity | null} */
  byExpressId(id) {
    return this._byId.get(id) || null;
  }

  /**
   * Case-insensitive lookup by IFC type name.
   * @param {string} type — e.g. 'IfcWall' or 'IFCWALL'
   * @returns {RawEntity[]}
   */
  byType(type) {
    const upper = type.toUpperCase();
    if (this._store) {
      const t = this._store.typeIndexOf(upper);
      if (t < 0) {
        return [];
      }
      const pos = this._store.positionsOfType(t);
      const ix = this._store.index;
      const out = new Array(pos.length);
      for (let k = 0; k < pos.length; k++) {
        out[k] = ix.entity(pos[k]);
      }
      return out;
    }
    const ids = this._byType.get(upper);
    if (!ids) {
      return [];
    }
    return [...ids].map(id => this._byId.get(id));
  }

  /** @returns {RawEntity | null} */
  byGuid(guid) {
    const id = this._byGuid.get(guid);
    return id !== null && id !== undefined ? this._byId.get(id) : null;
  }

  /** @returns {string[]} sorted list of unique IFC types */
  types() {
    const names = this._store ? this._store.presentTypeNames() : [...this._byType.keys()];
    return names.sort();
  }

  /** @returns {{ entityCount: number, typeCount: number, guidCount: number, guidDuplicates: number }} */
  stats() {
    return {
      entityCount: this._byId.size,
      typeCount: this._store ? this._store.presentTypeNames().length : this._byType.size,
      guidCount: this._byGuid.size,
      guidDuplicates: this._guidDuplicates,
    };
  }

  /**
   * Drop entities that are only needed during geometry construction —
   * points, curves, placements, profiles, breps make up 80–90 % of a
   * typical IFC and are dead weight once meshes exist. Kept alive:
   *  - every IfcRoot subtype (has a GUID): products, rels, psets, types,
   *    spatial structure — everything user-facing lookups traverse
   *  - non-root property / quantity / material / classification / unit /
   *    georef / owner entities (matched by type prefix)
   *  - the full reference closure of IfcAlignment* entities — the
   *    alignment panel parses their geometry on demand after load
   *
   * Callers must warm whatever caches read geometry entities (e.g.
   * engine.getCoords) BEFORE compacting.
   *
   * Store mode: survivors are copied into a Map of plain { expressId, type,
   * params } objects (same set, same order and same strings as Map mode) and
   * the byte store is released, so the file buffer can be collected.
   *
   * @returns {number} count of dropped entities
   */
  compact() {
    const keep = new Set(this._byGuid.values());

    // Reference closure from alignment entities (params hold #id refs).
    // IFCLINEARPLACEMENT seeds keep IfcAxis2PlacementLinear /
    // IfcPointByDistanceExpression / basis curve alive for post-compact reads.
    // `visited` je oddělené od `keep`: root seedy (IfcAlignment má GUID, je
    // v keep od začátku) by jinak walk přeskočil a jejich Representation
    // řetěz (PDS → ShapeRep → GradientCurve) by kompakce zahodila.
    const stack = [];
    for (const t of this.types()) {
      if (t.startsWith('IFCALIGNMENT') || t === 'IFCLINEARPLACEMENT') {
        for (const e of this.byType(t)) {
          stack.push(e.expressId);
        }
      }
    }
    const visited = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      keep.add(id);
      const e = this._byId.get(id);
      if (!e) {
        continue;
      }
      const refs = e.params.match(/#\d+/g);
      if (refs) {
        for (const r of refs) {
          const rid = parseInt(r.slice(1), 10);
          if (!visited.has(rid)) {
            stack.push(rid);
          }
        }
      }
    }

    if (this._store) {
      return this._compactStore(keep);
    }

    let dropped = 0;
    for (const [id, e] of this._byId) {
      if (keep.has(id) || KEEP_TYPE.test(e.type)) {
        continue;
      }
      this._byId.delete(id);
      const typeSet = this._byType.get(e.type);
      if (typeSet) {
        typeSet.delete(id);
        if (typeSet.size === 0) {
          this._byType.delete(e.type);
        }
      }
      dropped++;
    }
    return dropped;
  }

  /** Store mode compact(): copy survivors to a Map, switch to Map mode, release bytes. */
  _compactStore(keep) {
    const store = this._store;
    const ix = store.index;
    const { typeNames, typeIdx, ids, count } = ix;
    const keepType = new Uint8Array(typeNames.length);
    for (let t = 0; t < keepType.length; t++) {
      keepType[t] = KEEP_TYPE.test(typeNames[t]) ? 1 : 0;
    }

    const byId = new Map();
    const byType = new Map();
    for (let i = 0; i < count; i++) {
      const id = ids[i];
      const t = typeIdx[i];
      if (!keepType[t] && !keep.has(id)) {
        continue;
      }
      const type = typeNames[t];
      byId.set(id, { expressId: id, type, params: ix.paramsString(i) });
      let typeSet = byType.get(type);
      if (!typeSet) {
        typeSet = new Set();
        byType.set(type, typeSet);
      }
      typeSet.add(id);
    }
    this._byId = byId;
    this._byType = byType;
    this._store = null;
    store.release();
    return count - byId.size;
  }
}
