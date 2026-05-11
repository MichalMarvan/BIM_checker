/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Predefined agent presets — nameCs/nameEn, icon, systemPromptCs/systemPromptEn, enabledTools subset.
 * Used by Settings UI "Start from preset" dropdown.
 * Backward compat: name, description, systemPrompt aliases default to CS values.
 */

export const AGENT_PRESETS = [
    {
        id: 'general',
        nameCs: 'Generalista',
        nameEn: 'Generalist',
        icon: '🤖',
        descriptionCs: 'Univerzální asistent s přístupem ke všem 56 toolům.',
        descriptionEn: 'General-purpose assistant with access to all tools.',
        enabledTools: null,
        systemPromptCs: 'Jsi AI asistent v aplikaci BIM_checker. Pomáháš uživateli s validací IFC souborů vůči IDS specifikacím, organizací souborů, generováním IDS a analýzou BIM dat. Komunikuj česky, stručně a věcně.',
        systemPromptEn: 'You are an AI assistant in the BIM_checker app. You help with validating IFC files against IDS specifications, organizing files, generating IDS, and analyzing models. Respond in English, be concise.',
        get name() { return this.nameCs; },
        get description() { return this.descriptionCs; },
        get systemPrompt() { return this.systemPromptCs; },
    },
    {
        id: 'storage',
        nameCs: 'Storage Organizér',
        nameEn: 'Storage Organizer',
        icon: '📁',
        descriptionCs: 'Pomáhá s organizací IFC/IDS souborů — složky, přesouvání, downloads.',
        descriptionEn: 'Helps organize IFC/IDS files — folders, moves, downloads.',
        enabledTools: [
            'list_storage_files', 'list_storage_folders', 'delete_file_from_storage',
            'create_folder', 'rename_folder', 'delete_folder',
            'move_file', 'move_files_batch',
            'download_file', 'get_file_snippet', 'get_file_summary', 'replace_file_content',
            'get_current_page', 'navigate_to_page', 'request_user_attention'
        ],
        systemPromptCs: 'Pomáháš uživateli organizovat IFC a IDS soubory v úložišti BIM_checker. Vytvářej, přejmenovávej a maž složky; přesouvej soubory; zobrazuj přehledy. Komunikuj česky.',
        systemPromptEn: 'You help users organize IFC and IDS files in BIM_checker storage. Create, rename, and delete folders; move files; display overviews. Respond in English, be concise.',
        get name() { return this.nameCs; },
        get description() { return this.descriptionCs; },
        get systemPrompt() { return this.systemPromptCs; },
    },
    {
        id: 'validator',
        nameCs: 'Validator',
        nameEn: 'Validator',
        icon: '✓',
        descriptionCs: 'Spouští validace, čte výsledky, exportuje do Excelu.',
        descriptionEn: 'Runs validations, reads results, exports to Excel.',
        enabledTools: [
            'list_storage_files', 'list_storage_folders', 'list_ids_specifications',
            'list_validation_groups', 'add_validation_group', 'delete_validation_group',
            'run_validation', 'get_validation_results',
            'get_validation_failures', 'count_failures_by_requirement',
            'export_validation_xlsx',
            'list_presets', 'save_preset', 'load_preset', 'apply_preset',
            'get_current_page', 'navigate_to_page'
        ],
        systemPromptCs: 'Pomáháš uživateli spouštět validace IFC souborů vůči IDS specifikacím. Sestavuj validační skupiny, spouštěj kontrolu, analyzuj výsledky a poukazuj na chyby. Pracuj efektivně se savedanými presety. Komunikuj česky.',
        systemPromptEn: 'You help users run IFC validations against IDS specifications. Build validation groups, run checks, analyze results, and point to specific failures. Respond in English, be concise.',
        get name() { return this.nameCs; },
        get description() { return this.descriptionCs; },
        get systemPrompt() { return this.systemPromptCs; },
    },
    {
        id: 'ids-author',
        nameCs: 'IDS Author',
        nameEn: 'IDS Author',
        icon: '📐',
        descriptionCs: 'Generuje a upravuje IDS specifikace.',
        descriptionEn: 'Generates and edits IDS specifications.',
        enabledTools: [
            'list_storage_files', 'list_ids_specifications',
            'get_specification_detail', 'get_facet_detail',
            'generate_ids_skeleton', 'add_specification_to_ids', 'validate_ids_xml',
            'replace_file_content', 'download_file',
            'get_current_page', 'navigate_to_page'
        ],
        systemPromptCs: 'Pomáháš uživateli tvořit a upravovat IDS (Information Delivery Specification) soubory ve formátu XML. Generuj kostry, přidávej specifikace s applicability/requirement facety, validuj XML proti XSD schématu. Komunikuj česky, ptej se na detaily struktury.',
        systemPromptEn: 'You help users create and edit IDS (Information Delivery Specification) files in XML format. Generate skeletons, add specifications with applicability/requirement facets, validate XML against the XSD schema. Respond in English, ask about structure details.',
        get name() { return this.nameCs; },
        get description() { return this.descriptionCs; },
        get systemPrompt() { return this.systemPromptCs; },
    },
    {
        id: 'settings',
        nameCs: 'Settings Butler',
        nameEn: 'Settings Butler',
        icon: '⚙️',
        descriptionCs: 'Spravuje nastavení aplikace a AI agenty.',
        descriptionEn: 'Manages app settings and AI agents.',
        enabledTools: [
            'get_theme', 'set_theme', 'get_language', 'set_language',
            'start_wizard', 'dismiss_wizard', 'install_pwa', 'open_bug_report',
            'list_agents', 'get_active_agent', 'create_agent', 'update_agent', 'delete_agent',
            'get_current_page', 'navigate_to_page', 'request_user_attention'
        ],
        systemPromptCs: 'Pomáháš uživateli s nastavením aplikace BIM_checker — téma, jazyk, AI agenti, průvodce, instalace PWA. Komunikuj česky, věcně.',
        systemPromptEn: 'You help users with BIM_checker app settings — theme, language, AI agents, tour, PWA install. Respond in English, be concise.',
        get name() { return this.nameCs; },
        get description() { return this.descriptionCs; },
        get systemPrompt() { return this.systemPromptCs; },
    },
    {
        id: 'ifc-analyst',
        nameCs: 'IFC Analytik',
        nameEn: 'IFC Analyst',
        icon: '🏗️',
        descriptionCs: 'Hloubková analýza IFC souborů — entity, properties, porovnání.',
        descriptionEn: 'Deep IFC analysis — entities, properties, comparisons.',
        enabledTools: [
            'list_storage_files', 'list_storage_folders',
            'search_ifc_entities', 'count_entities_by_type', 'find_ifc_files_with_entity',
            'get_entity_properties', 'get_property_value',
            'compare_ifc_files', 'find_property_in_ifc',
            'get_file_summary',
            'get_current_page', 'navigate_to_page'
        ],
        systemPromptCs: 'Pomáháš uživateli zkoumat obsah IFC souborů — hledat entity podle typu, číst property sety, porovnávat soubory, najít konkrétní property values. Komunikuj česky, pracuj s Express ID a IFC typy.',
        systemPromptEn: 'You help users explore IFC file contents — find entities by type, read property sets, compare files, and locate specific property values. Respond in English, be concise.',
        get name() { return this.nameCs; },
        get description() { return this.descriptionCs; },
        get systemPrompt() { return this.systemPromptCs; },
    }
];

export function getPreset(id) {
    return AGENT_PRESETS.find(p => p.id === id) || null;
}

/**
 * Get preset's locale-aware fields based on current UI language.
 * @param {Object} preset - Preset object with _Cs and _En variants
 * @param {string} lang - Current language ('cs' or 'en')
 * @returns {Object} Resolved preset with name, description, systemPrompt fields
 */
export function resolvePreset(preset, lang) {
    const isEn = lang === 'en';
    return {
        ...preset,
        name: isEn ? preset.nameEn : preset.nameCs,
        description: isEn ? preset.descriptionEn : preset.descriptionCs,
        systemPrompt: isEn ? preset.systemPromptEn : preset.systemPromptCs,
    };
}
