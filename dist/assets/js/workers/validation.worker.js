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

    try {
        switch (type) {
            case 'VALIDATE_BATCH':
                handleValidateBatch(taskId, data);
                break;

            case 'VALIDATE_SPEC':
                handleValidateSpec(taskId, data);
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
    } catch (error) {
        self.postMessage({
            taskId,
            type: 'ERROR',
            error: error.message
        });
    }
};

/**
 * Validate a batch of entities against a specification
 */
function handleValidateBatch(taskId, data) {
    const { entities, spec, startIndex = 0 } = data;

    const result = ValidationEngine.validateBatch(entities, spec);

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
function handleValidateSpec(taskId, data) {
    const { entities, spec, chunkSize = 100 } = data;

    const applicableEntities = ValidationEngine.filterByApplicability(
        entities,
        spec.applicability
    );

    const result = {
        specification: spec.name,
        status: 'pass',
        passCount: 0,
        failCount: 0,
        entityResults: []
    };

    // Process in chunks and report progress
    for (let i = 0; i < applicableEntities.length; i += chunkSize) {
        const chunk = applicableEntities.slice(i, i + chunkSize);

        for (const entity of chunk) {
            const entityResult = ValidationEngine.validateEntity(
                entity,
                spec.requirements || [],
                spec.name
            );
            result.entityResults.push(entityResult);

            if (entityResult.status === 'pass') {
                result.passCount++;
            } else {
                result.failCount++;
                result.status = 'fail';
            }
        }

        // Report progress
        self.postMessage({
            taskId,
            type: 'PROGRESS',
            data: {
                processed: Math.min(i + chunkSize, applicableEntities.length),
                total: applicableEntities.length,
                specification: spec.name
            }
        });
    }

    self.postMessage({
        taskId,
        type: 'SPEC_RESULT',
        data: result
    });
}

// Signal ready
self.postMessage({ type: 'READY' });
