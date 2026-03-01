import { appendFile, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { defineCommand } from "citty";
import { loadConfig, type ValidatedConfig } from "../../config/loader.js";
import type {
	FixtureOptions,
	JudgeCallFn,
	ReporterConfig,
	ReporterConfigWithOptions,
	ResolvedSuite,
	Run,
	RunOptions,
} from "../../config/types.js";
import { computeFixtureConfigHash } from "../../fixtures/config-hash.js";
import { formatMarkdownReport } from "../../reporters/markdown.js";
import { createProgressPlugin } from "../../reporters/progress-plugin.js";
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
		readonly "update-fixtures"?: boolean | undefined;
		readonly "no-progress"?: boolean | undefined;
		readonly quiet?: boolean | undefined;
	},
	configDefaults: ValidatedConfig["run"],
	suite: ResolvedSuite,
	signal: AbortSignal,
	fixtureDir: string,
	rateLimiter?: RateLimiter,
	judge?: JudgeCallFn,
	previousRun?: Run,
	plugins?: ValidatedConfig["plugins"],
	onFixtureStale?: (caseId: string, ageDays: number) => void,
): RunOptions {
	const isUpdateFixtures = args["update-fixtures"] ?? false;
	const mode = isUpdateFixtures
		? "live"
		: ((args.mode ?? configDefaults.defaultMode ?? "replay") as RunOptions["mode"]);
	const record = isUpdateFixtures || (args.record ?? false);

	const configHash = computeFixtureConfigHash(suite);
	const fixtureOptions: FixtureOptions = {
		baseDir: fixtureDir,
		stripRaw: suite.replay?.stripRaw ?? true,
		ttlDays: suite.replay?.ttlDays ?? 14,
		strictFixtures: args["strict-fixtures"] ?? false,
	};

	// Add progress plugin automatically unless disabled
	const allPlugins = [...(plugins ?? [])];
	if (!args.quiet && !args["no-progress"]) {
		allPlugins.push(createProgressPlugin());
	}

	return {
		mode,
		timeoutMs: configDefaults.timeoutMs,
		record: record || undefined,
		concurrency: parseIntArg(args.concurrency, "concurrency") ?? suite.concurrency,
		signal,
		previousRunId: args["run-id"],
		previousRun,
		strictFixtures: args["strict-fixtures"] || undefined,
		trials: parseIntArg(args.trials, "trials"),
		rateLimiter,
		judge,
		plugins: allPlugins.length > 0 ? allPlugins : undefined,
		configHash,
		fixtureOptions,
		onFixtureStale,
	};
}

interface ResolvedConfigPath {
	readonly cwd: string;
	readonly configPath?: string | undefined;
}

async function resolveConfigInput(configArg?: string): Promise<ResolvedConfigPath | undefined> {
	if (!configArg) return undefined;
	const resolved = resolve(configArg);
	const s = await stat(resolved).catch(() => null);
	if (s?.isFile()) {
		const name = basename(resolved);
		const stem = name.replace(/\.(ts|mts|js|mjs)$/, "");
		return { cwd: dirname(resolved), configPath: stem };
	}
	if (s?.isDirectory()) return { cwd: resolved };
	return { cwd: resolved };
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
	readonly "update-fixtures"?: boolean | undefined;
	readonly "no-progress"?: boolean | undefined;
	readonly watch?: boolean | undefined;
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

			if (!args["auto-approve"]) {
				if (process.stdout.isTTY) {
					const shouldContinue = await confirmPrompt("Proceed with this run?");
					if (!shouldContinue) {
						logger.info("Run cancelled.");
						process.exit(0);
					}
				} else {
					throw new ConfigError(
						"--confirm-cost requires interactive TTY or --auto-approve in non-interactive environments.",
					);
				}
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
				validatedConfig.fixtureDir,
				rateLimiter,
				validatedConfig.judge?.call,
				previousRun,
				validatedConfig.plugins,
				(caseId, ageDays) => {
					logger.warn(
						`Fixture for case "${caseId}" is ${ageDays} days old. Consider re-recording.`,
					);
				},
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

async function loadConfigSafe(configArg: string | undefined): Promise<ValidatedConfig> {
	try {
		const resolved = await resolveConfigInput(configArg);
		return await loadConfig(resolved);
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

// ─── Watch mode ─────────────────────────────────────────────────────────────

async function executeWatch(args: ExecuteRunArgs): Promise<void> {
	const { createFileWatcher } = await import("../../watcher/file-watcher.js");
	const logger = createLogger({ verbose: args.verbose, quiet: args.quiet });

	// Determine watch paths
	const cwd = process.cwd();
	const watchPaths = [cwd];

	const watcher = createFileWatcher({
		paths: watchPaths,
		debounceMs: 300,
		onError: (err, path) => logger.warn(`[watch] Watcher error on ${path}: ${String(err)}`),
	});

	logger.info("[watch] Watching for changes... (press Ctrl+C to stop)");

	// Initial run
	await runOnce(args, logger);

	let isRunning = false;
	let pendingRerun = false;

	watcher.on("change", async (files) => {
		const relevantFiles = files.filter(
			(f) =>
				f.endsWith(".ts") ||
				f.endsWith(".js") ||
				f.endsWith(".jsonl") ||
				f.endsWith(".yaml") ||
				f.endsWith(".yml"),
		);
		if (relevantFiles.length === 0) return;

		if (isRunning) {
			pendingRerun = true;
			return;
		}

		isRunning = true;
		try {
			const shortNames = relevantFiles.map((f) => f.replace(`${cwd}/`, ""));
			logger.info(`\n[watch] Change detected: ${shortNames.join(", ")}`);

			// Clear terminal for clean output
			if (process.stdout.isTTY) {
				process.stdout.write("\x1bc");
			}

			await runOnce(args, logger);
			logger.info("\n[watch] Watching for changes...");

			// If changes arrived during the run, re-run once more
			while (pendingRerun) {
				pendingRerun = false;
				logger.info("\n[watch] Changes detected during run, re-running...");
				if (process.stdout.isTTY) {
					process.stdout.write("\x1bc");
				}
				await runOnce(args, logger);
				logger.info("\n[watch] Watching for changes...");
			}
		} finally {
			isRunning = false;
		}
	});

	// Wait for Ctrl+C
	await new Promise<void>((resolve) => {
		const handleSignal = (): void => {
			logger.info("\n[watch] Stopped.");
			watcher.close().then(resolve);
		};
		process.on("SIGINT", handleSignal);
		process.on("SIGTERM", handleSignal);
	});
}

async function runOnce(
	args: ExecuteRunArgs,
	logger: ReturnType<typeof createLogger>,
): Promise<void> {
	try {
		const validatedConfig = await loadConfigSafe(args.config);
		const suites = filterSuites(validatedConfig.suites, args.suite);

		const controller = new AbortController();

		for (const rawSuite of suites) {
			let suite = rawSuite;
			if (args.filter) {
				suite = filterCases(suite, args.filter);
			}

			const options = buildRunOptions(
				args,
				validatedConfig.run,
				suite,
				controller.signal,
				validatedConfig.fixtureDir,
				undefined,
				validatedConfig.judge?.call,
				undefined,
				validatedConfig.plugins,
			);
			const run = await runSuite(suite, options);
			await dispatchReporters(run, args, validatedConfig.reporters);
		}
	} catch (err) {
		logger.error(err instanceof Error ? err.message : String(err));
	}
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
		"update-fixtures": {
			type: "boolean" as const,
			description: "Re-record all fixtures (forces live mode + record)",
			default: false,
		},
		"no-progress": {
			type: "boolean" as const,
			description: "Disable live progress output",
			default: false,
		},
		watch: {
			type: "boolean" as const,
			alias: "w",
			description: "Watch for changes and re-run automatically",
			default: false,
		},
	},
	async run({ args }) {
		if (args.watch) {
			await executeWatch(args);
		} else {
			await executeRun(args);
		}
	},
});
