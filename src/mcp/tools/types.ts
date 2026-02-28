/** Standard MCP tool result shape. */
export interface ToolResult {
	readonly isError?: boolean | undefined;
	readonly content: readonly ToolResultContent[];
}

export interface ToolResultContent {
	readonly type: "text";
	readonly text: string;
}

/** Creates a successful text result. */
export function textResult(text: string): ToolResult {
	return { content: [{ type: "text", text }] };
}

/** Creates an error result. */
export function errorResult(message: string): ToolResult {
	return { isError: true, content: [{ type: "text", text: message }] };
}

/** Wraps a handler so uncaught errors become error results. */
export function formatError(label: string, error: unknown): ToolResult {
	const message = error instanceof Error ? error.message : String(error);
	return errorResult(`Failed to ${label}: ${message}`);
}
