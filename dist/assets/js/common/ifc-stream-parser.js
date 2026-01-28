/* ===========================================
   BIM CHECKER - IFC STREAM PARSER
   Streaming parser for large IFC files
   =========================================== */

class IFCStreamParser {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
        this.onEntity = options.onEntity || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onComplete = options.onComplete || (() => {});

        this.buffer = '';
        this.entityBuffer = ''; // Buffer for multi-line entities
        this.totalBytes = 0;
        this.processedBytes = 0;
        this.entityCount = 0;
        this.headerProcessed = false;
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
                    // Process remaining buffer
                    if (this.buffer.trim()) {
                        this.processLine(this.buffer);
                    }
                    this.onComplete({
                        totalEntities: this.entityCount,
                        totalBytes: this.totalBytes
                    });
                    break;
                }

                // Decode chunk
                const chunk = decoder.decode(value, { stream: true });
                this.processedBytes += value.byteLength;

                // Add to buffer
                this.buffer += chunk;

                // Process complete lines
                this.processBuffer();

                // Report progress
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

    processBuffer() {
        const lines = this.buffer.split('\n');

        // Keep last incomplete line in buffer
        this.buffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
            this.processLine(line);
        }
    }

    /**
     * Check if a buffer represents a complete IFC entity.
     * Handles edge case where semicolon might be inside a string.
     * @param {string} buffer - The entity buffer to check
     * @returns {boolean} - True if entity is complete
     */
    isEntityComplete(buffer) {
        if (!buffer.trimEnd().endsWith(';')) {
            return false;
        }

        // Count apostrophes to determine if we're inside a string
        // IFC uses single quotes for strings, and escaped quotes are ''
        let inString = false;
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] === "'") {
                // Check for escaped quote (two consecutive apostrophes)
                if (buffer[i + 1] === "'") {
                    i++; // Skip the escaped quote
                    continue;
                }
                inString = !inString;
            }
        }

        // Entity is complete only if we're not inside a string
        return !inString;
    }

    processLine(line) {
        line = line.trim();

        if (!line) {
            return;
        }

        // Skip header lines until DATA section
        if (!this.headerProcessed) {
            if (line === 'DATA;') {
                this.headerProcessed = true;
            }
            return;
        }

        // Stop at ENDSEC
        if (line === 'ENDSEC;') {
            // Process any remaining entity in buffer
            if (this.entityBuffer) {
                this.processEntityBuffer();
            }
            return;
        }

        // Handle multi-line entity support
        // IFC entities can span multiple lines and end with semicolon
        if (this.entityBuffer) {
            // We're in the middle of a multi-line entity
            this.entityBuffer += ' ' + line;
            if (this.isEntityComplete(this.entityBuffer)) {
                // Entity complete
                this.processEntityBuffer();
            }
        } else if (line.startsWith('#')) {
            // Start of a new entity
            if (this.isEntityComplete(line)) {
                // Single-line entity (most common case)
                const entity = this.parseEntity(line);
                if (entity) {
                    this.entityCount++;
                    this.onEntity(entity);
                }
            } else {
                // Multi-line entity starts here
                this.entityBuffer = line;
            }
        }
    }

    processEntityBuffer() {
        if (this.entityBuffer) {
            const entity = this.parseEntity(this.entityBuffer);
            if (entity) {
                this.entityCount++;
                this.onEntity(entity);
            }
            this.entityBuffer = '';
        }
    }

    parseEntity(line) {
        try {
            // Basic IFC entity parsing
            const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\);?$/);
            if (!match) {
                return null;
            }

            const [, id, type, argsStr] = match;

            return {
                id: parseInt(id),
                type: type,
                line: line,
                arguments: this.parseArguments(argsStr)
            };
        } catch (e) {
            console.warn('Error parsing entity:', e, line);
            return null;
        }
    }

    parseArguments(argsStr) {
        // Simplified argument parsing
        const args = [];
        let current = '';
        let depth = 0;
        let inString = false;

        // Handle empty arguments - return array with one empty element
        if (argsStr.trim() === '') {
            return [''];
        }

        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];

            if (char === "'" && argsStr[i-1] !== '\\') {
                inString = !inString;
            }

            if (!inString) {
                if (char === '(') {
                    depth++;
                }
                if (char === ')') {
                    depth--;
                }
                if (char === ',' && depth === 0) {
                    args.push(this.parseValue(current.trim()));
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        if (current.trim()) {
            args.push(this.parseValue(current.trim()));
        }

        return args;
    }

    parseValue(value) {
        // Remove quotes
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1);
        }

        // Check for reference
        if (value.startsWith('#')) {
            return { ref: parseInt(value.slice(1)) };
        }

        // Check for number
        if (!isNaN(value)) {
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
