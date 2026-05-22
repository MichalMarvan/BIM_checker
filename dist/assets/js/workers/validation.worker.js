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
function handleValidateSpec(taskId, data) {
    const { entities, spec, chunkSize = 100, ifcSchema } = data;

    // Apply schema-aware gate — mirrors the 3-branch logic in validateBatch
    const SUPPORTED = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];
    const declared = Array.isArray(spec.ifcVersions)
        ? spec.ifcVersions
        : (spec.ifcVersion ? spec.ifcVersion.trim().split(/\s+/).filter(Boolean) : []);
    const supported = declared.filter(v => SUPPORTED.includes(v));
    const unsupported = declared.filter(v => !SUPPORTED.includes(v));

    // Branch 1: all-unsupported — FIRST, INDEPENDENT of schema match
    if (declared.length > 0 && supported.length === 0) {
        self.postMessage({ taskId, type: 'SPEC_RESULT', data: {
            specification: spec.name,
            status: 'error',
            errorMessage: `No supported IFC version in spec.ifcVersions (declared: ${declared.join(', ')}). Allowed: ${SUPPORTED.join(', ')}.`,
            passCount: 0,
            failCount: 0,
            entityResults: [],
            warnings: []
        }});
        return;
    }

    // Branch 2: spec doesn't apply to this schema — SECOND, INDEPENDENT
    if (declared.length > 0 && !declared.includes(ifcSchema)) {
        self.postMessage({ taskId, type: 'SPEC_RESULT', data: {
            specification: spec.name,
            status: 'skipped',
            skipReason: 'ifc-version-mismatch',
            ifcSchema,
            declaredVersions: declared,
            passCount: 0,
            failCount: 0,
            entityResults: [],
            warnings: []
        }});
        return;
    }

    // Branch 3: proceed — pick ifcVersion for hierarchy load
    const ifcVersion = (ifcSchema !== 'UNKNOWN' && supported.includes(ifcSchema))
        ? ifcSchema
        : (supported[0] || 'IFC4');

    const applicableEntities = ValidationEngine.filterByApplicability(
        entities,
        spec.applicability
    );

    const result = {
        specification: spec.name,
        status: 'pass',
        passCount: 0,
        failCount: 0,
        entityResults: [],
        warnings: unsupported.length > 0
            ? [`Unsupported ifcVersion entries ignored: ${unsupported.join(', ')}`]
            : []
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
