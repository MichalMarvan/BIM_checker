// Phase 6.14.3 — Extract IFC4 IfcWorkSchedule from a loaded model.
//
// IFC schema:
//   IfcWorkSchedule (subtype of IfcWorkControl, IfcControl)
//     IsNestedBy → IfcTask (via IfcRelNests, OR
//                IfcRelAssignsToControl with RelatingControl = workSchedule)
//   IfcTask
//     TaskTime: optional IfcTaskTime with ScheduleStart, ScheduleFinish
//     IsNestedBy → child IfcTask (subtasks)
//   IfcRelSequence: predecessor relations between IfcTasks

import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList } from '../geometry/step-helpers.js';
import { extractEntityName } from '../parser/entity-name.js';
import { generateScheduleId } from './schedule-store.js';

function unquoteString(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = raw.match(/^'(.*)'$/s);
  return m ? m[1] : null;
}

function isoFromIfcDateTime(raw) {
  // IFC date strings: '2026-01-15T08:00:00' typically. Slice to YYYY-MM-DD.
  const s = unquoteString(raw);
  if (!s) return null;
  return s.slice(0, 10);
}

/**
 * Build reverse IfcRelNests index for IFC schedule traversal.
 */
function buildNestsIndex(entityIndex) {
  const map = new Map();
  for (const rel of entityIndex.byType('IfcRelNests')) {
    const parts = splitParams(rel.params);
    const parent = parseRef(parts[4]);
    const children = parseRefList(parts[5]);
    if (parent == null) continue;
    let arr = map.get(parent);
    if (!arr) { arr = []; map.set(parent, arr); }
    arr.push(...children);
  }
  return map;
}

/** Build IfcRelAssignsToControl reverse index: control → assigned objects. */
function buildAssignsToControlIndex(entityIndex) {
  const map = new Map();
  for (const rel of entityIndex.byType('IfcRelAssignsToControl')) {
    const parts = splitParams(rel.params);
    // RelatedObjects (parts[4]), RelatingControl (parts[6])
    const relatedObjs = parseRefList(parts[4]);
    const control = parseRef(parts[6]);
    if (control == null) continue;
    let arr = map.get(control);
    if (!arr) { arr = []; map.set(control, arr); }
    arr.push(...relatedObjs);
  }
  return map;
}

/** Get TaskTime entity referenced from an IfcTask. */
function getTaskTime(entityIndex, taskExpressId) {
  const task = entityIndex.byExpressId(taskExpressId);
  if (!task) return null;
  // IfcTask params (IFC4): GlobalId, OwnerHistory, Name, Description, ObjectType,
  //   LongDescription, Status, WorkMethod, IsMilestone, Priority, TaskTime, PredefinedType
  const parts = splitParams(task.params);
  const taskTimeRef = parseRef(parts[10]);
  if (!taskTimeRef) return null;
  const taskTime = entityIndex.byExpressId(taskTimeRef);
  if (!taskTime || !taskTime.type.startsWith('IFCTASKTIME')) return null;
  return taskTime;
}

function getTaskDates(entityIndex, taskExpressId) {
  const taskTime = getTaskTime(entityIndex, taskExpressId);
  if (!taskTime) return { start: null, end: null };
  const parts = splitParams(taskTime.params);
  // IfcTaskTime params (subset, IFC4):
  //   Name, DataOrigin, UserDefinedDataOrigin, DurationType, ScheduleDuration,
  //   ScheduleStart, ScheduleFinish, ScheduleContour, ...
  return {
    start: isoFromIfcDateTime(parts[5]),
    end: isoFromIfcDateTime(parts[6]),
  };
}

/** List IfcWorkSchedule entities in an entityIndex. */
export function findIfcWorkSchedules(entityIndex) {
  return entityIndex.byType('IfcWorkSchedule').map(e => ({
    expressId: e.expressId,
    name: extractEntityName(e.params) || `WorkSchedule #${e.expressId}`,
  }));
}

/**
 * Parse a specific IfcWorkSchedule into the Schedule shape used by the
 * timeline panel. Tasks are walked through IfcRelAssignsToControl + IfcRelNests.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} workScheduleExpressId
 * @returns {Schedule | null}
 */
export function parseIfcWorkSchedule(entityIndex, workScheduleExpressId) {
  const ws = entityIndex.byExpressId(workScheduleExpressId);
  if (!ws || ws.type !== 'IFCWORKSCHEDULE') return null;
  const name = extractEntityName(ws.params) || 'IfcWorkSchedule';

  const nests = buildNestsIndex(entityIndex);
  const assigns = buildAssignsToControlIndex(entityIndex);

  // Top-level tasks come via either IfcRelAssignsToControl OR IfcRelNests
  // from the IfcWorkSchedule.
  const topTasks = [
    ...(assigns.get(workScheduleExpressId) || []),
    ...(nests.get(workScheduleExpressId) || []),
  ];

  const visited = new Set();
  const tasks = [];
  let projectStart = null, projectEnd = null;

  function walkTask(taskId, parentTaskId) {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const task = entityIndex.byExpressId(taskId);
    if (!task || task.type !== 'IFCTASK') return;
    const taskName = extractEntityName(task.params) || `Task #${taskId}`;
    const { start, end } = getTaskDates(entityIndex, taskId);
    if (start && end) {
      tasks.push({
        id: String(taskId),
        name: taskName,
        parentId: parentTaskId ? String(parentTaskId) : null,
        start, end,
        predecessors: [],   // IfcRelSequence parsing future work
        entityLinks: [],
      });
      if (!projectStart || start < projectStart) projectStart = start;
      if (!projectEnd || end > projectEnd) projectEnd = end;
    }
    // Recurse into nested tasks
    for (const childId of nests.get(taskId) || []) {
      walkTask(childId, taskId);
    }
  }

  for (const tId of topTasks) walkTask(tId, null);

  if (tasks.length === 0) return null;

  return {
    id: generateScheduleId(),
    name,
    createdAt: Date.now(),
    projectStart,
    projectEnd,
    tasks,
  };
}
