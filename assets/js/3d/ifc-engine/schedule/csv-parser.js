// Phase 6.14.1 — CSV → schedule parser.
//
// Expected columns (header row required, case-insensitive):
//   id          — task id (required, unique)
//   name        — task name (required)
//   start       — ISO date or DD.MM.YYYY (required)
//   end         — ISO date or DD.MM.YYYY (required)
//   parent      — optional parent task id (for hierarchy)
//   predecessors — optional, comma-separated task ids
//   entity_ids  — optional, comma-separated 'modelId:expressId' pairs

import { generateScheduleId, generateTaskId } from './schedule-store.js';

function parseCsvLine(line) {
  // Simple CSV with quoted fields — handles commas inside quotes
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function normalizeDate(s) {
  if (!s) return null;
  const trimmed = String(s).trim();
  // ISO: 2026-08-15
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // DD.MM.YYYY
  const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  // Try Date constructor as fallback
  const dt = new Date(trimmed);
  if (Number.isFinite(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

/**
 * Parse CSV text into a Schedule object.
 * @param {string} csvText
 * @param {{ name?: string }} opts
 * @returns {{ id, name, createdAt, projectStart, projectEnd, tasks }}
 */
export function parseScheduleCsv(csvText, opts = {}) {
  // Strip BOM + split lines
  let text = csvText.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV potřebuje minimálně header + 1 řádek');

  const header = parseCsvLine(lines[0]).map(s => s.trim().toLowerCase());
  const colIdx = (name) => header.indexOf(name);
  const reqCols = ['id', 'name', 'start', 'end'];
  for (const c of reqCols) {
    if (colIdx(c) < 0) throw new Error(`CSV postrádá povinný sloupec: ${c}`);
  }
  const idIdx = colIdx('id');
  const nameIdx = colIdx('name');
  const startIdx = colIdx('start');
  const endIdx = colIdx('end');
  const parentIdx = colIdx('parent');
  const predsIdx = colIdx('predecessors');
  const entitiesIdx = colIdx('entity_ids');

  const tasks = [];
  let projectStart = null, projectEnd = null;
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const id = String(cells[idIdx] || '').trim();
    const name = String(cells[nameIdx] || '').trim();
    const start = normalizeDate(cells[startIdx]);
    const end = normalizeDate(cells[endIdx]);
    if (!id || !name || !start || !end) {
      console.warn(`Skipping CSV row ${i + 1}: missing required fields`);
      continue;
    }
    const parent = parentIdx >= 0 ? String(cells[parentIdx] || '').trim() || null : null;
    const predecessors = predsIdx >= 0
      ? String(cells[predsIdx] || '').split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const entityLinks = entitiesIdx >= 0
      ? String(cells[entitiesIdx] || '').split(',').map(s => s.trim()).filter(Boolean).map(pair => {
        const [modelId, expressId] = pair.split(':');
        return { modelId, expressId: parseInt(expressId, 10) };
      }).filter(l => l.modelId && Number.isFinite(l.expressId))
      : [];
    tasks.push({ id, name, parentId: parent, start, end, predecessors, entityLinks });

    if (!projectStart || start < projectStart) projectStart = start;
    if (!projectEnd || end > projectEnd) projectEnd = end;
  }
  if (tasks.length === 0) throw new Error('CSV neobsahuje žádné platné úkoly');

  return {
    id: generateScheduleId(),
    name: opts.name || `Schedule ${new Date().toISOString().slice(0, 10)}`,
    createdAt: Date.now(),
    projectStart,
    projectEnd,
    tasks,
  };
}
