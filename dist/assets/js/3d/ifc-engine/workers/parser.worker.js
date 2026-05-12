// Web Worker wrapper around parseStepText.
// Protocol:
//   inbound:  { cmd: 'parse', text: string }
//   outbound: { ok: true, entities: RawEntity[], schema: string }
//          or { ok: false, error: string }
//
// Entities are sent as Array (Map is not structured-cloneable to/from worker).
// Receiver should rebuild Map<expressId, RawEntity> if needed.

import { parseStepText } from '../parser/step-parser.js';

self.onmessage = (event) => {
  const msg = event.data;

  if (!msg || msg.cmd !== 'parse') {
    self.postMessage({ ok: false, error: `unknown cmd: ${msg && msg.cmd}` });
    return;
  }

  try {
    const { entities, schema } = parseStepText(msg.text);
    // Convert Map → Array for postMessage transfer
    const entitiesArr = [...entities.values()];
    self.postMessage({ ok: true, entities: entitiesArr, schema });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
