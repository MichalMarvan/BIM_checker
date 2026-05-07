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
        return m[1].replace(/''/g, "'");
    }

    return { splitIfcParams, unwrapEnumValue, unwrapString };
})();
