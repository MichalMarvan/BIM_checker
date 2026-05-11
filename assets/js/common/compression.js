/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Compression — IFC/IDS file content gzip via native CompressionStream API.
 * Backward compat: decompress() detects gzip magic bytes, falls back to
 * plain-text passthrough for legacy uncompressed bytes/strings.
 */
window.Compression = (function() {
    'use strict';

    function isSupported() {
        return typeof CompressionStream !== 'undefined'
            && typeof DecompressionStream !== 'undefined';
    }

    function isGzipped(bytes) {
        if (!bytes) return false;
        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        return view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b;
    }
    async function compress(text) {
        if (typeof text !== 'string') {
            throw new TypeError('Compression.compress expects a string');
        }
        if (!isSupported()) {
            throw new Error('CompressionStream not supported in this environment');
        }
        const encoded = new TextEncoder().encode(text);
        const stream = new Blob([encoded]).stream()
            .pipeThrough(new CompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        const buffer = await blob.arrayBuffer();
        return new Uint8Array(buffer);
    }

    async function decompress(bytes) {
        if (bytes === null || bytes === undefined) return '';
        if (typeof bytes === 'string') return bytes;

        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

        if (!isGzipped(view)) {
            return new TextDecoder('utf-8').decode(view);
        }

        if (!isSupported()) {
            throw new Error('Cannot decompress: CompressionStream not supported');
        }
        const stream = new Blob([view]).stream()
            .pipeThrough(new DecompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        return await blob.text();
    }

    return { compress, decompress, isGzipped, isSupported };
})();
