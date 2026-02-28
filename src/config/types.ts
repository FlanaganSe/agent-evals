import type { z } from "zod";
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

export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type CaseInput = z.infer<typeof CaseInputSchema>;
export type CaseCategory = z.infer<typeof CaseCategorySchema>;
export type TargetOutput = z.infer<typeof TargetOutputSchema>;
export type GradeResult = z.infer<typeof GradeResultSchema>;
export type CaseExpected = z.infer<typeof CaseExpectedSchema>;
export type Case = z.infer<typeof CaseSchema>;
export type GateConfig = z.infer<typeof GateConfigSchema>;
export type GateCheckResult = z.infer<typeof GateCheckResultSchema>;
export type GateResult = z.infer<typeof GateResultSchema>;
export type CategorySummary = z.infer<typeof CategorySummarySchema>;
export type Trial = z.infer<typeof TrialSchema>;
export type TrialStats = z.infer<typeof TrialStatsSchema>;
export type RunSummary = z.infer<typeof RunSummarySchema>;
export type RunMode = z.infer<typeof RunModeSchema>;
export type Run = z.infer<typeof RunSchema>;

// ─── Runtime-only types (not serializable, not Zod-validated) ────────────────

// ─── Judge types (Phase 4) ───────────────────────────────────────────────────

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

export interface JudgeCallOptions {
	readonly temperature?: number | undefined;
	readonly model?: string | undefined;
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

export type Target = (input: CaseInput) => Promise<TargetOutput>;

export type GraderFn = (
	output: TargetOutput,
	expected: CaseExpected | undefined,
	context: GraderContext,
) => Promise<GradeResult>;

export interface GraderContext {
	readonly caseId: string;
	readonly suiteId: string;
	readonly mode: RunMode;
	readonly graderName: string;
	readonly judge?: JudgeCallFn | undefined;
}

export interface GraderConfig {
	readonly grader: GraderFn;
	readonly weight?: number | undefined;
	readonly required?: boolean | undefined;
	readonly threshold?: number | undefined;
}

export type GraderFactory<TConfig> = (config: TConfig) => GraderFn;

export interface ReplayConfig {
	readonly ttlDays?: number | undefined;
	readonly stripRaw?: boolean | undefined;
}

export interface SuiteConfig {
	readonly name: string;
	readonly description?: string | undefined;
	readonly target: Target;
	readonly cases: readonly (Case | string)[] | string;
	readonly defaultGraders?: readonly GraderConfig[] | undefined;
	readonly gates?: GateConfig | undefined;
	readonly concurrency?: number | undefined;
	readonly tags?: readonly string[] | undefined;
	readonly targetVersion?: string | undefined;
	readonly replay?: ReplayConfig | undefined;
}

export interface EvalConfig {
	readonly suites: readonly SuiteConfig[];
	readonly run?:
		| {
				readonly defaultMode?: RunMode | undefined;
				readonly timeoutMs?: number | undefined;
				readonly rateLimit?: number | undefined;
		  }
		| undefined;
	readonly judge?: JudgeConfig | undefined;
	readonly plugins?: readonly import("../plugin/types.js").EvalPlugin[] | undefined;
	readonly reporters?: readonly ReporterConfig[] | undefined;
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

export interface ReporterConfigWithOptions {
	readonly reporter: string | import("../reporters/types.js").ReporterPlugin;
	readonly output?: string | undefined;
	readonly options?: Readonly<Record<string, unknown>> | undefined;
}

/** A suite with cases fully resolved (loaded from files if needed). */
export interface ResolvedSuite {
	readonly name: string;
	readonly description?: string | undefined;
	readonly target: Target;
	readonly cases: readonly Case[];
	readonly defaultGraders?: readonly GraderConfig[] | undefined;
	readonly gates?: GateConfig | undefined;
	readonly concurrency?: number | undefined;
	readonly tags?: readonly string[] | undefined;
	readonly targetVersion?: string | undefined;
	readonly replay?: ReplayConfig | undefined;
}

export interface RateLimiter {
	readonly acquire: (signal?: AbortSignal) => Promise<void>;
	readonly dispose: () => void;
}

export interface FixtureOptions {
	readonly baseDir: string;
	readonly stripRaw: boolean;
	readonly ttlDays: number;
	readonly strictFixtures: boolean;
}

export interface RunOptions {
	readonly mode: RunMode;
	readonly timeoutMs: number;
	readonly record?: boolean | undefined;
	readonly concurrency?: number | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly previousRunId?: string | undefined;
	readonly previousRun?: Run | undefined;
	readonly strictFixtures?: boolean | undefined;
	readonly fixtureDir?: string | undefined;
	readonly runDir?: string | undefined;
	readonly trials?: number | undefined;
	readonly rateLimiter?: RateLimiter | undefined;
	readonly judge?: JudgeCallFn | undefined;
	readonly plugins?: readonly import("../plugin/types.js").EvalPlugin[] | undefined;
	readonly configHash?: string | undefined;
	readonly fixtureOptions?: FixtureOptions | undefined;
	readonly onFixtureStale?: ((caseId: string, ageDays: number) => void) | undefined;
}

export interface RunMeta {
	readonly id: string;
	readonly suiteId: string;
	readonly mode: RunMode;
	readonly timestamp: string;
	readonly passRate: number;
}

export interface CaseResult {
	readonly pass: boolean;
	readonly score: number;
	readonly failedGraders: readonly string[];
	readonly reason: string;
}
