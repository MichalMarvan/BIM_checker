// Module worker for worker-smoke.mjs: imports the real geometry core (and
// through it three.module.js by relative path) and reports what works here.
import { buildEntityGeometry } from '../../assets/js/3d/ifc-engine/geometry/geometry-core.js';
import { indexStepBytes } from '../../assets/js/3d/ifc-engine/parser/byte-lexer.js';
import { EntityIndex } from '../../assets/js/3d/ifc-engine/parser/entity-index.js';

const SAMPLE = `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCCARTESIANPOINT((0.,0.,0.));\n#2=IFCDIRECTION((0.,0.,1.));\n#3=IFCAXIS2PLACEMENT3D(#1,#2,$);\n#4=IFCLOCALPLACEMENT($,#3);\n#5=IFCRECTANGLEPROFILEDEF(.AREA.,$,#6,1.,2.);\n#6=IFCAXIS2PLACEMENT2D(#7,$);\n#7=IFCCARTESIANPOINT((0.,0.));\n#8=IFCEXTRUDEDAREASOLID(#5,#3,#2,3.);\n#9=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#8));\n#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#9));\n#11=IFCWALL('2abcdefghijklmnopqrstu',$,'Zeď ''ž''',$,$,#4,#10,$,$);\n#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#3,$);\nENDSEC;\nEND-ISO-10303-21;`;

self.onmessage = (e) => {
  const out = { ok: true, checks: {} };
  try {
    out.checks.buildEntityGeometry = typeof buildEntityGeometry;
    const plain = new TextEncoder().encode(SAMPLE);
    out.checks.sabAvailable = typeof SharedArrayBuffer === 'function';
    out.checks.crossOriginIsolated = self.crossOriginIsolated === true;
    let bytes = plain;
    if (e.data && e.data.sab) {
      bytes = new Uint8Array(e.data.sab);
    } else if (out.checks.sabAvailable && out.checks.crossOriginIsolated) {
      const sab = new SharedArrayBuffer(plain.byteLength);
      bytes = new Uint8Array(sab);
      bytes.set(plain);
    }
    out.checks.bytesShared = bytes.buffer instanceof (self.SharedArrayBuffer || function () {});
    try {
      out.checks.textDecoderOnSab = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(0, 12));
    } catch (err) {
      out.checks.textDecoderOnSab = `ERROR: ${err.message}`;
    }
    try {
      out.checks.fromCharCodeOnSab = String.fromCharCode.apply(null, bytes.subarray(0, 12));
    } catch (err) {
      out.checks.fromCharCodeOnSab = `ERROR: ${err.message}`;
    }
    out.checks.indexOfOnSab = bytes.indexOf(68);
    const index = indexStepBytes(bytes, { shared: out.checks.bytesShared });
    out.checks.count = index.count;
    out.checks.idsShared = index.ids.buffer instanceof (self.SharedArrayBuffer || function () {});
    const ei = new EntityIndex(index);
    out.checks.name = ei.byExpressId(11).params.slice(0, 40);
    const r = buildEntityGeometry(ei, 11);
    out.checks.items = r ? r.items.length : -1;
    out.checks.positions = r && r.items[0] ? r.items[0].bufferGeometry.getAttribute('position').count : -1;
    out.checks.matrixIsArray16 = r ? r.matrix.elements.length : -1;
  } catch (err) {
    out.ok = false;
    out.error = `${err.message}\n${err.stack}`;
  }
  self.postMessage(out);
};
