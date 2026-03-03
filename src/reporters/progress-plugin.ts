import type { EvalPlugin } from "../plugin/types.js";

export interface ProgressPluginOptions {
	readonly stream?: NodeJS.WritableStream;
	readonly noColor?: boolean;
}

const STATUS_SYMBOLS = {
	pass: { symbol: "✓", color: "\x1b[32m" },
	fail: { symbol: "✗", color: "\x1b[31m" },
	error: { symbol: "!", color: "\x1b[33m" },
} as const;

function formatStatus(status: "pass" | "fail" | "error", noColor: boolean): string {
	const { symbol, color } = STATUS_SYMBOLS[status];
	if (noColor) return symbol;
	return `${color}${symbol}\x1b[0m`;
}

function formatLatency(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

/**
 * Built-in plugin that displays live progress during suite execution.
 * Streams per-trial results (caseId, status, score, latency) as permanent lines,
 * with an overwritten summary counter at the bottom.
 * Uses ANSI escape codes on TTY streams; no-op on non-interactive output.
 */
export function createProgressPlugin(options?: ProgressPluginOptions): EvalPlugin {
	const stream = options?.stream ?? process.stderr;
	const isTTY = "isTTY" in stream && (stream as { isTTY?: boolean }).isTTY;
	const noColor = options?.noColor ?? false;

	if (!isTTY) {
		return { name: "progress", version: "1.0.0" };
	}

	let counterLines = 0;

	return {
		name: "progress",
		version: "1.0.0",
		hooks: {
			async beforeRun(context) {
				const modeLabel = context.mode === "replay" ? " (replay)" : "";
				stream.write(`Running ${context.suiteId}${modeLabel}...\n`);
				counterLines = 0;
			},
			async afterTrial(trial, context) {
				// Erase the counter line (not the permanent trial lines above)
				if (counterLines > 0) {
					stream.write(`\x1b[${counterLines}A\x1b[0J`);
				}

				// Permanent trial result line
				const status = formatStatus(trial.status, noColor);
				const latency = formatLatency(trial.output.latencyMs);
				stream.write(`  ${status} ${trial.caseId}  ${latency}\n`);

				// Overwritable counter line
				const pct = Math.round((context.completedCount / context.totalCount) * 100);
				stream.write(`  ${context.completedCount}/${context.totalCount} (${pct}%)\n`);
				counterLines = 1;
			},
			async afterRun() {
				counterLines = 0;
			},
		},
	};
}
