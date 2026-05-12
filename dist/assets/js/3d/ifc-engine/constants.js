// Shared engine constants. Single source of truth for PRODUCT_TYPES
// (used by index.js search() filter + geo-coords.js bbox computation).

/**
 * IFC product entity types — concrete IfcProduct subtypes that have geometry
 * and appear as visible objects in 3D scene.
 *
 * Includes:
 * - Structural: WALL, SLAB, MEMBER, COLUMN, BEAM, FOOTING, PILE
 * - Architectural: DOOR, WINDOW, STAIR, RAILING, ROOF, RAMP, COVERING, PLATE,
 *   CURTAINWALL, FURNISHING
 * - Generic: BUILDINGELEMENTPROXY
 * - Reinforcement: REINFORCINGBAR, REINFORCINGMESH, FASTENER, MECHANICALFASTENER, DISCRETEACCESSORY
 *
 * Excludes:
 * - Spatial containers (IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCSPACE) —
 *   these are NOT geometry-bearing and would skew bbox computation. Search
 *   API filters them via PRODUCT_TYPES_INCLUDING_SPATIAL if app vrstva needs them.
 * - Geometry primitives (CARTESIANPOINT, DIRECTION, etc.)
 * - Property entities (PROPERTYSET, PROPERTYSINGLEVALUE)
 * - Relationships (RELDEFINES*, RELAGGREGATES, etc.)
 */
export const PRODUCT_TYPES = new Set([
  'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCMEMBER', 'IFCCOLUMN', 'IFCBEAM',
  'IFCDOOR', 'IFCWINDOW', 'IFCSTAIR', 'IFCRAILING', 'IFCROOF', 'IFCFOOTING',
  'IFCBUILDINGELEMENTPROXY', 'IFCFURNISHINGELEMENT', 'IFCCOVERING', 'IFCPLATE',
  'IFCCURTAINWALL', 'IFCREINFORCINGBAR', 'IFCREINFORCINGMESH', 'IFCDISCRETEACCESSORY',
  'IFCFASTENER', 'IFCMECHANICALFASTENER', 'IFCPILE', 'IFCRAMP',
]);

/**
 * Spatial container types — useful for navigation/hierarchy queries
 * (e.g., "list buildings in this model"), NOT included in bbox computation.
 */
export const SPATIAL_CONTAINER_TYPES = new Set([
  'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE',
]);

/**
 * Union: products + spatial containers. Used by search() with no type filter
 * to return all entities visible to app vrstva (3D + tree navigation).
 */
export const PRODUCT_TYPES_INCLUDING_SPATIAL = new Set([
  ...PRODUCT_TYPES,
  ...SPATIAL_CONTAINER_TYPES,
]);
