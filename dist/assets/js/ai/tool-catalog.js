/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Single source of truth for tool categorization.
 * Used by Settings tool picker and (future) AI help modal.
 * Tool names match exactly the `function.name` values in tool-defs.js.
 */

export const TOOL_CATEGORIES = [
    {
        id: 'settings',
        icon: '⚙️',
        labelKey: 'ai.category.settings',
        tools: [
            { name: 'get_theme', labelKey: 'ai.tool.get_theme.label' },
            { name: 'set_theme', labelKey: 'ai.tool.set_theme.label' },
            { name: 'get_language', labelKey: 'ai.tool.get_language.label' },
            { name: 'set_language', labelKey: 'ai.tool.set_language.label' },
            { name: 'start_wizard', labelKey: 'ai.tool.start_wizard.label' },
            { name: 'dismiss_wizard', labelKey: 'ai.tool.dismiss_wizard.label' },
            { name: 'install_pwa', labelKey: 'ai.tool.install_pwa.label' },
            { name: 'open_bug_report', labelKey: 'ai.tool.open_bug_report.label' }
        ]
    },
    {
        id: 'agents',
        icon: '🤖',
        labelKey: 'ai.category.agents',
        tools: [
            { name: 'list_agents', labelKey: 'ai.tool.list_agents.label' },
            { name: 'get_active_agent', labelKey: 'ai.tool.get_active_agent.label' },
            { name: 'create_agent', labelKey: 'ai.tool.create_agent.label' },
            { name: 'update_agent', labelKey: 'ai.tool.update_agent.label' },
            { name: 'delete_agent', labelKey: 'ai.tool.delete_agent.label' }
        ]
    },
    {
        id: 'storage',
        icon: '📁',
        labelKey: 'ai.category.storage',
        tools: [
            { name: 'list_storage_files', labelKey: 'ai.tool.list_storage_files.label' },
            { name: 'list_storage_folders', labelKey: 'ai.tool.list_storage_folders.label' },
            { name: 'delete_file_from_storage', labelKey: 'ai.tool.delete_file_from_storage.label' },
            { name: 'create_folder', labelKey: 'ai.tool.create_folder.label' },
            { name: 'rename_folder', labelKey: 'ai.tool.rename_folder.label' },
            { name: 'delete_folder', labelKey: 'ai.tool.delete_folder.label' },
            { name: 'move_file', labelKey: 'ai.tool.move_file.label' },
            { name: 'move_files_batch', labelKey: 'ai.tool.move_files_batch.label' },
            { name: 'download_file', labelKey: 'ai.tool.download_file.label' },
            { name: 'get_file_snippet', labelKey: 'ai.tool.get_file_snippet.label' },
            { name: 'get_file_summary', labelKey: 'ai.tool.get_file_summary.label' },
            { name: 'replace_file_content', labelKey: 'ai.tool.replace_file_content.label' },
            { name: 'connect_local_folder', labelKey: 'ai.tool.connect_local_folder.label' },
            { name: 'disconnect_local_folder', labelKey: 'ai.tool.disconnect_local_folder.label' },
            { name: 'rescan_local_folder', labelKey: 'ai.tool.rescan_local_folder.label' },
            { name: 'get_storage_info', labelKey: 'ai.tool.get_storage_info.label' }
        ]
    },
    {
        id: 'presets',
        icon: '📋',
        labelKey: 'ai.category.presets',
        tools: [
            { name: 'list_presets', labelKey: 'ai.tool.list_presets.label' },
            { name: 'save_preset', labelKey: 'ai.tool.save_preset.label' },
            { name: 'delete_preset', labelKey: 'ai.tool.delete_preset.label' },
            { name: 'load_preset', labelKey: 'ai.tool.load_preset.label' },
            { name: 'apply_preset', labelKey: 'ai.tool.apply_preset.label' }
        ]
    },
    {
        id: 'validation',
        icon: '✓',
        labelKey: 'ai.category.validation',
        tools: [
            { name: 'list_validation_groups', labelKey: 'ai.tool.list_validation_groups.label' },
            { name: 'add_validation_group', labelKey: 'ai.tool.add_validation_group.label' },
            { name: 'delete_validation_group', labelKey: 'ai.tool.delete_validation_group.label' },
            { name: 'run_validation', labelKey: 'ai.tool.run_validation.label' },
            { name: 'get_validation_results', labelKey: 'ai.tool.get_validation_results.label' },
            { name: 'get_validation_failures', labelKey: 'ai.tool.get_validation_failures.label' },
            { name: 'count_failures_by_requirement', labelKey: 'ai.tool.count_failures_by_requirement.label' },
            { name: 'export_validation_xlsx', labelKey: 'ai.tool.export_validation_xlsx.label' }
        ]
    },
    {
        id: 'ids',
        icon: '📐',
        labelKey: 'ai.category.ids',
        tools: [
            { name: 'list_ids_specifications', labelKey: 'ai.tool.list_ids_specifications.label' },
            { name: 'get_specification_detail', labelKey: 'ai.tool.get_specification_detail.label' },
            { name: 'get_facet_detail', labelKey: 'ai.tool.get_facet_detail.label' },
            { name: 'generate_ids_skeleton', labelKey: 'ai.tool.generate_ids_skeleton.label' },
            { name: 'add_specification_to_ids', labelKey: 'ai.tool.add_specification_to_ids.label' },
            { name: 'validate_ids_xml', labelKey: 'ai.tool.validate_ids_xml.label' }
        ]
    },
    {
        id: 'ifc',
        icon: '🏗️',
        labelKey: 'ai.category.ifc',
        tools: [
            { name: 'search_ifc_entities', labelKey: 'ai.tool.search_ifc_entities.label' },
            { name: 'count_entities_by_type', labelKey: 'ai.tool.count_entities_by_type.label' },
            { name: 'find_ifc_files_with_entity', labelKey: 'ai.tool.find_ifc_files_with_entity.label' },
            { name: 'get_entity_properties', labelKey: 'ai.tool.get_entity_properties.label' },
            { name: 'get_property_value', labelKey: 'ai.tool.get_property_value.label' },
            { name: 'compare_ifc_files', labelKey: 'ai.tool.compare_ifc_files.label' },
            { name: 'find_property_in_ifc', labelKey: 'ai.tool.find_property_in_ifc.label' }
        ]
    },
    {
        id: 'bsdd',
        icon: '🔗',
        labelKey: 'ai.category.bsdd',
        tools: [
            { name: 'bsdd_search', labelKey: 'ai.tool.bsdd_search.label' },
            { name: 'bsdd_get_property', labelKey: 'ai.tool.bsdd_get_property.label' }
        ]
    },
    {
        id: 'misc',
        icon: '⋯',
        labelKey: 'ai.category.misc',
        tools: [
            { name: 'get_current_page', labelKey: 'ai.tool.get_current_page.label' },
            { name: 'navigate_to_page', labelKey: 'ai.tool.navigate_to_page.label' },
            { name: 'request_user_attention', labelKey: 'ai.tool.request_user_attention.label' }
        ]
    }
];

export const TOTAL_TOOLS = TOOL_CATEGORIES.reduce((sum, c) => sum + c.tools.length, 0);

export function getAllToolNames() {
    return TOOL_CATEGORIES.flatMap(c => c.tools.map(t => t.name));
}

export function getCategoryForTool(toolName) {
    for (const cat of TOOL_CATEGORIES) {
        if (cat.tools.some(t => t.name === toolName)) return cat.id;
    }
    return null;
}
