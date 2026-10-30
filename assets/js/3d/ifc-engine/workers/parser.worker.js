// Web Worker wrapper around indexStepBytes (byte-level STEP lexer).
// Protocol:
//   inbound:  { cmd: 'parse', bytes: ArrayBuffer }   — transferred in
//          or { cmd: 'parse', text: string }          — legacy, encoded to UTF-8 here
//   outbound: { progress: true, done: number, total: number }   — heartbeat,
//               roughly every 8 MiB of input while the lexer runs
//             { ok: true, bytes: ArrayBuffer, fields: StepByteIndex columns }
//               — bytes and every column buffer transferred back (zero copy);
//               rebuild with StepByteIndex.fromTransferable(bytes, fields)
//          or { ok: false, error: string }
//
// Nothing here is structured-cloned per entity: the whole result is a handful
// of typed arrays plus the type-name table and the (sample-capped) diagnostics.

import { indexStepBytes } from '../parser/byte-lexer.js';

self.onmessage = (event) => {
  const msg = event.data;

  if (!msg || msg.cmd !== 'parse') {
    self.postMessage({ ok: false, error: `unknown cmd: ${msg && msg.cmd}` });
    return;
  }

  try {
    let bytes;
    if (typeof msg.text === 'string') {
      bytes = new TextEncoder().encode(msg.text);
    } else if (msg.bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(msg.bytes);
    } else {
      throw new TypeError('parse: expected bytes (ArrayBuffer) or text (string)');
    }
    const index = indexStepBytes(bytes, {
      onProgress: (done, total) => self.postMessage({ progress: true, done, total })
    });
    const { fields, transfer } = index.toTransferable();
    self.postMessage({ ok: true, bytes: bytes.buffer, fields }, transfer);
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
