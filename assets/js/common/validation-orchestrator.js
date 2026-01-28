/* ===========================================
   BIM CHECKER - VALIDATION ORCHESTRATOR
   Coordinates parallel validation workflow
   =========================================== */

class ValidationOrchestrator {
    // 50MB threshold for parallel processing
    static LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

    // Maximum chunk size for streaming
    static MAX_CHUNK_SIZE = 10 * 1024 * 1024;

    constructor(options = {}) {
        this.workerPool = null;
        this.aborted = false;
        this.listeners = new Map();
        this.progress = {
            phase: 'idle',
            files: new Map(),
            overall: 0
        };
    }

    /**
     * Check if Web Workers are supported
     * @returns {boolean}
     */
    static isWorkerSupported() {
        return typeof Worker !== 'undefined';
    }

    /**
     * Determine processing strategy based on file size
     * @param {number} fileSize - Size in bytes
     * @returns {string} 'single' or 'parallel'
     */
    static determineStrategy(fileSize) {
        return fileSize >= ValidationOrchestrator.LARGE_FILE_THRESHOLD
            ? 'parallel'
            : 'single';
    }

    /**
     * Calculate optimal chunk size for streaming
     * @param {number} fileSize - Size in bytes
     * @returns {number} Chunk size in bytes
     */
    static calculateChunkSize(fileSize) {
        // Aim for ~10-20 chunks per file
        const idealChunks = 15;
        const calculated = Math.ceil(fileSize / idealChunks);
        return Math.min(calculated, ValidationOrchestrator.MAX_CHUNK_SIZE);
    }

    /**
     * Add event listener
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            for (const callback of this.listeners.get(event)) {
                try {
                    callback(data);
                } catch (e) {
                    console.error('Event handler error:', e);
                }
            }
        }
    }

    /**
     * Initialize worker pool
     * @private
     */
    _initWorkerPool() {
        if (this.workerPool || !ValidationOrchestrator.isWorkerSupported()) {
            return;
        }

        try {
            this.workerPool = new WorkerPool({
                workerScript: 'assets/js/workers/validation.worker.js'
            });

            // Test worker with ping
            this.workerPool.submit('PING', {}).catch(() => {
                console.warn('Worker ping failed, disabling worker pool');
                this.workerPool.terminate();
                this.workerPool = null;
            });
        } catch (error) {
            console.warn('Failed to create worker pool, falling back to main thread:', error);
            this.workerPool = null;
        }
    }

    /**
     * Update and emit progress
     * @private
     */
    _updateProgress(fileId, fileProgress) {
        this.progress.files.set(fileId, fileProgress);

        // Calculate overall progress
        let totalProgress = 0;
        let fileCount = 0;

        for (const [id, fp] of this.progress.files) {
            totalProgress += fp.percent || 0;
            fileCount++;
        }

        this.progress.overall = fileCount > 0 ? totalProgress / fileCount : 0;

        this.emit('progress', {
            phase: this.progress.phase,
            overall: this.progress.overall,
            files: Object.fromEntries(this.progress.files)
        });
    }

    /**
     * Validate IFC files against IDS specifications
     * @param {Array} ifcFiles - Array of { name, content, size }
     * @param {Array} specifications - Parsed IDS specifications
     * @returns {Promise<Array>} Validation results
     */
    async validate(ifcFiles, specifications) {
        this.aborted = false;
        this.progress.phase = 'starting';
        this.progress.files.clear();

        this.emit('start', { fileCount: ifcFiles.length, specCount: specifications.length });

        // Check if we should use workers
        const useWorkers = typeof Worker !== 'undefined' && ifcFiles.some(
            f => f.size >= ValidationOrchestrator.LARGE_FILE_THRESHOLD
        );

        if (useWorkers) {
            this._initWorkerPool();
        }

        const results = [];

        try {
            // Process files - parallel for multiple small files, or sequential for large
            if (ifcFiles.length > 1 && !ifcFiles.some(f => f.size >= ValidationOrchestrator.LARGE_FILE_THRESHOLD)) {
                // Multiple small files - process in parallel
                this.progress.phase = 'validating';
                const promises = ifcFiles.map(file =>
                    this._validateFile(file, specifications)
                );
                const fileResults = await Promise.all(promises);
                results.push(...fileResults);
            } else {
                // Large file(s) or single file - process sequentially
                for (const file of ifcFiles) {
                    if (this.aborted) break;

                    this.progress.phase = 'validating';
                    const fileResult = await this._validateFile(file, specifications);
                    results.push(fileResult);
                }
            }
        } finally {
            this.progress.phase = 'complete';
            this.emit('complete', { results });
        }

        return results;
    }

    /**
     * Validate single file
     * @private
     */
    async _validateFile(file, specifications) {
        const fileId = file.name;

        this._updateProgress(fileId, {
            name: file.name,
            size: file.size,
            phase: 'parsing',
            percent: 0
        });

        // Parse IFC file
        const entities = await this._parseIFC(file);

        this._updateProgress(fileId, {
            name: file.name,
            size: file.size,
            phase: 'validating',
            percent: 30,
            entityCount: entities.length
        });

        // Validate against specifications
        const specResults = await this._validateAgainstSpecs(entities, specifications, fileId);

        this._updateProgress(fileId, {
            name: file.name,
            size: file.size,
            phase: 'complete',
            percent: 100,
            entityCount: entities.length
        });

        return {
            fileName: file.name,
            entityCount: entities.length,
            specificationResults: specResults
        };
    }

    /**
     * Parse IFC file
     * @private
     */
    async _parseIFC(file) {
        // Use the existing parseIFCFileAsync function
        if (typeof parseIFCFileAsync === 'function') {
            return await parseIFCFileAsync(file.content, file.name);
        }

        // Fallback - should not happen in production
        console.warn('parseIFCFileAsync not available');
        return [];
    }

    /**
     * Validate entities against specifications
     * @private
     */
    async _validateAgainstSpecs(entities, specifications, fileId) {
        const results = [];
        const totalSpecs = specifications.length;

        // If worker pool available and large dataset, use parallel validation
        if (this.workerPool && entities.length > 1000) {
            const specPromises = specifications.map((spec, index) => {
                return this.workerPool.submit('VALIDATE_SPEC', {
                    entities,
                    spec
                }).then(result => {
                    // Update progress
                    this._updateProgress(fileId, {
                        phase: 'validating',
                        percent: 30 + ((index + 1) / totalSpecs) * 70,
                        currentSpec: spec.name
                    });
                    return result;
                });
            });

            const specResults = await Promise.all(specPromises);
            results.push(...specResults.filter(r => r.entityResults.length > 0));
        } else {
            // Use main thread with ValidationEngine
            for (let i = 0; i < specifications.length; i++) {
                if (this.aborted) break;

                const spec = specifications[i];
                const result = ValidationEngine.validateBatch(entities, spec);

                if (result.entityResults.length > 0) {
                    results.push(result);
                }

                this._updateProgress(fileId, {
                    phase: 'validating',
                    percent: 30 + ((i + 1) / totalSpecs) * 70,
                    currentSpec: spec.name
                });

                // Yield to UI
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        return results;
    }

    /**
     * Abort current validation
     */
    abort() {
        this.aborted = true;

        if (this.workerPool) {
            this.workerPool.terminate();
            this.workerPool = null;
        }

        this.emit('abort', {});
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.abort();
        this.listeners.clear();
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.ValidationOrchestrator = ValidationOrchestrator;
}
