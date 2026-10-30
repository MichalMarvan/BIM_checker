// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Michal Marvan
//
// loadIfc input → Uint8Array for the parser worker, optionally in a
// SharedArrayBuffer (cross-origin isolated pages; see sharedMemoryAvailable).

/**
 * File bytes as a Uint8Array for the parser. With `shared` the bytes land in a
 * SharedArrayBuffer (a Blob/File is streamed into it chunk by chunk, so no
 * second whole-file copy exists), which the parser worker and later the
 * geometry workers read without any transfer or copy. Without `shared` the
 * result wraps the caller's buffer when it covers it entirely (it gets
 * TRANSFERRED to the parser worker and comes back detached for the caller).
 *
 * @param {ArrayBuffer | Uint8Array | Blob | string} input
 * @param {boolean} shared
 * @returns {Promise<Uint8Array>}
 */
export async function readInputBytes(input, shared) {
  const toShared = (view) => {
    const out = new Uint8Array(new SharedArrayBuffer(view.byteLength));
    out.set(view);
    return out;
  };
  if (typeof input === 'string') {
    const enc = new TextEncoder().encode(input);
    return shared ? toShared(enc) : enc;
  }
  if (input instanceof ArrayBuffer) {
    return shared ? toShared(new Uint8Array(input)) : new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    const view = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (shared) {
      return toShared(view);
    }
    // Transfer needs the whole buffer; a partial view (e.g. a Node Buffer
    // from the pool) is copied so the neighbours stay intact.
    return input.byteOffset === 0 && input.byteLength === input.buffer.byteLength
      ? view
      : new Uint8Array(input.slice().buffer);
  }
  if (input && typeof input.arrayBuffer === 'function') {
    if (shared && typeof input.stream === 'function' && Number.isInteger(input.size)) {
      const out = new Uint8Array(new SharedArrayBuffer(input.size));
      let ofs = 0;
      const reader = input.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (ofs + value.byteLength > out.byteLength) {
          throw new RangeError('readInputBytes: blob grew while reading');
        }
        out.set(value, ofs);
        ofs += value.byteLength;
      }
      if (ofs !== out.byteLength) {
        throw new RangeError(`readInputBytes: blob shrank while reading (${ofs} of ${out.byteLength} B)`);
      }
      return out;
    }
    const buf = await input.arrayBuffer();
    return shared ? toShared(new Uint8Array(buf)) : new Uint8Array(buf);
  }
  throw new TypeError(`loadIfc: unsupported input (${input === null ? 'null' : typeof input})`);
}
