/**
 * Executes tool calls dispatched by the AI.
 *
 * Phase 7 returns `tools_disabled` for any call. Phase 8+ will implement
 * real tools.
 */
export async function executeToolCall(toolCall) {
    console.warn('[tool-executor] Phase 7: tools disabled. Call ignored:', toolCall);
    return {
        toolCallId: toolCall?.id,
        result: { error: 'tools_disabled', message: 'Tools are not available in Phase 7' }
    };
}
