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

    function isGzipped(_bytes) { return false; }
    async function compress(_text) { throw new Error('not implemented'); }
    async function decompress(_bytes) { throw new Error('not implemented'); }

    return { compress, decompress, isGzipped, isSupported };
})();
