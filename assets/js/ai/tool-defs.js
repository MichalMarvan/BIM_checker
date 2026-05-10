/**
 * Tool definitions for AI function calling.
 * 15 tools spanning storage, validator workflow, IDS specs,
 * IFC content queries, and UI navigation.
 */

export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'list_storage_files',
            description: 'Vypíše všechny soubory v IndexedDB úložišti pro daný typ.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'], description: 'Typ souborů' }
                },
                required: ['type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_file_from_storage',
            description: 'Smaže soubor z úložiště. Před smazáním se uživatele zeptá přes potvrzovací dialog.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string', description: 'Přesné jméno souboru' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_validation_groups',
            description: 'Vypíše aktuální validační skupiny (z last-session preset).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_validation_group',
            description: 'Přidá novou validační skupinu. Soubory se identifikují podle jména.',
            parameters: {
                type: 'object',
                properties: {
                    ifcFileNames: { type: 'array', items: { type: 'string' }, description: 'Pole jmen IFC souborů' },
                    idsFileName: { type: 'string', description: 'Jméno IDS souboru' }
                },
                required: ['ifcFileNames', 'idsFileName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_validation_group',
            description: 'Smaže validační skupinu podle indexu (od 0). Před smazáním se zeptá uživatele.',
            parameters: {
                type: 'object',
                properties: {
                    index: { type: 'integer', minimum: 0 }
                },
                required: ['index']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_validation',
            description: 'Spustí validaci. Pokud nejsi na Validator stránce, sám tam přepne a po obnovení automaticky spustí validaci (chat panel se zavře). Před voláním se ujisti, že existují validační skupiny (volej add_validation_group).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_validation_results',
            description: 'Vrátí poslední výsledky validace. Funguje pouze na stránce Validator.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_ids_specifications',
            description: 'Vrátí seznam specifikací uvnitř daného IDS souboru.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string', description: 'Jméno IDS souboru v úložišti' }
                },
                required: ['filename']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_ifc_entities',
            description: 'Najde entity v IFC souboru podle IFC typu (např. IFCWALL). Limit 50 entit, vrací počet.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    entityType: { type: 'string', description: 'IFC typ, např. IFCWALL, IFCDOOR' }
                },
                required: ['filename', 'entityType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'count_entities_by_type',
            description: 'Histogram IFC typů v souboru — kolik entit od každého typu.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' }
                },
                required: ['filename']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_ifc_files_with_entity',
            description: 'Pro daný IFC typ najde, ve kterých souborech v úložišti se vyskytuje a kolikrát.',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string' }
                },
                required: ['entityType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_entity_properties',
            description: 'Vrátí všechny PSet (property sets) dané entity podle Express ID.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    expressId: { type: 'integer' }
                },
                required: ['filename', 'expressId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_property_value',
            description: 'Vrátí konkrétní hodnotu vlastnosti z property setu.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    expressId: { type: 'integer' },
                    psetName: { type: 'string' },
                    propertyName: { type: 'string' }
                },
                required: ['filename', 'expressId', 'psetName', 'propertyName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_current_page',
            description: 'Vrátí, na které stránce BIM_checker je uživatel právě teď.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'navigate_to_page',
            description: 'Přepne uživatele na jinou stránku aplikace. POZOR: vyvolá page reload, chat panel se zavře.',
            parameters: {
                type: 'object',
                properties: {
                    page: { type: 'string', enum: ['home', 'validator', 'parser', 'viewer'] }
                },
                required: ['page']
            }
        }
    }
];

export function getToolsForAgent(/* agent */) {
    return TOOL_DEFINITIONS;
}
