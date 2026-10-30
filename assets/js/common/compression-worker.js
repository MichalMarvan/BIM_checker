/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Gzip decompression off the main thread. Large stored files (17 MB IFC ≈
 * seconds of DecompressionStream work) would otherwise block the UI and
 * compete with the render loop during model loads.
 *
 * `asBytes` returns the raw ArrayBuffer (transferred) instead of a string —
 * needed above V8's ~512 MiB string limit, where text() silently yields ''.
 */
self.onmessage = async (event) => {
    const { id, buf, asBytes } = event.data;
    try {
        const stream = new Blob([buf]).stream()
            .pipeThrough(new DecompressionStream('gzip'));
        if (asBytes) {
            const out = await new Response(stream).arrayBuffer();
            self.postMessage({ id, buf: out }, [out]);
        } else {
            const text = await new Response(stream).text();
            self.postMessage({ id, text });
        }
    } catch (err) {
        self.postMessage({ id, error: (err && err.message) || String(err) });
    }
};
