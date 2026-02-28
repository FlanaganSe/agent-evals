import { loadConfig } from "../../config/loader.js";
import { formatConsoleReport } from "../../reporters/console.js";
import { runSuite } from "../../runner/runner.js";
import { saveRun } from "../../storage/run-store.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export interface RunSuiteArgs {
	readonly suite: string;
	readonly mode: "live" | "replay";
	readonly record: boolean;
}

export async function handleRunSuite(args: RunSuiteArgs, cwd: string): Promise<ToolResult> {
	try {
		const config = await loadConfig({ cwd });
		const resolvedSuite = config.suites.find((s) => s.name === args.suite);
		if (!resolvedSuite) {
			const available = config.suites.map((s) => s.name).join(", ");
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Suite "${args.suite}" not found. Available suites: ${available}. Use list-suites to see all suites.`,
					},
				],
			};
		}

		const run = await runSuite(resolvedSuite, {
			mode: args.mode,
			record: args.record,
			concurrency: 1,
			timeoutMs: config.run.timeoutMs,
			judge: config.judge?.call,
			plugins: [...config.plugins],
			fixtureDir: config.fixtureDir,
			runDir: undefined,
		});

		// Persist run so list-runs and get-run-details can find it
		await saveRun(run);

		const report = formatConsoleReport(run, { color: false });
		return textResult(report);
	} catch (error) {
		return formatError(`run suite "${args.suite}"`, error);
	}
}
