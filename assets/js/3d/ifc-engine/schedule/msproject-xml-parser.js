// Phase 6.14.3 — MS Project XML parser.
//
// Microsoft Project export format (Project → Save As → XML).
// Schema namespace: http://schemas.microsoft.com/project
//
// Key elements per <Task>:
//   <UID>            — internal task id (integer)
//   <ID>             — display id (sequential)
//   <Name>           — task name
//   <Start>          — ISO datetime (YYYY-MM-DDTHH:MM:SS)
//   <Finish>         — ISO datetime
//   <OutlineLevel>   — hierarchy depth (1=root)
//   <OutlineNumber>  — dotted path "1.2.3" — used to derive parent
//   <Summary>        — true if rollup (skip terminal tasks)
//   <PredecessorLink> — child element with <PredecessorUID>
//
// We map UID → our task.id, OutlineNumber → parent inference.

import { generateScheduleId } from './schedule-store.js';

function getText(node, tag) {
  const el = node.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : null;
}

function isoDateOnly(isoDateTime) {
  if (!isoDateTime) return null;
  return isoDateTime.slice(0, 10);
}

/**
 * Parse MS Project XML text → Schedule.
 * @param {string} xmlText
 * @param {{ name?: string }} opts
 * @returns {Schedule}
 */
export function parseMsProjectXml(xmlText, opts = {}) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const errors = doc.getElementsByTagName('parsererror');
  if (errors.length > 0) {
    throw new Error('MS Project XML parse error: ' + errors[0].textContent);
  }

  const taskNodes = [...doc.getElementsByTagName('Task')];
  if (taskNodes.length === 0) throw new Error('MS Project XML neobsahuje žádné <Task> elementy');

  // Map outlineNumber → uid for parent inference
  const byOutline = new Map();
  for (const t of taskNodes) {
    const outline = getText(t, 'OutlineNumber');
    const uid = getText(t, 'UID');
    if (outline && uid) byOutline.set(outline, uid);
  }

  const tasks = [];
  let projectStart = null, projectEnd = null;

  for (const t of taskNodes) {
    const uid = getText(t, 'UID');
    const name = getText(t, 'Name');
    const start = isoDateOnly(getText(t, 'Start'));
    const end = isoDateOnly(getText(t, 'Finish'));
    if (!uid || uid === '0') continue;  // UID 0 = project summary task, skip
    if (!name || !start || !end) continue;

    // Parent from OutlineNumber: "1.2.3" → parent is "1.2"
    const outline = getText(t, 'OutlineNumber');
    let parentId = null;
    if (outline && outline.includes('.')) {
      const parentOutline = outline.split('.').slice(0, -1).join('.');
      parentId = byOutline.get(parentOutline) || null;
    }

    // Predecessors from <PredecessorLink><PredecessorUID>
    const predecessors = [];
    for (const link of t.getElementsByTagName('PredecessorLink')) {
      const predUid = getText(link, 'PredecessorUID');
      if (predUid) predecessors.push(predUid);
    }

    tasks.push({
      id: uid,
      name,
      parentId,
      start,
      end,
      predecessors,
      entityLinks: [],
    });

    if (!projectStart || start < projectStart) projectStart = start;
    if (!projectEnd || end > projectEnd) projectEnd = end;
  }

  if (tasks.length === 0) throw new Error('Žádné platné úkoly v MS Project XML');

  // Project name from <Name> at root if available
  const rootName = doc.querySelector('Project > Name')?.textContent?.trim();

  return {
    id: generateScheduleId(),
    name: opts.name || rootName || `MS Project ${new Date().toISOString().slice(0, 10)}`,
    createdAt: Date.now(),
    projectStart,
    projectEnd,
    tasks,
  };
}
