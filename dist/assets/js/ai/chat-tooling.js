/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Chat-loop tooling policy: which tool schemas an agent's request carries,
 * and how many tool iterations one user turn may take.
 *
 * Local models (Ollama / localhost endpoints) pay for every schema byte in
 * prefill on every loop iteration, and small models get confused by a 60+
 * tool menu. Agents without an explicit tool selection therefore get a slim
 * default set on local providers; an explicit enabledTools array always wins.
 */

import { TOOL_DEFINITIONS } from './tool-defs.js';
import { detectProvider } from './providers.js';

export const MAX_TOOL_ITERATIONS = 8;

// Curated default for local providers — the common storage / validation /
// IDS / IFC workflows. Excludes agent management, app settings, bSDD stubs
// and niche folder-backend plumbing; users can re-enable anything in the
// Settings tool picker.
export const DEFAULT_LOCAL_TOOLSET = [
    // storage
    'list_storage_files', 'list_storage_folders', 'get_file_snippet',
    'get_file_summary', 'get_storage_info', 'download_file', 'move_file',
    'create_folder', 'delete_file_from_storage', 'replace_file_content',
    'save_file_to_folder',
    // validation
    'list_validation_groups', 'add_validation_group', 'delete_validation_group',
    'run_validation', 'get_validation_results', 'get_validation_failures',
    'count_failures_by_requirement', 'export_validation_xlsx',
    // ids
    'list_ids_specifications', 'get_specification_detail', 'get_facet_detail',
    'generate_ids_skeleton', 'add_specification_to_ids', 'validate_ids_xml',
    // ifc
    'search_ifc_entities', 'count_entities_by_type', 'get_entity_properties',
    'find_property_in_ifc',
    // presets
    'list_presets', 'load_preset', 'apply_preset',
    // navigation
    'get_current_page', 'navigate_to_page', 'request_user_attention'
];

export function resolveToolsForAgent(agent, endpoint, defs = TOOL_DEFINITIONS) {
    if (agent && Array.isArray(agent.enabledTools)) {
        return defs.filter(d => agent.enabledTools.includes(d.function.name));
    }
    const isLocal = (agent && agent.provider === 'ollama')
        || detectProvider(endpoint || '') === 'ollama';
    if (isLocal) {
        const slim = new Set(DEFAULT_LOCAL_TOOLSET);
        return defs.filter(d => slim.has(d.function.name));
    }
    return defs;
}
