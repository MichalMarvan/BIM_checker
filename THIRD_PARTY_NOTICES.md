# Third-party notices

This project is licensed under AGPL-3.0-or-later. The following separately licensed libraries are distributed with or bundled into the web application. Their upstream copyright and license terms remain in force.

| Component | Version | License | Use |
|---|---:|---|---|
| SheetJS `xlsx` | vendored snapshot | Apache-2.0 | IDS Excel import/export |
| `xmllint-wasm` | vendored snapshot | MIT / LGPL-3.0 | IDS XSD validation |
| Three.js | vendored snapshot | MIT | 3D rendering |
| `three-mesh-bvh` | vendored snapshot | MIT | 3D spatial acceleration |
| `proj4` | 2.11.0 | MIT | CRS transformations |
| JSZip | 3.10.1 | MIT OR GPL-3.0-or-later | ZIP exports |
| GeoTIFF.js | 2.1.3 | MIT | Terrain raster import |
| html2canvas | 1.4.1 | MIT | Screenshot composition |
| `@tarikjabiri/dxf` | 2.6.2 | MIT | DXF export |
| jsPDF | 4.2.1 | MIT | PDF export |
| Transformers.js (`@huggingface/transformers`) | 4.2.0 browser distribution | Apache-2.0 | Optional local RAG inference |
| ONNX Runtime Web | 1.26.0-dev.20260416-b7804b056c | MIT | WebAssembly inference runtime |

The optional `Xenova/all-MiniLM-L6-v2` model is downloaded from Hugging Face only when semantic search is first used and is cached by the browser. Model metadata and license are provided by its upstream repository.

Exact npm dependency versions are recorded in `package-lock.json`; `npm run sbom` produces the machine-readable CycloneDX inventory in `sbom.cdx.json`. Full license texts are available in the corresponding npm packages and upstream repositories.
