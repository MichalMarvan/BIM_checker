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
    return id != null ? this._byId.get(id) : null;
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
}
