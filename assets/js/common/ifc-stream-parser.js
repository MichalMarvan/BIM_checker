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
        let lines = this.buffer.split('\n');
        
        // Keep last incomplete line in buffer
        this.buffer = lines.pop() || '';
        
        // Process complete lines
        for (let line of lines) {
            this.processLine(line);
        }
    }

    processLine(line) {
        line = line.trim();
        
        if (!line) return;
        
        // Skip header lines until DATA section
        if (!this.headerProcessed) {
            if (line === 'DATA;') {
                this.headerProcessed = true;
            }
            return;
        }
        
        // Stop at ENDSEC
        if (line === 'ENDSEC;') {
            return;
        }
        
        // Parse entity
        if (line.startsWith('#')) {
            const entity = this.parseEntity(line);
            if (entity) {
                this.entityCount++;
                this.onEntity(entity);
            }
        }
    }

    parseEntity(line) {
        try {
            // Basic IFC entity parsing
            const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\);?$/);
            if (!match) return null;
            
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
                if (char === '(') depth++;
                if (char === ')') depth--;
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
        if (value === '.T.') return true;
        if (value === '.F.') return false;
        if (value === '$') return null;
        if (value === '*') return undefined;
        
        return value;
    }
}

// Export for use in other modules
window.IFCStreamParser = IFCStreamParser;
