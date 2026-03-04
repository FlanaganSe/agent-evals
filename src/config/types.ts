import type { z } from "zod";
import type { RateLimiter } from "../runner/rate-limiter.js";
import type {
	CaseCategorySchema,
	CaseExpectedSchema,
	CaseInputSchema,
	CaseSchema,
	CategorySummarySchema,
	GateCheckResultSchema,
	GateConfigSchema,
	GateResultSchema,
	GradeResultSchema,
	RunModeSchema,
	RunSchema,
	RunSummarySchema,
	TargetOutputSchema,
	TokenUsageSchema,
	ToolCallSchema,
	TrialSchema,
	TrialStatsSchema,
} from "./schema.js";

// ─── Inferred from Zod (serializable types) ─────────────────────────────────

/** LLM token consumption counts (input and output tokens). */
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/** A single tool invocation with name, arguments, and optional result. */
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** Arbitrary key-value input passed to the target function. Defined per-case in config or JSONL/YAML files. */
export type CaseInput = z.infer<typeof CaseInputSchema>;

/** Case classification category for per-category reporting: `"happy_path"`, `"edge_case"`, `"adversarial"`, `"multi_step"`, or `"regression"`. */
export type CaseCategory = z.infer<typeof CaseCategorySchema>;

/** Structured output returned by a target function. Must include `latencyMs`; `text`, `toolCalls`, `tokenUsage`, `cost`, and `raw` are optional. */
export type TargetOutput = z.infer<typeof TargetOutputSchema>;

/** Result of a single grader evaluation. Contains a boolean pass/fail, a 0-1 normalized score, a human-readable reason, and the grader name. */
export type GradeResult = z.infer<typeof GradeResultSchema>;

/** Expected output for comparison-based graders. Use `text` for factuality, `toolCalls` for tool graders, and `metadata.classification` for llmClassify. */
export type CaseExpected = z.infer<typeof CaseExpectedSchema>;

/** A single test case with a unique ID, input payload, optional expected output, category, and tags. */
export type Case = z.infer<typeof CaseSchema>;

/** Suite-level quality gate thresholds. All configured gates must pass for the suite to pass. */
export type GateConfig = z.infer<typeof GateConfigSchema>;

/** Result of checking a single gate threshold, including the actual value, threshold, and pass/fail. */
export type GateCheckResult = z.infer<typeof GateCheckResultSchema>;

/** Aggregate gate result: overall pass/fail plus individual gate check results. */
export type GateResult = z.infer<typeof GateResultSchema>;

/** Per-category pass/fail statistics within a run summary. */
export type CategorySummary = z.infer<typeof CategorySummarySchema>;

/** A single trial — one execution of a case through the target and grading pipeline. Contains the output, all grade results, and a weighted score. */
export type Trial = z.infer<typeof TrialSchema>;

/** Aggregate statistics across multiple trials of a single case. Includes Wilson score confidence intervals and flakiness detection. */
export type TrialStats = z.infer<typeof TrialStatsSchema>;

/** Aggregate statistics for a complete suite run. Includes pass rate, cost, latency, gate results, and optional per-category and per-case trial stats. */
export type RunSummary = z.infer<typeof RunSummarySchema>;

/** Execution mode: `"live"` calls the target, `"replay"` uses cached fixtures, `"judge-only"` re-grades output from a previous run. */
export type RunMode = z.infer<typeof RunModeSchema>;

/** Complete persisted result of a suite execution. Stored as JSON in `.eval-runs/` with a schemaVersion for backward compatibility. */
export type Run = z.infer<typeof RunSchema>;

// ─── Runtime-only types (not serializable, not Zod-validated) ────────────────

// ─── Judge types ─────────────────────────────────────────────────────────────

/**
 * A single message in a judge conversation.
 * Maps directly to OpenAI/Anthropic/etc message format.
 */
export interface JudgeMessage {
	readonly role: "system" | "user" | "assistant";
	readonly content: string;
}

/**
 * Response from a judge LLM call.
 * The framework parses this — users return raw text from their LLM call.
 */
export interface JudgeResponse {
	readonly text: string;
	readonly tokenUsage?: TokenUsage | undefined;
	readonly cost?: number | undefined;
	readonly modelId?: string | undefined;
}

/**
 * Provider-agnostic judge call function.
 * Users implement this with their preferred LLM SDK.
 *
 * @example OpenAI adapter:
 * ```ts
 * const judgeCall: JudgeCallFn = async (messages, options) => {
 *   const response = await openai.chat.completions.create({
 *     model: options?.model ?? "gpt-4o",
 *     messages: messages.map(m => ({ role: m.role, content: m.content })),
 *     temperature: options?.temperature ?? 0,
 *   });
 *   return {
 *     text: response.choices[0].message.content ?? "",
 *     tokenUsage: {
 *       input: response.usage?.prompt_tokens ?? 0,
 *       output: response.usage?.completion_tokens ?? 0,
 *     },
 *   };
 * };
 * ```
 */
export type JudgeCallFn = (
	messages: readonly JudgeMessage[],
	options?: JudgeCallOptions,
) => Promise<JudgeResponse>;

/** Options passed to the judge LLM call. Used to override model, temperature, or token limits per-call. */
export interface JudgeCallOptions {
	/** LLM sampling temperature. Use 0 for deterministic (cacheable) judge calls. */
	readonly temperature?: number | undefined;
	/** Override the model used for this judge call. */
	readonly model?: string | undefined;
	/** Maximum tokens for the judge response. */
	readonly maxTokens?: number | undefined;
}

/**
 * Judge configuration in EvalConfig.
 * Attached at the config level (not per-grader) so all LLM graders share one judge.
 */
export interface JudgeConfig {
	readonly call: JudgeCallFn;
	readonly model?: string | undefined;
	readonly temperature?: number | undefined;
	readonly maxTokens?: number | undefined;
}

// ─── Target ──────────────────────────────────────────────────────────────────

/** The function users implement to wrap their AI agent or LLM pipeline. Receives a CaseInput and must return a TargetOutput. */
export type Target = (input: CaseInput) => Promise<TargetOutput>;

/** Core grading function signature. Receives the target output, optional expected values, and a runtime context. Returns a GradeResult with pass/fail, score, and reason. */
export type GraderFn = (
	output: TargetOutput,
	expected: CaseExpected | undefined,
	context: GraderContext,
) => Promise<GradeResult>;

/** Runtime context injected into graders during pipeline execution. Provides case/suite metadata and an optional judge function for LLM graders. */
export interface GraderContext {
	readonly caseId: string;
	readonly suiteId: string;
	readonly mode: RunMode;
	readonly graderName: string;
	/** Judge function for LLM-based graders. Only present when `judge` is configured in EvalConfig. */
	readonly judge?: JudgeCallFn | undefined;
}

/** Configuration for a grader within a suite. */
export interface GraderConfig {
	readonly grader: GraderFn;
	/** Relative weight for scoring. Higher weight means more influence on the case score. @default 1.0 */
	readonly weight?: number | undefined;
	/** If true, the case fails immediately when this grader fails, regardless of other graders. @default false */
	readonly required?: boolean | undefined;
	/** Minimum score (0-1) for this grader to be considered passing. When unset, the pipeline uses the minimum threshold across all graders in the suite, falling back to 0.5. */
	readonly threshold?: number | undefined;
}

/** Generic factory for parameterized graders. Takes a configuration object and returns a GraderFn. */
export type GraderFactory<TConfig> = (config: TConfig) => GraderFn;

/** Fixture replay behavior settings for a suite. */
export interface ReplayConfig {
	/** Number of days before a fixture is considered stale. @default 14 */
	readonly ttlDays?: number | undefined;
	/** Strip the `raw` field from target output when recording fixtures to reduce size. @default true */
	readonly stripRaw?: boolean | undefined;
}

/** Configuration for a single eval suite. Defines the target, cases, graders, gates, and replay settings. */
export interface SuiteConfig {
	/** Unique suite name used as an identifier in runs, fixtures, and CLI output. */
	readonly name: string;
	readonly description?: string | undefined;
	/** The target function to evaluate. Called with each case's input in live mode. */
	readonly target: Target;
	/** Test cases: inline Case objects, file paths to JSONL/YAML files, or a single file path string. */
	readonly cases: readonly (Case | string)[] | string;
	/** Graders applied to all cases in this suite. */
	readonly defaultGraders?: readonly GraderConfig[] | undefined;
	/** Suite-level quality gates. All configured gates must pass for the suite to pass. */
	readonly gates?: GateConfig | undefined;
	/** Maximum concurrent target calls. @default 1 */
	readonly concurrency?: number | undefined;
	readonly tags?: readonly string[] | undefined;
	/** Opaque version string for fixture invalidation. Change this when your target's behavior changes to force re-recording. */
	readonly targetVersion?: string | undefined;
	readonly replay?: ReplayConfig | undefined;
}

/** Top-level eval configuration passed to `defineConfig()`. Defines suites, global run settings, judge, plugins, and reporters. */
export interface EvalConfig {
	readonly suites: readonly SuiteConfig[];
	readonly run?:
		| {
				/** Default execution mode when not specified via CLI. @default "live" */
				readonly defaultMode?: RunMode | undefined;
				/** Timeout in milliseconds for each target call. @default 30000 */
				readonly timeoutMs?: number | undefined;
				/** Maximum target calls per minute (token bucket rate limiting). */
				readonly rateLimit?: number | undefined;
		  }
		| undefined;
	/** Global judge configuration shared by all LLM graders. Required when using llmRubric, factuality, or llmClassify. */
	readonly judge?: JudgeConfig | undefined;
	readonly plugins?: readonly import("../plugin/types.js").EvalPlugin[] | undefined;
	readonly reporters?: readonly ReporterConfig[] | undefined;
	/** Directory for fixture storage, relative to the project root. @default ".eval-fixtures" */
	readonly fixtureDir?: string | undefined;
}

/**
 * Reporter config entry in EvalConfig.
 * Can be a string name (for built-in reporters) or a ReporterPlugin object.
 */
export type ReporterConfig =
	| string
	| import("../reporters/types.js").ReporterPlugin
	| ReporterConfigWithOptions;

/** Reporter config with explicit output path and options. */
export interface ReporterConfigWithOptions {
	readonly reporter: string | import("../reporters/types.js").ReporterPlugin;
	/** Output file path. If undefined, writes to stdout. */
	readonly output?: string | undefined;
	readonly options?: Readonly<Record<string, unknown>> | undefined;
}

/** A suite with cases fully resolved (loaded from JSONL/YAML files if needed). This is the resolved form used by the runner. */
export interface ResolvedSuite {
	readonly name: string;
	readonly description?: string | undefined;
	readonly target: Target;
	/** All cases fully loaded and deduplicated. File paths have been resolved to inline Case objects. */
	readonly cases: readonly Case[];
	readonly defaultGraders?: readonly GraderConfig[] | undefined;
	readonly gates?: GateConfig | undefined;
	readonly concurrency?: number | undefined;
	readonly tags?: readonly string[] | undefined;
	readonly targetVersion?: string | undefined;
	readonly replay?: ReplayConfig | undefined;
}

export type { RateLimiter };

/** Resolved fixture settings used by the runner. All defaults have been applied. */
export interface FixtureOptions {
	/** Absolute path to the fixture storage directory. */
	readonly baseDir: string;
	/** Whether to strip the `raw` field from recorded fixtures. */
	readonly stripRaw: boolean;
	/** Number of days before a fixture is considered stale. */
	readonly ttlDays: number;
	/** If true, missing or stale fixtures cause an error instead of falling back to live mode. */
	readonly strictFixtures: boolean;
}

/** Full set of options for executing a suite run via `runSuite()`. */
export interface RunOptions {
	readonly mode: RunMode;
	/** Timeout in milliseconds for each target call. */
	readonly timeoutMs: number;
	/** Record fixtures for future replay when running in live mode. */
	readonly record?: boolean | undefined;
	readonly concurrency?: number | undefined;
	/** AbortSignal for cancelling the run. */
	readonly signal?: AbortSignal | undefined;
	/** Run ID of the previous run. Used in judge-only mode to load output from a prior run. */
	readonly previousRunId?: string | undefined;
	/** Previous run object. Used in judge-only mode to re-grade existing output without reloading from disk. */
	readonly previousRun?: Run | undefined;
	/** If true, missing or stale fixtures cause an error in replay mode. */
	readonly strictFixtures?: boolean | undefined;
	/** Directory for storing run artifacts. @default ".eval-runs" */
	readonly runDir?: string | undefined;
	/** Number of times to execute each case. Enables flakiness detection and statistical analysis. @default 1 */
	readonly trials?: number | undefined;
	readonly rateLimiter?: RateLimiter | undefined;
	/** Judge function for LLM graders. Overrides the config-level judge. */
	readonly judge?: JudgeCallFn | undefined;
	readonly plugins?: readonly import("../plugin/types.js").EvalPlugin[] | undefined;
	/** Hash of the suite configuration for fixture invalidation. */
	readonly configHash?: string | undefined;
	readonly fixtureOptions?: FixtureOptions | undefined;
	/** Callback invoked when a fixture is stale but still usable. Receives the case ID and fixture age in days. */
	readonly onFixtureStale?: ((caseId: string, ageDays: number) => void) | undefined;
}

/** Lightweight run metadata returned by `listRuns()`. Contains just enough info for display without loading the full run. */
export interface RunMeta {
	readonly id: string;
	readonly suiteId: string;
	readonly mode: RunMode;
	readonly timestamp: string;
	readonly passRate: number;
}

/** Aggregated pass/fail result across all graders for a single case. Computed from individual GradeResult scores and weights. */
export interface CaseResult {
	readonly pass: boolean;
	/** Weighted average score across all graders, normalized to 0-1. */
	readonly score: number;
	/** Names of graders that failed for this case. */
	readonly failedGraders: readonly string[];
	readonly reason: string;
}
