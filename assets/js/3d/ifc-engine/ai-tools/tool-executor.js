// Tool executor — maps OpenAI function-call invocations to IfcEngine methods.
//
// Usage:
//   const executor = createExecutor(engine);
//   const result = await executor.executeTool('search_entities', { type: 'IFCWALL' });
//   // → { ok: true, data: [{ modelId, expressId, ifcType }, ...] }
//
// All handlers return { ok: true, data } or { ok: false, error: string }.
// Never throws — AI loop always gets a JSON-stringifiable response.

import * as THREE from 'three';
import { TOOL_DEFINITIONS } from './tool-defs.js';

/**
 * Validate that all required arguments are present.
 * @returns {string | null} error message or null if OK
 */
function validateRequired(args, required) {
  if (!required || required.length === 0) return null;
  for (const key of required) {
    if (args[key] === undefined || args[key] === null) {
      return `missing required argument: ${key}`;
    }
  }
  return null;
}

/**
 * Find tool definition by name.
 */
function findToolDef(name) {
  return TOOL_DEFINITIONS.find(td => td.function.name === name) || null;
}

/**
 * Build executor bound to a specific IfcEngine instance.
 * @param {IfcEngine} engine
 * @returns {{ executeTool: (name, args) => Promise<{ok, data?, error?}>, listTools: () => string[] }}
 */
export function createExecutor(engine) {
  const handlers = {
    list_loaded_models: async () => {
      const models = engine.getModels();
      return { ok: true, data: models };
    },

    search_entities: async (args) => {
      const hits = engine.search({ type: args.type, modelId: args.modelId });
      const data = hits.map(({ modelId, expressId }) => {
        const meta = engine.getEntityMeta(modelId, expressId);
        return meta || { modelId, expressId, ifcType: null, name: null, guid: null };
      });
      return { ok: true, data };
    },

    get_entity_properties: async (args) => {
      const props = engine.getProperties(args.modelId, args.expressId);
      if (!props) return { ok: false, error: `entity not found: model=${args.modelId} id=${args.expressId}` };
      return { ok: true, data: props };
    },

    highlight_entities: async (args) => {
      // Convert CSS color strings ('red', '#ff0000') to hex int via THREE.Color.
      // Default color (Phase 4: 0xfacc15 yellow) preserved as-is unless overridden.
      const parseColor = (c) => {
        if (c == null) return undefined;
        if (typeof c === 'number') return c;
        try { return new THREE.Color(c).getHex(); } catch { return undefined; }
      };
      const items = args.items.map(it => ({
        ...it,
        color: parseColor(it.color),
      }));
      const defaultColor = parseColor(args.defaultColor);
      engine.highlight(items, defaultColor);
      return { ok: true, data: { highlighted: args.items.length } };
    },

    clear_highlights: async () => {
      engine.clearHighlights();
      return { ok: true, data: { cleared: true } };
    },

    focus_entity: async (args) => {
      engine.focusEntity(args.modelId, args.expressId);
      return { ok: true, data: { focused: true } };
    },

    get_model_coords: async (args) => {
      const coords = engine.getCoords(args.modelId);
      if (!coords) return { ok: false, error: `model not found: ${args.modelId}` };
      return { ok: true, data: coords };
    },

    semantic_search: async (args) => {
      try {
        const results = await engine.semanticSearch(args.query, {
          modelId: args.modelId,
          level: args.level,
          k: args.k || 10,
        });
        return {
          ok: true,
          data: {
            count: results.length,
            results: results.map(r => ({
              modelId: r.chunk.modelId,
              level: r.chunk.level,
              expressId: r.chunk.refExpressId,
              ifcType: r.chunk.ifcType,
              name: r.chunk.name,
              text: r.chunk.text,
              score: Number(r.score.toFixed(4)),
            })),
          },
        };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    get_georeference: async (args) => {
      // Default to first model if modelId not provided
      let modelId = args.modelId;
      let modelName = null;
      const models = engine.getModels();
      if (!modelId) {
        if (models.length === 0) return { ok: false, error: 'No models loaded.' };
        modelId = models[0].modelId;
        modelName = models[0].name;
      } else {
        modelName = models.find(m => m.modelId === modelId)?.name || null;
      }
      const coords = engine.getCoords(modelId);
      if (!coords) return { ok: false, error: `model not found: ${modelId}` };
      // Diagnose LoGeoRef level
      let loGeoRef;
      if (coords.projectedCRS && coords.mapConversion) loGeoRef = '50 (full georeference)';
      else if (coords.refLat != null && coords.refLon != null) loGeoRef = '20 (site reference point only)';
      else loGeoRef = '< 20 (local coords only)';
      return { ok: true, data: { modelId, modelName, loGeoRef, ...coords } };
    },
  };

  return {
    executeTool: async (name, args = {}) => {
      const handler = handlers[name];
      if (!handler) return { ok: false, error: `unknown tool: ${name}` };

      const def = findToolDef(name);
      const required = def?.function.parameters.required;
      const validationError = validateRequired(args, required);
      if (validationError) return { ok: false, error: validationError };

      try {
        return await handler(args);
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    },
    listTools: () => Object.keys(handlers),
  };
}

