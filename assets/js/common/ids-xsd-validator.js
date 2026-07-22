/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDSXSDValidator — lazy-loaded XSD validation against IDS 1.0 schema via xmllint-wasm.
 *
 * API (xmllint-wasm 4.0.2 browser, ES module):
 *   Named export: validateXML(options) → Promise<{ valid, errors, rawOutput, normalized }>
 *   errors: [{ rawMessage, message, loc: { fileName, lineNumber } | null }]
 *
 * The module uses dynamic import() to load the ES module bundle.
 * The official IDS 1.0 schema and its W3C dependencies are shipped locally so
 * validation stays strict and works offline. Only schemaLocation URLs are made
 * relative and the unused XSI import is omitted for libxml2 compatibility.
 */
window.IDSXSDValidator = (function() {
    'use strict';

    let initPromise = null;
    let validateXMLFn = null;
    let xsdFiles = null;
    let initialized = false;

    // Capture the base path of this script so we can resolve sibling paths.
    // When loaded via <script src="...">, we scan for our own <script> tag.
    function getScriptBase() {
        const scripts = document.querySelectorAll('script[src]');
        for (const s of scripts) {
            if (s.src && s.src.includes('ids-xsd-validator')) {
                return s.src.replace(/[^/]+$/, '');
            }
        }
        // Fallback: derive from window location (works for pages/*)
        return window.location.origin + '/assets/js/common/';
    }

    async function init() {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            const base = getScriptBase();
            // base ends in 'common/', so vendor is ../vendor/ and data is ../../data/
            const vendorUrl = base + '../vendor/xmllint-wasm.js';
            const dataBase = base + '../../data/';
            const fileNames = [
                'ids-1.0.xsd',
                'xml.xsd',
                'XMLSchema.xsd',
                'XMLSchema.dtd',
                'datatypes.dtd'
            ];

            const [mod, ...responses] = await Promise.all([
                import(/* webpackIgnore: true */ vendorUrl),
                ...fileNames.map(fileName => fetch(dataBase + fileName))
            ]);

            validateXMLFn = mod.validateXML;
            if (typeof validateXMLFn !== 'function') {
                throw new Error(
                    'xmllint-wasm: validateXML not found. Got: ' + Object.keys(mod).join(', ')
                );
            }

            const failedIndex = responses.findIndex(response => !response.ok);
            if (failedIndex !== -1) {
                const response = responses[failedIndex];
                throw new Error(`Failed to fetch XSD dependency ${fileNames[failedIndex]}: ${response.status}`);
            }
            const contents = await Promise.all(responses.map(response => response.text()));
            xsdFiles = fileNames.map((fileName, index) => ({ fileName, contents: contents[index] }));
            initialized = true;
        })();
        return initPromise;
    }

    /**
     * Validate an IDS XML string against the IDS 1.0 XSD schema.
     * @param {string} xmlString — raw XML content
     * @returns {Promise<{valid: boolean, errors: Array<{line: number|null, column: number|null, severity: string, message: string}>}>}
     */
    async function validate(xmlString) {
        await init();
        const out = await validateXMLFn({
            xml:    [{ fileName: 'doc.ids',     contents: xmlString }],
            schema: [xsdFiles[0]],
            preload: xsdFiles.slice(1)
        });

        // xmllint-wasm 4.x errors: [{ rawMessage, message, loc: { fileName, lineNumber } | null }]
        const errors = (out.errors || []).map(parseErrorObject);
        return {
            valid:  errors.length === 0,
            errors
        };
    }

    /**
     * Parse an error object from xmllint-wasm 4.x into our normalized shape.
     */
    function parseErrorObject(errObj) {
        if (errObj && typeof errObj === 'object') {
            const line    = errObj.loc ? errObj.loc.lineNumber || null : null;
            const message = errObj.message || errObj.rawMessage || String(errObj);
            // Severity is not structured in 4.x — infer from message text
            const severity = /warning/i.test(message) ? 'warning' : 'error';
            return { line, column: null, severity, message: message.trim() };
        }
        // Fallback for plain string errors
        const m = String(errObj).match(/^[^:]+:(\d+):(?:\d+:)?\s*(.+)$/);
        return m
            ? { line: parseInt(m[1]), column: null, severity: 'error', message: m[2].trim() }
            : { line: null, column: null, severity: 'error', message: String(errObj) };
    }

    return {
        init,
        validate,
        /** @internal — exposed for lazy-init tests */
        _isInitialized: () => initialized
    };
})();
