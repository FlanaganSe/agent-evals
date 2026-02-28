import { z } from "zod";
import { VERSION } from "../index.js";
import { handleCompareRuns } from "./tools/compare-runs.js";
import { handleDescribeConfig } from "./tools/describe-config.js";
import { handleGetRunDetails } from "./tools/get-run-details.js";
import { handleListGraders } from "./tools/list-graders.js";
import { handleListRuns } from "./tools/list-runs.js";
import { handleListSuites } from "./tools/list-suites.js";
import { handleRunSuite } from "./tools/run-suite.js";
import { handleValidateConfig } from "./tools/validate-config.js";

/**
 * Creates and starts the MCP server with all eval tools registered.
 * All logging goes to stderr — stdout is reserved for the JSON-RPC protocol.
 */
export async function startMcpServer(): Promise<void> {
	// Dynamic import — the SDK is an optional peer dependency
	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

	const server = new McpServer({
		name: "agent-evals",
		version: VERSION,
	});

	const cwd = process.cwd();

	registerTools(server, cwd);

	// Import resources registration lazily to avoid import errors when MCP SDK not installed
	const { registerResources } = await import("./resources.js");
	registerResources(server);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(`agent-evals MCP server v${VERSION} started`);
}

// Use `any` for McpServer type since it's dynamically imported
// biome-ignore lint/suspicious/noExplicitAny: McpServer type comes from optional peer dep
type McpServerInstance = any;

function registerTools(server: McpServerInstance, cwd: string): void {
	// ─── run-suite ────────────────────────────────────────────────────────────
	server.registerTool(
		"run-suite",
		{
			title: "Run Eval Suite",
			description: `Execute an eval suite by name and return pass/fail results with per-case grades.

Use list-suites first to discover available suite names. After running, use get-run-details with the run ID from the output to see full results, or compare-runs to diff against a previous run.

Returns a formatted text report with per-case pass/fail status, scores, failure reasons, gate results, and a summary line.`,
			inputSchema: {
				suite: z.string().describe("Suite name to run. Use list-suites to see available names."),
				mode: z
					.enum(["live", "replay"])
					.default("replay")
					.describe(
						"Execution mode: live calls the target function (real LLM calls), replay uses recorded fixtures ($0 cost)",
					),
				record: z
					.boolean()
					.default(false)
					.describe("Record fixtures when running in live mode (for future replay)"),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
			},
		},
		async ({ suite, mode, record }: { suite: string; mode: string; record: boolean }) =>
			handleRunSuite({ suite, mode: mode as "live" | "replay", record }, cwd),
	);

	// ─── list-runs ────────────────────────────────────────────────────────────
	server.registerTool(
		"list-runs",
		{
			title: "List Eval Runs",
			description: `List recent eval run results with IDs, suite names, modes, pass rates, and timestamps.

Use this to find run IDs for compare-runs or get-run-details. Results are sorted newest-first.

Returns one line per run: ID, suite name, mode, pass rate, timestamp.`,
			inputSchema: {
				limit: z.number().int().positive().default(10).describe("Maximum number of runs to return"),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async ({ limit }: { limit: number }) => handleListRuns({ limit }, cwd),
	);

	// ─── compare-runs ─────────────────────────────────────────────────────────
	server.registerTool(
		"compare-runs",
		{
			title: "Compare Eval Runs",
			description: `Compare two eval runs and show regressions, improvements, and score deltas per case.

Use list-runs first to find run IDs. The base run should be older, the compare run newer.

Returns a formatted diff showing per-case changes (regression/improvement/unchanged), score deltas, and a summary line.`,
			inputSchema: {
				baseRunId: z.string().describe("Base run ID (older). Use list-runs to find IDs."),
				compareRunId: z.string().describe("Compare run ID (newer). Use list-runs to find IDs."),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async ({ baseRunId, compareRunId }: { baseRunId: string; compareRunId: string }) =>
			handleCompareRuns({ baseRunId, compareRunId }, cwd),
	);

	// ─── get-run-details ──────────────────────────────────────────────────────
	server.registerTool(
		"get-run-details",
		{
			title: "Get Eval Run Details",
			description: `Get detailed results for a specific eval run including per-case grades, scores, and failure reasons.

Use list-runs to find run IDs. For a diff between two runs, use compare-runs instead.

Returns a verbose formatted report with all trial data, grader results, and gate outcomes.`,
			inputSchema: {
				runId: z.string().describe("Run ID to inspect. Use list-runs to find IDs."),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async ({ runId }: { runId: string }) => handleGetRunDetails({ runId }, cwd),
	);

	// ─── list-suites (NEW) ────────────────────────────────────────────────────
	server.registerTool(
		"list-suites",
		{
			title: "List Eval Suites",
			description: `List all eval suites defined in the project's eval.config.ts with their case counts, categories, and gates.

Use this first to discover available suite names before calling run-suite. For full config details including run settings and plugins, use describe-config.

Returns structured JSON with an array of suite summaries.`,
			inputSchema: {
				verbose: z
					.boolean()
					.default(false)
					.describe("Include full case IDs in the output (default: summary only)"),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async ({ verbose }: { verbose: boolean }) => handleListSuites({ verbose }, cwd),
	);

	// ─── describe-config (NEW) ────────────────────────────────────────────────
	server.registerTool(
		"describe-config",
		{
			title: "Describe Eval Config",
			description: `Return the fully loaded eval config as structured JSON, including all suites, cases, gates, and run settings.

Use this to understand the current project's eval setup before modifying eval.config.ts. Shows case IDs (useful for --filter with run-suite), gate thresholds, and plugin list.

Note: Loads and evaluates eval.config.ts. Functions (target, judge, graders) are shown as metadata counts, not serialized.`,
			inputSchema: {},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async () => handleDescribeConfig({} as Record<string, never>, cwd),
	);

	// ─── list-graders (NEW) ──────────────────────────────────────────────────
	server.registerTool(
		"list-graders",
		{
			title: "List Available Graders",
			description: `Enumerate all available graders with their parameters, defaults, and usage examples.

Use this when writing or modifying eval configs to understand which graders are available and what options they accept. Filter by tier (deterministic, llm, composition) or category (text, tool-call, metric, safety, llm-judge, composition).

Deterministic graders are free and instant. LLM graders require a judge function in the config. Composition operators (all, any, not) combine other graders.

Returns structured JSON with an array of grader descriptors.`,
			inputSchema: {
				tier: z
					.enum(["deterministic", "llm", "composition"])
					.optional()
					.describe("Filter by grader tier"),
				category: z
					.string()
					.optional()
					.describe("Filter by category: text, tool-call, metric, safety, llm-judge, composition"),
				includePlugins: z
					.boolean()
					.default(true)
					.describe("Include graders from plugins (requires loading config)"),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async ({
			tier,
			category,
			includePlugins,
		}: {
			tier?: string;
			category?: string;
			includePlugins: boolean;
		}) =>
			handleListGraders(
				{
					tier: tier as "deterministic" | "llm" | "composition" | undefined,
					category,
					includePlugins,
				},
				cwd,
			),
	);

	// ─── validate-config (NEW) ────────────────────────────────────────────────
	server.registerTool(
		"validate-config",
		{
			title: "Validate Eval Config",
			description: `Validate that eval.config.ts loads without errors and check for common issues.

Use this after modifying the eval config to verify it will work before running evals. Reports validation errors, missing fields, and warnings (empty suites, missing graders, etc.).

Returns { valid: true/false, warnings: [...], error?: string }.`,
			inputSchema: {
				configPath: z
					.string()
					.optional()
					.describe("Custom config file path (default: eval.config.ts in project root)"),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async ({ configPath }: { configPath?: string }) => handleValidateConfig({ configPath }, cwd),
	);
}
