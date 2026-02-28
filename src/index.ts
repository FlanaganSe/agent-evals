export const VERSION = "0.0.1";

// Comparison
export { type CompareOptions, compareRuns } from "./comparison/compare.js";
export { type ComparisonFormatOptions, formatComparisonReport } from "./comparison/format.js";
export type {
	CaseComparison,
	CategoryComparisonSummary,
	ChangeDirection,
	ComparisonSummary,
	GraderChange,
	RunComparison,
} from "./comparison/types.js";
// Config
export { defineConfig } from "./config/define-config.js";
export type { LoadConfigOptions, ValidatedConfig } from "./config/loader.js";
export { loadConfig } from "./config/loader.js";
// Schemas
export {
	CaseCategorySchema,
	CaseExpectedSchema,
	CaseInputSchema,
	CaseSchema,
	CategorySummarySchema,
	EvalConfigSchema,
	FixtureEntrySchema,
	FixtureMetaSchema,
	GateCheckResultSchema,
	GateConfigSchema,
	GateResultSchema,
	GradeResultSchema,
	ReplayConfigSchema,
	RunModeSchema,
	RunSchema,
	RunSummarySchema,
	SerializedGraderConfigSchema,
	SuiteConfigSchema,
	TargetOutputSchema,
	TokenUsageSchema,
	ToolCallSchema,
	TrialSchema,
	TrialStatsSchema,
} from "./config/schema.js";
export type {
	Case,
	CaseCategory,
	CaseExpected,
	CaseInput,
	CaseResult,
	CategorySummary,
	EvalConfig,
	FixtureOptions,
	GateCheckResult,
	GateConfig,
	GateResult,
	GraderConfig,
	GraderContext,
	GraderFactory,
	GraderFn,
	JudgeCallFn,
	JudgeCallOptions,
	JudgeConfig,
	JudgeMessage,
	JudgeResponse,
	RateLimiter,
	ReplayConfig,
	ReporterConfig,
	ReporterConfigWithOptions,
	ResolvedSuite,
	Run,
	RunMeta,
	RunMode,
	RunOptions,
	RunSummary,
	SuiteConfig,
	Target,
	TargetOutput,
	TokenUsage,
	ToolCall,
	Trial,
	TrialStats,
} from "./config/types.js";
// Fixtures
export { computeFixtureConfigHash } from "./fixtures/config-hash.js";
export type {
	FixtureInfo,
	FixtureReadResult,
	FixtureStatsResult,
	FixtureStoreOptions,
} from "./fixtures/fixture-store.js";
export {
	clearFixtures,
	fixtureStats,
	listFixtures,
	readFixture,
	writeFixture,
} from "./fixtures/fixture-store.js";
// LLM Graders
export { factuality } from "./graders/llm/factuality.js";
export { createCachingJudge } from "./graders/llm/judge-cache.js";
export {
	clearJudgeCache,
	createDiskCachingJudge,
	judgeCacheStats,
} from "./graders/llm/judge-disk-cache.js";
export { type LlmClassifyOptions, llmClassify } from "./graders/llm/llm-classify.js";
export { llmRubric } from "./graders/llm/llm-rubric.js";
// Plugin
export type {
	AfterTrialContext,
	BeforeRunContext,
	EvalPlugin,
	PluginHooks,
} from "./plugin/types.js";
// Reporters
export { formatConsoleReport, formatMarkdownSummary } from "./reporters/console.js";
export { formatJsonReport } from "./reporters/json.js";
export { formatJunitXml } from "./reporters/junit.js";
export { formatMarkdownReport } from "./reporters/markdown.js";
// Progress
export { createProgressPlugin } from "./reporters/progress-plugin.js";
export { resolveReporter } from "./reporters/registry.js";
export type { ReporterOptions, ReporterPlugin } from "./reporters/types.js";
// Runner
export { type CostEstimate, estimateCost } from "./runner/cost-estimator.js";
export { createTokenBucketLimiter } from "./runner/rate-limiter.js";
export { runSuite } from "./runner/runner.js";
export { computeAllTrialStats, computeTrialStats, wilsonInterval } from "./runner/statistics.js";
// Storage
export { listRuns, loadRun, saveRun } from "./storage/run-store.js";
export type { FileWatcher, FileWatcherOptions } from "./watcher/file-watcher.js";
// Watcher
export { createFileWatcher } from "./watcher/file-watcher.js";
