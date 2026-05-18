/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDSAutoFix — analyses xmllint-wasm errors against the IDS 1.0 XSD and
 * produces fixable descriptors that mutate the XMLDocument in place.
 *
 * Pure functions; no DOM dependencies outside the supplied XMLDocument.
 */
window.IDSAutoFix = (function () {
    'use strict';

    // Catalogue entries are pushed by feature tasks below.
    // Each entry: { id, test(err, xmlDoc), build(err, xmlDoc) → FixDescriptor }
    const classifiers = [];

    function analyze(xmlDoc, xmllintErrors) {
        if (!xmlDoc || !Array.isArray(xmllintErrors)) return [];
        const descriptors = [];
        xmllintErrors.forEach((err, idx) => {
            for (const c of classifiers) {
                if (c.test(err, xmlDoc)) {
                    const d = c.build(err, xmlDoc);
                    if (d) {
                        descriptors.push(d);
                        return;
                    }
                }
            }
            descriptors.push({
                id: 'unknown-' + idx,
                category: 'unknown',
                label: err.message || err.rawMessage || 'XSD error',
                before: null,
                after: null,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: false,
                apply: null
            });
        });
        return descriptors;
    }

    function applyFixes(xmlDoc, fixIds, descriptors) {
        if (!xmlDoc || !Array.isArray(fixIds) || !Array.isArray(descriptors)) {
            return xmlDoc ? new XMLSerializer().serializeToString(xmlDoc) : '';
        }
        const wanted = new Set(fixIds);
        for (const d of descriptors) {
            if (!wanted.has(d.id) || !d.fixable || typeof d.apply !== 'function') continue;
            try { d.apply(xmlDoc); } catch (e) { console.warn('IDSAutoFix apply failed:', d.id, e); }
        }
        return new XMLSerializer().serializeToString(xmlDoc);
    }

    classifiers.push({
        id: 'author-not-email',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes('author') && msg.includes('pattern');
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('author');
            if (!node) return null;
            const before = node.textContent;
            const after = 'noreply@example.com';
            if (before === after) return null;
            return {
                id: 'author-not-email-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'author-not-email',
                label: 'editor.autoFix.fix.authorNotEmail',
                before,
                after,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    const n = doc.querySelector('author');
                    if (n) n.textContent = after;
                }
            };
        }
    });

    return { analyze, applyFixes, _classifiers: classifiers };
})();
