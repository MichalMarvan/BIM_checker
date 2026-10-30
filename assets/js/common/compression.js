/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Compression — IFC/IDS file content gzip via native CompressionStream API.
 * Backward compat: decompress() detects gzip magic bytes, falls back to
 * plain-text passthrough for legacy uncompressed bytes/strings.
 */
window.Compression = (function() {
    'use strict';

    // Gzip payloads above this go to the decompression worker — for small
    // files the postMessage round-trip costs more than it saves.
    const WORKER_THRESHOLD = 256 * 1024;
    const _scriptSrc = document.currentScript ? document.currentScript.src : null;
    let _worker = null;
    let _workerBroken = false;
    let _nextId = 1;
    const _pending = new Map();

    function _getWorker() {
        if (_workerBroken || !_scriptSrc) return null;
        if (_worker) return _worker;
        try {
            _worker = new Worker(new URL('compression-worker.js', _scriptSrc));
            _worker.onmessage = (e) => {
                const { id, text, buf, error } = e.data || {};
                const p = _pending.get(id);
                if (!p) return;
                _pending.delete(id);
                if (error) p.reject(new Error(error));
                else p.resolve(buf !== undefined ? buf : text);
            };
            _worker.onerror = () => {
                _workerBroken = true;
                for (const p of _pending.values()) p.reject(new Error('compression worker failed'));
                _pending.clear();
                try { _worker.terminate(); } catch (e) { /* already dead */ }
                _worker = null;
            };
        } catch (e) {
            _workerBroken = true;
            _worker = null;
        }
        return _worker;
    }

    function _decompressInWorker(view, asBytes) {
        const w = _getWorker();
        if (!w) return null;
        // Copy before transfer — the caller's buffer must stay intact so the
        // inline path can still run if the worker dies mid-job.
        const buf = view.slice().buffer;
        const id = _nextId++;
        const promise = new Promise((resolve, reject) => _pending.set(id, { resolve, reject }));
        w.postMessage({ id, buf, asBytes: !!asBytes }, [buf]);
        return promise;
    }

    function isSupported() {
        return typeof CompressionStream !== 'undefined'
            && typeof DecompressionStream !== 'undefined';
    }

    function isGzipped(bytes) {
        if (!bytes) return false;
        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        return view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b;
    }
    /**
     * gzip a string, raw bytes or a Blob/File. Blobs are streamed, so a file
     * above V8's ~512 MiB string limit never has to become a JS string.
     */
    async function compress(text) {
        const isBlob = typeof Blob !== 'undefined' && text instanceof Blob;
        const isBytes = text instanceof ArrayBuffer || ArrayBuffer.isView(text);
        if (typeof text !== 'string' && !isBlob && !isBytes) {
            throw new TypeError('Compression.compress expects a string, bytes or Blob');
        }
        if (!isSupported()) {
            throw new Error('CompressionStream not supported in this environment');
        }
        const source = typeof text === 'string' ? new Blob([new TextEncoder().encode(text)])
            : isBlob ? text : new Blob([text]);
        const stream = source.stream()
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

        if (view.byteLength >= WORKER_THRESHOLD) {
            const viaWorker = _decompressInWorker(view);
            if (viaWorker) {
                try {
                    return _assertNotTruncated(view, await viaWorker);
                } catch (e) {
                    if (e && e.code === 'TEXT_TOO_LARGE') {
                        throw e;
                    }
                    console.warn('[Compression] worker decompress failed, falling back inline:', e.message);
                }
            }
        }

        const stream = new Blob([view]).stream()
            .pipeThrough(new DecompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        return _assertNotTruncated(view, await blob.text());
    }

    // gzip's last 4 bytes hold the uncompressed size (mod 2^32). Chromium
    // returns '' without an exception when the text exceeds V8's string limit;
    // surface that instead of handing callers an empty file.
    function _assertNotTruncated(view, text) {
        if (text.length > 0 || view.byteLength < 8) {
            return text;
        }
        const isize = new DataView(view.buffer, view.byteOffset + view.byteLength - 4, 4).getUint32(0, true);
        if (isize > 0) {
            const err = new Error(`Decompressed content (${isize} bytes) is too large for a JS string; use Compression.decompressToBytes`);
            err.code = 'TEXT_TOO_LARGE';
            throw err;
        }
        return text;
    }

    /**
     * Like decompress() but returns the raw bytes (Uint8Array) and never builds
     * a JS string, so payloads above V8's ~512 MiB string limit survive.
     * Strings are UTF-8 encoded; plain bytes pass through untouched.
     */
    async function decompressToBytes(bytes) {
        if (bytes === null || bytes === undefined) {
            return new Uint8Array(0);
        }
        if (typeof bytes === 'string') {
            return new TextEncoder().encode(bytes);
        }

        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        if (!isGzipped(view)) {
            return view;
        }

        if (!isSupported()) {
            throw new Error('Cannot decompress: CompressionStream not supported');
        }

        if (view.byteLength >= WORKER_THRESHOLD) {
            const viaWorker = _decompressInWorker(view, true);
            if (viaWorker) {
                try {
                    return new Uint8Array(await viaWorker);
                } catch (e) {
                    console.warn('[Compression] worker decompress failed, falling back inline:', e.message);
                }
            }
        }

        const stream = new Blob([view]).stream()
            .pipeThrough(new DecompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    function _decompressViaWorkerForTest(bytes) {
        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        const p = _decompressInWorker(view);
        if (!p) return Promise.reject(new Error('worker unavailable'));
        return p;
    }

    return { compress, decompress, decompressToBytes, isGzipped, isSupported, _decompressViaWorkerForTest };
})();
