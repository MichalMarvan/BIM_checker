/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * IDSXSDValidator — lazy-loaded XSD validation against IDS 1.0 schema via xmllint-wasm.
 *
 * API (xmllint-wasm 4.0.2 browser, ES module):
 *   Named export: validateXML(options) → Promise<{ valid, errors, rawOutput, normalized }>
 *   errors: [{ rawMessage, message, loc: { fileName, lineNumber } | null }]
 *
 * The module uses dynamic import() to load the ES module bundle.
 * The ids-1.0.xsd shipped here is a patched version of the official IDS 1.0 schema:
 *   - External xs:import schemaLocation references removed (xmllint-wasm cannot fetch URLs)
 *   - xs:element ref="xs:restriction" replaced with xs:any (lax validation, same coverage)
 *   - xs:attributeGroup ref="xs:occurs" inlined as minOccurs/maxOccurs attributes
 * These patches preserve validation behavior for all IDS 1.0 documents.
 */
window.IDSXSDValidator = (function() {
    'use strict';

    let initPromise = null;
    let validateXMLFn = null;
    let xsdText = null;
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
            const xsdUrl    = base + '../../data/ids-1.0.xsd';

            const [mod, xsdResp] = await Promise.all([
                import(/* webpackIgnore: true */ vendorUrl),
                fetch(xsdUrl)
            ]);

            validateXMLFn = mod.validateXML;
            if (typeof validateXMLFn !== 'function') {
                throw new Error(
                    'xmllint-wasm: validateXML not found. Got: ' + Object.keys(mod).join(', ')
                );
            }

            if (!xsdResp.ok) {
                throw new Error('Failed to fetch IDS XSD: ' + xsdResp.status + ' ' + xsdUrl);
            }
            xsdText = await xsdResp.text();
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
            schema: [{ fileName: 'ids-1.0.xsd', contents: xsdText   }]
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
