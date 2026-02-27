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
}

export interface GraderConfig {
	readonly grader: GraderFn;
	readonly weight?: number | undefined;
	readonly required?: boolean | undefined;
	readonly threshold?: number | undefined;
}

export type GraderFactory<TConfig> = (config: TConfig) => GraderFn;

export interface SuiteConfig {
	readonly name: string;
	readonly description?: string | undefined;
	readonly target: Target;
	readonly cases: readonly Case[] | string;
	readonly defaultGraders?: readonly GraderConfig[] | undefined;
	readonly gates?: GateConfig | undefined;
	readonly concurrency?: number | undefined;
	readonly tags?: readonly string[] | undefined;
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
}

export interface RateLimiter {
	readonly acquire: (signal?: AbortSignal) => Promise<void>;
	readonly dispose: () => void;
}

export interface RunOptions {
	readonly mode: RunMode;
	readonly timeoutMs: number;
	readonly record?: boolean | undefined;
	readonly concurrency?: number | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly previousRunId?: string | undefined;
	readonly strictFixtures?: boolean | undefined;
	readonly fixtureDir?: string | undefined;
	readonly runDir?: string | undefined;
	readonly trials?: number | undefined;
	readonly rateLimiter?: RateLimiter | undefined;
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
