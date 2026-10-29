/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/** RFC 4180 CSV codec with UTF-8 BOM and spreadsheet-formula neutralization. */
(function(global) {
    'use strict';

    const BOM = '\uFEFF';
    const DANGEROUS_FORMULA = /^[\t\r\n ]*[=+\-@]/;
    // The guard intentionally applies only to string cells \u2014 numeric cells stay unquoted (commit 29d082f).

    function sanitizeCell(value, neutralizeFormulas = true) {
        if (value === undefined || value === null) {
            return '';
        }
        const text = String(value);
        return neutralizeFormulas && typeof value === 'string' && DANGEROUS_FORMULA.test(text)
            ? `'${text}`
            : text;
    }

    function encodeCell(value, options = {}) {
        const text = sanitizeCell(value, options.neutralizeFormulas !== false);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function encodeRows(rows, options = {}) {
        const newline = options.newline || '\r\n';
        const body = (rows || []).map(row =>
            (row || []).map(value => encodeCell(value, options)).join(',')
        ).join(newline);
        return (options.bom === false ? '' : BOM) + body + (options.finalNewline === false || !body ? '' : newline);
    }

    function parseRows(input) {
        const text = String(input ?? '').replace(/^\uFEFF/, '');
        if (!text) {
            return [];
        }
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;

        for (let index = 0; index < text.length; index++) {
            const char = text[index];
            if (quoted) {
                if (char === '"' && text[index + 1] === '"') {
                    field += '"';
                    index++;
                } else if (char === '"') {
                    quoted = false;
                } else {
                    field += char;
                }
                continue;
            }
            if (char === '"' && field === '') {
                quoted = true;
            } else if (char === ',') {
                row.push(field);
                field = '';
            } else if (char === '\r' || char === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
                if (char === '\r' && text[index + 1] === '\n') {
                    index++;
                }
            } else {
                field += char;
            }
        }
        if (quoted) {
            throw new Error('CSV contains an unterminated quoted field');
        }
        if (field !== '' || row.length > 0 || text.endsWith(',')) {
            row.push(field);
            rows.push(row);
        }
        return rows;
    }

    global.BIMCSV = Object.freeze({ BOM, sanitizeCell, encodeCell, encodeRows, parseRows });
})(globalThis);

