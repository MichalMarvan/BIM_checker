// Phase 6.5.2 — Screenshot capture (canvas → Blob).
//
// Modes:
//   captureCanvas(viewer, { scale, watermark })
//     - scale: 1 | 2 | 4 (renders at scale × current canvas size)
//     - watermark: { modelName?, viewpoint?, date? } or null
//     - Re-renders Three.js scene at higher resolution by temporarily
//       resizing renderer; restores after read-back.
//
// Returns Blob (image/png) by default.

import * as THREE from 'three';

export async function captureCanvas(viewer, opts = {}) {
  const scale = opts.scale && [1, 2, 4].includes(opts.scale) ? opts.scale : 1;
  const format = opts.format || 'image/png';
  const quality = opts.quality ?? 0.95;

  const renderer = viewer._renderer;
  const camera = viewer._camera;
  const scene = viewer._scene;

  const origSize = new THREE.Vector2();
  renderer.getSize(origSize);
  const origPixelRatio = renderer.getPixelRatio();

  if (scale !== 1) {
    renderer.setPixelRatio(1);
    renderer.setSize(origSize.x * scale, origSize.y * scale, false);
    if (camera.isPerspectiveCamera) {
      camera.aspect = (origSize.x * scale) / (origSize.y * scale);
      camera.updateProjectionMatrix();
    }
  }

  // Force one render — copy pixels into an offscreen canvas IMMEDIATELY so
  // the next animation-frame render-loop clear (preserveDrawingBuffer:false)
  // doesn't wipe the buffer before async toBlob completes.
  renderer.render(scene, camera);
  const offscreen = document.createElement('canvas');
  offscreen.width = renderer.domElement.width;
  offscreen.height = renderer.domElement.height;
  offscreen.getContext('2d').drawImage(renderer.domElement, 0, 0);

  let outputCanvas = offscreen;
  if (opts.watermark) {
    outputCanvas = drawWatermark(offscreen, opts.watermark);
  }

  const blob = await new Promise((resolve, reject) => {
    outputCanvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), format, quality);
  });

  // Restore renderer size
  if (scale !== 1) {
    renderer.setPixelRatio(origPixelRatio);
    renderer.setSize(origSize.x, origSize.y, false);
    if (camera.isPerspectiveCamera) {
      camera.aspect = origSize.x / origSize.y;
      camera.updateProjectionMatrix();
    }
  }

  return blob;
}

function drawWatermark(sourceCanvas, watermark) {
  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  // Watermark in bottom-left corner
  const padding = Math.round(out.width * 0.014);
  const fontSize = Math.round(out.width * 0.018);
  const lineHeight = fontSize * 1.3;

  const lines = [];
  if (watermark.modelName) lines.push(watermark.modelName);
  if (watermark.viewpoint) lines.push(`Pohled: ${watermark.viewpoint}`);
  if (watermark.date !== false) lines.push(watermark.date || new Date().toLocaleString('cs-CZ'));

  if (lines.length === 0) return out;

  // Background pill
  ctx.font = `${fontSize}px sans-serif`;
  const widths = lines.map(l => ctx.measureText(l).width);
  const maxW = Math.max(...widths);
  const boxW = maxW + padding * 2;
  const boxH = lineHeight * lines.length + padding;
  const x = padding;
  const y = out.height - boxH - padding;

  ctx.fillStyle = 'rgba(15,23,42,0.78)';
  roundRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + padding, y + padding * 0.5 + i * lineHeight);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

let _html2canvasPromise = null;
function loadHtml2Canvas() {
  if (!_html2canvasPromise) {
    _html2canvasPromise = import('https://esm.sh/html2canvas@1.4.1').then(m => m.default || m);
  }
  return _html2canvasPromise;
}

export async function captureViewport(element, opts = {}) {
  const html2canvas = await loadHtml2Canvas();
  const scale = opts.scale && [1, 2, 4].includes(opts.scale) ? opts.scale : 1;
  const canvas = await html2canvas(element, {
    backgroundColor: opts.backgroundColor ?? null,
    scale,
    useCORS: true,
    logging: false,
  });
  const format = opts.format || 'image/png';
  const quality = opts.quality ?? 0.95;
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), format, quality);
  });
}
