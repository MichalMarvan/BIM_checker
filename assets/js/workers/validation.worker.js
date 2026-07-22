/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/* ===========================================
   BIM CHECKER - VALIDATION WORKER
   Background validation processing
   =========================================== */

// Import shared modules
if (typeof importScripts === 'function') {
    importScripts('../common/regex-cache.js');
    importScripts('../common/validation-engine.js');
}

// Message handler
self.onmessage = function(e) {
    const { taskId, type, data } = e.data;

    const dispatch = async () => {
        switch (type) {
            case 'VALIDATE_BATCH':
                await handleValidateBatch(taskId, data);
                break;

            case 'VALIDATE_SPEC':
                await handleValidateSpec(taskId, data);
                break;

            case 'PING':
                self.postMessage({ taskId, type: 'PONG', data: true });
                break;

            default:
                self.postMessage({
                    taskId,
                    type: 'ERROR',
                    error: `Unknown task type: ${type}`
                });
        }
    };

    dispatch().catch(error => {
        self.postMessage({
            taskId,
            type: 'ERROR',
            error: error.message
        });
    });
};

/**
 * Validate a batch of entities against a specification
 */
async function handleValidateBatch(taskId, data) {
    const { entities, spec, startIndex = 0, ifcSchema } = data;

    const result = await ValidationEngine.validateBatch(entities, spec, { ifcSchema });

    // Add index offset for progress tracking
    result.startIndex = startIndex;
    result.processedCount = entities.length;

    self.postMessage({
        taskId,
        type: 'BATCH_RESULT',
        data: result
    });
}

/**
 * Validate entities against a single specification
 * Reports progress during validation
 */
async function handleValidateSpec(taskId, data) {
    const { entities, spec, ifcSchema } = data;
    const result = await ValidationEngine.validateBatch(entities, spec, { ifcSchema });

    self.postMessage({
        taskId,
        type: 'SPEC_RESULT',
        data: result
    });
}

// Signal ready
self.postMessage({ type: 'READY' });
