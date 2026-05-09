/**
 * Tool definitions for AI function calling.
 *
 * Phase 7 ships an empty list — chat works in pure-completion mode.
 * Phase 8+ will populate with BIM_checker-specific tools (storage ops,
 * validation control, file management, etc.).
 */
export const TOOL_DEFINITIONS = [];

export function getToolsForAgent(/* agent */) {
    return TOOL_DEFINITIONS;
}
