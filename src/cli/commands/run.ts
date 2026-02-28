import { appendFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { defineCommand } from "citty";
import { loadConfig, type ValidatedConfig } from "../../config/loader.js";
import type {
	JudgeCallFn,
	ReporterConfig,
	ReporterConfigWithOptions,
	ResolvedSuite,
	Run,
	RunOptions,
} from "../../config/types.js";
import { formatMarkdownReport } from "../../reporters/markdown.js";
import { resolveReporter } from "../../reporters/registry.js";
import type { ReporterPlugin } from "../../reporters/types.js";
import { estimateCost } from "../../runner/cost-estimator.js";
import type { RateLimiter } from "../../runner/rate-limiter.js";
import { createTokenBucketLimiter } from "../../runner/rate-limiter.js";
import { runSuite } from "../../runner/runner.js";
import { loadRun, saveRun } from "../../storage/run-store.js";
import { ConfigError, getExitCode } from "../errors.js";
import {
	filterCases,
	filterCasesByIds,
	filterSuites,
	resolveFailingFilter,
	validateFilterFlags,
} from "../filter.js";
import { createLogger } from "../logger.js";
import { globalArgs } from "../shared-args.js";

// ─── Exported helpers for unit testing and reuse by record command ───────────

export function parseIntArg(value: string | undefined, name: string): number | undefined {
	if (value === undefined) return undefined;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 1) {
		throw new ConfigError(`--${name} must be a positive integer, got '${value}'`);
	}
	return n;
}

export function buildRunOptions(
	args: {
		readonly mode?: string | undefined;
		readonly record?: boolean | undefined;
		readonly concurrency?: string | undefined;
		readonly trials?: string | undefined;
		readonly "strict-fixtures"?: boolean | undefined;
		readonly "run-id"?: string | undefined;
	},
	configDefaults: ValidatedConfig["run"],
	suite: ResolvedSuite,
	signal: AbortSignal,
	rateLimiter?: RateLimiter,
	judge?: JudgeCallFn,
	previousRun?: Run,
	plugins?: ValidatedConfig["plugins"],
): RunOptions {
	const mode = (args.mode ?? configDefaults.defaultMode ?? "replay") as RunOptions["mode"];
	return {
		mode,
		timeoutMs: configDefaults.timeoutMs,
		record: args.record || undefined,
		concurrency: parseIntArg(args.concurrency, "concurrency") ?? suite.concurrency,
		signal,
		previousRunId: args["run-id"],
		previousRun,
		strictFixtures: args["strict-fixtures"] || undefined,
		trials: parseIntArg(args.trials, "trials"),
		rateLimiter,
		judge,
		plugins: plugins && plugins.length > 0 ? plugins : undefined,
	};
}

async function resolveConfigDir(configPath?: string): Promise<string | undefined> {
	if (!configPath) return undefined;
	const resolved = resolve(configPath);
	const s = await stat(resolved).catch(() => null);
	if (s?.isFile()) return dirname(resolved);
	if (s?.isDirectory()) return resolved;
	return resolved;
}

// ─── Core execution logic (shared with record command) ──────────────────────

export interface ExecuteRunArgs {
	readonly verbose?: boolean | undefined;
	readonly quiet?: boolean | undefined;
	readonly config?: string | undefined;
	readonly mode?: string | undefined;
	readonly record?: boolean | undefined;
	readonly suite?: string | undefined;
	readonly filter?: string | undefined;
	readonly "filter-failing"?: string | undefined;
	readonly "run-id"?: string | undefined;
	readonly trials?: string | undefined;
	readonly concurrency?: string | undefined;
	readonly "strict-fixtures"?: boolean | undefined;
	readonly "rate-limit"?: string | undefined;
	readonly "no-color"?: boolean | undefined;
	readonly reporter?: string | undefined;
	readonly output?: string | undefined;
	readonly "confirm-cost"?: boolean | undefined;
	readonly "auto-approve"?: boolean | undefined;
}

export async function executeRun(args: ExecuteRunArgs): Promise<void> {
	const logger = createLogger({ verbose: args.verbose, quiet: args.quiet });

	const controller = new AbortController();
	let rateLimiter: RateLimiter | undefined;
	let signalCount = 0;

	const handleRawSignal = (): void => {
		signalCount++;
		if (signalCount >= 2) {
			logger.error("Force exit.");
			process.exit(130);
		}
		logger.warn("Shutting down gracefully... (press Ctrl+C again to force)");
		controller.abort();
	};

	const handleTermSignal = (): void => {
		logger.warn("Shutting down gracefully...");
		controller.abort();
	};

	process.on("SIGINT", handleRawSignal);
	process.on("SIGTERM", handleTermSignal);

	let worstExitCode = 0;

	try {
		// Validate mutually exclusive filters
		validateFilterFlags(args.filter, args["filter-failing"]);

		// Load config
		const validatedConfig = await loadConfigSafe(args.config);

		// Filter suites
		const suites = filterSuites(validatedConfig.suites, args.suite);

		// Warn about trials in replay mode
		const effectiveMode = args.mode ?? validatedConfig.run.defaultMode;
		if (args.trials && effectiveMode !== "live") {
			logger.warn(
				"Trials have no effect in replay mode with deterministic graders. Each trial will produce identical results.",
			);
		}

		// Rate limiter
		const rateLimitRpm =
			parseIntArg(args["rate-limit"], "rate-limit") ?? validatedConfig.run.rateLimit;
		if (rateLimitRpm) {
			rateLimiter = createTokenBucketLimiter({ maxRequestsPerMinute: rateLimitRpm });
		}

		// Load previous run for judge-only mode
		let previousRun: Run | undefined;
		if (effectiveMode === "judge-only") {
			if (!args["run-id"]) {
				throw new ConfigError("--mode=judge-only requires --run-id=<id>");
			}
			previousRun = await loadRun(args["run-id"]);
		}

		// Cost confirmation
		if (args["confirm-cost"]) {
			for (const suite of suites) {
				const estimate = estimateCost(suite, {
					mode: (args.mode ?? validatedConfig.run.defaultMode) as RunOptions["mode"],
					trials: parseIntArg(args.trials, "trials"),
				});
				if (estimate.judgeCalls > 0 || estimate.targetCalls > 0) {
					logger.info(`\nCost estimate for '${suite.name}':\n${estimate.summary}\n`);
				}
			}

			if (process.stdout.isTTY && !args["auto-approve"]) {
				const shouldContinue = await confirmPrompt("Proceed with this run?");
				if (!shouldContinue) {
					logger.info("Run cancelled.");
					process.exit(0);
				}
			} else if (!args["auto-approve"]) {
				logger.warn(
					"Non-interactive environment detected. Use --auto-approve to skip confirmation.",
				);
			}
		}

		for (const rawSuite of suites) {
			let suite = rawSuite;

			// Validate previousRun matches this suite
			if (previousRun && previousRun.suiteId !== suite.name) {
				logger.warn(
					`Skipping suite '${suite.name}': --run-id references suite '${previousRun.suiteId}'`,
				);
				continue;
			}

			// Apply case filters
			if (args["filter-failing"]) {
				const failingIds = await resolveFailingFilter(args["filter-failing"]);
				suite = filterCasesByIds(suite, failingIds);
				if (suite.cases.length === 0) {
					logger.info(`No failing cases in suite '${suite.name}' — skipping.`);
					continue;
				}
			} else if (args.filter) {
				suite = filterCases(suite, args.filter);
			}

			// Warn about live mode trials cost
			const trialCount = parseIntArg(args.trials, "trials");
			if (trialCount && effectiveMode === "live") {
				logger.warn(
					`Running ${trialCount} trials × ${suite.cases.length} cases = ${trialCount * suite.cases.length} target invocations.`,
				);
			}

			const options = buildRunOptions(
				args,
				validatedConfig.run,
				suite,
				controller.signal,
				rateLimiter,
				validatedConfig.judge?.call,
				previousRun,
				validatedConfig.plugins,
			);
			const run = await runSuite(suite, options);

			// Dispatch reporters
			await dispatchReporters(run, args, validatedConfig.reporters);

			// Write GitHub Actions summary
			await writeGitHubSummary(run);

			// Save run artifact
			const savedPath = await saveRun(run);
			logger.info(`Run saved: ${savedPath}`);

			// Determine exit code for this suite
			if (run.summary.aborted) {
				worstExitCode = Math.max(worstExitCode, 130);
			} else if (!run.summary.gateResult.pass) {
				worstExitCode = Math.max(worstExitCode, 1);
			}
		}
	} catch (err) {
		const exitCode = getExitCode(err);
		logger.error(err instanceof Error ? err.message : String(err));
		process.exit(exitCode);
	} finally {
		process.off("SIGINT", handleRawSignal);
		process.off("SIGTERM", handleTermSignal);
		rateLimiter?.dispose();
	}

	process.exit(worstExitCode);
}

async function loadConfigSafe(configPath: string | undefined): Promise<ValidatedConfig> {
	try {
		const cwd = await resolveConfigDir(configPath);
		return await loadConfig({ cwd });
	} catch (err) {
		throw new ConfigError(
			`Failed to load config: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

async function dispatchReporters(
	run: Run,
	args: {
		readonly reporter?: string | undefined;
		readonly output?: string | undefined;
		readonly verbose?: boolean | undefined;
		readonly quiet?: boolean | undefined;
		readonly "no-color"?: boolean | undefined;
	},
	configReporters: readonly ReporterConfig[],
): Promise<void> {
	// Primary reporter: --reporter flag replaces console (not adds to it)
	const primaryReporterName = args.reporter ?? "console";
	if (!args.quiet) {
		const plugin = await resolveReporter(primaryReporterName);
		const result = await plugin.report(run, {
			output: args.output,
			verbose: args.verbose,
			color: primaryReporterName === "console" ? !args["no-color"] : undefined,
		});
		if (result && !args.output) {
			process.stdout.write(`${result}\n`);
		}
	}

	// Config-level reporters (additional output targets)
	for (const reporterConfig of configReporters) {
		const { reporter, output, options } = normalizeReporterConfig(reporterConfig);
		const plugin = await resolveReporter(reporter);
		const result = await plugin.report(run, { output, ...options });
		if (result && !output) {
			process.stdout.write(`${result}\n`);
		}
	}
}

function normalizeReporterConfig(config: ReporterConfig): {
	readonly reporter: string | ReporterPlugin;
	readonly output?: string | undefined;
	readonly options?: Record<string, unknown> | undefined;
} {
	if (typeof config === "string") {
		return { reporter: config };
	}
	if ("report" in config && typeof config.report === "function") {
		return { reporter: config as ReporterPlugin };
	}
	const withOptions = config as ReporterConfigWithOptions;
	return {
		reporter: withOptions.reporter,
		output: withOptions.output,
		options: withOptions.options as Record<string, unknown> | undefined,
	};
}

async function confirmPrompt(message: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(`${message} (y/N) `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y");
		});
	});
}

async function writeGitHubSummary(run: Run): Promise<void> {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) return;
	const markdown = formatMarkdownReport(run);
	await appendFile(summaryPath, `${markdown}\n`);
}

// ─── citty command definition ───────────────────────────────────────────────

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: {
		name: "run",
		description: "Run eval suites",
	},
	args: {
		...globalArgs,
		mode: {
			type: "string" as const,
			description: "Execution mode: live, replay, or judge-only",
		},
		record: {
			type: "boolean" as const,
			description: "Record fixtures during live run",
			default: false,
		},
		suite: {
			type: "string" as const,
			alias: "s",
			description: "Run specific suite(s) by name (comma-separated)",
		},
		filter: {
			type: "string" as const,
			alias: "f",
			description: "Run specific case(s) by ID (comma-separated)",
		},
		"filter-failing": {
			type: "string" as const,
			description: "Re-run only failing cases from a previous run ID",
		},
		"run-id": {
			type: "string" as const,
			description: "Previous run ID (required for judge-only mode)",
		},
		trials: {
			type: "string" as const,
			alias: "t",
			description: "Number of trials per case for flakiness detection",
		},
		concurrency: {
			type: "string" as const,
			description: "Max concurrent cases",
		},
		"strict-fixtures": {
			type: "boolean" as const,
			description: "Fail on fixture staleness warnings",
			default: false,
		},
		"rate-limit": {
			type: "string" as const,
			description: "Max requests per minute for live mode",
		},
		reporter: {
			type: "string" as const,
			alias: "r",
			description: "Reporter format: console, json, junit, markdown (default: console)",
		},
		output: {
			type: "string" as const,
			alias: "o",
			description: "Output file path for reporter (default: stdout)",
		},
		"confirm-cost": {
			type: "boolean" as const,
			description: "Show cost estimate and confirm before running",
			default: false,
		},
		"auto-approve": {
			type: "boolean" as const,
			description: "Skip cost confirmation in non-interactive environments",
			default: false,
		},
	},
	async run({ args }) {
		await executeRun(args);
	},
});
