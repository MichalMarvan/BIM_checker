/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/* Shared IDS 1.0 semantic validation for the main thread and workers. */
const ValidationEngine = (function() {
    'use strict';

    const SUPPORTED_IFC = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];
    const FLOAT_TOLERANCE = 1e-6;

    // IDS 1.0 special occurrence/type mapping for IFC2X3.
    const IFC2X3_OCCURRENCE_TYPES = {
        IFCFURNITURE: ['IFCFURNISHINGELEMENT', 'IFCFURNITURETYPE'],
        IFCSYSTEMFURNITUREELEMENT: ['IFCFURNISHINGELEMENT', 'IFCSYSTEMFURNITUREELEMENTTYPE'],
        IFCACTUATOR: ['IFCDISTRIBUTIONCONTROLELEMENT', 'IFCACTUATORTYPE'],
        IFCALARM: ['IFCDISTRIBUTIONCONTROLELEMENT', 'IFCALARMTYPE'],
        IFCCONTROLLER: ['IFCDISTRIBUTIONCONTROLELEMENT', 'IFCCONTROLLERTYPE'],
        IFCFLOWINSTRUMENT: ['IFCDISTRIBUTIONCONTROLELEMENT', 'IFCFLOWINSTRUMENTTYPE'],
        IFCSENSOR: ['IFCDISTRIBUTIONCONTROLELEMENT', 'IFCSENSORTYPE'],
        IFCAIRTOAIRHEATRECOVERY: ['IFCENERGYCONVERSIONDEVICE', 'IFCAIRTOAIRHEATRECOVERYTYPE'],
        IFCBOILER: ['IFCENERGYCONVERSIONDEVICE', 'IFCBOILERTYPE'],
        IFCCHILLER: ['IFCENERGYCONVERSIONDEVICE', 'IFCCHILLERTYPE'],
        IFCCOIL: ['IFCENERGYCONVERSIONDEVICE', 'IFCCOILTYPE'],
        IFCCONDENSER: ['IFCENERGYCONVERSIONDEVICE', 'IFCCONDENSERTYPE'],
        IFCCOOLEDBEAM: ['IFCENERGYCONVERSIONDEVICE', 'IFCCOOLEDBEAMTYPE'],
        IFCCOOLINGTOWER: ['IFCENERGYCONVERSIONDEVICE', 'IFCCOOLINGTOWERTYPE'],
        IFCELECTRICGENERATOR: ['IFCENERGYCONVERSIONDEVICE', 'IFCELECTRICGENERATORTYPE'],
        IFCELECTRICMOTOR: ['IFCENERGYCONVERSIONDEVICE', 'IFCELECTRICMOTORTYPE'],
        IFCEVAPORATIVECOOLER: ['IFCENERGYCONVERSIONDEVICE', 'IFCEVAPORATIVECOOLERTYPE'],
        IFCEVAPORATOR: ['IFCENERGYCONVERSIONDEVICE', 'IFCEVAPORATORTYPE'],
        IFCHEATEXCHANGER: ['IFCENERGYCONVERSIONDEVICE', 'IFCHEATEXCHANGERTYPE'],
        IFCHUMIDIFIER: ['IFCENERGYCONVERSIONDEVICE', 'IFCHUMIDIFIERTYPE'],
        IFCMOTORCONNECTION: ['IFCENERGYCONVERSIONDEVICE', 'IFCMOTORCONNECTIONTYPE'],
        IFCTRANSFORMER: ['IFCENERGYCONVERSIONDEVICE', 'IFCTRANSFORMERTYPE'],
        IFCTUBEBUNDLE: ['IFCENERGYCONVERSIONDEVICE', 'IFCTUBEBUNDLETYPE'],
        IFCUNITARYEQUIPMENT: ['IFCENERGYCONVERSIONDEVICE', 'IFCUNITARYEQUIPMENTTYPE'],
        IFCAIRTERMINALBOX: ['IFCFLOWCONTROLLER', 'IFCAIRTERMINALBOXTYPE'],
        IFCDAMPER: ['IFCFLOWCONTROLLER', 'IFCDAMPERTYPE'],
        IFCELECTRICTIMECONTROL: ['IFCFLOWCONTROLLER', 'IFCELECTRICTIMECONTROLTYPE'],
        IFCFLOWMETER: ['IFCFLOWCONTROLLER', 'IFCFLOWMETERTYPE'],
        IFCPROTECTIVEDEVICE: ['IFCFLOWCONTROLLER', 'IFCPROTECTIVEDEVICETYPE'],
        IFCSWITCHINGDEVICE: ['IFCFLOWCONTROLLER', 'IFCSWITCHINGDEVICETYPE'],
        IFCVALVE: ['IFCFLOWCONTROLLER', 'IFCVALVETYPE'],
        IFCCABLECARRIERFITTING: ['IFCFLOWFITTING', 'IFCCABLECARRIERFITTINGTYPE'],
        IFCDUCTFITTING: ['IFCFLOWFITTING', 'IFCDUCTFITTINGTYPE'],
        IFCJUNCTIONBOX: ['IFCFLOWFITTING', 'IFCJUNCTIONBOXTYPE'],
        IFCPIPEFITTING: ['IFCFLOWFITTING', 'IFCPIPEFITTINGTYPE'],
        IFCCOMPRESSOR: ['IFCFLOWMOVINGDEVICE', 'IFCCOMPRESSORTYPE'],
        IFCFAN: ['IFCFLOWMOVINGDEVICE', 'IFCFANTYPE'],
        IFCPUMP: ['IFCFLOWMOVINGDEVICE', 'IFCPUMPTYPE'],
        IFCCABLECARRIERSEGMENT: ['IFCFLOWSEGMENT', 'IFCCABLECARRIERSEGMENTTYPE'],
        IFCCABLESEGMENT: ['IFCFLOWSEGMENT', 'IFCCABLESEGMENTTYPE'],
        IFCDUCTSEGMENT: ['IFCFLOWSEGMENT', 'IFCDUCTSEGMENTTYPE'],
        IFCPIPESEGMENT: ['IFCFLOWSEGMENT', 'IFCPIPESEGMENTTYPE'],
        IFCELECTRICFLOWSTORAGEDEVICE: ['IFCFLOWSTORAGEDEVICE', 'IFCELECTRICFLOWSTORAGEDEVICETYPE'],
        IFCTANK: ['IFCFLOWSTORAGEDEVICE', 'IFCTANKTYPE'],
        IFCAIRTERMINAL: ['IFCFLOWTERMINAL', 'IFCAIRTERMINALTYPE'],
        IFCELECTRICAPPLIANCE: ['IFCFLOWTERMINAL', 'IFCELECTRICAPPLIANCETYPE'],
        IFCFIRESUPPRESSIONTERMINAL: ['IFCFLOWTERMINAL', 'IFCFIRESUPPRESSIONTERMINALTYPE'],
        IFCLAMP: ['IFCFLOWTERMINAL', 'IFCLAMPTYPE'],
        IFCLIGHTFIXTURE: ['IFCFLOWTERMINAL', 'IFCLIGHTFIXTURETYPE'],
        IFCOUTLET: ['IFCFLOWTERMINAL', 'IFCOUTLETTYPE'],
        IFCSANITARYTERMINAL: ['IFCFLOWTERMINAL', 'IFCSANITARYTERMINALTYPE'],
        IFCSPACEHEATER: ['IFCFLOWTERMINAL', 'IFCSPACEHEATERTYPE'],
        IFCSTACKTERMINAL: ['IFCFLOWTERMINAL', 'IFCSTACKTERMINALTYPE'],
        IFCWASTETERMINAL: ['IFCFLOWTERMINAL', 'IFCWASTETERMINALTYPE'],
        IFCDUCTSILENCER: ['IFCFLOWTREATMENTDEVICE', 'IFCDUCTSILENCERTYPE'],
        IFCFILTER: ['IFCFLOWTREATMENTDEVICE', 'IFCFILTERTYPE'],
        IFCVIBRATIONISOLATOR: ['IFCELEMENTCOMPONENT', 'IFCVIBRATIONISOLATORTYPE']
    };

    function getRegex(pattern) {
        try {
            const anchored = `^(?:${pattern})$`;
            if (typeof RegexCache !== 'undefined') return RegexCache.get(anchored);
            return new RegExp(anchored);
        } catch {
            return null;
        }
    }

    function splitParams(value) {
        if (typeof IfcParams !== 'undefined') return IfcParams.splitIfcParams(value);
        if (typeof IFCParserCore !== 'undefined' && IFCParserCore._splitParams) return IFCParserCore._splitParams(value);
        return String(value || '').split(',');
    }

    function unwrapString(raw) {
        if (typeof IfcParams !== 'undefined') return IfcParams.unwrapString(raw);
        const match = String(raw || '').trim().match(/^'(.*)'$/s);
        if (!match) return null;
        const value = match[1].replace(/''/g, "'");
        return typeof IFCParserCore !== 'undefined' && IFCParserCore._decodeIFCString
            ? IFCParserCore._decodeIFCString(value)
            : value;
    }

    function unwrapEnum(raw) {
        if (typeof IfcParams !== 'undefined') return IfcParams.unwrapEnumValue(raw);
        const match = String(raw || '').trim().match(/^\.(.+)\.$/);
        return match ? match[1] : null;
    }

    function isNullish(value) {
        return value === null || value === undefined;
    }

    function isEmptyValue(value) {
        return isNullish(value) || value === '' || (Array.isArray(value) && value.length === 0);
    }

    function numericTolerance(value) {
        const numeric = Math.abs(Number(value) || 0);
        return FLOAT_TOLERANCE * (1 + numeric) + Number.EPSILON * Math.max(1, numeric) * 10;
    }

    function isIntegerType(dataType, base) {
        return String(dataType || '').toUpperCase().includes('INTEGER')
            || /(?:^|:)integer$|nonNegativeInteger|positiveInteger|negativeInteger/i.test(String(base || ''));
    }

    function isNumericType(dataType, base, actual) {
        if (typeof actual === 'number') return true;
        const type = String(dataType || '').toUpperCase();
        if (type === 'IFCREAL' || type === 'IFCNUMBER' || type.includes('MEASURE') || type.includes('INTEGER')) return true;
        return /(?:decimal|double|float|integer)/i.test(String(base || ''));
    }

    function coerceExpected(raw, actual, dataType, base) {
        const text = String(raw ?? '');
        if (typeof actual === 'boolean' || String(dataType || '').toUpperCase() === 'IFCBOOLEAN') {
            if (text === 'true') return { valid: true, value: true };
            if (text === 'false') return { valid: true, value: false };
            return { valid: false, value: null };
        }
        if (isNumericType(dataType, base, actual)) {
            const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
            if (!numericPattern.test(text)) return { valid: false, value: null };
            const value = Number(text);
            if (!Number.isFinite(value)) return { valid: false, value: null };
            if (isIntegerType(dataType, base) && !/^[+-]?\d+$/.test(text)) return { valid: false, value: null };
            return { valid: true, value };
        }
        return { valid: true, value: text };
    }

    function equalValues(actual, expectedRaw, dataType, base) {
        const expected = coerceExpected(expectedRaw, actual, dataType, base);
        if (!expected.valid) return false;
        if (typeof actual === 'number' && typeof expected.value === 'number') {
            return Math.abs(actual - expected.value) <= numericTolerance(expected.value);
        }
        return actual === expected.value;
    }

    function restrictionFacets(constraint) {
        if (Array.isArray(constraint?.facets) && constraint.facets.length) return constraint.facets;
        const facets = [];
        for (const type of ['pattern', 'enumeration', 'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive', 'length', 'minLength', 'maxLength', 'totalDigits', 'fractionDigits', 'whiteSpace']) {
            const values = type === 'pattern' ? constraint?.patterns : (type === 'enumeration' ? constraint?.values : null);
            if (Array.isArray(values)) values.forEach(value => facets.push({ type, value }));
            else if (constraint?.[type] !== undefined) facets.push({ type, value: constraint[type] });
        }
        return facets;
    }

    function matchRestriction(actual, constraint, dataType) {
        if (isEmptyValue(actual)) return false;
        const facets = restrictionFacets(constraint);
        const base = constraint.base || 'xs:string';
        const enumerations = facets.filter(facet => facet.type === 'enumeration');
        if (enumerations.length && !enumerations.some(facet => equalValues(actual, facet.value, dataType, base))) return false;
        const patterns = facets.filter(facet => facet.type === 'pattern');
        if (patterns.length) {
            if (typeof actual !== 'string') return false;
            if (!patterns.some(facet => {
                const regex = getRegex(facet.value);
                return regex ? regex.test(actual) : false;
            })) return false;
        }

        for (const facet of facets) {
            if (facet.type === 'enumeration' || facet.type === 'pattern' || facet.type === 'whiteSpace') continue;
            if (['length', 'minLength', 'maxLength'].includes(facet.type)) {
                if (typeof actual !== 'string') return false;
                const length = Array.from(actual).length;
                const expected = Number(facet.value);
                if (facet.type === 'length' && length !== expected) return false;
                if (facet.type === 'minLength' && length < expected) return false;
                if (facet.type === 'maxLength' && length > expected) return false;
                continue;
            }
            if (facet.type === 'totalDigits' || facet.type === 'fractionDigits') {
                if (typeof actual !== 'number') return false;
                const normalized = Math.abs(actual).toString().replace(/[eE].*$/, '');
                const pieces = normalized.split('.');
                const total = pieces.join('').replace(/^0+/, '').length || 1;
                const fraction = (pieces[1] || '').replace(/0+$/, '').length;
                if (facet.type === 'totalDigits' && total > Number(facet.value)) return false;
                if (facet.type === 'fractionDigits' && fraction > Number(facet.value)) return false;
                continue;
            }
            if (['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'].includes(facet.type)) {
                if (typeof actual !== 'number') return false;
                const expected = coerceExpected(facet.value, actual, dataType, base);
                if (!expected.valid || typeof expected.value !== 'number') return false;
                if (facet.type === 'minInclusive' && actual < expected.value) return false;
                if (facet.type === 'maxInclusive' && actual > expected.value) return false;
                if (facet.type === 'minExclusive' && actual <= expected.value) return false;
                if (facet.type === 'maxExclusive' && actual >= expected.value) return false;
            }
        }
        return true;
    }

    function matchValue(actualInput, constraint, dataType) {
        if (!constraint) return !isEmptyValue(actualInput?.value !== undefined ? actualInput.value : actualInput);
        const actual = actualInput && typeof actualInput === 'object' && Object.prototype.hasOwnProperty.call(actualInput, 'value')
            ? actualInput.value
            : actualInput;
        const actualType = actualInput?.dataType || dataType || null;
        if (isEmptyValue(actual)) return false;
        if (constraint.type === 'simple' || constraint.type === 'simpleValue') {
            return equalValues(actual, constraint.value, actualType, null);
        }
        if (constraint.type === 'enumeration') {
            return (constraint.values || []).some(value => equalValues(actual, value, actualType, constraint.base));
        }
        if (constraint.type === 'restriction') return matchRestriction(actual, constraint, actualType);
        return false;
    }

    function cardinalityResult(requiredPass, present, cardinality) {
        const mode = String(cardinality || 'required').toLowerCase();
        if (mode === 'optional') return !present || requiredPass;
        if (mode === 'prohibited') return !requiredPass;
        return requiredPass;
    }

    function entityClassMatches(entity, target, ctx) {
        if (entity.entity === target) return true;
        if (ctx?.ifcVersion !== 'IFC2X3') return false;
        const mapping = IFC2X3_OCCURRENCE_TYPES[target];
        return Boolean(mapping
            && entity.entity === mapping[0]
            && entity.typeEntity?.entity === mapping[1]);
    }

    function entityNameMatches(entity, constraint, ctx) {
        if (!constraint) return true;
        if (constraint.type === 'simple' || constraint.type === 'simpleValue') {
            return entityClassMatches(entity, String(constraint.value || ''), ctx);
        }
        if (constraint.type === 'enumeration') {
            return (constraint.values || []).some(value => entityClassMatches(entity, String(value), ctx));
        }
        if (constraint.type === 'restriction') return matchValue(entity.entity, constraint, 'IFCLABEL');
        return false;
    }

    function customPredefinedType(entity, ctx, params) {
        const candidates = ['ObjectType', 'ElementType', 'ProcessType', 'UserDefinedType'];
        for (const name of candidates) {
            const index = ctx?.getAttributeIndex ? ctx.getAttributeIndex(entity.entity, name) : null;
            if (index !== null && index !== undefined) {
                const value = unwrapString(params[index]);
                if (value !== null) return value;
            }
        }
        const fallback = ctx?.getObjectTypeIndex ? ctx.getObjectTypeIndex(entity.entity) : null;
        return fallback !== null && fallback !== undefined ? unwrapString(params[fallback]) : null;
    }

    function actualPredefinedTypes(entity, ctx) {
        if (!entity) return [];
        if (entity.attributes?.PredefinedType) return [entity.attributes.PredefinedType];
        const index = ctx?.getPredefinedTypeIndex ? ctx.getPredefinedTypeIndex(entity.entity) : null;
        if (index === null || index === undefined || !entity.params) return [];
        const params = ctx?.splitParams ? ctx.splitParams(entity.params) : splitParams(entity.params);
        const value = ctx?.unwrapEnumValue ? ctx.unwrapEnumValue(params[index]) : unwrapEnum(params[index]);
        if ((!value || value === 'NOTDEFINED') && entity.typeEntity) return actualPredefinedTypes(entity.typeEntity, ctx);
        if (value === 'USERDEFINED') {
            return Array.from(new Set(['USERDEFINED', customPredefinedType(entity, ctx, params)].filter(Boolean)));
        }
        return value ? [value] : [];
    }

    function checkPredefinedType(entity, facetPredefinedType, ctx) {
        return actualPredefinedTypes(entity, ctx)
            .some(actual => matchValue(actual, facetPredefinedType, 'IFCLABEL'));
    }

    function checkEntityFacet(entity, facet, ctx) {
        if (!entityNameMatches(entity, facet.name, ctx)) return false;
        return facet.predefinedType ? checkPredefinedType(entity, facet.predefinedType, ctx) : true;
    }

    function rawTypedValue(raw, dataType) {
        const text = String(raw || '').trim();
        if (!text || text === '$' || text === '*') return { value: null, dataType, kind: text === '*' ? 'derived' : 'null' };
        if (/^#\d+$/.test(text)) return { value: text, dataType, kind: 'reference' };
        if (text.startsWith('(') && text.endsWith(')')) {
            return { value: text.slice(1, -1).trim() ? text : [], dataType, kind: 'list' };
        }
        const wrapped = text.match(/^([A-Z][A-Z0-9_]*)\(([\s\S]*)\)$/i);
        if (wrapped) return rawTypedValue(wrapped[2], wrapped[1].toUpperCase());
        const stringValue = unwrapString(text);
        if (stringValue !== null) return { value: stringValue, dataType, kind: 'string' };
        if (text === '.T.') return { value: true, dataType: dataType || 'IFCBOOLEAN', kind: 'boolean' };
        if (text === '.F.') return { value: false, dataType: dataType || 'IFCBOOLEAN', kind: 'boolean' };
        if (text === '.U.') return { value: null, dataType: dataType || 'IFCLOGICAL', kind: 'null' };
        const enumValue = unwrapEnum(text);
        if (enumValue !== null) return { value: enumValue, dataType, kind: 'string' };
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
            return { value: Number(text), dataType, kind: 'number' };
        }
        return { value: text, dataType, kind: 'object' };
    }

    function expandedProperties(entity, ctx) {
        const properties = Array.isArray(entity.properties) ? entity.properties.slice() : [];
        if (!properties.length && entity.propertySets) {
            for (const [setName, set] of Object.entries(entity.propertySets)) {
                for (const [name, value] of Object.entries(set || {})) {
                    properties.push({ setName, name, values: [{ value, dataType: null, kind: typeof value }], dataType: null, supported: true });
                }
            }
        }
        for (const definition of entity.predefinedPropertySets || []) {
            const attributes = ctx?.getAttributes ? ctx.getAttributes(definition.type) : [];
            if (!attributes.length) continue;
            const params = ctx?.splitParams ? ctx.splitParams(definition.params) : splitParams(definition.params);
            for (let index = 4; index < Math.min(attributes.length, params.length); index++) {
                const dataType = ctx?.getAttributeType ? ctx.getAttributeType(definition.type, attributes[index]) : null;
                const value = rawTypedValue(params[index], dataType);
                if (value.kind === 'null' || value.kind === 'derived') continue;
                properties.push({
                    setName: definition.name,
                    name: attributes[index],
                    values: [value],
                    dataType,
                    propertyType: definition.type,
                    supported: value.kind !== 'reference' && value.kind !== 'object' && value.kind !== 'list'
                });
            }
        }
        return properties;
    }

    function propertyRequiredPass(entity, facet, ctx) {
        const properties = expandedProperties(entity, ctx);
        const setNames = Array.from(new Set(properties.map(property => property.setName)
            .concat(Object.keys(entity.propertySets || {}))));
        const matchingSetNames = setNames.filter(setName => matchValue(setName, facet.propertySet, 'IFCLABEL'));
        const matching = properties.filter(property => (
            matchingSetNames.includes(property.setName)
            && matchValue(property.name, facet.baseName || facet.name, 'IFCLABEL')
        ));
        const present = matching.length > 0;
        const matchingBySet = new Map(matchingSetNames.map(setName => [
            setName,
            matching.filter(property => property.setName === setName)
        ]));
        const pass = matchingSetNames.length > 0 && Array.from(matchingBySet.values()).every(setProperties => (
            setProperties.length > 0 && setProperties.every(property => {
                if (property.supported === false) return false;
                let values = (property.values || []).filter(value => !isEmptyValue(value?.value));
                if (!values.length) return false;
                if (facet.dataType) {
                    values = values.filter(value => (
                        String(value.dataType || property.dataType || '').toUpperCase() === String(facet.dataType).toUpperCase()
                    ));
                    if (!values.length) return false;
                }
                if (!facet.value) return true;
                return values.some(value => matchValue(value, facet.value, facet.dataType || value.dataType));
            })
        ));
        return { pass, present, matching };
    }

    function validationResult(type, pass, message, details) {
        return { type, status: pass ? 'pass' : 'fail', message: message || '', details: details || '' };
    }

    function checkPropertyFacet(entity, facet, isApplicability, ctx) {
        const evaluated = propertyRequiredPass(entity, facet, ctx);
        const pass = isApplicability
            ? evaluated.pass
            : cardinalityResult(evaluated.pass, evaluated.present, facet.cardinality);
        if (isApplicability) return pass;
        const setLabel = facet.propertySet?.value || '*';
        const nameLabel = (facet.baseName || facet.name)?.value || '*';
        return validationResult('property', pass, `${setLabel}.${nameLabel}`, evaluated.present
            ? `${evaluated.matching.length} matching property value(s)`
            : 'Matching property not found');
    }

    function entityAttributes(entity, ctx) {
        const result = [];
        const names = ctx?.getAttributes ? ctx.getAttributes(entity.entity) : [];
        if (names.length && entity.params) {
            const params = ctx?.splitParams ? ctx.splitParams(entity.params) : splitParams(entity.params);
            for (let index = 0; index < Math.min(names.length, params.length); index++) {
                const type = ctx?.getAttributeType ? ctx.getAttributeType(entity.entity, names[index]) : null;
                result.push({ name: names[index], typed: rawTypedValue(params[index], type) });
            }
            return result;
        }
        for (const [name, value] of Object.entries(entity.attributes || {})) {
            result.push({ name, typed: { value, dataType: null, kind: typeof value } });
        }
        return result;
    }

    function attributeRequiredPass(entity, facet, ctx) {
        const matching = entityAttributes(entity, ctx).filter(attribute => matchValue(attribute.name, facet.name, 'IFCLABEL'));
        const specified = matching.filter(attribute => attribute.typed.kind !== 'null' && attribute.typed.kind !== 'derived');
        const present = specified.length > 0;
        const pass = specified.some(attribute => {
            if (isEmptyValue(attribute.typed.value)) return false;
            if (!facet.value) return true;
            if (['reference', 'list', 'object'].includes(attribute.typed.kind)) return false;
            return matchValue(attribute.typed, facet.value, attribute.typed.dataType);
        });
        return { pass, present, matching };
    }

    function checkAttributeFacet(entity, facet, isApplicability, ctx) {
        const evaluated = attributeRequiredPass(entity, facet, ctx);
        const pass = isApplicability
            ? evaluated.pass
            : cardinalityResult(evaluated.pass, evaluated.present, facet.cardinality);
        if (isApplicability) return pass;
        return validationResult('attribute', pass, `Attribute: ${facet.name?.value || '*'}`, evaluated.present
            ? 'Attribute evaluated'
            : 'Attribute not found or null');
    }

    function classificationRequiredPass(entity, facet) {
        const classifications = entity.classifications || [];
        const pass = classifications.some(classification => {
            if (facet.system && !matchValue(classification.system, facet.system, 'IFCLABEL')) return false;
            if (facet.value && !(classification.values || []).some(value => matchValue(value, facet.value, 'IFCLABEL'))) return false;
            return Boolean(classification.system || (classification.values || []).length);
        });
        return { pass, present: classifications.length > 0 };
    }

    function checkClassificationFacet(entity, facet, isApplicability) {
        const evaluated = classificationRequiredPass(entity, facet);
        const pass = isApplicability
            ? evaluated.pass
            : cardinalityResult(evaluated.pass, evaluated.present, facet.cardinality);
        if (isApplicability) return pass;
        return validationResult('classification', pass, 'Classification', evaluated.present
            ? 'Classification evaluated'
            : 'Classification not found');
    }

    function materialRequiredPass(entity, facet) {
        const values = entity.materials || [];
        const present = Boolean(entity.hasMaterial || values.length);
        return { pass: present && (!facet.value || values.some(value => matchValue(value, facet.value, 'IFCLABEL'))), present };
    }

    function checkMaterialFacet(entity, facet, isApplicability) {
        const evaluated = materialRequiredPass(entity, facet);
        const pass = isApplicability
            ? evaluated.pass
            : cardinalityResult(evaluated.pass, evaluated.present, facet.cardinality);
        if (isApplicability) return pass;
        return validationResult('material', pass, 'Material', evaluated.present ? 'Material evaluated' : 'Material not found');
    }

    function partOfRequiredPass(entity, facet, ctx) {
        const mode = facet.relation || '*';
        const relations = (entity.relations || []).filter(relation => relation.mode === mode);
        return { pass: relations.some(relation => checkEntityFacet(relation.target, facet.entity || {}, ctx)), present: relations.length > 0 };
    }

    function checkPartOfFacet(entity, facet, isApplicability, ctx) {
        const evaluated = partOfRequiredPass(entity, facet, ctx);
        const pass = isApplicability
            ? evaluated.pass
            : cardinalityResult(evaluated.pass, evaluated.present, facet.cardinality);
        if (isApplicability) return pass;
        return validationResult('partOf', pass, `Part of ${facet.relation || 'supported relation'}`, evaluated.present
            ? 'Relationship evaluated'
            : 'Relationship not found');
    }

    function checkFacetMatch(entity, facet, ctx) {
        switch (facet.type) {
            case 'entity': return checkEntityFacet(entity, facet, ctx);
            case 'property': return checkPropertyFacet(entity, facet, true, ctx);
            case 'attribute': return checkAttributeFacet(entity, facet, true, ctx);
            case 'classification': return checkClassificationFacet(entity, facet, true, ctx);
            case 'material': return checkMaterialFacet(entity, facet, true, ctx);
            case 'partOf': return checkPartOfFacet(entity, facet, true, ctx);
            default: return false;
        }
    }

    function filterByApplicability(entities, applicability, ctx) {
        if (!applicability || applicability.length === 0) return entities;
        return entities.filter(entity => applicability.every(facet => checkFacetMatch(entity, facet, ctx)));
    }

    function checkRequirementFacet(entity, facet, ctx) {
        switch (facet.type) {
            case 'entity': {
                const pass = checkEntityFacet(entity, facet, ctx);
                return validationResult('entity', pass, `Entity: ${facet.name?.value || '*'}`, pass ? 'Entity matches' : 'Entity does not match');
            }
            case 'property': return checkPropertyFacet(entity, facet, false, ctx);
            case 'attribute': return checkAttributeFacet(entity, facet, false, ctx);
            case 'classification': return checkClassificationFacet(entity, facet, false, ctx);
            case 'material': return checkMaterialFacet(entity, facet, false, ctx);
            case 'partOf': return checkPartOfFacet(entity, facet, false, ctx);
            default: return validationResult(facet.type || 'unknown', false, 'Unsupported facet', 'Facet cannot be evaluated');
        }
    }

    function validateEntity(entity, requirements, specName, ctx) {
        const validations = (requirements || []).map(facet => checkRequirementFacet(entity, facet, ctx));
        return {
            entity: entity.entity,
            name: entity.name,
            guid: entity.guid,
            fileName: entity.fileName,
            specification: specName,
            status: validations.every(validation => validation.status === 'pass') ? 'pass' : 'fail',
            validations
        };
    }

    async function buildContext(ifcVersion) {
        if (typeof window === 'undefined' || !window.IFCHierarchy || !window.IfcParams) return { ifcVersion };
        await window.IFCHierarchy.load(ifcVersion);
        return {
            ifcVersion,
            getPredefinedTypeIndex: cls => window.IFCHierarchy.getPredefinedTypeIndex(ifcVersion, cls),
            getObjectTypeIndex: cls => window.IFCHierarchy.getObjectTypeIndex(ifcVersion, cls),
            getAttributeIndex: (cls, name) => window.IFCHierarchy.getAttributeIndex(ifcVersion, cls, name),
            getAttributes: cls => window.IFCHierarchy.getAttributes(ifcVersion, cls),
            getAttributeType: (cls, name) => window.IFCHierarchy.getAttributeType(ifcVersion, cls, name),
            splitParams: window.IfcParams.splitIfcParams,
            unwrapEnumValue: window.IfcParams.unwrapEnumValue,
            unwrapString: window.IfcParams.unwrapString
        };
    }

    function occurrenceBounds(spec) {
        const minRaw = spec.minOccurs === undefined || spec.minOccurs === null || spec.minOccurs === '' ? '1' : String(spec.minOccurs);
        const maxRaw = spec.maxOccurs === undefined || spec.maxOccurs === null || spec.maxOccurs === '' ? '1' : String(spec.maxOccurs);
        return {
            min: Number(minRaw),
            max: maxRaw === 'unbounded' ? Infinity : Number(maxRaw)
        };
    }

    async function validateBatch(entities, spec, options) {
        options = options || {};
        const ifcSchema = options.ifcSchema || 'UNKNOWN';
        const declared = Array.isArray(spec.ifcVersions)
            ? spec.ifcVersions
            : (spec.ifcVersion ? spec.ifcVersion.trim().split(/\s+/).filter(Boolean) : []);
        const supported = declared.filter(version => SUPPORTED_IFC.includes(version));
        const unsupported = declared.filter(version => !SUPPORTED_IFC.includes(version));

        // IDS 1.0 defines ifcVersion as exchange metadata. It must not change
        // whether a specification passes or fails against an IFC file.
        const ifcVersion = SUPPORTED_IFC.includes(ifcSchema)
            ? ifcSchema
            : (supported[0] || 'IFC4');
        const ctx = options.context || await buildContext(ifcVersion);
        const applicableEntities = filterByApplicability(entities, spec.applicability || [], ctx);
        const bounds = occurrenceBounds(spec);
        const occurrencePass = applicableEntities.length >= bounds.min && applicableEntities.length <= bounds.max;
        const prohibited = bounds.max === 0;
        const result = {
            specification: spec.name,
            status: occurrencePass ? 'pass' : 'fail',
            passCount: 0,
            failCount: occurrencePass ? 0 : 1,
            entityResults: [],
            applicableCount: applicableEntities.length,
            occurrence: {
                minOccurs: bounds.min,
                maxOccurs: bounds.max === Infinity ? 'unbounded' : bounds.max,
                actual: applicableEntities.length,
                status: occurrencePass ? 'pass' : 'fail'
            },
            warnings: unsupported.length ? [`Unsupported ifcVersion entries ignored: ${unsupported.join(', ')}`] : []
        };

        if (prohibited) return result;
        for (const entity of applicableEntities) {
            const entityResult = validateEntity(entity, spec.requirements || [], spec.name, ctx);
            result.entityResults.push(entityResult);
            if (entityResult.status === 'pass') result.passCount++;
            else {
                result.failCount++;
                result.status = 'fail';
            }
        }
        return result;
    }

    return {
        matchValue,
        cardinalityResult,
        checkEntityFacet,
        checkPredefinedType,
        checkPropertyFacet,
        checkAttributeFacet,
        checkClassificationFacet,
        checkMaterialFacet,
        checkPartOfFacet,
        checkFacetMatch,
        checkRequirementFacet,
        filterByApplicability,
        validateEntity,
        validateBatch,
        buildContext,
        occurrenceBounds
    };
})();

if (typeof window !== 'undefined') window.ValidationEngine = ValidationEngine;
if (typeof self !== 'undefined' && typeof window === 'undefined') self.ValidationEngine = ValidationEngine;
