/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IfcParams — utilities for parsing IFC entity parameter strings.
 * Handles quoted strings with '' escape, nested parentheses.
 */
window.IfcParams = (function() {
    'use strict';

    function splitIfcParams(s) {
        if (!s || !s.length) return [];
        const out = [];
        let buf = '';
        let depth = 0;
        let inString = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (inString) {
                buf += ch;
                if (ch === "'") {
                    if (s[i + 1] === "'") { buf += s[++i]; continue; } // escaped quote
                    inString = false;
                }
                continue;
            }
            if (ch === "'") { inString = true; buf += ch; continue; }
            if (ch === '(') { depth++; buf += ch; continue; }
            if (ch === ')') { depth--; buf += ch; continue; }
            if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
            buf += ch;
        }
        if (buf.length) out.push(buf);
        return out;
    }

    function unwrapEnumValue(s) {
        if (!s) return null;
        const trimmed = s.trim();
        if (!trimmed || trimmed === '$') return null;
        const m = trimmed.match(/^\.(.+)\.$/);
        return m ? m[1] : null;
    }

    function unwrapString(s) {
        if (!s) return null;
        const trimmed = s.trim();
        if (!trimmed || trimmed === '$') return null;
        const m = trimmed.match(/^'(.*)'$/s);
        if (!m) return null;
        return decodeIFCString(m[1].replace(/''/g, "'"));
    }

    function decodeIFCString(value) {
        if (!value) return value;
        value = value.replace(/\\S\\(.)/g, (match, character) => String.fromCharCode(character.charCodeAt(0) + 128));
        value = value.replace(/\\X\\([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
        value = value.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (match, hex) => {
            let result = '';
            for (let index = 0; index < hex.length; index += 4) result += String.fromCharCode(parseInt(hex.slice(index, index + 4), 16));
            return result;
        });
        value = value.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (match, hex) => {
            let result = '';
            for (let index = 0; index < hex.length; index += 8) result += String.fromCodePoint(parseInt(hex.slice(index, index + 8), 16));
            return result;
        });
        return value;
    }

    return { splitIfcParams, unwrapEnumValue, unwrapString, decodeIFCString };
})();
