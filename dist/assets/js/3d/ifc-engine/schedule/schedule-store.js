// Phase 6.14.1 — Schedule (4D timeline) persistence.
//
// Schedule shape:
//   {
//     id, name, createdAt,
//     projectStart: ISO date string, projectEnd: ISO date,
//     tasks: [{
//       id, name, parentId?, start, end,        // ISO date strings
//       predecessors?: [taskId],                  // for Gantt arrows
//       entityLinks: [{modelId, expressId}],      // resolved direct links
//       rules?: [{ ifcType?, propertyMatch? }],   // per-rule auto-link
//     }],
//   }

const DB_NAME = 'bim_ai_viewer_schedules';
const DB_VERSION = 1;
const STORE = 'schedules';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      try { result = fn(store); } catch (err) { reject(err); return; }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
    });
  });
}

export async function saveSchedule(s) { return tx('readwrite', store => store.put(s)); }

export async function listSchedules() {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getSchedule(id) {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function removeSchedule(id) { return tx('readwrite', store => store.delete(id)); }

export function generateScheduleId() {
  return `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
export function generateTaskId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`;
}
