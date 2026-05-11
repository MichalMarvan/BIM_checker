/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Tool definitions for AI function calling.
 * 56 tools spanning storage, validator workflow, IDS specs + generation,
 * IFC content queries + analysis, UI navigation, settings, agent management,
 * folder/file ops, presets, validation drilldown, bSDD (gated), and Excel export.
 */

export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'list_storage_files',
            description: 'Lists all files in IndexedDB storage for the given type. Optionally filter by folder (substring match on path). Without `folder` returns all files.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'], description: 'File type' },
                    folder: { type: 'string', description: 'Optional filter — folder name or path fragment. Returns files from the folder and all subfolders.' }
                },
                required: ['type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_storage_folders',
            description: 'Returns a list of folders in storage with their direct files. Use this when the user talks about a folder and you want to know which files are in it.',
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
            description: 'Deletes a file from storage. Asks the user for confirmation before deletion.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string', description: 'Exact file name' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_validation_groups',
            description: 'Lists the current validation groups (from the last-session preset).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_validation_group',
            description: 'Adds a new validation group. Files are identified by name.',
            parameters: {
                type: 'object',
                properties: {
                    ifcFileNames: { type: 'array', items: { type: 'string' }, description: 'Array of IFC file names' },
                    idsFileName: { type: 'string', description: 'IDS file name' }
                },
                required: ['ifcFileNames', 'idsFileName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_validation_group',
            description: 'Deletes a validation group by index (0-based). Asks the user for confirmation before deletion.',
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
            description: 'Runs validation. If not on the Validator page, navigates there automatically and triggers validation after reload (chat panel will close). Before calling, ensure validation groups exist (call add_validation_group).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_validation_results',
            description: 'Returns the latest validation results. Only works on the Validator page.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_ids_specifications',
            description: 'Returns a list of specifications inside the given IDS file.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string', description: 'IDS file name in storage' }
                },
                required: ['filename']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_ifc_entities',
            description: 'Finds entities in an IFC file by IFC type (e.g. IFCWALL). Limit 50 entities, returns count.',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    entityType: { type: 'string', description: 'IFC type, e.g. IFCWALL, IFCDOOR' }
                },
                required: ['filename', 'entityType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'count_entities_by_type',
            description: 'Histogram of IFC types in a file — how many entities of each type.',
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
            description: 'For a given IFC type, finds which files in storage contain it and how many times.',
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
            description: 'Returns all PSets (property sets) for a given entity by Express ID.',
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
            description: 'Returns the value of a specific property from a property set.',
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
            description: 'Returns which BIM_checker page the user is currently on.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'navigate_to_page',
            description: 'Navigates the user to a different page in the app. WARNING: causes a page reload, the chat panel will close.',
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
            description: 'Returns the current color theme (light/dark).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_theme',
            description: 'Switches the color theme. Takes effect immediately.',
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
            description: 'Returns the current UI language (cs/en).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_language',
            description: 'Switches the UI language. Triggers a re-render of all text.',
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
            description: 'Starts the onboarding wizard. Only works on sub-pages (validator/parser/viewer), not on the homepage.',
            parameters: {
                type: 'object',
                properties: {
                    page: { type: 'string', enum: ['validator', 'parser', 'viewer'], description: 'Optional — which step set to use. If omitted, the current page is used.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'dismiss_wizard',
            description: 'Closes the active wizard.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'install_pwa',
            description: 'Triggers the browser install dialog for the PWA. If the browser does not have an install prompt available, returns available:false.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'open_bug_report',
            description: 'Opens the bug report dialog. Optionally pre-fills the description.',
            parameters: {
                type: 'object',
                properties: {
                    description: { type: 'string', description: 'Pre-filled description text.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_agents',
            description: 'Returns a list of all AI agents (without API keys).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_active_agent',
            description: 'Returns information about the currently active agent (the one driving this chat).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_agent',
            description: 'Creates a new AI agent. Requires an API key. If an agent with the same name already exists, returns duplicate_name with existingId — use update_agent instead of creating again.',
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
            description: 'Updates an existing agent. Identify via id OR name (name must be unique). For renaming, call with `id` and a new `name`. MUST NOT be used on the currently active agent — returns cannot_modify_active.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Agent identifier. When provided, the name value is interpreted as a rename.' },
                    name: { type: 'string', description: 'Without id, acts as a lookup key. With id, sets the new name.' },
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
            description: 'Deletes an agent by id OR name (name must be unique). Opens a confirmation dialog before deletion. Cannot delete the currently active agent or the last remaining one.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_folder',
            description: 'Creates a new folder in storage for the given type. Optionally specify parentName (name or path of the parent folder).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' },
                    parentName: { type: 'string', description: 'Optional, defaults to root.' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'rename_folder',
            description: 'Renames a folder. Identify via folderName (name or path).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    folderName: { type: 'string' },
                    newName: { type: 'string' }
                },
                required: ['type', 'folderName', 'newName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_folder',
            description: 'Deletes a folder including all files and subfolders. Opens a confirmation dialog before deletion.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    folderName: { type: 'string' }
                },
                required: ['type', 'folderName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'move_file',
            description: 'Moves a file to a different folder. Identify both the file and the folder by name.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    fileName: { type: 'string' },
                    targetFolderName: { type: 'string' }
                },
                required: ['type', 'fileName', 'targetFolderName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'move_files_batch',
            description: 'Moves multiple files to the same folder at once. Returns lists of moved and skipped (with reason).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    fileNames: { type: 'array', items: { type: 'string' } },
                    targetFolderName: { type: 'string' }
                },
                required: ['type', 'fileNames', 'targetFolderName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'download_file',
            description: 'Triggers a download of a file from storage to the user\'s OS (via browser).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_file_snippet',
            description: 'Returns the first N bytes of a file\'s content as text (default 8000, max 50000). Sets truncated:true if the file is longer.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' },
                    maxBytes: { type: 'integer', minimum: 100, maximum: 50000 }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_file_summary',
            description: 'File summary: for IFC returns top 10 types + entity count, for IDS returns specification count + info, plus size and modifiedAt.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' }
                },
                required: ['type', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'replace_file_content',
            description: 'Overwrites the content of an existing file with new text. Opens a confirmation dialog before writing (with a warning if the size difference is >50%).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['ifc', 'ids'] },
                    name: { type: 'string' },
                    content: { type: 'string' }
                },
                required: ['type', 'name', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_presets',
            description: 'Lists all saved validation presets.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'save_preset',
            description: 'Saves a new preset. useCurrentGroups:true takes the current groups from the validator UI, otherwise uses the last-session preset.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    useCurrentGroups: { type: 'boolean' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_preset',
            description: 'Deletes a preset by id OR name. Opens a confirmation dialog before deletion.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'load_preset',
            description: 'Loads a preset as the last-session preset (validator UI updates). andNavigate:true switches to the Validator page if not already there (and triggers auto-run).',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    andNavigate: { type: 'boolean' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'apply_preset',
            description: 'Finds a preset by name and applies it. If not on the Validator page, automatically navigates there and starts validation.',
            parameters: {
                type: 'object',
                properties: { presetName: { type: 'string' } },
                required: ['presetName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'request_user_attention',
            description: 'Displays a toast notification to the user — info/warning/success/error. Use when you want to alert the user to something outside the chat panel.',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string' },
                    kind: { type: 'string', enum: ['info', 'warning', 'success', 'error'] }
                },
                required: ['message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_specification_detail',
            description: 'Details of a single specification in an IDS file. Find via specName or specIndex (0-based). Returns applicability + requirements facets.',
            parameters: {
                type: 'object',
                properties: {
                    idsFileName: { type: 'string' },
                    specName: { type: 'string' },
                    specIndex: { type: 'integer', minimum: 0 }
                },
                required: ['idsFileName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_facet_detail',
            description: 'Details of a specific facet within a specification. facetType is entity|partOf|classification|attribute|property|material. in=applicability|requirements (default applicability).',
            parameters: {
                type: 'object',
                properties: {
                    idsFileName: { type: 'string' },
                    specName: { type: 'string' },
                    specIndex: { type: 'integer' },
                    facetType: { type: 'string', enum: ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'] },
                    index: { type: 'integer', minimum: 0 },
                    in: { type: 'string', enum: ['applicability', 'requirements'] }
                },
                required: ['idsFileName', 'facetType', 'index']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_validation_failures',
            description: 'Details of failed requirements from the last validation. Page-locked to Validator. Limit 50, returns truncated:true if exceeded.',
            parameters: {
                type: 'object',
                properties: {
                    groupIndex: { type: 'integer', minimum: 0 },
                    ifcFileName: { type: 'string', description: 'Optional filter for a specific IFC file.' }
                },
                required: ['groupIndex']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'count_failures_by_requirement',
            description: 'Histogram of failed/total per requirement across all IFC files in a group. Page-locked to Validator.',
            parameters: {
                type: 'object',
                properties: { groupIndex: { type: 'integer', minimum: 0 } },
                required: ['groupIndex']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'compare_ifc_files',
            description: 'Compares entity histograms of two groups of IFC files. Returns { a, b, delta } where delta = b - a per type.',
            parameters: {
                type: 'object',
                properties: {
                    fileNamesA: { type: 'array', items: { type: 'string' } },
                    fileNamesB: { type: 'array', items: { type: 'string' } }
                },
                required: ['fileNamesA', 'fileNamesB']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_property_in_ifc',
            description: 'Finds entities containing a property with the given name. Optional value filter (exact match). Limit 50 matches.',
            parameters: {
                type: 'object',
                properties: {
                    fileName: { type: 'string' },
                    propertyName: { type: 'string' },
                    value: { type: 'string' }
                },
                required: ['fileName', 'propertyName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_ids_skeleton',
            description: 'Generates a minimal IDS XML skeleton with one empty specification. Returns XML as a string. The generator requires an email in the author field (XSD constraint).',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    author: { type: 'string', description: 'Email for the author field (required per XSD).' },
                    ifcVersion: { type: 'string', description: 'Default IFC4X3_ADD2.' },
                    copyright: { type: 'string' },
                    version: { type: 'string' },
                    description: { type: 'string' },
                    purpose: { type: 'string' },
                    milestone: { type: 'string' }
                },
                required: ['title']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_specification_to_ids',
            description: 'Adds a new specification to an existing IDS file. Opens a confirmation dialog before writing. Facets must have the correct shape (type + relevant fields).',
            parameters: {
                type: 'object',
                properties: {
                    idsFileName: { type: 'string' },
                    name: { type: 'string' },
                    ifcVersion: { type: 'string' },
                    description: { type: 'string' },
                    applicabilityFacets: { type: 'array', items: { type: 'object' }, description: 'Array of facet objects (entity/property/attribute/...).' },
                    requirementFacets: { type: 'array', items: { type: 'object' }, description: 'Array of facet objects.' }
                },
                required: ['idsFileName', 'name', 'applicabilityFacets', 'requirementFacets']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'validate_ids_xml',
            description: 'Runs XSD validation of an IDS file against ids-1.0.xsd. Returns valid + errors[0..20]. Only works where the XSD validator is loaded (validator/parser page).',
            parameters: {
                type: 'object',
                properties: { idsFileName: { type: 'string' } },
                required: ['idsFileName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'bsdd_search',
            description: 'Search in the buildingSMART Data Dictionary. Currently a gated stub — returns integration_disabled. Will be implemented in a future phase.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    classificationUri: { type: 'string' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'bsdd_get_property',
            description: 'Details of a bSDD property by URI. Currently a gated stub — returns integration_disabled.',
            parameters: {
                type: 'object',
                properties: { uri: { type: 'string' } },
                required: ['uri']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'export_validation_xlsx',
            description: 'Downloads an Excel export of validation results. Page-locked to Validator after validation has been run.',
            parameters: { type: 'object', properties: {} }
        }
    }
];

export function getToolsForAgent(/* agent */) {
    return TOOL_DEFINITIONS;
}
