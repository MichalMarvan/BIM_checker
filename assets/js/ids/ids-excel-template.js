/**
 * IDS Excel Template
 * Generates sample Excel template with Top 20 IFC4 psets
 */

const IDSExcelTemplate = (function() {

    // Top 20 most common IFC4 property sets with their properties
    const TOP_PSETS = [
        { pset: 'Pset_WallCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'LoadBearing', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_DoorCommon', properties: ['Reference', 'Status', 'IsExternal', 'FireRating', 'AcousticRating', 'SecurityRating', 'HandicapAccessible'] },
        { pset: 'Pset_WindowCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'GlazingAreaFraction', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_SlabCommon', properties: ['Reference', 'Status', 'IsExternal', 'LoadBearing', 'FireRating', 'AcousticRating', 'Combustible'] },
        { pset: 'Pset_BeamCommon', properties: ['Reference', 'Status', 'Span', 'Slope', 'LoadBearing', 'FireRating'] },
        { pset: 'Pset_ColumnCommon', properties: ['Reference', 'Status', 'Slope', 'LoadBearing', 'FireRating'] },
        { pset: 'Pset_RoofCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_StairCommon', properties: ['Reference', 'Status', 'NumberOfRisers', 'NumberOfTreads', 'RiserHeight', 'TreadLength', 'HandicapAccessible'] },
        { pset: 'Pset_RampCommon', properties: ['Reference', 'Status', 'IsExternal', 'FireRating', 'HandicapAccessible'] },
        { pset: 'Pset_CoveringCommon', properties: ['Reference', 'Status', 'IsExternal', 'FireRating', 'AcousticRating', 'FlammabilityRating'] },
        { pset: 'Pset_CurtainWallCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_PlateCommon', properties: ['Reference', 'Status', 'IsExternal', 'LoadBearing', 'FireRating'] },
        { pset: 'Pset_RailingCommon', properties: ['Reference', 'Status', 'IsExternal', 'Height'] },
        { pset: 'Pset_BuildingElementProxyCommon', properties: ['Reference', 'Status'] },
        { pset: 'Pset_SpaceCommon', properties: ['Reference', 'IsExternal', 'GrossPlannedArea', 'NetPlannedArea', 'PubliclyAccessible', 'HandicapAccessible'] },
        { pset: 'Pset_ZoneCommon', properties: ['Reference', 'IsExternal', 'GrossPlannedArea', 'NetPlannedArea'] },
        { pset: 'Pset_BuildingCommon', properties: ['Reference', 'BuildingID', 'IsPermanentID', 'YearOfConstruction', 'IsLandmarked'] },
        { pset: 'Pset_SiteCommon', properties: ['Reference', 'BuildableArea', 'TotalArea', 'BuildingHeightLimit'] },
        { pset: 'Pset_BuildingStoreyCommon', properties: ['Reference', 'EntranceLevel', 'AboveGround', 'SprinklerProtection', 'GrossAreaPlanned', 'NetAreaPlanned'] },
        { pset: 'Pset_MemberCommon', properties: ['Reference', 'Status', 'Span', 'Slope', 'LoadBearing', 'FireRating'] }
    ];

    /**
     * Generate template IDS data
     */
    function generateTemplateData() {
        return {
            title: '[Your IDS Title]',
            author: '[Your Name]',
            version: '1.0',
            date: new Date().toISOString().split('T')[0],
            description: '[Description of your IDS requirements]',
            purpose: '',
            copyright: '',
            milestone: '',
            specifications: [
                {
                    identifier: 'SPEC_walls',
                    name: 'Wall Requirements',
                    description: 'All walls must have basic properties defined',
                    ifcVersion: 'IFC4',
                    applicability: [{ type: 'entity', name: { value: 'IFCWALL' } }],
                    requirements: [
                        { type: 'property', propertySet: { value: 'Pset_WallCommon' }, baseName: { value: 'IsExternal' } },
                        { type: 'property', propertySet: { value: 'Pset_WallCommon' }, baseName: { value: 'LoadBearing' } }
                    ]
                },
                {
                    identifier: 'SPEC_doors',
                    name: 'Door Requirements',
                    description: 'All doors must have fire rating',
                    ifcVersion: 'IFC4',
                    applicability: [{ type: 'entity', name: { value: 'IFCDOOR' } }],
                    requirements: [
                        { type: 'property', propertySet: { value: 'Pset_DoorCommon' }, baseName: { value: 'FireRating' } }
                    ]
                },
                {
                    identifier: 'SPEC_windows',
                    name: 'Window Requirements',
                    description: 'All windows must have thermal properties',
                    ifcVersion: 'IFC4',
                    applicability: [{ type: 'entity', name: { value: 'IFCWINDOW' } }],
                    requirements: [
                        { type: 'property', propertySet: { value: 'Pset_WindowCommon' }, baseName: { value: 'ThermalTransmittance' } }
                    ]
                }
            ]
        };
    }

    /**
     * Generate psets_lookup with Top 20 psets
     */
    function generatePsetsLookup() {
        const rows = [];

        for (const pset of TOP_PSETS) {
            for (const prop of pset.properties) {
                rows.push({
                    pset_name: pset.pset,
                    property_name: prop,
                    dataType: '',
                    value: ''
                });
            }
        }

        return rows;
    }

    /**
     * Generate and download template
     */
    function downloadTemplate() {
        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Info sheet
        const infoData = [
            { Field: 'title', Value: '[Your IDS Title]' },
            { Field: 'author', Value: '[Your Name]' },
            { Field: 'version', Value: '1.0' },
            { Field: 'date', Value: new Date().toISOString().split('T')[0] },
            { Field: 'description', Value: '[Description of your IDS requirements]' },
            { Field: 'purpose', Value: '' },
            { Field: 'copyright', Value: '' },
            { Field: 'milestone', Value: '' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(infoData), 'info');

        // Specifications sheet
        const specsData = [
            { spec_id: 'SPEC_walls', name: 'Wall Requirements', description: 'All walls must have basic properties defined', ifcVersion: 'IFC4' },
            { spec_id: 'SPEC_doors', name: 'Door Requirements', description: 'All doors must have fire rating', ifcVersion: 'IFC4' },
            { spec_id: 'SPEC_windows', name: 'Window Requirements', description: 'All windows must have thermal properties', ifcVersion: 'IFC4' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(specsData), 'specifications');

        // Applicability sheet
        const applicabilityData = [
            { spec_id: 'SPEC_walls', facet_type: 'entity', entity_name: 'IFCWALL', predefinedType: '' },
            { spec_id: 'SPEC_doors', facet_type: 'entity', entity_name: 'IFCDOOR', predefinedType: '' },
            { spec_id: 'SPEC_windows', facet_type: 'entity', entity_name: 'IFCWINDOW', predefinedType: '' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(applicabilityData), 'applicability');

        // Psets lookup with Top 20
        const psetsData = generatePsetsLookup();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(psetsData), 'psets_lookup');

        // Element psets
        const elementPsetsData = [
            { spec_id: 'SPEC_walls', pset_name: 'Pset_WallCommon', cardinality: 'required', value_override: '' },
            { spec_id: 'SPEC_doors', pset_name: 'Pset_DoorCommon', cardinality: 'required', value_override: '' },
            { spec_id: 'SPEC_windows', pset_name: 'Pset_WindowCommon', cardinality: 'required', value_override: '' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(elementPsetsData), 'element_psets');

        // Download
        const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'IDS_Template.xlsx';
        link.click();

        URL.revokeObjectURL(url);
    }

    return {
        TOP_PSETS,
        generateTemplateData,
        generatePsetsLookup,
        downloadTemplate
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.IDSExcelTemplate = IDSExcelTemplate;
}
