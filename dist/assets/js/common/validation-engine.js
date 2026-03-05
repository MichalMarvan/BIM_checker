/* ===========================================
   BIM CHECKER - VALIDATION ENGINE
   Shared validation logic for main thread and workers
   =========================================== */

const ValidationEngine = (function() {

    // Use RegexCache if available, otherwise create inline
    function getRegex(pattern) {
        if (typeof RegexCache !== 'undefined') {
            return RegexCache.get(pattern);
        }
        return new RegExp(pattern);
    }

    /**
     * Check if entity matches entity facet
     * @param {Object} entity
     * @param {Object} facet
     * @returns {boolean}
     */
    function checkEntityFacet(entity, facet) {
        if (!facet.name) {
            return true;
        }

        if (facet.name.type === 'simple') {
            return entity.entity === facet.name.value;
        } else if (facet.name.type === 'restriction' && facet.name.isRegex) {
            const regex = getRegex(facet.name.pattern);
            return regex.test(entity.entity);
        }

        return true;
    }

    /**
     * Check if entity matches property facet
     * @param {Object} entity
     * @param {Object} facet
     * @param {boolean} isApplicability
     * @returns {boolean|Object}
     */
    function checkPropertyFacet(entity, facet, isApplicability) {
        const validation = {
            type: 'property',
            status: 'fail',
            message: '',
            details: ''
        };

        const psetName = facet.propertySet?.value || (facet.propertySet?.type === 'simple' && facet.propertySet.value);
        const propName = facet.name?.value || (facet.name?.type === 'simple' && facet.name.value);

        if (!psetName || !propName) {
            validation.message = 'Incomplete specification';
            return isApplicability ? false : validation;
        }

        validation.message = `${psetName}.${propName}`;

        const pset = entity.propertySets[psetName];
        if (!pset) {
            validation.details = `Property set "${psetName}" not found`;
            return isApplicability ? false : validation;
        }

        const propValue = pset[propName];
        if (propValue === undefined) {
            validation.details = `Property "${propName}" not found in "${psetName}"`;
            return isApplicability ? false : validation;
        }

        // Check value if specified
        if (facet.value) {
            if (facet.value.type === 'simple') {
                if (String(propValue) !== String(facet.value.value)) {
                    validation.details = `Expected "${facet.value.value}", got "${propValue}"`;
                    return isApplicability ? false : validation;
                }
            } else if (facet.value.type === 'restriction') {
                if (facet.value.options) {
                    if (!facet.value.options.includes(String(propValue))) {
                        validation.details = `Value "${propValue}" not in allowed options`;
                        return isApplicability ? false : validation;
                    }
                } else if (facet.value.isRegex) {
                    const regex = getRegex(facet.value.pattern);
                    if (!regex.test(String(propValue))) {
                        validation.details = `Value "${propValue}" doesn't match pattern`;
                        return isApplicability ? false : validation;
                    }
                }
            }
        }

        validation.status = 'pass';
        validation.details = `Value: "${propValue}"`;
        return isApplicability ? true : validation;
    }

    /**
     * Check if entity matches attribute facet
     * @param {Object} entity
     * @param {Object} facet
     * @param {boolean} isApplicability
     * @returns {boolean|Object}
     */
    function checkAttributeFacet(entity, facet, isApplicability) {
        const validation = {
            type: 'attribute',
            status: 'fail',
            message: '',
            details: ''
        };

        const attrName = facet.name?.value || (facet.name?.type === 'simple' && facet.name.value);
        if (!attrName) {
            validation.message = 'Incomplete specification';
            return isApplicability ? false : validation;
        }

        validation.message = `Attribute: ${attrName}`;

        const attrValue = entity.attributes[attrName];
        if (attrValue === undefined) {
            validation.details = `Attribute "${attrName}" not found`;
            return isApplicability ? false : validation;
        }

        // Check value if specified
        if (facet.value) {
            if (facet.value.type === 'simple') {
                if (String(attrValue) !== String(facet.value.value)) {
                    validation.details = `Expected "${facet.value.value}", got "${attrValue}"`;
                    return isApplicability ? false : validation;
                }
            } else if (facet.value.type === 'restriction' && facet.value.isRegex) {
                const regex = getRegex(facet.value.pattern);
                if (!regex.test(String(attrValue))) {
                    validation.details = `Value "${attrValue}" doesn't match pattern`;
                    return isApplicability ? false : validation;
                }
            }
        }

        validation.status = 'pass';
        validation.details = `Value: "${attrValue}"`;
        return isApplicability ? true : validation;
    }

    /**
     * Check if entity matches a facet (applicability)
     * @param {Object} entity
     * @param {Object} facet
     * @returns {boolean}
     */
    function checkFacetMatch(entity, facet) {
        if (facet.type === 'entity') {
            return checkEntityFacet(entity, facet);
        } else if (facet.type === 'property') {
            return checkPropertyFacet(entity, facet, true);
        } else if (facet.type === 'attribute') {
            return checkAttributeFacet(entity, facet, true);
        }
        return true;
    }

    /**
     * Filter entities by applicability
     * @param {Array} entities
     * @param {Array} applicability
     * @returns {Array}
     */
    function filterByApplicability(entities, applicability) {
        if (!applicability || applicability.length === 0) {
            return entities;
        }

        return entities.filter(entity => {
            for (const facet of applicability) {
                if (!checkFacetMatch(entity, facet)) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Validate entity against requirements
     * @param {Object} entity
     * @param {Array} requirements
     * @param {string} specName
     * @returns {Object}
     */
    function validateEntity(entity, requirements, specName) {
        const result = {
            entity: entity.entity,
            name: entity.name,
            guid: entity.guid,
            fileName: entity.fileName,
            specification: specName,
            status: 'pass',
            validations: []
        };

        for (const facet of requirements) {
            let validation;

            if (facet.type === 'property') {
                validation = checkPropertyFacet(entity, facet, false);
            } else if (facet.type === 'attribute') {
                validation = checkAttributeFacet(entity, facet, false);
            } else {
                validation = { type: facet.type, status: 'pass', message: '', details: '' };
            }

            result.validations.push(validation);

            if (validation.status === 'fail') {
                result.status = 'fail';
            }
        }

        return result;
    }

    /**
     * Validate a batch of entities against a specification
     * @param {Array} entities
     * @param {Object} spec
     * @returns {Object}
     */
    function validateBatch(entities, spec) {
        const result = {
            specification: spec.name,
            status: 'pass',
            passCount: 0,
            failCount: 0,
            entityResults: []
        };

        const applicableEntities = filterByApplicability(entities, spec.applicability);

        for (const entity of applicableEntities) {
            const entityResult = validateEntity(entity, spec.requirements || [], spec.name);
            result.entityResults.push(entityResult);

            if (entityResult.status === 'pass') {
                result.passCount++;
            } else {
                result.failCount++;
                result.status = 'fail';
            }
        }

        return result;
    }

    return {
        checkEntityFacet,
        checkPropertyFacet,
        checkAttributeFacet,
        checkFacetMatch,
        filterByApplicability,
        validateEntity,
        validateBatch
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.ValidationEngine = ValidationEngine;
}

// Export for worker
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.ValidationEngine = ValidationEngine;
}
