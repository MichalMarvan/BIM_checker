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

    function reformatDate(s) {
        if (typeof s !== 'string') return null;
        const trimmed = s.trim();
        let m;
        m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);          // D.M.YYYY
        if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
        m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);          // D/M/YYYY
        if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
        m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);          // YYYY/M/D
        if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
        return null;
    }

    classifiers.push({
        id: 'date-bad-format',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes("'date'") && msg.includes('xs:date');
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('date');
            if (!node) return null;
            const before = node.textContent;
            const after = reformatDate(before);
            return {
                id: 'date-bad-format-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'date-bad-format',
                label: 'editor.autoFix.fix.dateBadFormat',
                before,
                after,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: !!after,
                apply(doc) {
                    if (!after) return;
                    const n = doc.querySelector('date');
                    if (n) n.textContent = after;
                }
            };
        }
    });

    classifiers.push({
        id: 'cardinality-on-entity',
        test(err) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            return msg.includes("'entity'") && msg.includes('cardinality');
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('entity[cardinality]');
            if (!node) return null;
            return {
                id: 'cardinality-on-entity-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'cardinality-on-entity',
                label: 'editor.autoFix.fix.cardinalityOnEntity',
                before: 'cardinality="' + node.getAttribute('cardinality') + '"',
                after: '(removed)',
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    doc.querySelectorAll('entity[cardinality]').forEach(n => n.removeAttribute('cardinality'));
                }
            };
        }
    });

    const APPLICABILITY_FACETS = ['entity','partOf','classification','attribute','property','material'];

    classifiers.push({
        id: 'cardinality-on-applicability',
        test(err, xmlDoc) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            if (!msg.includes('cardinality') || !msg.includes('not allowed')) return false;
            if (msg.includes("'entity'")) return false; // handled by cardinality-on-entity
            // Confirm the offending element lives inside <applicability>.
            const found = xmlDoc.querySelector('applicability > [cardinality]');
            return !!found;
        },
        build(err, xmlDoc) {
            const node = xmlDoc.querySelector('applicability > [cardinality]');
            if (!node) return null;
            return {
                id: 'cardinality-on-applicability-' + (err.loc ? err.loc.lineNumber : 'x'),
                category: 'cardinality-on-applicability',
                label: 'editor.autoFix.fix.cardinalityOnApplicability',
                before: `<${node.tagName} cardinality="${node.getAttribute('cardinality')}">`,
                after: `<${node.tagName}>`,
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    doc.querySelectorAll('applicability > [cardinality]')
                        .forEach(n => { if (APPLICABILITY_FACETS.includes(n.tagName)) n.removeAttribute('cardinality'); });
                }
            };
        }
    });

    classifiers.push({
        id: 'missing-title',
        test(err, xmlDoc) {
            const msg = (err.message || err.rawMessage || '').toLowerCase();
            if (!msg.includes("'info'") || !msg.includes('title')) return false;
            return !xmlDoc.querySelector('info > title');
        },
        build(err, xmlDoc) {
            return {
                id: 'missing-title',
                category: 'missing-title',
                label: 'editor.autoFix.fix.missingTitle',
                before: null,
                after: '<title>Untitled IDS</title>',
                lineNumber: err.loc ? err.loc.lineNumber : null,
                fixable: true,
                apply(doc) {
                    const info = doc.querySelector('info');
                    if (!info || info.querySelector('title')) return;
                    const ns = doc.documentElement.namespaceURI || null;
                    const title = ns ? doc.createElementNS(ns, 'title') : doc.createElement('title');
                    title.textContent = 'Untitled IDS';
                    info.insertBefore(title, info.firstChild);
                }
            };
        }
    });

    return { analyze, applyFixes, _classifiers: classifiers };
})();
