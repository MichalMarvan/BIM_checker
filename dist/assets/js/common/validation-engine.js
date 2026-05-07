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
     * @param {Object} [ctx] - optional context with isSubtypeOf, getPredefinedTypeIndex, etc.
     * @returns {boolean}
     */
    function checkEntityFacet(entity, facet, ctx) {
        if (!facet.name) {
            return true;
        }

        // Regex pattern: explicit match only, no inheritance
        if (facet.name.type === 'restriction' && facet.name.isRegex) {
            return new RegExp(facet.name.pattern).test(entity.entity);
        }

        // Collect target classes (simple → [value], enumeration → values)
        let targets = null;
        if (facet.name.type === 'simple') targets = [facet.name.value];
        else if (facet.name.type === 'enumeration' && Array.isArray(facet.name.values)) targets = facet.name.values;
        if (!targets) return false;

        // Match by exact or subtype-of
        let nameMatch = false;
        for (const target of targets) {
            if (ctx && ctx.isSubtypeOf && ctx.isSubtypeOf(entity.entity, target)) { nameMatch = true; break; }
            if (entity.entity === target) { nameMatch = true; break; }
        }
        if (!nameMatch) return false;

        // PredefinedType check
        if (facet.predefinedType) return checkPredefinedType(entity, facet.predefinedType, ctx);
        return true;
    }

    /**
     * Check predefinedType attribute of entity against facet predefinedType
     * @param {Object} entity
     * @param {Object} facetPredef
     * @param {Object} [ctx]
     * @returns {boolean}
     */
    function checkPredefinedType(entity, facetPredef, ctx) {
        if (!ctx || !ctx.getPredefinedTypeIndex) return true; // no ctx → skip
        const idx = ctx.getPredefinedTypeIndex(entity.entity);
        if (idx === null) return false;
        if (!entity.params) return false;

        const params = ctx.splitParams(entity.params);
        let actual = ctx.unwrapEnumValue(params[idx]);

        if (actual === 'USERDEFINED') {
            const objIdx = ctx.getObjectTypeIndex(entity.entity);
            if (objIdx !== null) {
                actual = ctx.unwrapString(params[objIdx]);
            }
        }
        if (actual === null) return false;

        if (facetPredef.type === 'simple') return actual === facetPredef.value;
        if (facetPredef.type === 'enumeration' && Array.isArray(facetPredef.values)) {
            return facetPredef.values.includes(actual);
        }
        if (facetPredef.type === 'restriction' && facetPredef.isRegex) {
            return new RegExp(facetPredef.pattern).test(actual);
        }
        return false;
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
        const propName = facet.baseName?.value || (facet.baseName?.type === 'simple' && facet.baseName.value)
            || facet.name?.value || (facet.name?.type === 'simple' && facet.name.value);

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
            } else if (facet.value.type === 'enumeration' && Array.isArray(facet.value.values)) {
                if (!facet.value.values.includes(String(propValue))) {
                    validation.details = `Value "${propValue}" not in allowed options`;
                    return isApplicability ? false : validation;
                }
            } else if (facet.value.type === 'restriction' && facet.value.isRegex) {
                const regex = getRegex(facet.value.pattern);
                if (!regex.test(String(propValue))) {
                    validation.details = `Value "${propValue}" doesn't match pattern`;
                    return isApplicability ? false : validation;
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
            } else if (facet.value.type === 'enumeration' && Array.isArray(facet.value.values)) {
                if (!facet.value.values.includes(String(attrValue))) {
                    validation.details = `Value "${attrValue}" not in allowed options`;
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
     * @param {Object} [ctx]
     * @returns {boolean}
     */
    function checkFacetMatch(entity, facet, ctx) {
        if (facet.type === 'entity') {
            return checkEntityFacet(entity, facet, ctx);
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
     * @param {Object} [ctx]
     * @returns {Array}
     */
    function filterByApplicability(entities, applicability, ctx) {
        if (!applicability || applicability.length === 0) {
            return entities;
        }

        return entities.filter(entity => {
            for (const facet of applicability) {
                if (!checkFacetMatch(entity, facet, ctx)) {
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
     * @returns {Promise<Object>}
     */
    async function validateBatch(entities, spec) {
        const ifcVersion = spec.ifcVersion || 'IFC4';
        if (typeof window !== 'undefined' && window.IFCHierarchy) {
            await window.IFCHierarchy.load(ifcVersion);
        }
        const ctx = (typeof window !== 'undefined' && window.IFCHierarchy && window.IfcParams) ? {
            ifcVersion,
            isSubtypeOf: (c, a) => window.IFCHierarchy.isSubtypeOf(ifcVersion, c, a),
            getPredefinedTypeIndex: (cls) => window.IFCHierarchy.getPredefinedTypeIndex(ifcVersion, cls),
            getObjectTypeIndex: (cls) => window.IFCHierarchy.getObjectTypeIndex(ifcVersion, cls),
            splitParams: window.IfcParams.splitIfcParams,
            unwrapEnumValue: window.IfcParams.unwrapEnumValue,
            unwrapString: window.IfcParams.unwrapString
        } : null;

        const result = {
            specification: spec.name,
            status: 'pass',
            passCount: 0,
            failCount: 0,
            entityResults: []
        };

        const applicableEntities = filterByApplicability(entities, spec.applicability, ctx);

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
        checkPredefinedType,
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
