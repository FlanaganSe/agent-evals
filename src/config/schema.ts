import { z } from "zod";

// ─── Leaf types ───────────────────────────────────────────────────────────────

export const TokenUsageSchema = z.strictObject({
	input: z.number().int().nonnegative(),
	output: z.number().int().nonnegative(),
});

export const ToolCallSchema = z.strictObject({
	name: z.string(),
	args: z.record(z.string(), z.unknown()).optional(),
	result: z.unknown().optional(),
});

export const CaseInputSchema = z.record(z.string(), z.unknown());

export const CaseCategorySchema = z.union([
	z.literal("happy_path"),
	z.literal("edge_case"),
	z.literal("adversarial"),
	z.literal("multi_step"),
	z.literal("regression"),
]);

// ─── Composed types ──────────────────────────────────────────────────────────

export const TargetOutputSchema = z.strictObject({
	text: z.string().optional(),
	toolCalls: z.array(ToolCallSchema).readonly().optional(),
	latencyMs: z.number().nonnegative(),
	tokenUsage: TokenUsageSchema.optional(),
	cost: z.number().nonnegative().optional(),
	raw: z.unknown().optional(),
});

export const GradeResultSchema = z.strictObject({
	pass: z.boolean(),
	score: z.number().min(0).max(1),
	reason: z.string(),
	graderName: z.string(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CaseExpectedSchema = z.strictObject({
	text: z.string().optional(),
	toolCalls: z.array(ToolCallSchema).readonly().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SerializedGraderConfigSchema = z.strictObject({
	graderName: z.string(),
	weight: z.number().default(1.0),
	required: z.boolean().default(false),
	threshold: z.number().min(0).max(1).default(0.5),
});

export const GateConfigSchema = z.strictObject({
	passRate: z.number().min(0).max(1).optional(),
	maxCost: z.number().nonnegative().optional(),
	p95LatencyMs: z.number().nonnegative().optional(),
});

export const CaseSchema = z.strictObject({
	id: z.string(),
	description: z.string().optional(),
	input: CaseInputSchema,
	expected: CaseExpectedSchema.optional(),
	category: CaseCategorySchema.optional(),
	tags: z.array(z.string()).readonly().optional(),
});

// Note: SuiteConfigSchema is intentionally NOT defined here because it contains
// runtime-only types (target function, GraderFn) that are not serializable.
// Suite validation happens at the runtime level in types.ts / loader.ts.

export const ReplayConfigSchema = z.strictObject({
	ttlDays: z.number().int().positive().default(14),
	stripRaw: z.boolean().default(true),
});

export const SuiteConfigSchema = z.strictObject({
	name: z.string(),
	description: z.string().optional(),
	cases: z.union([z.array(z.union([CaseSchema, z.string()])).readonly(), z.string()]),
	gates: GateConfigSchema.optional(),
	concurrency: z.number().int().positive().optional(),
	tags: z.array(z.string()).readonly().optional(),
	targetVersion: z.string().optional(),
	replay: ReplayConfigSchema.optional(),
});

// ─── Execution types ─────────────────────────────────────────────────────────

export const TrialSchema = z.strictObject({
	caseId: z.string(),
	status: z.union([z.literal("pass"), z.literal("fail"), z.literal("error")]),
	output: TargetOutputSchema,
	grades: z.array(GradeResultSchema).readonly(),
	score: z.number().min(0).max(1),
	durationMs: z.number().nonnegative(),
	trialIndex: z.number().int().nonnegative().optional(),
});

export const TrialStatsSchema = z.strictObject({
	trialCount: z.number().int().positive(),
	passCount: z.number().int().nonnegative(),
	failCount: z.number().int().nonnegative(),
	errorCount: z.number().int().nonnegative(),
	passRate: z.number().min(0).max(1),
	meanScore: z.number().min(0).max(1),
	scoreStdDev: z.number().min(0),
	ci95Low: z.number().min(0).max(1),
	ci95High: z.number().min(0).max(1),
	flaky: z.boolean(),
});

export const GateCheckResultSchema = z.strictObject({
	gate: z.string(),
	pass: z.boolean(),
	actual: z.number(),
	threshold: z.number(),
	reason: z.string(),
});

export const GateResultSchema = z.strictObject({
	pass: z.boolean(),
	results: z.array(GateCheckResultSchema).readonly(),
});

export const CategorySummarySchema = z.strictObject({
	total: z.number().int().nonnegative(),
	passed: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative(),
	errors: z.number().int().nonnegative(),
	passRate: z.number().min(0).max(1),
});

export const RunSummarySchema = z.strictObject({
	totalCases: z.number().int().nonnegative(),
	passed: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative(),
	errors: z.number().int().nonnegative(),
	passRate: z.number().min(0).max(1),
	totalCost: z.number().nonnegative(),
	totalDurationMs: z.number().nonnegative(),
	p95LatencyMs: z.number().nonnegative(),
	gateResult: GateResultSchema,
	byCategory: z.record(z.string(), CategorySummarySchema).optional(),
	aborted: z.boolean().optional(),
	trialStats: z.record(z.string(), TrialStatsSchema).optional(),
});

export const RunModeSchema = z.union([
	z.literal("live"),
	z.literal("replay"),
	z.literal("judge-only"),
]);

export const RunSchema = z.strictObject({
	schemaVersion: z.string(),
	id: z.string(),
	suiteId: z.string(),
	mode: RunModeSchema,
	trials: z.array(TrialSchema).readonly(),
	summary: RunSummarySchema,
	timestamp: z.string(),
	configHash: z.string(),
	frameworkVersion: z.string(),
});

// ─── Fixture types ──────────────────────────────────────────────────────────

export const FixtureMetaSchema = z.strictObject({
	schemaVersion: z.string(),
	suiteId: z.string(),
	caseId: z.string(),
	configHash: z.string(),
	recordedAt: z.string(),
	frameworkVersion: z.string(),
});

export const FixtureEntrySchema = z.strictObject({
	_meta: FixtureMetaSchema.optional(),
	output: TargetOutputSchema,
});

// ─── Top-level config schema (serializable portion only) ─────────────────────

export const EvalConfigSchema = z.strictObject({
	suites: z.array(SuiteConfigSchema).readonly(),
	run: z
		.strictObject({
			defaultMode: RunModeSchema.optional(),
			timeoutMs: z.number().int().positive().optional(),
			rateLimit: z.number().int().positive().optional(),
		})
		.optional(),
	fixtureDir: z.string().optional(),
});
