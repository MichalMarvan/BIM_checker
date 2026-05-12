// Phase 6.14.3 — Primavera P6 XER text format parser.
//
// XER is tab-separated with section markers:
//   ERMHDR  <fields...>           — file header (timestamp, P6 version)
//   %T  <TABLE_NAME>              — start of table
//   %F  <field_names...>          — column names for the next %R rows
//   %R  <values...>               — data row
//   %E                            — end of file
//
// We parse the TASK table (and PROJECT for name). Date format: YYYY-MM-DD HH:MM
//
// MVP scope: extract task_id, task_name, target_start_date, target_end_date,
// wbs_id (parent). Predecessors come from TASKPRED table (skipped here for
// brevity — can extend later).

import { generateScheduleId } from './schedule-store.js';

function isoDate(p6date) {
  if (!p6date) return null;
  // P6 date: "2026-01-15 08:00" or "2026-01-15"
  return p6date.slice(0, 10);
}

/**
 * Parse XER text. Returns { tables: { TABLE_NAME: { fields[], rows[][] } } }.
 */
function parseXerTables(xerText) {
  const lines = xerText.split(/\r?\n/);
  const tables = {};
  let currentTable = null;
  let currentFields = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('%T\t')) {
      currentTable = line.split('\t')[1];
      currentFields = null;
      tables[currentTable] = { fields: [], rows: [] };
    } else if (line.startsWith('%F\t')) {
      currentFields = line.split('\t').slice(1);
      if (currentTable) tables[currentTable].fields = currentFields;
    } else if (line.startsWith('%R\t')) {
      const values = line.split('\t').slice(1);
      if (currentTable && currentFields) {
        tables[currentTable].rows.push(values);
      }
    } else if (line.startsWith('%E')) {
      break;
    }
  }
  return tables;
}

function rowToObject(fields, row) {
  const obj = {};
  for (let i = 0; i < fields.length; i++) {
    obj[fields[i]] = row[i] ?? '';
  }
  return obj;
}

/**
 * Parse XER text → Schedule.
 * @param {string} xerText
 * @param {{ name?: string }} opts
 * @returns {Schedule}
 */
export function parseP6Xer(xerText, opts = {}) {
  const tables = parseXerTables(xerText);
  const taskTable = tables['TASK'];
  if (!taskTable || taskTable.rows.length === 0) {
    throw new Error('XER neobsahuje TASK tabulku nebo je prázdná');
  }

  // PROJECT table for name
  let projectName = null;
  if (tables['PROJECT']?.rows[0]) {
    const projObj = rowToObject(tables['PROJECT'].fields, tables['PROJECT'].rows[0]);
    projectName = projObj.proj_short_name || projObj.proj_id || null;
  }

  // Build WBS parent map (wbs_id → parent wbs_id) if PROJWBS present
  const wbsParent = new Map();
  if (tables['PROJWBS']) {
    const fields = tables['PROJWBS'].fields;
    for (const row of tables['PROJWBS'].rows) {
      const o = rowToObject(fields, row);
      if (o.wbs_id && o.parent_wbs_id) wbsParent.set(o.wbs_id, o.parent_wbs_id);
    }
  }

  const tasks = [];
  let projectStart = null, projectEnd = null;
  for (const row of taskTable.rows) {
    const o = rowToObject(taskTable.fields, row);
    const id = o.task_id;
    const name = o.task_name;
    const start = isoDate(o.target_start_date || o.early_start_date);
    const end = isoDate(o.target_end_date || o.early_end_date);
    if (!id || !name || !start || !end) continue;
    tasks.push({
      id, name,
      parentId: o.wbs_id || null,
      start, end,
      predecessors: [],     // would need TASKPRED table parse
      entityLinks: [],
    });
    if (!projectStart || start < projectStart) projectStart = start;
    if (!projectEnd || end > projectEnd) projectEnd = end;
  }

  if (tasks.length === 0) throw new Error('Žádné platné úkoly v XER');

  return {
    id: generateScheduleId(),
    name: opts.name || projectName || `P6 ${new Date().toISOString().slice(0, 10)}`,
    createdAt: Date.now(),
    projectStart,
    projectEnd,
    tasks,
  };
}
