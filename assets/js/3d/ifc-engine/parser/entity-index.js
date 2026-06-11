// EntityIndex — secondary indexes over Map<expressId, RawEntity>.
// Provides O(1) lookups by expressId, type (case-insensitive), and GUID.

/**
 * Extract first single-quoted string from raw STEP params.
 * IFC convention: first attribute of all IfcRoot subtypes is GlobalId.
 * Returns null if no quoted string found.
 */
function extractFirstGuid(params) {
  const m = params.match(/'([^']+)'/);
  return m ? m[1] : null;
}

export class EntityIndex {
  /**
   * @param {Map<number, RawEntity>} entities — output of parseStepText
   */
  constructor(entities) {
    this._byId = entities;
    this._byType = new Map();   // Map<UPPERCASE_TYPE, Set<expressId>>
    this._byGuid = new Map();   // Map<guid, expressId>

    for (const [id, entity] of entities) {
      // Index by type
      let typeSet = this._byType.get(entity.type);
      if (!typeSet) {
        typeSet = new Set();
        this._byType.set(entity.type, typeSet);
      }
      typeSet.add(id);

      // Index by GUID (only if present and looks like an IfcRoot subtype with GUID)
      const guid = extractFirstGuid(entity.params);
      if (guid && guid.length === 22) {
        // IfcGloballyUniqueId is exactly 22 chars (base64 encoded UUID)
        this._byGuid.set(guid, id);
      }
    }
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
    const ids = this._byType.get(type.toUpperCase());
    if (!ids) return [];
    return [...ids].map(id => this._byId.get(id));
  }

  /** @returns {RawEntity | null} */
  byGuid(guid) {
    const id = this._byGuid.get(guid);
    return id !== null && id !== undefined ? this._byId.get(id) : null;
  }

  /** @returns {string[]} sorted list of unique IFC types */
  types() {
    return [...this._byType.keys()].sort();
  }

  /** @returns {{ entityCount: number, typeCount: number }} */
  stats() {
    return {
      entityCount: this._byId.size,
      typeCount: this._byType.size,
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
   * @returns {number} count of dropped entities
   */
  compact() {
    const KEEP_TYPE = /^IFC(PROPERTY|ELEMENTQUANTITY|QUANTITY|PHYSICAL|MATERIAL|CLASSIFICATION|SIUNIT|UNIT|DERIVEDUNIT|MONETARYUNIT|MEASUREWITHUNIT|MAPCONVERSION|PROJECTEDCRS|COORDINATEREFERENCESYSTEM|ALIGNMENT|OWNERHISTORY|APPLICATION|PERSON|ORGANIZATION|ACTORROLE|PRESENTATIONLAYER)/;
    const keep = new Set(this._byGuid.values());

    // Reference closure from alignment entities (params hold #id refs).
    const stack = [];
    for (const [id, e] of this._byId) {
      if (e.type.startsWith('IFCALIGNMENT')) stack.push(id);
    }
    while (stack.length) {
      const id = stack.pop();
      if (keep.has(id)) continue;
      keep.add(id);
      const e = this._byId.get(id);
      if (!e) continue;
      const refs = e.params.match(/#\d+/g);
      if (refs) {
        for (const r of refs) {
          const rid = parseInt(r.slice(1), 10);
          if (!keep.has(rid)) stack.push(rid);
        }
      }
    }

    let dropped = 0;
    for (const [id, e] of this._byId) {
      if (keep.has(id) || KEEP_TYPE.test(e.type)) continue;
      this._byId.delete(id);
      const typeSet = this._byType.get(e.type);
      if (typeSet) {
        typeSet.delete(id);
        if (typeSet.size === 0) this._byType.delete(e.type);
      }
      dropped++;
    }
    return dropped;
  }
}
