/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/* ===========================================
   BIM CHECKER - IFC STREAM PARSER
   Streaming parser for large IFC files

   Tokenizace má stejnou sémantiku jako parseStepText v
   assets/js/3d/ifc-engine/parser/step-parser.js (ES modul, sem ho nelze
   importovat): záznam končí prvním `;` mimo řetězec ('' = escapovaný
   apostrof) a mimo blokový komentář, komentáře se vyříznou, víceřádkový
   záznam se spojí bez mezer, záznam nezačínající `#` se ignoruje, ENDSEC
   ukončuje DATA sekci. Paritu hlídá tests/test-suites/ifc-parser-parity.test.js.
   =========================================== */

const STREAM_DATA_SECTION_RE = /\bDATA\s*;/;
const STREAM_ENTITY_RECORD_RE = /^#(\d+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*;?$/;
const STREAM_INNER_ENTITY_START_RE = /'(?:[^']|'')*'|(#\d+\s*=)/g;

class IFCStreamParser {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
        this.onEntity = options.onEntity || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onComplete = options.onComplete || (() => {});

        this.buffer = '';
        this.recordText = ''; // dokončené úseky rozpracovaného záznamu (před komentářem)
        this.totalBytes = 0;
        this.processedBytes = 0;
        this.entityCount = 0;
        this.headerProcessed = false;
        this.sectionDone = false;
    }

    async parseFile(file) {
        this.totalBytes = file.size;
        const stream = file.stream();
        const reader = stream.getReader();
        const decoder = new TextDecoder('utf-8');

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    this.finish();
                    this.onComplete({
                        totalEntities: this.entityCount,
                        totalBytes: this.totalBytes
                    });
                    break;
                }

                this.processedBytes += value.byteLength;
                this.feed(decoder.decode(value, { stream: true }));

                const progress = (this.processedBytes / this.totalBytes) * 100;
                this.onProgress({
                    progress: Math.round(progress),
                    processedBytes: this.processedBytes,
                    totalBytes: this.totalBytes,
                    entityCount: this.entityCount
                });
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Synchronně zpracuje celý text po kusech (stejná cesta jako parseFile).
     * @param {string} text
     * @param {number} [chunkSize]
     */
    parseText(text, chunkSize = this.chunkSize) {
        for (let i = 0; i < text.length; i += chunkSize) {
            this.feed(text.slice(i, i + chunkSize));
        }
        this.finish();
        return this.entityCount;
    }

    /** Přidá další kus textu a zpracuje všechny úplné záznamy. */
    feed(chunk) {
        this.buffer += chunk;
        this.scan(false);
    }

    /** Konec vstupu: neukončený komentář se zahodí, záznam bez `;` se (jako ve step-parseru) nevydá. */
    finish() {
        this.scan(true);
        this.buffer = '';
        this.recordText = '';
    }

    processBuffer() {
        this.scan(false);
    }

    /**
     * Zpracuje všechny úplné záznamy v bufferu; neúplný zbytek (rozpracovaný
     * řetězec, komentář nebo záznam bez `;`) zůstane v bufferu na další kus.
     * @param {boolean} eof — true: vstup skončil, neukončené konstrukce se uzavřou
     */
    scan(eof) {
        if (this.sectionDone) {
            this.buffer = '';
            return;
        }
        if (!this.headerProcessed) {
            const dataMatch = STREAM_DATA_SECTION_RE.exec(this.buffer);
            if (!dataMatch) {
                // `DATA;` může být rozdělen hranicí kusu — nech konec bufferu.
                this.buffer = eof ? '' : this.buffer.slice(-8);
                return;
            }
            this.headerProcessed = true;
            this.buffer = this.buffer.slice(dataMatch.index + dataMatch[0].length);
        }

        const text = this.buffer;
        const scanRe = /['/;]/g;
        let segStart = 0;
        for (let m = scanRe.exec(text); m !== null; m = scanRe.exec(text)) {
            const at = m.index;
            const c = text.charCodeAt(at);
            if (c === 39 /* ' */) {
                let j = at + 1;
                let closed = false;
                for (;;) {
                    j = text.indexOf("'", j);
                    if (j === -1) {
                        break;
                    }
                    if (j + 1 >= text.length && !eof) {
                        break;
                    } // za `'` může ještě přijít `'` (escape)
                    if (text.charCodeAt(j + 1) === 39) {
                        j += 2; continue;
                    }
                    j++;
                    closed = true;
                    break;
                }
                if (!closed) {
                    if (!eof) {
                        this.buffer = text.slice(segStart); return;
                    }
                    j = text.length;
                }
                scanRe.lastIndex = j;
            } else if (c === 47 /* / */) {
                if (at + 1 >= text.length && !eof) {
                    this.buffer = text.slice(segStart); return;
                }
                if (text.charCodeAt(at + 1) !== 42 /* * */) {
                    continue;
                }
                const end = text.indexOf('*/', at + 2);
                if (end === -1) {
                    this.recordText += text.slice(segStart, at);
                    this.buffer = eof ? '' : text.slice(at);
                    if (eof) {
                        this.recordText = '';
                    }
                    return;
                }
                this.recordText += text.slice(segStart, at);
                segStart = end + 2;
                scanRe.lastIndex = segStart;
            } else {
                const rec = (this.recordText + text.slice(segStart, at)).trim();
                this.recordText = '';
                segStart = at + 1;
                if (!this.handleRecord(rec)) {
                    this.sectionDone = true;
                    this.buffer = '';
                    return;
                }
            }
        }
        this.buffer = eof ? '' : text.slice(segStart);
    }

    /**
     * Zpracuje jeden ukončený záznam (bez `;`).
     * @returns {boolean} false, když záznam je ENDSEC (konec DATA sekce)
     */
    handleRecord(rec) {
        if (rec === '') {
            return true;
        }
        if (/^ENDSEC$/i.test(rec)) {
            return false;
        }
        if (rec.charCodeAt(0) !== 35 /* # */) {
            return true;
        }
        if (rec.indexOf('\n') !== -1) {
            rec = rec.replace(/\s*\r?\n\s*/g, '');
        }
        this.emitRecord(rec);
        return true;
    }

    /** Záznam, který spolkl následující entitu (chybí `);`): hlavu zahodit, zbytek zpracovat. */
    emitRecord(rec) {
        if (rec.indexOf('=', 1) !== -1) {
            STREAM_INNER_ENTITY_START_RE.lastIndex = 1;
            for (let s = STREAM_INNER_ENTITY_START_RE.exec(rec); s !== null; s = STREAM_INNER_ENTITY_START_RE.exec(rec)) {
                if (s[1] === undefined) {
                    continue;
                }
                this.emitRecord(rec.slice(s.index));
                return;
            }
        }
        const entity = this.parseEntity(rec);
        if (entity) {
            this.entityCount++;
            this.onEntity(entity);
        }
    }

    /**
     * Zpětně kompatibilní vstup po řádcích: řádek se přidá do bufferu
     * (včetně konce řádku) a zpracuje se stejným automatem jako feed().
     */
    processLine(line) {
        this.feed(line + '\n');
    }

    /**
     * Check if a buffer represents a complete IFC entity: ends with `;`
     * outside a string ('' = escaped apostrophe) and outside a comment.
     * @param {string} buffer - The entity buffer to check
     * @returns {boolean} - True if entity is complete
     */
    isEntityComplete(buffer) {
        if (!buffer.trimEnd().endsWith(';')) {
            return false;
        }
        let inString = false;
        for (let i = 0; i < buffer.length; i++) {
            const char = buffer[i];
            if (char === "'") {
                if (inString && buffer[i + 1] === "'") {
                    i++;
                    continue;
                }
                inString = !inString;
            } else if (!inString && char === '/' && buffer[i + 1] === '*') {
                const end = buffer.indexOf('*/', i + 2);
                if (end === -1) {
                    return false;
                }
                i = end + 1;
            }
        }
        return !inString;
    }

    parseEntity(line) {
        try {
            const match = STREAM_ENTITY_RECORD_RE.exec(line.trim());
            if (!match) {
                return null;
            }

            const [, id, type, argsStr] = match;

            return {
                id: parseInt(id, 10),
                type: type.toUpperCase(),
                line: line,
                arguments: this.parseArguments(argsStr)
            };
        } catch (e) {
            console.warn('Error parsing entity:', e, line);
            return null;
        }
    }

    /**
     * Rozdělí params na top-level položky a každou převede přes parseValue.
     * Stejná sémantika jako splitParams ve step-parser.js: prázdné položky se
     * zachovávají ("a,,b" → 3 položky), prázdný vstup dává [].
     */
    parseArguments(argsStr) {
        const args = [];
        if (!argsStr || argsStr.trim() === '') {
            return args;
        }
        let current = '';
        let depth = 0;
        let inString = false;

        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];

            if (char === "'") {
                if (inString && argsStr[i + 1] === "'") {
                    current += "''";
                    i++;
                    continue;
                }
                inString = !inString;
            }

            if (!inString) {
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                } else if (char === ',' && depth === 0) {
                    args.push(this.parseValue(current.trim()));
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        args.push(this.parseValue(current.trim()));
        return args;
    }

    parseValue(value) {
        // String literal: strip quotes, unescape '' (IFC encoding \X2\ etc. is left raw)
        if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1).replace(/''/g, "'");
        }

        // Check for reference
        if (/^#\d+$/.test(value)) {
            return { ref: parseInt(value.slice(1), 10) };
        }

        // Check for number
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
            return parseFloat(value);
        }

        // Check for boolean/special values
        if (value === '.T.') {
            return true;
        }
        if (value === '.F.') {
            return false;
        }
        if (value === '$') {
            return null;
        }
        if (value === '*') {
            return undefined;
        }

        return value;
    }
}

// Export for use in other modules
window.IFCStreamParser = IFCStreamParser;
