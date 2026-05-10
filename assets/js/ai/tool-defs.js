/**
 * Tool definitions for AI function calling.
 * 29 tools spanning storage, validator workflow, IDS specs,
 * IFC content queries, UI navigation, settings, and agent management.
 */

export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'list_storage_files',
            description: 'Vypíše všechny soubory v IndexedDB úložišti pro daný typ. Volitelně lze filtrovat podle složky (substring match cesty). Bez `folder` vrátí všechny soubory.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'], description: 'Typ souborů' },
                    folder: { type: 'string', description: 'Volitelný filtr — jméno nebo část cesty složky. Vrátí soubory ze složky a všech podsložek.' }
                },
                required: ['type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_storage_folders',
            description: 'Vrátí seznam složek v úložišti spolu s jejich přímými soubory. Použij když uživatel mluví o složce a chceš vědět, které soubory v ní jsou.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] }
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
    },
    {
        type: 'function',
        function: {
            name: 'get_theme',
            description: 'Vrátí aktuální barevné téma (light/dark).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_theme',
            description: 'Přepne barevné téma. Bere efekt okamžitě.',
            parameters: {
                type: 'object',
                properties: { theme: { type: 'string', enum: ['light', 'dark'] } },
                required: ['theme']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_language',
            description: 'Vrátí aktuální jazyk UI (cs/en).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_language',
            description: 'Přepne jazyk UI. Spustí re-render textů.',
            parameters: {
                type: 'object',
                properties: { lang: { type: 'string', enum: ['cs', 'en'] } },
                required: ['lang']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'start_wizard',
            description: 'Spustí onboarding průvodce. Funguje jen na podstránkách (validator/parser/viewer), ne na homepage.',
            parameters: {
                type: 'object',
                properties: {
                    page: { type: 'string', enum: ['validator', 'parser', 'viewer'], description: 'Volitelné — který set kroků použít. Pokud nezadáno, použije se aktuální stránka.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'dismiss_wizard',
            description: 'Zavře aktivního průvodce.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'install_pwa',
            description: 'Spustí browser dialog pro instalaci PWA. Pokud browser instalační prompt nemá k dispozici, vrátí available:false.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'open_bug_report',
            description: 'Otevře dialog hlášení chyby. Volitelně předvyplní popis.',
            parameters: {
                type: 'object',
                properties: {
                    description: { type: 'string', description: 'Předvyplněný text popisu.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_agents',
            description: 'Vrátí seznam všech AI agentů (bez API klíčů).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_active_agent',
            description: 'Vrátí informace o aktuálně běžícím agentovi (tom, co řídí tento chat).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_agent',
            description: 'Vytvoří nového AI agenta. Vyžaduje API klíč. Pokud agent stejného jména už existuje, vrátí duplicate_name s existingId — použij update_agent místo dalšího create.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    provider: { type: 'string', description: 'openai | anthropic | google | mistral | groq | other' },
                    model: { type: 'string' },
                    apiKey: { type: 'string' },
                    systemPrompt: { type: 'string' },
                    temperature: { type: 'number', minimum: 0, maximum: 2 },
                    icon: { type: 'string' },
                    baseUrl: { type: 'string' }
                },
                required: ['name', 'provider', 'model', 'apiKey']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_agent',
            description: 'Upraví existujícího agenta. Identifikuj přes id NEBO name (jméno musí být unikátní). Pro rename volej s `id` a novým `name`. NESMÍ se použít na aktuálně běžícího agenta — vrátí cannot_modify_active.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Identifikátor agenta. Pokud je vyplněn, hodnota name se interpretuje jako přejmenování.' },
                    name: { type: 'string', description: 'Bez id slouží jako vyhledávací klíč. S id znamená nové jméno.' },
                    icon: { type: 'string' },
                    provider: { type: 'string' },
                    model: { type: 'string' },
                    apiKey: { type: 'string' },
                    systemPrompt: { type: 'string' },
                    temperature: { type: 'number', minimum: 0, maximum: 2 },
                    baseUrl: { type: 'string' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_agent',
            description: 'Smaže agenta podle id NEBO name (jméno musí být unikátní). Před smazáním otevře potvrzovací dialog. Nemůže smazat aktuálně běžícího agenta ani posledního zbývajícího.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                }
            }
        }
    }
];

export function getToolsForAgent(/* agent */) {
    return TOOL_DEFINITIONS;
}
