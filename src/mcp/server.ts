import { z } from "zod";
import { compareRuns } from "../comparison/compare.js";
import { formatComparisonReport } from "../comparison/format.js";
import { loadConfig } from "../config/loader.js";
import { VERSION } from "../index.js";
import { formatConsoleReport } from "../reporters/console.js";
import { runSuite } from "../runner/runner.js";
import { listRuns, loadRun } from "../storage/run-store.js";

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

	registerRunSuiteTool(server);
	registerListRunsTool(server);
	registerCompareRunsTool(server);
	registerGetRunDetailsTool(server);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(`agent-evals MCP server v${VERSION} started`);
}

// Use `any` for McpServer type since it's dynamically imported
// biome-ignore lint/suspicious/noExplicitAny: McpServer type comes from optional peer dep
type McpServerInstance = any;

function registerRunSuiteTool(server: McpServerInstance): void {
	server.registerTool(
		"run-suite",
		{
			title: "Run Eval Suite",
			description:
				"Execute an eval suite against the target. Returns pass/fail summary with per-case results.",
			inputSchema: {
				suite: z.string().describe("Suite name to run"),
				mode: z
					.enum(["live", "replay"])
					.default("replay")
					.describe("Execution mode (live calls target, replay uses fixtures)"),
				record: z.boolean().default(false).describe("Record fixtures when running in live mode"),
			},
			annotations: { readOnlyHint: false },
		},
		async ({ suite, mode, record }: { suite: string; mode: string; record: boolean }) => {
			try {
				const config = await loadConfig({ cwd: process.cwd() });
				const resolvedSuite = config.suites.find((s) => s.name === suite);
				if (!resolvedSuite) {
					return {
						isError: true,
						content: [
							{
								type: "text" as const,
								text: `Suite "${suite}" not found. Available suites: ${config.suites.map((s) => s.name).join(", ")}`,
							},
						],
					};
				}

				const run = await runSuite(resolvedSuite, {
					mode: mode as "live" | "replay",
					record,
					concurrency: 1,
					timeoutMs: 30_000,
				});

				const report = formatConsoleReport(run, { color: false });
				return {
					content: [{ type: "text" as const, text: report }],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: `Failed to run suite "${suite}": ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}

function registerListRunsTool(server: McpServerInstance): void {
	server.registerTool(
		"list-runs",
		{
			title: "List Eval Runs",
			description: "List recent eval run results with IDs, timestamps, and pass rates.",
			inputSchema: {
				limit: z.number().int().positive().default(10).describe("Maximum number of runs to return"),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ limit }: { limit: number }) => {
			try {
				const runs = await listRuns();
				const limited = runs.slice(0, limit);

				if (limited.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No eval runs found. Run `agent-evals run` first.",
							},
						],
					};
				}

				const lines = limited.map(
					(r) =>
						`${r.id}  ${r.suiteId}  ${r.mode}  ${(r.passRate * 100).toFixed(0)}% pass  ${r.timestamp}`,
				);
				return {
					content: [
						{
							type: "text" as const,
							text: `Recent runs (${limited.length}/${runs.length}):\n\n${lines.join("\n")}`,
						},
					],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: `Failed to list runs: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}

function registerCompareRunsTool(server: McpServerInstance): void {
	server.registerTool(
		"compare-runs",
		{
			title: "Compare Eval Runs",
			description: "Compare two eval runs and show regressions, improvements, and score deltas.",
			inputSchema: {
				baseRunId: z.string().describe("Base run ID (older)"),
				compareRunId: z.string().describe("Compare run ID (newer)"),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ baseRunId, compareRunId }: { baseRunId: string; compareRunId: string }) => {
			try {
				const base = await loadRun(baseRunId);
				const compare = await loadRun(compareRunId);
				const comparison = compareRuns(base, compare);
				const report = formatComparisonReport(comparison, { color: false });
				return {
					content: [{ type: "text" as const, text: report }],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: `Failed to compare runs: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}

function registerGetRunDetailsTool(server: McpServerInstance): void {
	server.registerTool(
		"get-run-details",
		{
			title: "Get Eval Run Details",
			description: "Get detailed results for a specific eval run including per-case grades.",
			inputSchema: {
				runId: z.string().describe("Run ID to inspect"),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ runId }: { runId: string }) => {
			try {
				const run = await loadRun(runId);
				const report = formatConsoleReport(run, { color: false, verbose: true });
				return {
					content: [{ type: "text" as const, text: report }],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: `Failed to get run "${runId}": ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
