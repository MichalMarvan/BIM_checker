// Phase 6.15.2 — LandXML Surface (TIN) parser.
//
// LandXML structure for terrain surfaces:
//   <Surfaces>
//     <Surface name="...">
//       <Definition surfType="TIN">
//         <Pnts>
//           <P id="1">north east elev</P>     // Note: LandXML order = N E Z
//           <P id="2">...</P>
//         </Pnts>
//         <Faces>
//           <F>1 2 3</F>                       // 1-based vertex IDs
//           <F>2 3 4</F>
//         </Faces>
//       </Definition>
//     </Surface>
//   </Surfaces>
//
// Output: TerrainData = { vertices: [{x,y,z}], triangles: [[i0,i1,i2]] }
// Coordinates are in the LandXML CRS (caller is responsible for matching it
// to model CRS — typically same).
//
// IMPORTANT: <P> uses "north east elev" order per LandXML spec, but XYZ in
// our viewer = (E, N, Z). We return {x: E, y: N, z: elev}.

function parseFloats(text) {
  return text.trim().split(/\s+/).map(parseFloat).filter(Number.isFinite);
}

/**
 * Parse LandXML XML text → array of TerrainData (one per <Surface>).
 * @param {string} xmlText
 * @returns {Array<{name: string, vertices: Array<{x,y,z}>, triangles: Array<[number,number,number]>}>}
 */
export function parseLandXmlSurfaces(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Neplatný LandXML (XML parse error)');
  }
  const surfaces = doc.getElementsByTagName('Surface');
  const result = [];
  for (const surf of surfaces) {
    const name = surf.getAttribute('name') || `Surface_${result.length + 1}`;
    const def = surf.getElementsByTagName('Definition')[0];
    if (!def) continue;
    const surfType = def.getAttribute('surfType');
    if (surfType && surfType !== 'TIN') continue;  // skip grid surfaces (separate format)

    const pntsEl = def.getElementsByTagName('Pnts')[0];
    const facesEl = def.getElementsByTagName('Faces')[0];
    if (!pntsEl || !facesEl) continue;

    // Parse points — id may be string; we map id → index in array
    const pNodes = pntsEl.getElementsByTagName('P');
    const idToIdx = new Map();
    const vertices = [];
    for (const p of pNodes) {
      const id = p.getAttribute('id');
      const nums = parseFloats(p.textContent);
      if (nums.length < 3 || !id) continue;
      // LandXML order: north east elev → our XYZ = (east, north, elev)
      vertices.push({ x: nums[1], y: nums[0], z: nums[2] });
      idToIdx.set(id, vertices.length - 1);
    }

    // Parse faces — F may have 3 (triangle) or 4 (quad — split into 2 triangles)
    const triangles = [];
    const fNodes = facesEl.getElementsByTagName('F');
    for (const f of fNodes) {
      const ids = f.textContent.trim().split(/\s+/);
      // Skip <F i="1"> (i=1 = invisible boundary face per LandXML spec)
      if (f.getAttribute('i') === '1') continue;
      const idx = ids.map(id => idToIdx.get(id));
      if (idx.some(i => i == null)) continue;
      if (idx.length === 3) {
        triangles.push([idx[0], idx[1], idx[2]]);
      } else if (idx.length === 4) {
        triangles.push([idx[0], idx[1], idx[2]]);
        triangles.push([idx[0], idx[2], idx[3]]);
      }
    }

    if (vertices.length > 0 && triangles.length > 0) {
      result.push({ name, vertices, triangles });
    }
  }
  return result;
}

/**
 * Compute bbox of TerrainData in alignment frame (XY).
 * @returns {{minX, minY, maxX, maxY, minZ, maxZ}}
 */
export function terrainBbox(terrain) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of terrain.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}
