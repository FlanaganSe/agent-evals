import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { defineCommand } from "citty";
import { compareRuns } from "../../comparison/compare.js";
import { formatComparisonReport } from "../../comparison/format.js";
import { loadRun } from "../../storage/run-store.js";
import { ConfigError, getExitCode } from "../errors.js";
import { createLogger } from "../logger.js";
import { globalArgs } from "../shared-args.js";

// ─── Core execution logic (exported for testing) ─────────────────────────────

export interface ExecuteCompareArgs {
	readonly verbose?: boolean | undefined;
	readonly quiet?: boolean | undefined;
	readonly config?: string | undefined;
	readonly base?: string | undefined;
	readonly compare?: string | undefined;
	readonly "fail-on-regression"?: boolean | undefined;
	readonly "score-threshold"?: string | undefined;
	readonly format?: string | undefined;
	readonly "no-color"?: boolean | undefined;
}

export async function executeCompare(args: ExecuteCompareArgs): Promise<void> {
	const logger = createLogger({ verbose: args.verbose, quiet: args.quiet });

	try {
		if (!args.base) {
			throw new ConfigError("Missing required argument: --base <runId>");
		}
		if (!args.compare) {
			throw new ConfigError("Missing required argument: --compare <runId>");
		}

		const projectDir = await resolveProjectDir(args.config);
		const runDir = join(projectDir, ".eval-runs");

		const baseRun = await loadRun(args.base, runDir).catch((err: unknown) => {
			throw new ConfigError(
				`Failed to load base run: ${err instanceof Error ? err.message : String(err)}`,
			);
		});

		const compareRun = await loadRun(args.compare, runDir).catch((err: unknown) => {
			throw new ConfigError(
				`Failed to load compare run: ${err instanceof Error ? err.message : String(err)}`,
			);
		});

		let scoreThreshold: number | undefined;
		if (args["score-threshold"]) {
			scoreThreshold = Number(args["score-threshold"]);
			if (Number.isNaN(scoreThreshold) || scoreThreshold < 0 || scoreThreshold > 1) {
				throw new ConfigError(
					`--score-threshold must be a number between 0 and 1, got '${args["score-threshold"]}'`,
				);
			}
		}

		const comparison = compareRuns(baseRun, compareRun, { scoreThreshold });

		if (args.format === "json") {
			process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
		} else {
			const report = formatComparisonReport(comparison, {
				color: !args["no-color"],
				verbose: args.verbose,
			});
			process.stdout.write(`${report}\n`);
		}

		if (args["fail-on-regression"] && comparison.summary.regressions > 0) {
			process.exitCode = 1;
			return;
		}
	} catch (err) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exitCode = getExitCode(err);
	}
}

async function resolveProjectDir(configArg?: string): Promise<string> {
	if (!configArg) return process.cwd();
	const resolved = resolve(configArg);
	const s = await stat(resolved).catch(() => null);
	if (s?.isFile()) return dirname(resolved);
	return resolved;
}

// ─── citty command definition ───────────────────────────────────────────────

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: {
		name: "compare",
		description: "Compare two eval runs to show regressions and improvements",
	},
	args: {
		...globalArgs,
		base: {
			type: "string" as const,
			description: "Base run ID (the 'before' run)",
			required: true,
		},
		compare: {
			type: "string" as const,
			description: "Compare run ID (the 'after' run)",
			required: true,
		},
		"fail-on-regression": {
			type: "boolean" as const,
			description: "Exit with code 1 if any regressions detected",
			default: false,
		},
		"score-threshold": {
			type: "string" as const,
			description: "Score delta threshold for regression detection (default: 0.05)",
		},
		format: {
			type: "string" as const,
			description: "Output format: console (default) or json",
		},
	},
	async run({ args }) {
		await executeCompare(args);
	},
});
