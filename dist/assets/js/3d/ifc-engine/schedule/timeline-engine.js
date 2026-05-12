// Phase 6.14.1 — Timeline status calculation + entity↔task resolution.
//
// Per entity at a given date, status is the highest of any task it's bound to:
//   not-started < in-progress < completed
//
// "Highest" because if entity is in 2 tasks (e.g. concrete pour + finishing),
// the more advanced state wins for visual clarity.

export const STATUS_NOT_STARTED = 'not-started';
export const STATUS_IN_PROGRESS = 'in-progress';
export const STATUS_COMPLETED = 'completed';

const STATUS_RANK = {
  [STATUS_NOT_STARTED]: 0,
  [STATUS_IN_PROGRESS]: 1,
  [STATUS_COMPLETED]: 2,
};

/** Status of a single task at given date string (YYYY-MM-DD). */
export function taskStatusAt(task, dateStr) {
  if (!task || !dateStr) return STATUS_NOT_STARTED;
  if (dateStr < task.start) return STATUS_NOT_STARTED;
  if (dateStr >= task.end) return STATUS_COMPLETED;
  return STATUS_IN_PROGRESS;
}

/**
 * Build entity → status map at given date.
 * @param {Schedule} schedule
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {Map<string, string>} key = `${modelId}|${expressId}` → status
 */
export function computeEntityStatusMap(schedule, dateStr) {
  const map = new Map();
  if (!schedule || !schedule.tasks) return map;
  for (const task of schedule.tasks) {
    const status = taskStatusAt(task, dateStr);
    for (const link of task.entityLinks || []) {
      const key = `${link.modelId}|${link.expressId}`;
      const existing = map.get(key);
      if (!existing || STATUS_RANK[status] > STATUS_RANK[existing]) {
        map.set(key, status);
      }
    }
  }
  return map;
}

/** Resolve rule-based links (per IFC type, property match) at engine-call time. */
export function resolveRuleLinks(task, engine) {
  const out = [...(task.entityLinks || [])];
  if (!task.rules) return out;
  for (const rule of task.rules) {
    const hits = engine.search({
      type: rule.ifcType,
      psetFilters: rule.propertyMatch ? [{
        pset: rule.propertyMatch.pset,
        property: rule.propertyMatch.property,
        op: 'eq',
        value: rule.propertyMatch.value,
      }] : undefined,
    });
    for (const h of hits) {
      out.push({ modelId: h.modelId, expressId: h.expressId });
    }
  }
  return out;
}

/** Status colors as hex ints for engine.highlight per-item. */
export const STATUS_COLORS = {
  [STATUS_NOT_STARTED]: 0x6b7280,    // gray — not yet built
  [STATUS_IN_PROGRESS]: 0xfacc15,    // yellow — under construction
  [STATUS_COMPLETED]: 0x10b981,      // green — done
};
