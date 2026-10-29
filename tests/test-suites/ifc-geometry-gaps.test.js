/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-geometry-gaps — IfcCompositeCurve/IfcTrimmedCurve profily a vadný IfcMappedItem', () => {
    async function build(data, productId) {
        const [{ parseStepText }, { EntityIndex }, { buildEntityGeometry }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/geometry/geometry-core.js')
        ]);
        const { entities } = parseStepText(`ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`);
        return buildEntityGeometry(new EntityIndex(entities), productId);
    }

    function bbox(result) {
        const geom = result.items[0].bufferGeometry;
        const lo = geom.userData?.localOrigin || [0, 0, 0];
        const bb = geom.boundingBox;
        return {
            min: [bb.min.x + lo[0], bb.min.y + lo[1], bb.min.z + lo[2]],
            max: [bb.max.x + lo[0], bb.max.y + lo[1], bb.max.z + lo[2]]
        };
    }

    function near(actual, expected, tol) {
        return Math.abs(actual - expected) <= tol;
    }

    // Projekt + jednotky: #20 = DEGREE (IFCCONVERSIONBASEDUNIT), #21 = RADIAN.
    const UNITS_DEG = `
#1=IFCPROJECT('p',$,$,$,$,$,$,$,#10);
#10=IFCUNITASSIGNMENT((#20));
#20=IFCCONVERSIONBASEDUNIT(#22,.PLANEANGLEUNIT.,'DEGREE',#23);
#21=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#22=IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0);
#23=IFCMEASUREWITHUNIT(IFCPLANEANGLEMEASURE(0.0174532925199433),#21);
`;
    const UNITS_RAD = `
#1=IFCPROJECT('p',$,$,$,$,$,$,$,#10);
#10=IFCUNITASSIGNMENT((#21));
#21=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
`;
    // Sloup s extruzí profilu #64, hloubka 2000, bez Position.
    function column(profileId) {
        return `
#70=IFCCARTESIANPOINT((0.,0.,0.));
#71=IFCAXIS2PLACEMENT3D(#70,$,$);
#72=IFCLOCALPLACEMENT($,#71);
#73=IFCDIRECTION((0.,0.,1.));
#74=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#71,$);
#75=IFCEXTRUDEDAREASOLID(#${profileId},$,#73,2000.);
#76=IFCSHAPEREPRESENTATION(#74,'Body','SweptSolid',(#75));
#77=IFCPRODUCTDEFINITIONSHAPE($,$,(#76));
#78=IFCCOLUMN('c',$,$,$,$,#72,#77,$,$);
`;
    }

    // buildingSMART curve-parameters-in-degrees: půlkruh = úsečka (IfcLine,
    // parametr × |Dir|) + oblouk IfcCircle 315°→135° (.PARAMETER.).
    const SEMICIRCLE = (a315, a135) => `
#52=IFCCARTESIANPOINT((-1000.0,1000.0));
#53=IFCDIRECTION((0.70710678,-0.70710678));
#54=IFCVECTOR(#53,1414.2135623731);
#55=IFCLINE(#52,#54);
#56=IFCTRIMMEDCURVE(#55,(IFCPARAMETERVALUE(0.292893218813453)),(IFCPARAMETERVALUE(1.70710678118655)),.T.,.PARAMETER.);
#57=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#56);
#58=IFCCARTESIANPOINT((0.0,0.0));
#59=IFCAXIS2PLACEMENT2D(#58,$);
#60=IFCCIRCLE(#59,1000.0);
#61=IFCTRIMMEDCURVE(#60,(IFCPARAMETERVALUE(${a315})),(IFCPARAMETERVALUE(${a135})),.T.,.PARAMETER.);
#62=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#61);
#63=IFCCOMPOSITECURVE((#57,#62),.U.);
#64=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'SemiCircle',#63);
`;

    it('půlkruhový profil, úhly ve stupních (IFCCONVERSIONBASEDUNIT DEGREE)', async () => {
        const r = await build(UNITS_DEG + SEMICIRCLE('315.0', '135.0') + column(64), 78);
        expect(r.items.length).toBe(1);
        expect(r.diagnostics.unsupportedRepresentationTypes.size).toBe(0);
        const bb = bbox(r);
        expect(near(bb.min[0], -707.1, 0.5)).toBe(true);
        expect(near(bb.max[0], 1000, 0.5)).toBe(true);
        expect(near(bb.min[1], -707.1, 0.5)).toBe(true);
        expect(near(bb.max[1], 1000, 0.5)).toBe(true);
        expect(near(bb.max[2], 2000, 1e-6)).toBe(true);
    });

    it('stejný profil, úhly v radiánech (IFCSIUNIT RADIAN)', async () => {
        const r = await build(UNITS_RAD + SEMICIRCLE('5.49778714378214', '2.35619449019234') + column(64), 78);
        expect(r.items.length).toBe(1);
        const bb = bbox(r);
        expect(near(bb.min[0], -707.1, 0.5)).toBe(true);
        expect(near(bb.max[0], 1000, 0.5)).toBe(true);
        expect(near(bb.max[1], 1000, 0.5)).toBe(true);
    });

    // curve-parameters-in-degrees "PartialEllipse": elipsa 0°→45°, úsečka
    // zpět do počátku se SenseAgreement .F., úsečka po ose X.
    it('částečná elipsa + obrácená úsečka (SenseAgreement .F.)', async () => {
        const data = UNITS_DEG + `
#150=IFCCARTESIANPOINT((0.0,0.0));
#151=IFCAXIS2PLACEMENT2D(#150,$);
#152=IFCELLIPSE(#151,1000.0,500.0);
#153=IFCTRIMMEDCURVE(#152,(IFCPARAMETERVALUE(0.0)),(IFCPARAMETERVALUE(45.0)),.T.,.PARAMETER.);
#154=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#153);
#156=IFCDIRECTION((0.89442719,0.4472136));
#157=IFCVECTOR(#156,1.0);
#158=IFCLINE(#150,#157);
#159=IFCTRIMMEDCURVE(#158,(IFCPARAMETERVALUE(0.0)),(IFCPARAMETERVALUE(790.569415042095)),.F.,.PARAMETER.);
#160=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#159);
#162=IFCDIRECTION((1.0,0.0));
#163=IFCVECTOR(#162,1.0);
#164=IFCLINE(#150,#163);
#165=IFCTRIMMEDCURVE(#164,(IFCPARAMETERVALUE(0.0)),(IFCPARAMETERVALUE(1000.0)),.T.,.PARAMETER.);
#166=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#165);
#167=IFCCOMPOSITECURVE((#154,#160,#166),.U.);
#64=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'PartialEllipse',#167);
` + column(64);
        const r = await build(data, 78);
        expect(r.items.length).toBe(1);
        const bb = bbox(r);
        expect(near(bb.min[0], 0, 1e-6)).toBe(true);
        expect(near(bb.max[0], 1000, 1e-6)).toBe(true);
        expect(near(bb.min[1], 0, 1e-6)).toBe(true);
        expect(near(bb.max[1], 353.55, 0.5)).toBe(true);
    });

    // project_and_site.ifc (Vebo spekband): polyline + oblouk s .CARTESIAN.
    // master a SenseAgreement .F. (trim1 = 180°, trim2 = 0°), polyline zpět.
    it('kartézské trimy, oblouk .F. navazující na polyline', async () => {
        const data = UNITS_DEG + `
#30=IFCCARTESIANPOINT((0.,-50.));
#31=IFCCARTESIANPOINT((0.,0.));
#32=IFCCARTESIANPOINT((150.,0.));
#33=IFCCARTESIANPOINT((150.,-50.));
#34=IFCPOLYLINE((#30,#31));
#35=IFCCARTESIANPOINT((75.,0.));
#36=IFCAXIS2PLACEMENT2D(#35,$);
#37=IFCCIRCLE(#36,75.);
#38=IFCTRIMMEDCURVE(#37,(#31,IFCPARAMETERVALUE(180.)),(#32,IFCPARAMETERVALUE(0.)),.F.,.CARTESIAN.);
#39=IFCPOLYLINE((#32,#33,#30));
#40=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#34);
#41=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#38);
#42=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#39);
#43=IFCCOMPOSITECURVE((#40,#41,#42),.F.);
#64=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'SB',#43);
` + column(64);
        const r = await build(data, 78);
        expect(r.items.length).toBe(1);
        const bb = bbox(r);
        expect(near(bb.min[0], 0, 1e-6)).toBe(true);
        expect(near(bb.max[0], 150, 1e-6)).toBe(true);
        expect(near(bb.min[1], -50, 1e-6)).toBe(true);
        expect(near(bb.max[1], 75, 0.5)).toBe(true);
    });

    it('IfcMappedItem s chybějícím MappingSource = invalidReference, ne unsupported', async () => {
        const data = `
#70=IFCCARTESIANPOINT((0.,0.,0.));
#71=IFCAXIS2PLACEMENT3D(#70,$,$);
#72=IFCLOCALPLACEMENT($,#71);
#74=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#71,$);
#80=IFCDIRECTION((0.,1.,0.));
#81=IFCDIRECTION((-1.,0.,0.));
#82=IFCDIRECTION((0.,0.,1.));
#83=IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM(#80,#81,#70,1.,#82,1.,1.);
#84=IFCMAPPEDITEM(#2198,#83);
#85=IFCSHAPEREPRESENTATION(#74,'Body','MappedRepresentation',(#84));
#86=IFCPRODUCTDEFINITIONSHAPE($,$,(#85));
#87=IFCREFERENT('r',$,'Sta',$,$,#72,#86,.STATION.);
`;
        const r = await build(data, 87);
        expect(r.items.length).toBe(0);
        expect(r.diagnostics.invalidReferenceCount).toBe(1);
        expect(r.diagnostics.unsupportedRepresentationTypes.size).toBe(0);
    });
});
