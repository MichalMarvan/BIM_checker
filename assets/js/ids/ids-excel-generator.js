/**
 * IDS Excel Generator
 * Generates Excel files from IDS data structure
 */

const IDSExcelGenerator = (function() {

    /**
     * Generate Excel file from IDS data
     * @param {Object} idsData - IDS data structure
     * @returns {ArrayBuffer} Excel file as ArrayBuffer
     */
    function generate(idsData) {
        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Generate sheet data
        const infoData = _generateInfoSheet(idsData);
        const specificationsData = _generateSpecificationsSheet(idsData.specifications || []);
        const applicabilityData = _generateApplicabilitySheet(idsData.specifications || []);
        const psetsLookupData = _generatePsetsLookupSheet(idsData.specifications || []);
        const elementPsetsData = _generateElementPsetsSheet(idsData.specifications || []);

        // Create sheets
        const infoSheet = XLSX.utils.json_to_sheet(infoData);
        const specificationsSheet = XLSX.utils.json_to_sheet(specificationsData);
        const applicabilitySheet = XLSX.utils.json_to_sheet(applicabilityData);
        const psetsLookupSheet = XLSX.utils.json_to_sheet(psetsLookupData);
        const elementPsetsSheet = XLSX.utils.json_to_sheet(elementPsetsData);

        // Add sheets to workbook
        XLSX.utils.book_append_sheet(workbook, infoSheet, 'info');
        XLSX.utils.book_append_sheet(workbook, specificationsSheet, 'specifications');
        XLSX.utils.book_append_sheet(workbook, applicabilitySheet, 'applicability');
        XLSX.utils.book_append_sheet(workbook, psetsLookupSheet, 'psets_lookup');
        XLSX.utils.book_append_sheet(workbook, elementPsetsSheet, 'element_psets');

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

        return buffer;
    }

    /**
     * Generate info sheet data
     * @private
     */
    function _generateInfoSheet(idsData) {
        return [
            { Field: 'title', Value: idsData.title || '' },
            { Field: 'author', Value: idsData.author || '' },
            { Field: 'version', Value: idsData.version || '' },
            { Field: 'date', Value: idsData.date || '' },
            { Field: 'description', Value: idsData.description || '' },
            { Field: 'purpose', Value: idsData.purpose || '' },
            { Field: 'copyright', Value: idsData.copyright || '' },
            { Field: 'milestone', Value: idsData.milestone || '' }
        ];
    }

    /**
     * Generate specifications sheet data
     * @private
     */
    function _generateSpecificationsSheet(specifications) {
        return specifications.map((spec, index) => ({
            spec_id: spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`,
            name: spec.name || '',
            description: spec.description || '',
            ifcVersion: spec.ifcVersion || 'IFC4',
            instructions: spec.instructions || ''
        }));
    }

    /**
     * Generate applicability sheet data
     * @private
     */
    function _generateApplicabilitySheet(specifications) {
        const rows = [];

        for (let index = 0; index < specifications.length; index++) {
            const spec = specifications[index];
            const specId = spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`;

            for (const facet of (spec.applicability || [])) {
                const row = {
                    spec_id: specId,
                    facet_type: facet.type || 'entity'
                };

                if (facet.type === 'entity') {
                    row.entity_name = facet.name?.value || '';
                    row.predefinedType = facet.predefinedType?.value || '';
                } else if (facet.type === 'property') {
                    row.pset_name = facet.propertySet?.value || '';
                    row.property_name = facet.baseName?.value || facet.name?.value || '';
                    row.property_value = facet.value?.value || '';
                } else if (facet.type === 'attribute') {
                    row.attribute_name = facet.name?.value || '';
                    row.attribute_value = facet.value?.value || '';
                }

                rows.push(row);
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push({
                spec_id: '',
                facet_type: '',
                entity_name: '',
                predefinedType: '',
                pset_name: '',
                property_name: '',
                property_value: '',
                attribute_name: '',
                attribute_value: ''
            });
        }

        return rows;
    }

    /**
     * Generate psets_lookup sheet data (deduplicated catalog)
     * @private
     */
    function _generatePsetsLookupSheet(specifications) {
        const seen = new Set();
        const rows = [];

        for (const spec of specifications) {
            for (const req of (spec.requirements || [])) {
                if (req.type !== 'property') continue;

                const psetName = req.propertySet?.value || '';
                const propName = req.baseName?.value || req.name?.value || '';
                const key = `${psetName}|${propName}`;

                if (!psetName || !propName || seen.has(key)) continue;

                seen.add(key);
                rows.push({
                    pset_name: psetName,
                    property_name: propName,
                    dataType: req.dataType || '',
                    value: req.value?.value || ''
                });
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push({ pset_name: '', property_name: '', dataType: '', value: '' });
        }

        return rows;
    }

    /**
     * Generate element_psets sheet data
     * @private
     */
    function _generateElementPsetsSheet(specifications) {
        const rows = [];

        for (let index = 0; index < specifications.length; index++) {
            const spec = specifications[index];
            const specId = spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`;
            const seenPsets = new Set();

            for (const req of (spec.requirements || [])) {
                if (req.type !== 'property') continue;

                const psetName = req.propertySet?.value || '';
                if (!psetName || seenPsets.has(psetName)) continue;

                seenPsets.add(psetName);
                rows.push({
                    spec_id: specId,
                    pset_name: psetName,
                    cardinality: req.cardinality || 'required',
                    value_override: ''
                });
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push({ spec_id: '', pset_name: '', cardinality: '', value_override: '' });
        }

        return rows;
    }

    /**
     * Download Excel file
     * @param {Object} idsData - IDS data structure
     * @param {string} filename - Filename without extension
     */
    function download(idsData, filename) {
        const buffer = generate(idsData);
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename || 'ids-export'}.xlsx`;
        link.click();

        URL.revokeObjectURL(url);
    }

    // Public API
    return {
        generate,
        download,
        // Expose private methods for testing
        _generateInfoSheet,
        _generateSpecificationsSheet,
        _generateApplicabilitySheet,
        _generatePsetsLookupSheet,
        _generateElementPsetsSheet
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.IDSExcelGenerator = IDSExcelGenerator;
}
