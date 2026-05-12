// Phase 6.13.1 — RAG embedder using transformers.js (browser-side, no backend).
//
// Model: Xenova/all-MiniLM-L6-v2 — sentence transformer producing 384-dim
// L2-normalized vectors. Optimized for semantic similarity. ~80 MB ONNX
// model file, cached by browser (Cache API + IndexedDB) after first load.
//
// Privacy: ALL processing stays on user's device. No data sent to any
// server. Model weights downloaded once from HuggingFace CDN.

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBED_DIM = 384;

let _pipelinePromise = null;
let _loadProgress = { loaded: 0, total: 0, status: 'idle' };
const _progressListeners = new Set();

function notifyProgress(state) {
  _loadProgress = { ..._loadProgress, ...state };
  for (const cb of _progressListeners) {
    try { cb(_loadProgress); } catch {}
  }
}

/** Subscribe to model load progress updates. Returns unsubscribe fn. */
export function onLoadProgress(cb) {
  _progressListeners.add(cb);
  cb(_loadProgress);
  return () => _progressListeners.delete(cb);
}

export function getLoadProgress() {
  return { ..._loadProgress };
}

async function loadPipeline() {
  if (!_pipelinePromise) {
    notifyProgress({ status: 'loading-lib' });
    _pipelinePromise = (async () => {
      // Lazy import — only fetched when RAG is first used
      const { pipeline, env } = await import('https://esm.sh/@xenova/transformers@2.17.2');
      // Allow remote model fetch (HuggingFace CDN)
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      // Cache will use Browser Cache API automatically
      notifyProgress({ status: 'loading-model' });
      const pipe = await pipeline('feature-extraction', MODEL_NAME, {
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.total) {
            notifyProgress({
              status: 'loading-model',
              loaded: progress.loaded || 0,
              total: progress.total,
              file: progress.file,
            });
          } else if (progress.status === 'done') {
            notifyProgress({ status: 'ready' });
          }
        },
      });
      notifyProgress({ status: 'ready' });
      return pipe;
    })();
  }
  return _pipelinePromise;
}

/**
 * Embed a single text string into a 384-dim vector.
 * @param {string} text
 * @returns {Promise<Float32Array>} L2-normalized vector
 */
export async function embed(text) {
  const pipe = await loadPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  // output.data is a Float32Array of length 384
  return new Float32Array(output.data);
}

/**
 * Embed a batch of texts. More efficient than embedding one at a time.
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
export async function embedBatch(texts) {
  // transformers.js doesn't expose batch easily; loop with progress is fine
  // for our scale (typically <1000 entities per model)
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    out.push(await embed(texts[i]));
  }
  return out;
}

export const EMBEDDING_DIM = EMBED_DIM;

/** Cosine similarity between two L2-normalized vectors (= dot product). */
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
