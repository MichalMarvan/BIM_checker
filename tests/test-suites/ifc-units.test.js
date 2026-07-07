/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('3D IFC unit resolution', () => {
    async function parse(ifc) {
        const [{ parseStepText }, { EntityIndex }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js')
        ]);
        const { entities } = parseStepText(ifc);
        return new EntityIndex(entities);
    }
    async function unitsMod() {
        return import('../../assets/js/3d/ifc-engine/parser/units.js');
    }

    const HEADER = `ISO-10303-21;\nDATA;\n`;
    const FOOTER = `ENDSEC;\nEND-ISO-10303-21;`;

    it('resolves millimetre scale through IfcProject.UnitsInContext', async () => {
        const ifc = HEADER + `
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#9=IFCPROJECT('guid',$,'P',$,$,$,$,$,#2);
` + FOOTER;
        const { extractLengthScale } = await unitsMod();
        expect(extractLengthScale(await parse(ifc))).toBe(0.001);
    });

    it('prefers the project assignment over an earlier orphaned one', async () => {
        const ifc = HEADER + `
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#4=IFCUNITASSIGNMENT((#3));
#9=IFCPROJECT('guid',$,'P',$,$,$,$,$,#4);
` + FOOTER;
        const { extractLengthScale } = await unitsMod();
        expect(extractLengthScale(await parse(ifc))).toBe(0.001);
    });

    it('resolves conversion-based length units (feet)', async () => {
        const ifc = HEADER + `
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#1);
#3=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);
#4=IFCCONVERSIONBASEDUNIT(#3,.LENGTHUNIT.,'FOOT',#2);
#5=IFCUNITASSIGNMENT((#4));
#9=IFCPROJECT('guid',$,'P',$,$,$,$,$,#5);
` + FOOTER;
        const { extractLengthScale } = await unitsMod();
        expect(extractLengthScale(await parse(ifc))).toBe(0.3048);
    });

    it('defaults to metres when no units are declared', async () => {
        const ifc = HEADER + `#1=IFCWALL('g',$,$,$,$,$,$,$,$);\n` + FOOTER;
        const { extractLengthScale } = await unitsMod();
        expect(extractLengthScale(await parse(ifc))).toBe(1);
    });

    it('builds a per-context map for merged files with conflicting units', async () => {
        // Two source blocks: mm block (#10-#19) and m block (#510-#519),
        // mimicking an Xbim concatenation with one surviving project.
        const ifc = HEADER + `
#10=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#11=IFCUNITASSIGNMENT((#10));
#12=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.01,#13,$);
#13=IFCAXIS2PLACEMENT3D(#14,$,$);
#14=IFCCARTESIANPOINT((0.,0.,0.));
#510=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#511=IFCUNITASSIGNMENT((#510));
#512=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-6,#13,$);
#515=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#512,$,.MODEL_VIEW.,$);
#900=IFCPROJECT('guid',$,'P',$,$,$,$,(#12),#11);
` + FOOTER;
        const { buildContextScaleMap } = await unitsMod();
        const map = buildContextScaleMap(await parse(ifc));
        expect(map === null).toBe(false);
        expect(map.get(12)).toBe(0.001);
        expect(map.get(512)).toBe(1);
        // subcontext inherits its parent's scale
        expect(map.get(515)).toBe(1);
    });

    it('returns null map for normal single-unit files', async () => {
        const ifc = HEADER + `
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.01,#4,$);
#4=IFCAXIS2PLACEMENT3D(#5,$,$);
#5=IFCCARTESIANPOINT((0.,0.,0.));
#9=IFCPROJECT('guid',$,'P',$,$,$,$,(#3),#2);
` + FOOTER;
        const { buildContextScaleMap } = await unitsMod();
        expect(buildContextScaleMap(await parse(ifc))).toBe(null);
    });

    it('returns null map when assignments agree on the unit', async () => {
        const ifc = HEADER + `
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#4=IFCUNITASSIGNMENT((#3));
` + FOOTER;
        const { buildContextScaleMap } = await unitsMod();
        expect(buildContextScaleMap(await parse(ifc))).toBe(null);
    });
});

describe('3D IFC product type detection', () => {
    async function detect(ifc) {
        const [{ parseStepText }, { EntityIndex }, { detectProductTypes }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/parser/product-detect.js')
        ]);
        const { entities } = parseStepText(ifc);
        return detectProductTypes(new EntityIndex(entities));
    }

    const HEADER = `ISO-10303-21;\nDATA;\n`;
    const FOOTER = `ENDSEC;\nEND-ISO-10303-21;`;

    it('includes whitelisted types and structurally detected unknown ones', async () => {
        const ifc = HEADER + `
#1=IFCWALL('g1',$,$,$,$,#5,#10,$,$);
#2=IFCGEOTECHNICALSTRATUM('g2',$,$,$,$,#5,#10,$,$);
#5=IFCLOCALPLACEMENT($,$);
#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#11));
#11=IFCSHAPEREPRESENTATION($,'Body','Brep',());
` + FOOTER;
        const types = await detect(ifc);
        expect(types.has('IFCWALL')).toBe(true);
        // not on any whitelist — found because it carries a ProductDefinitionShape
        expect(types.has('IFCGEOTECHNICALSTRATUM')).toBe(true);
    });

    it('keeps openings, annotations and non-products out', async () => {
        const ifc = HEADER + `
#1=IFCOPENINGELEMENT('g1',$,$,$,$,#5,#10,$);
#2=IFCANNOTATION('g2',$,$,$,$,#5,#10);
#3=IFCWALLTYPE('g3',$,'T',$,$,$,$,$,.NOTDEFINED.);
#4=IFCRELAGGREGATES('g4',$,$,$,#1,(#2));
#5=IFCLOCALPLACEMENT($,$);
#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#11));
#11=IFCSHAPEREPRESENTATION($,'Body','Brep',());
` + FOOTER;
        const types = await detect(ifc);
        expect(types.has('IFCOPENINGELEMENT')).toBe(false);
        expect(types.has('IFCANNOTATION')).toBe(false);
        expect(types.has('IFCWALLTYPE')).toBe(false);
        expect(types.has('IFCRELAGGREGATES')).toBe(false);
    });

    it('keeps subtraction features (IfcVoidingFeature) hidden from products', async () => {
        // Tekla exports voiding features (drill/cut reference volumes) as
        // products with a 'Reference' SolidModel shape — they must not be
        // listed or rendered (their volume is the hole, not material).
        const ifc = HEADER + `
#1=IFCVOIDINGFEATURE('g1',$,'COLUMN','D31080',$,#5,#10,'(?)',.HOLE.);
#5=IFCLOCALPLACEMENT($,$);
#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#11));
#11=IFCSHAPEREPRESENTATION($,'Reference','SolidModel',());
` + FOOTER;
        const [types, { HIDDEN_PRODUCT_TYPES }] = await Promise.all([
            detect(ifc),
            import('../../assets/js/3d/ifc-engine/constants.js')
        ]);
        expect(types.has('IFCVOIDINGFEATURE')).toBe(false);
        expect(HIDDEN_PRODUCT_TYPES.has('IFCVOIDINGFEATURE')).toBe(true);
        expect(HIDDEN_PRODUCT_TYPES.has('IFCOPENINGSTANDARDCASE')).toBe(true);
    });
});
