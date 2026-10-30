/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Ifc swept extra — independent geometry modules', () => {
    let sweep, tin, parseStepText, EntityIndex;
    async function geometry(step, kind = 'sweep', id = 20) {
        if (!sweep) {
            ({ fixedReferenceSweptAreaSolidToGeometry:sweep, triangulatedIrregularNetworkToGeometry:tin } = await import('../../assets/js/3d/ifc-engine/geometry/swept-extra.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
        const parsed = parseStepText(`ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4X3_ADD2')); ENDSEC; DATA; ${step} ENDSEC; END-ISO-10303-21;`);
        return (kind === 'tin' ? tin : sweep)(new EntityIndex(parsed.entities), id);
    }
    const base = `
#1=IFCCARTESIANPOINT((0.,0.,0.)); #2=IFCCARTESIANPOINT((0.,0.,10.));
#3=IFCDIRECTION((1.,0.,0.)); #4=IFCPOLYLINE((#1,#2));
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#20=IFCFIXEDREFERENCESWEPTAREASOLID(#10,$,#4,$,$,#3);`;
    function close(a,b,eps=1e-5) { expect(Math.abs(a-b)<eps).toBe(true); }
    function bounds(g, expected, eps=1e-5) {
        expect(g !== null).toBe(true);
        const origin=g.userData.localOrigin;
        [...g.boundingBox.min.toArray(),...g.boundingBox.max.toArray()].forEach((v,i)=>close(v+origin[i%3],expected[i],eps));
    }
    function volume(g) {
        const p=g.attributes.position.array, ix=g.index.array; let v=0;
        for(let i=0;i<ix.length;i+=3) {
            const a=3*ix[i],b=3*ix[i+1],c=3*ix[i+2];
            v+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);
        }
        return v/6;
    }
    it('straight sweep has analytical bounds, positive volume and a closed oriented mesh',async()=>{
        const g=await geometry(base); bounds(g,[-1,-2,0,1,2,10]); close(volume(g),80);
        expect(g.index.count/3).toBe(12);
        const edges=new Map(), ix=g.index.array;
        for(let i=0;i<ix.length;i+=3) for(let j=0;j<3;j++) {
            const a=ix[i+j],b=ix[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
            const entry=edges.get(key)||[0,0]; entry[0]++;entry[1]+=a<b?1:-1;edges.set(key,entry);
        }
        expect([...edges.values()].every(([count,direction])=>count===2&&direction===0)).toBe(true); g.dispose();
    });
    it('projects a nonperpendicular FixedReference instead of skewing the profile',async()=>{
        const g=await geometry(base.replace('(1.,0.,0.)','(7.,0.,7.)')); bounds(g,[-1,-2,0,1,2,10]); g.dispose();
    });
    it('FixedReference controls X rather than Y, including its sign',async()=>{
        const g=await geometry(base.replace('(1.,0.,0.)','(0.,-1.,0.)')); bounds(g,[-2,-1,0,2,1,10]);close(volume(g),80);g.dispose();
    });
    it('applies translated and rotated solid Position before localOrigin',async()=>{
        const g=await geometry(base.replace('#10,$,#4','#10,#30,#4')+`
#30=IFCAXIS2PLACEMENT3D(#31,#32,#33); #31=IFCCARTESIANPOINT((100.,200.,300.));
#32=IFCDIRECTION((1.,0.,0.)); #33=IFCDIRECTION((0.,1.,0.));`);
        bounds(g,[100,199,298,110,201,302]);close(volume(g),80);g.dispose();
    });
    it('profile Position translates and rotates the cross section',async()=>{
        const g=await geometry(base.replace('.AREA.,$,$,2.,4.','.AREA.,$,#30,2.,4.')+`
#30=IFCAXIS2PLACEMENT2D(#31,#32); #31=IFCCARTESIANPOINT((3.,5.)); #32=IFCDIRECTION((0.,1.));`);
        bounds(g,[1,4,0,5,6,10]);g.dispose();
    });
    it('derived profile applies rotation, translation and uniform scale',async()=>{
        const g=await geometry(base.replace('#20=IFCFIXEDREFERENCESWEPTAREASOLID(#10,','#20=IFCFIXEDREFERENCESWEPTAREASOLID(#40,')+`
#40=IFCDERIVEDPROFILEDEF(.AREA.,$,#10,#41,$); #41=IFCCARTESIANTRANSFORMATIONOPERATOR2D(#42,$,#43,2.);
#42=IFCDIRECTION((0.,-1.)); #43=IFCCARTESIANPOINT((3.,5.));`);
        bounds(g,[-1,3,0,7,7,10]);close(volume(g),320);g.dispose();
    });
    it('native polyline parameters interpolate by segment index, not metres',async()=>{
        const step=base.replace('#4=IFCPOLYLINE((#1,#2));','#4=IFCPOLYLINE((#1,#5,#2)); #5=IFCCARTESIANPOINT((0.,0.,2.));');
        const g=await geometry(step.replace('#4,$,$,#3','#4,0.5,1.5,#3'));bounds(g,[-1,-2,1,1,2,6]);g.dispose();
        const h=await geometry(step.replace('#4,$,$,#3','#4,IFCLENGTHMEASURE(0.5),IFCLENGTHMEASURE(1.5),#3'));bounds(h,[-1,-2,0.5,1,2,1.5]);h.dispose();
    });
    it('supports either optional trim independently on bounded curves',async()=>{
        const g=await geometry(base.replace('#4,$,$,#3','#4,$,0.5,#3'));bounds(g,[-1,-2,0,1,2,5]);g.dispose();
        const h=await geometry(base.replace('#4,$,$,#3','#4,0.5,$,#3'));bounds(h,[-1,-2,5,1,2,10]);h.dispose();
    });
    it('unbounded line requires both trims and uses vector magnitude for native parameters',async()=>{
        const s=base.replace('IFCPOLYLINE((#1,#2))','IFCLINE(#1,#6)')+'#5=IFCDIRECTION((0.,0.,1.));#6=IFCVECTOR(#5,2.);';
        expect(await geometry(s)).toBe(null);
        const g=await geometry(s.replace('#4,$,$,#3','#4,-1.,3.,#3'));bounds(g,[-1,-2,-2,1,2,6]);g.dispose();
    });
    it('indexed 3D line chains honor indices and preserve all dimensions',async()=>{
        const g=await geometry(base.replace('IFCPOLYLINE((#1,#2))','IFCINDEXEDPOLYCURVE(#30,(IFCLINEINDEX((2,1,3))),.F.)')+
            '#30=IFCCARTESIANPOINTLIST3D(((0.,0.,2.),(0.,0.,0.),(0.,0.,10.)),$);');
        bounds(g,[-1,-2,0,1,2,10]);g.dispose();
    });
    it('indexed circular arc sweeps an analytical quarter annulus',async()=>{
        const s=base.replace('IFCPOLYLINE((#1,#2))','IFCINDEXEDPOLYCURVE(#30,(IFCARCINDEX((1,2,3))),.F.)')
            .replace('(1.,0.,0.)','(0.,0.,1.)')+'#30=IFCCARTESIANPOINTLIST3D(((10.,0.,0.),(7.071067811865475,7.071067811865475,0.),(0.,10.,0.)),$);';
        const g=await geometry(s);bounds(g,[0,0,-1,12,12,1]);close(volume(g),40*Math.PI,0.1);g.dispose();
        expect(await geometry(s.replace('#4,$,$,#3','#4,0.,1.,#3'))).toBe(null);
    });
    it('classic composite SameSense false reverses its child',async()=>{
        const g=await geometry(base.replace('IFCPOLYLINE((#1,#2))','IFCCOMPOSITECURVE((#30),.F.)')+
            '#30=IFCCOMPOSITECURVESEGMENT(.DISCONTINUOUS.,.F.,#31);#31=IFCPOLYLINE((#2,#1));');
        bounds(g,[-1,-2,0,1,2,10]);close(volume(g),80);g.dispose();
    });
    const alignment=`
#1=IFCCARTESIANPOINT((0.,0.));#2=IFCDIRECTION((1.,0.));#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCLINE(#1,#7);#7=IFCVECTOR(#2,1.);
#5=IFCCURVESEGMENT(.DISCONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(10.),#4);
#6=IFCCOMPOSITECURVE((#5),.F.);#9=IFCDIRECTION((0.,0.,1.));
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#20=IFCFIXEDREFERENCESWEPTAREASOLID(#10,$,#6,$,$,#9);`;
    it('alignment composite line and circular segments use analytical tangents',async()=>{
        const g=await geometry(alignment);bounds(g,[0,-2,-1,10,2,1]);g.dispose();
        const h=await geometry(alignment.replace('IFCLINE(#1,#7)','IFCCIRCLE(#3,10.)').replace('IFCLENGTHMEASURE(10.)','IFCLENGTHMEASURE(15.707963267948966)'));
        bounds(h,[0,-2,-1,12,10,1]);close(volume(h),40*Math.PI,0.1);h.dispose();
    });
    const gradient=alignment.replace('#10,$,#6','#10,$,#33')+`
#30=IFCDIRECTION((1.,1.));#31=IFCAXIS2PLACEMENT2D(#1,#30);
#32=IFCCURVESEGMENT(.DISCONTINUOUS.,#31,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(14.142135623730951),#4);
#33=IFCGRADIENTCURVE((#32),.F.,#6,$);`;
    it('gradient has 3D tangent and length trims measure the sloped distance',async()=>{
        const g=await geometry(gradient.replace('#33,$,$,#9','#33,IFCLENGTHMEASURE(2.),IFCLENGTHMEASURE(8.),#9'));
        const q=Math.SQRT1_2;bounds(g,[q,-2,q,9*q,2,9*q]);close(volume(g),48,1e-4);g.dispose();
    });
    it('rejects partial/unsupported gradients instead of flattening missing coverage',async()=>{
        expect(await geometry(gradient.replace('14.142135623730951','7.'))).toBe(null);
        expect(await geometry(gradient.replace('IFCGRADIENTCURVE((#32)','IFCGRADIENTCURVE((#32,#99)'))).toBe(null);
    });
    it('segmented reference with verified zero deviation preserves its base curve',async()=>{
        const step=alignment.replace('#10,$,#6','#10,$,#40')+`
#40=IFCSEGMENTEDREFERENCECURVE((#5,#41),.F.,#6,$);
#41=IFCCURVESEGMENT(.DISCONTINUOUS.,#42,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(0.),#4);
#42=IFCAXIS2PLACEMENT2D(#43,#2);#43=IFCCARTESIANPOINT((10.,0.));`;
        const g=await geometry(step);bounds(g,[0,-2,-1,10,2,1]);g.dispose();
        expect(await geometry(step.replace('(10.,0.)','(10.,1.)'))).toBe(null);
        expect(await geometry(step.replace('((#5,#41),.F.,#6,$)','((#5),.F.,#6,$)'))).toBe(null);
    });
    it('arbitrary profile holes retain inner walls and open end-cap holes',async()=>{
        const g=await geometry(base.replace('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.)','IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#31,(#33))')+`
#30=IFCCARTESIANPOINTLIST2D(((-1.,-2.),(1.,-2.),(1.,2.),(-1.,2.)),$);
#31=IFCINDEXEDPOLYCURVE(#30,(IFCLINEINDEX((1,2,3,4,1))),.F.);
#32=IFCCARTESIANPOINTLIST2D(((-0.5,-1.),(0.5,-1.),(0.5,1.),(-0.5,1.)),$);
#33=IFCINDEXEDPOLYCURVE(#32,(IFCLINEINDEX((1,2,3,4,1))),.F.);`);
        close(volume(g),60);expect(g.index.count/3).toBe(32);g.dispose();
    });
    it('hollow circle has polygonal tube volume',async()=>{
        const g=await geometry(base.replace('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.)','IFCCIRCLEHOLLOWPROFILEDEF(.AREA.,$,$,2.,0.5)'));
        close(volume(g),320*Math.sin(Math.PI/32)*(4-2.25),1e-4);g.dispose();
    });
    it('floating origin preserves millimetres at georeferenced coordinates',async()=>{
        const g=await geometry(base.replace('(0.,0.,0.)','(1000000000.,2000000000.,3000000000.)').replace('(0.,0.,10.)','(1000000000.,2000000000.,3000000010.)').replace('2.,4.)','0.002,0.004)'));
        close(g.boundingBox.max.x-g.boundingBox.min.x,0.002,1e-6);close(g.boundingBox.max.y-g.boundingBox.min.y,0.004,1e-6);
        expect(g.userData.localOrigin[0]).toBe(1e9);g.dispose();
    });
    for(const [name,step] of [
        ['parallel reference',base.replace('(1.,0.,0.)','(0.,0.,1.)')],
        ['zero reference',base.replace('(1.,0.,0.)','(0.,0.,0.)')],
        ['non-tangent polyline',base.replace('IFCPOLYLINE((#1,#2))','IFCPOLYLINE((#1,#5,#2))')+'#5=IFCCARTESIANPOINT((1.,0.,5.));'],
        ['reversed trims',base.replace('#4,$,$,#3','#4,0.8,0.2,#3')],
        ['out-of-range trim',base.replace('#4,$,$,#3','#4,0.,2.,#3')],
        ['malformed trim',base.replace('#4,$,$,#3','#4,0.xyz,1.,#3')],
        ['missing reference',base.replace('#10,$,#4','#99,$,#4')],
        ['nonfinite point',base.replace('(0.,0.,0.)','(1.E999,0.,0.)')],
        ['unknown profile',base.replace('IFCRECTANGLEPROFILEDEF','IFCUNSUPPORTEDPROFILE')],
        ['unsupported cant curve',alignment.replace('IFCCOMPOSITECURVE((#5),.F.)','IFCSEGMENTEDREFERENCECURVE((#5),.F.,#6,$)')],
        ['ambiguous alignment parameter',alignment.replace('#6,$,$,#9','#6,0.,1.,#9')],
        ['cyclic composite',base.replace('IFCPOLYLINE((#1,#2))','IFCCOMPOSITECURVE((#30),.F.)')+'#30=IFCCOMPOSITECURVESEGMENT(.DISCONTINUOUS.,.T.,#4);']
    ]) it(`returns null for ${name}`,async()=>{expect(await geometry(step)).toBe(null);});

    const terrain=`#1=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(2.,0.,0.),(0.,2.,1.),(2.,2.,1.)),$);
#20=IFCTRIANGULATEDIRREGULARNETWORK(#1,$,.F.,((1,2,3),(2,4,3)),$,(0,7));`;
    it('TIN delegates visible faces and computes bounds/normals',async()=>{
        const g=await geometry(terrain,'tin');bounds(g,[0,0,0,2,2,1]);expect(g.index.count/3).toBe(2);
        expect(g.attributes.normal.array.every(Number.isFinite)).toBe(true);g.dispose();
    });
    it('TIN hides all negative flags and excludes unused coordinates from bbox',async()=>{
        const g=await geometry(terrain.replace('(2.,2.,1.)','(100.,100.,100.)').replace('(0,7)','(0,-2)'),'tin');
        bounds(g,[0,0,0,2,2,1]);expect(g.index.count/3).toBe(1);g.dispose();
        expect(await geometry(terrain.replace('(0,7)','(-1,-42)'),'tin')).toBe(null);
    });
    it('TIN respects PnIndex before delegating to the face-set converter',async()=>{
        const g=await geometry(terrain.replace('((1,2,3),(2,4,3)),$,(0,7)','((1,2,3)),(2,4,3),(0)'),'tin');
        bounds(g,[0,0,0,2,2,1]);expect(g.index.count/3).toBe(1);
        const pos=g.attributes.position,o=g.userData.localOrigin;
        expect(Array.from({length:pos.count},(_,i)=>Math.abs(pos.getX(i)+o[0]-2)<1e-6 && Math.abs(pos.getY(i)+o[1]-2)<1e-6).some(Boolean)).toBe(true);
        g.dispose();
    });
    it('TIN preserves large coordinates with localOrigin',async()=>{
        const g=await geometry(terrain.replace('(0.,0.,0.),(2.,0.,0.),(0.,2.,1.),(2.,2.,1.)','(1.E9,2.E9,3.E9),(1000000000.002,2.E9,3.E9),(1.E9,2000000000.002,3000000000.001),(1000000000.002,2000000000.002,3000000000.001)'),'tin');
        close(g.boundingBox.max.x-g.boundingBox.min.x,0.002,1e-6);g.dispose();
    });
    it('TIN rejects malformed indices, flags, closed surfaces and NaN',async()=>{
        for(const step of [terrain.replace('(0,7)','(0)'),terrain.replace('(1,2,3)','(0,2,3)'),terrain.replace('(1,2,3)','(1,2,99)'),
            terrain.replace('(1,2,3)','(1,1,3)'),terrain.replace('.F.','.T.'),terrain.replace('(0.,0.,0.)','(1.E999,0.,0.)'),terrain.replace('(0,7)','(0,0.5)')]) {
            expect(await geometry(step,'tin')).toBe(null);
        }
    });
    it('both exports reject absent entities and unrelated entity types',async()=>{
        expect(await geometry(base,'sweep',999)).toBe(null);expect(await geometry(base,'tin')).toBe(null);expect(await geometry(terrain)).toBe(null);
    });
});
