import type { EvalPlugin } from "../plugin/types.js";

export interface ProgressPluginOptions {
	readonly stream?: NodeJS.WritableStream;
	readonly noColor?: boolean;
}

/**
 * Built-in plugin that displays live progress during suite execution.
 * Uses ANSI escape codes on TTY streams; no-op on non-interactive output.
 */
export function createProgressPlugin(options?: ProgressPluginOptions): EvalPlugin {
	const stream = options?.stream ?? process.stderr;
	const isTTY = "isTTY" in stream && (stream as { isTTY?: boolean }).isTTY;

	if (!isTTY) {
		return { name: "progress", version: "1.0.0" };
	}

	let lastLineCount = 0;

	return {
		name: "progress",
		version: "1.0.0",
		hooks: {
			async beforeRun(context) {
				const modeLabel = context.mode === "replay" ? " (replay)" : "";
				stream.write(`Running ${context.suiteId}${modeLabel}...\n`);
				lastLineCount = 1;
			},
			async afterTrial(_trial, context) {
				// Clear previous progress line
				if (lastLineCount > 0) {
					stream.write(`\x1b[${lastLineCount}A\x1b[0J`);
				}

				const pct = Math.round((context.completedCount / context.totalCount) * 100);
				const line = `  ${context.completedCount}/${context.totalCount} (${pct}%)\n`;
				stream.write(line);
				lastLineCount = 1;
			},
			async afterRun() {
				// Clear progress line before final report
				if (lastLineCount > 0) {
					stream.write(`\x1b[${lastLineCount}A\x1b[0J`);
				}
				lastLineCount = 0;
			},
		},
	};
}
