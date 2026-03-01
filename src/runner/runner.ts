import { createHash, randomUUID } from "node:crypto";
import type {
	Case,
	CaseCategory,
	CategorySummary,
	ResolvedSuite,
	Run,
	RunOptions,
	RunSummary,
	TargetOutput,
	Trial,
} from "../config/types.js";
import { readFixture, writeFixture } from "../fixtures/fixture-store.js";
import { VERSION } from "../index.js";
import { createHookDispatcher } from "../plugin/hooks.js";
import { evaluateGates } from "./gate.js";
import { runJudgeOnly } from "./judge-only.js";
import { runGraderPipeline } from "./pipeline.js";
import { computeAllTrialStats } from "./statistics.js";

const SCHEMA_VERSION = "1.0.0";

interface TrialWorkItem {
	readonly testCase: Case;
	readonly trialIndex: number;
}

/**
 * Executes a suite against the target function.
 * Supports trials, concurrency, rate limiting, and abort signals.
 *
 * In judge-only mode, re-grades trials from a previous run without
 * re-executing the target. Requires `options.previousRun` to be set.
 */
export async function runSuite(suite: ResolvedSuite, options: RunOptions): Promise<Run> {
	if (options.mode === "judge-only") {
		return runSuiteJudgeOnly(suite, options);
	}

	const dispatcher = createHookDispatcher(options.plugins ?? [], {
		warn: (msg) => process.stderr.write(`${msg}\n`),
	});
	const runId = randomUUID();
	const startTime = Date.now();
	const trialCount = options.trials ?? 1;
	const totalTrialCount = suite.cases.length * trialCount;

	await dispatcher.beforeRun({
		suiteId: suite.name,
		mode: options.mode,
		caseCount: suite.cases.length,
		trialCount: totalTrialCount,
	});

	const workItems = expandTrials(suite.cases, trialCount);
	let aborted = false;
	let completedCount = 0;

	const trials: Trial[] = await concurrentMap(
		workItems,
		async (item) => {
			if (options.signal?.aborted) {
				aborted = true;
				return null;
			}

			if (options.rateLimiter && options.mode === "live") {
				await options.rateLimiter.acquire(options.signal);
			}

			const trial = await executeCase(item.testCase, suite, options, item.trialIndex);
			completedCount++;
			await dispatcher.afterTrial(trial, {
				suiteId: suite.name,
				completedCount,
				totalCount: totalTrialCount,
			});
			return trial;
		},
		options.concurrency ?? 1,
		options.signal,
	);

	// Check if abort happened during execution
	if (options.signal?.aborted) {
		aborted = true;
	}

	// Sort trials deterministically by (caseId, trialIndex)
	trials.sort((a, b) => {
		const caseCompare = a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0;
		if (caseCompare !== 0) return caseCompare;
		return (a.trialIndex ?? 0) - (b.trialIndex ?? 0);
	});

	const totalDurationMs = Date.now() - startTime;
	const trialStats = computeAllTrialStats(trials, options.trials);
	const partialSummary = computePartialSummary(
		trials,
		suite.cases,
		totalDurationMs,
		trialStats,
		aborted,
	);
	const gateResult = evaluateGates(partialSummary, suite.gates);

	const summary: RunSummary = {
		...partialSummary,
		gateResult,
	};

	const run: Run = {
		schemaVersion: SCHEMA_VERSION,
		id: runId,
		suiteId: suite.name,
		mode: options.mode,
		trials,
		summary,
		timestamp: new Date().toISOString(),
		configHash: computeConfigHash(suite),
		frameworkVersion: VERSION,
	};

	await dispatcher.afterRun(run);

	return run;
}

async function runSuiteJudgeOnly(suite: ResolvedSuite, options: RunOptions): Promise<Run> {
	if (!options.previousRun) {
		throw new Error("--mode=judge-only requires --run-id=<id> to specify a previous run.");
	}

	const runId = randomUUID();
	const startTime = Date.now();

	const trials = await runJudgeOnly({
		previousRun: options.previousRun,
		suiteConfig: suite,
		runOptions: options,
	});

	// Sort trials deterministically
	const sortedTrials = [...trials].sort((a, b) => {
		const caseCompare = a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0;
		if (caseCompare !== 0) return caseCompare;
		return (a.trialIndex ?? 0) - (b.trialIndex ?? 0);
	});

	const totalDurationMs = Date.now() - startTime;
	const trialStats = computeAllTrialStats(sortedTrials, options.trials);
	const partialSummary = computePartialSummary(
		sortedTrials,
		suite.cases,
		totalDurationMs,
		trialStats,
		false,
	);
	const gateResult = evaluateGates(partialSummary, suite.gates);

	const summary: RunSummary = { ...partialSummary, gateResult };

	return {
		schemaVersion: SCHEMA_VERSION,
		id: runId,
		suiteId: suite.name,
		mode: "judge-only",
		trials: sortedTrials,
		summary,
		timestamp: new Date().toISOString(),
		configHash: computeConfigHash(suite),
		frameworkVersion: VERSION,
	};
}

function expandTrials(cases: readonly Case[], trialCount: number): readonly TrialWorkItem[] {
	const items: TrialWorkItem[] = [];
	for (const testCase of cases) {
		for (let i = 0; i < trialCount; i++) {
			items.push({ testCase, trialIndex: i });
		}
	}
	return items;
}

/**
 * Run items concurrently with bounded parallelism.
 * Returns completed results (nulls from aborted items are filtered out).
 */
async function concurrentMap<TIn, TOut>(
	items: readonly TIn[],
	fn: (item: TIn) => Promise<TOut | null>,
	concurrency: number,
	signal?: AbortSignal,
): Promise<TOut[]> {
	const results: TOut[] = [];
	let index = 0;

	async function worker(): Promise<void> {
		while (index < items.length) {
			if (signal?.aborted) return;
			const currentIndex = index++;
			const item = items[currentIndex];
			if (!item) return;
			const result = await fn(item);
			if (result !== null) {
				results.push(result);
			}
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
	await Promise.all(workers);
	return results;
}

async function executeCase(
	testCase: Case,
	suite: ResolvedSuite,
	options: RunOptions,
	trialIndex: number,
): Promise<Trial> {
	const caseStart = Date.now();

	let output: TargetOutput;

	if (options.mode === "replay" && options.fixtureOptions && options.configHash) {
		// Replay mode — load from fixture store
		const fixtureResult = await readFixture(
			suite.name,
			testCase.id,
			options.configHash,
			options.fixtureOptions,
		);

		if (fixtureResult.status === "miss") {
			if (fixtureResult.reason === "not-found") {
				throw new Error(
					`No fixture found for case "${testCase.id}" in suite "${suite.name}". ` +
						`Run with --mode=live --record to create fixtures.`,
				);
			}
			if (fixtureResult.reason === "config-hash-mismatch") {
				throw new Error(
					`Fixture for case "${testCase.id}" was recorded with a different config (hash: ${fixtureResult.recordedHash}). ` +
						`Re-record with --mode=live --record or bump targetVersion.`,
				);
			}
		}

		if (fixtureResult.status === "stale") {
			if (options.strictFixtures) {
				throw new Error(
					`Fixture for case "${testCase.id}" is ${fixtureResult.ageDays} days old (TTL: ${options.fixtureOptions.ttlDays} days). ` +
						`Re-record or pass --no-strict-fixtures.`,
				);
			}
			options.onFixtureStale?.(testCase.id, fixtureResult.ageDays);
		}

		output =
			fixtureResult.status === "hit" || fixtureResult.status === "stale"
				? fixtureResult.output
				: // Should never reach here — handled by miss cases above
					({ text: "", latencyMs: 0 } satisfies TargetOutput);
	} else {
		// Live mode — call target
		try {
			output = await withTimeout(
				() => suite.target(testCase.input),
				options.timeoutMs,
				options.signal,
			);
		} catch (err) {
			const durationMs = Date.now() - caseStart;
			const message = err instanceof Error ? err.message : String(err);
			return {
				caseId: testCase.id,
				status: "error",
				output: {
					text: `Target error: ${message}`,
					latencyMs: durationMs,
				},
				grades: [],
				score: 0,
				durationMs,
				trialIndex: options.trials && options.trials > 1 ? trialIndex : undefined,
			};
		}

		// Record fixture if requested
		if (options.record && options.fixtureOptions && options.configHash) {
			await writeFixture(
				suite.name,
				testCase.id,
				output,
				options.configHash,
				options.fixtureOptions,
			);
		}
	}

	const durationMs = Date.now() - caseStart;
	const pipelineResult = await runGraderPipeline(
		output,
		testCase.expected,
		undefined,
		suite.defaultGraders,
		{
			caseId: testCase.id,
			suiteId: suite.name,
			mode: options.mode,
			judge: options.judge,
		},
	);

	const status = pipelineResult.caseResult.pass ? "pass" : "fail";

	return {
		caseId: testCase.id,
		status,
		output,
		grades: pipelineResult.grades,
		score: pipelineResult.caseResult.score,
		durationMs,
		trialIndex: options.trials && options.trials > 1 ? trialIndex : undefined,
	};
}

async function withTimeout<T>(
	fn: () => Promise<T>,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<T> {
	if (signal?.aborted) {
		throw new Error("Aborted");
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	const onAbort = (): void => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });

	try {
		const result = await Promise.race([
			fn(),
			new Promise<never>((_, reject) => {
				controller.signal.addEventListener("abort", () => {
					const reason = signal?.aborted ? "Aborted" : `Timeout after ${timeoutMs}ms`;
					reject(new Error(reason));
				});
			}),
		]);
		return result;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}

function computePartialSummary(
	trials: readonly Trial[],
	cases: readonly Case[],
	totalDurationMs: number,
	trialStats: Record<string, import("./statistics.js").TrialStats> | undefined,
	aborted: boolean,
): Omit<RunSummary, "gateResult"> {
	const totalCost = trials.reduce((sum, t) => sum + (t.output.cost ?? 0), 0);
	const p95LatencyMs = computeP95(trials.map((t) => t.output.latencyMs));
	const byCategory = computeByCategory(trials, cases, trialStats);

	// When using trials (pass^k semantics), count unique cases
	if (trialStats) {
		const caseIds = [...new Set(trials.map((t) => t.caseId))];
		const totalCases = caseIds.length;
		const passed = caseIds.filter((id) => {
			const stats = trialStats[id];
			return stats && stats.passCount === stats.trialCount;
		}).length;
		const errored = caseIds.filter((id) => {
			const stats = trialStats[id];
			return stats && stats.errorCount === stats.trialCount;
		}).length;
		const failed = totalCases - passed - errored;

		return {
			totalCases,
			passed,
			failed,
			errors: errored,
			passRate: totalCases > 0 ? passed / totalCases : 0,
			totalCost,
			totalDurationMs,
			p95LatencyMs,
			byCategory: Object.keys(byCategory).length > 0 ? byCategory : undefined,
			aborted: aborted || undefined,
			trialStats,
		};
	}

	// Single trial per case — original logic
	const passed = trials.filter((t) => t.status === "pass").length;
	const failed = trials.filter((t) => t.status === "fail").length;
	const errors = trials.filter((t) => t.status === "error").length;
	const totalCases = trials.length;
	const passRate = totalCases > 0 ? passed / totalCases : 0;

	return {
		totalCases,
		passed,
		failed,
		errors,
		passRate,
		totalCost,
		totalDurationMs,
		p95LatencyMs,
		byCategory: Object.keys(byCategory).length > 0 ? byCategory : undefined,
		aborted: aborted || undefined,
	};
}

function computeP95(values: readonly number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.ceil(0.95 * sorted.length) - 1;
	return sorted[Math.max(0, idx)] ?? 0;
}

function computeByCategory(
	trials: readonly Trial[],
	cases: readonly Case[],
	trialStats?: Record<string, import("./statistics.js").TrialStats> | undefined,
): Record<string, CategorySummary> {
	const categoryMap = new Map<string, CaseCategory>();
	for (const c of cases) {
		if (c.category !== undefined) {
			categoryMap.set(c.id, c.category);
		}
	}

	if (categoryMap.size === 0) return {};

	const buckets = new Map<
		CaseCategory,
		{ total: number; passed: number; failed: number; errors: number }
	>();

	if (trialStats) {
		// Multi-trial: aggregate by unique case using pass^k semantics
		const caseIds = [...new Set(trials.map((t) => t.caseId))];
		for (const caseId of caseIds) {
			const category = categoryMap.get(caseId);
			if (category === undefined) continue;

			let bucket = buckets.get(category);
			if (bucket === undefined) {
				bucket = { total: 0, passed: 0, failed: 0, errors: 0 };
				buckets.set(category, bucket);
			}
			bucket.total += 1;
			const stats = trialStats[caseId];
			if (stats && stats.passCount === stats.trialCount) bucket.passed += 1;
			else if (stats && stats.errorCount === stats.trialCount) bucket.errors += 1;
			else bucket.failed += 1;
		}
	} else {
		// Single trial per case — count trials directly
		for (const trial of trials) {
			const category = categoryMap.get(trial.caseId);
			if (category === undefined) continue;

			let bucket = buckets.get(category);
			if (bucket === undefined) {
				bucket = { total: 0, passed: 0, failed: 0, errors: 0 };
				buckets.set(category, bucket);
			}
			bucket.total += 1;
			if (trial.status === "pass") bucket.passed += 1;
			else if (trial.status === "fail") bucket.failed += 1;
			else bucket.errors += 1;
		}
	}

	const result: Record<string, CategorySummary> = {};
	for (const [category, bucket] of buckets) {
		result[category] = {
			total: bucket.total,
			passed: bucket.passed,
			failed: bucket.failed,
			errors: bucket.errors,
			passRate: bucket.total > 0 ? bucket.passed / bucket.total : 0,
		};
	}

	return result;
}

function computeConfigHash(suite: ResolvedSuite): string {
	const hashInput = JSON.stringify({
		name: suite.name,
		caseCount: suite.cases.length,
		caseIds: suite.cases.map((c) => c.id),
		gates: suite.gates,
	});
	return createHash("sha256").update(hashInput).digest("hex").slice(0, 16);
}
