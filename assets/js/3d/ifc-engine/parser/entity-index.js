// EntityIndex — secondary indexes over Map<expressId, RawEntity>.
// Provides O(1) lookups by expressId, type (case-insensitive), and GUID.

import { IFC_ROOT_TYPES, IFC_NON_ROOT_TYPES } from './ifc-root-types.js';

// Konzervativní tvar IfcGloballyUniqueId: 22 znaků base64 abecedy IFC, první
// znak 0–3 (128 bitů UUID = 21×6 + 2 bity). Používá se jen pro typy, které
// nejsou ve schématu známé jako podtyp IfcRoot.
const STRICT_GUID_RE = /^[0-3][0-9A-Za-z_$]{21}$/;

/**
 * Vrátí obsah PRVNÍHO atributu, pokud je to uvozený řetězec (surový obsah,
 * bez rozbalení '' escapu). Jinak null — první atribut je #ref, $, číslo,
 * výčet, seznam nebo řetězec je neuzavřený / následuje něco jiného než čárka.
 * Dříve se bral první řetězec KDEKOLI v params, což indexovalo i Name
 * u IfcPropertySingleValue apod. jako falešné GUID.
 */
function extractFirstAttrString(params) {
  const n = params.length;
  let i = 0;
  while (i < n && (params[i] === ' ' || params[i] === '\t' || params[i] === '\r' || params[i] === '\n')) i++;
  if (params[i] !== "'") return null;
  let j = i + 1;
  while (j < n) {
    if (params[j] === "'") {
      if (params[j + 1] === "'") { j += 2; continue; }
      break;
    }
    j++;
  }
  if (j >= n) return null;
  let k = j + 1;
  while (k < n && (params[k] === ' ' || params[k] === '\t' || params[k] === '\r' || params[k] === '\n')) k++;
  if (k < n && params[k] !== ',') return null;
  const s = params.slice(i + 1, j);
  return s.length ? s : null;
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
  const s = extractFirstAttrString(params);
  if (s === null) return null;
  if (IFC_ROOT_TYPES.has(type)) return s;
  if (IFC_NON_ROOT_TYPES.has(type)) return null;
  return STRICT_GUID_RE.test(s) ? s : null;
}

export class EntityIndex {
  /**
   * @param {Map<number, RawEntity>} entities — output of parseStepText
   */
  constructor(entities) {
    this._byId = entities;
    this._byType = new Map();   // Map<UPPERCASE_TYPE, Set<expressId>>
    this._byGuid = new Map();   // Map<guid, expressId>
    this._guidDuplicates = 0;   // počet přepsání existujícího GUID (poslední vyhrává)

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
        if (this._byGuid.has(guid)) this._guidDuplicates++;
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

  /** @returns {{ entityCount: number, typeCount: number, guidCount: number, guidDuplicates: number }} */
  stats() {
    return {
      entityCount: this._byId.size,
      typeCount: this._byType.size,
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
   * @returns {number} count of dropped entities
   */
  compact() {
    const KEEP_TYPE = /^IFC(PROPERTY|ELEMENTQUANTITY|QUANTITY|PHYSICAL|MATERIAL|CLASSIFICATION|SIUNIT|UNIT|DERIVEDUNIT|MONETARYUNIT|MEASUREWITHUNIT|MAPCONVERSION|PROJECTEDCRS|COORDINATEREFERENCESYSTEM|ALIGNMENT|OWNERHISTORY|APPLICATION|PERSON|ORGANIZATION|ACTORROLE|PRESENTATIONLAYER)/;
    const keep = new Set(this._byGuid.values());

    // Reference closure from alignment entities (params hold #id refs).
    // IFCLINEARPLACEMENT seeds keep IfcAxis2PlacementLinear /
    // IfcPointByDistanceExpression / basis curve alive for post-compact reads.
    // `visited` je oddělené od `keep`: root seedy (IfcAlignment má GUID, je
    // v keep od začátku) by jinak walk přeskočil a jejich Representation
    // řetěz (PDS → ShapeRep → GradientCurve) by kompakce zahodila.
    const stack = [];
    for (const [id, e] of this._byId) {
      if (e.type.startsWith('IFCALIGNMENT') || e.type === 'IFCLINEARPLACEMENT') stack.push(id);
    }
    const visited = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      keep.add(id);
      const e = this._byId.get(id);
      if (!e) continue;
      const refs = e.params.match(/#\d+/g);
      if (refs) {
        for (const r of refs) {
          const rid = parseInt(r.slice(1), 10);
          if (!visited.has(rid)) stack.push(rid);
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
