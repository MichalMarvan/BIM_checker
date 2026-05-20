// 3D-specific AI tool definitions for OpenAI function-calling.
//
// These tools wrap the IfcEngine 3D viewer API. AI agents (in BIM_checker or
// other host apps) import this catalog and pass to their LLM as `tools` parameter.
// The executor (./tool-executor.js) maps tool calls to engine method calls.
//
// Style matches BIM_checker/assets/js/ai/tool-defs.js — Czech descriptions,
// OpenAI function-calling JSON format.

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_loaded_models',
      description: 'Vrátí seznam načtených IFC modelů s metadata (modelId, jméno souboru, IFC schéma, počet entit). Použij když uživatel chce vědět co je aktuálně načteno nebo když potřebuješ modelId pro další volání.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_entities',
      description: 'Najde entity v 3D scéně podle IFC typu (např. IFCWALL, IFCSLAB). Bez typu vrátí všechny produktové entity (zdi, slaby, sloupy, atd.) napříč všemi modely. Volitelně omez na jeden model přes modelId.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'IFC typ entity (např. IFCWALL, IFCDOOR). Bez tohoto parametru vrátí všechny produktové entity.' },
          modelId: { type: 'string', description: 'Volitelný — omezí hledání na jeden model. Bez tohoto hledá napříč federací.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_properties',
      description: 'Vrátí všechny PropertySety a atributy jedné entity (název, GUID, kategorie + Pset_X obsahy). Použij když uživatel chce vidět detaily konkrétního objektu nebo ověřit hodnotu property.',
      parameters: {
        type: 'object',
        properties: {
          modelId: { type: 'string', description: 'ID modelu, kde entita leží (z list_loaded_models nebo search_entities).' },
          expressId: { type: 'integer', description: 'Express ID entity (z search_entities).' },
        },
        required: ['modelId', 'expressId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'highlight_entities',
      description: 'Zvýrazní jednu nebo více entit ve 3D scéně barvou. Použij k vizuálnímu ukázání výsledku hledání nebo zvýraznění problémových entit. Předchozí highlights se přepíšou (volitelně volej clear_highlights nejdřív).',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Pole entit k zvýraznění. Každá obsahuje modelId + expressId + volitelnou color (CSS název nebo hex jako string).',
            items: {
              type: 'object',
              properties: {
                modelId: { type: 'string' },
                expressId: { type: 'integer' },
                color: { type: 'string', description: 'CSS color name nebo hex (např. "red", "#ff0000"). Volitelné — bez něj použije defaultColor.' },
              },
              required: ['modelId', 'expressId'],
            },
          },
          defaultColor: { type: 'string', description: 'Výchozí barva pro entity bez explicit color. Default = žlutá (#facc15).' },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_highlights',
      description: 'Smaže všechna zvýraznění a obnoví původní barvy entit. Použij před novým highlight_entities nebo když uživatel chce "vyčistit scénu".',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'focus_entity',
      description: 'Přesune kameru tak aby viděla jednu konkrétní entitu (fit-to-bbox). Použij když uživatel chce "podívat se na" nebo "najít" konkrétní objekt ve scéně.',
      parameters: {
        type: 'object',
        properties: {
          modelId: { type: 'string' },
          expressId: { type: 'integer' },
        },
        required: ['modelId', 'expressId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_model_coords',
      description: 'Vrátí geo-reference data modelu (IfcSite RefLat/Lon, IfcMapConversion eastings/northings, IfcProjectedCRS název) plus bboxCenter. Užitečné pro federation diagnostics nebo zobrazení polohy modelu uživateli.',
      parameters: {
        type: 'object',
        properties: {
          modelId: { type: 'string' },
        },
        required: ['modelId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'semantic_search',
      description: 'Phase 6.13 RAG. Sémanticky vyhledá entity v IFC modelu pomocí dotazu v přirozeném jazyce (CZ nebo EN). Funguje na lokálních embeddings (transformers.js, MiniLM-L6-v2). Pro otázky typu "find walls thicker than 200mm on storey 2", "co je v té místnosti za HVAC", "find all railings", "co se liší od standardu". Vrací top-k nejrelevantnějších entit/storey/model summaries s skóre. Auto-indexuje při prvním použití (~30s download modelu, pak instant z cache). Returns: [{ chunk: { modelId, level, refExpressId, ifcType, name, text }, score }]',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Otázka nebo popis hledané entity' },
          modelId: { type: 'string', description: 'Volitelně omez na 1 model' },
          level: { type: 'string', enum: ['entity', 'storey', 'model'], description: 'Volitelně filtruj level chunků' },
          k: { type: 'integer', description: 'Top-k výsledků (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_georeference',
      description: 'Vrátí kompletní geo-referenční info modelu + diagnózu LoGeoRef úrovně (10/20/30/40/50). Pokud modelId chybí, použije první načtený model. Returns: { modelId, modelName, loGeoRef: "50 (full)" | "20 (site only)" | "<20 (local)", refLat, refLon, refElevation, projectedCRS: { name, datum, verticalDatum, projection, zone }, mapConversion: { eastings, northings, orthogonalHeight, rotationDeg, scale }, bboxCenter }. Pro otázky typu "kde je tato stavba?", "jaký používá souřadnicový systém?", "v jaké nadmořské výšce?".',
      parameters: {
        type: 'object',
        properties: {
          modelId: { type: 'string', description: 'Volitelně — bez něj použije první model.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_types',
      description: 'Vrátí mapu IFC typů a počty entit v daném modelu (nebo napříč federací). Použij k zjištění co model obsahuje, ještě před search_entities.',
      parameters: {
        type: 'object',
        properties: {
          modelId: { type: 'string', description: 'Volitelně omez na jeden model.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'filter_by_property',
      description: 'Najde entity podle hodnoty PropertySetu. Operátory: eq, ne, contains, gt, lt, gte, lte, exists, notExists. Příklad: { pset: "Pset_WallCommon", property: "FireRating", op: "eq", value: "REI 60" }.',
      parameters: {
        type: 'object',
        properties: {
          pset: { type: 'string', description: 'Název PropertySetu (např. Pset_WallCommon).' },
          property: { type: 'string', description: 'Název property uvnitř PSetu.' },
          op: { type: 'string', enum: ['eq', 'ne', 'contains', 'gt', 'lt', 'gte', 'lte', 'exists', 'notExists'], description: 'Operátor porovnání.' },
          value: { description: 'Hodnota k porovnání (string nebo number).' },
          entityType: { type: 'string', description: 'Volitelně — omez na IFC typ (např. IFCWALL).' },
          modelId: { type: 'string', description: 'Volitelně — jen jeden model.' },
        },
        required: ['property', 'op'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_section_plane',
      description: 'Vytvoří řez modelem. Specifikuj bod a normálu roviny. Pro osu Z: point=[0,0,h], normal=[0,0,1]. Vrátí planeId pro pozdější update/remove.',
      parameters: {
        type: 'object',
        properties: {
          point: { type: 'array', items: { type: 'number' }, description: 'Bod na rovině [x,y,z].' },
          normal: { type: 'array', items: { type: 'number' }, description: 'Normálový vektor [x,y,z].' },
        },
        required: ['point', 'normal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_section',
      description: 'Smaže všechny řezové roviny a obnoví neořezané zobrazení modelu.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'measure_distance',
      description: 'Změří vzdálenost mezi dvěma 3D body. Vrátí { value, unit } v metrech.',
      parameters: {
        type: 'object',
        properties: {
          p1: { type: 'array', items: { type: 'number' }, description: '[x,y,z]' },
          p2: { type: 'array', items: { type: 'number' }, description: '[x,y,z]' },
        },
        required: ['p1', 'p2'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_ids_validation',
      description: 'Spustí IDS validaci proti uživatelem nahranému IDS XML v UI panelu. Vrátí { pass, fail, specifications: [...] }. Uživatel musí mít IDS XML načtený přes IDS panel.',
      parameters: {
        type: 'object',
        properties: {
          failuresOnly: { type: 'boolean', description: 'Vrátí jen failed checks.' },
          limit: { type: 'integer', description: 'Max počet záznamů.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detect_clashes',
      description: 'Detekuje kolize mezi objekty modelu. Vrací seznam kolizí (hard / clearance / duplicate).',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['bbox', 'mesh'], description: 'Metoda: rychlé bbox vs přesné mesh-BVH.' },
          clearanceMm: { type: 'number', description: 'Tolerance pro clearance (mm).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_model_stats',
      description: 'Vrátí celkové statistiky všech načtených modelů: počet modelů, entit, typů.',
      parameters: { type: 'object', properties: {} },
    },
  },
];
