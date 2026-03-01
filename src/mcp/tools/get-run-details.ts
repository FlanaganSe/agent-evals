import { join } from "node:path";
import { formatConsoleReport } from "../../reporters/console.js";
import { loadRun } from "../../storage/run-store.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export interface GetRunDetailsArgs {
	readonly runId: string;
}

export async function handleGetRunDetails(
	args: GetRunDetailsArgs,
	cwd: string,
): Promise<ToolResult> {
	try {
		const run = await loadRun(args.runId, join(cwd, ".eval-runs"));
		const report = formatConsoleReport(run, { color: false, verbose: true });
		return textResult(report);
	} catch (error) {
		return formatError(`get run "${args.runId}"`, error);
	}
}
