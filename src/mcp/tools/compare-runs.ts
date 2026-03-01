import { join } from "node:path";
import { compareRuns } from "../../comparison/compare.js";
import { formatComparisonReport } from "../../comparison/format.js";
import { loadRun } from "../../storage/run-store.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export interface CompareRunsArgs {
	readonly baseRunId: string;
	readonly compareRunId: string;
}

export async function handleCompareRuns(args: CompareRunsArgs, cwd: string): Promise<ToolResult> {
	try {
		const runDir = join(cwd, ".eval-runs");
		const base = await loadRun(args.baseRunId, runDir);
		const compare = await loadRun(args.compareRunId, runDir);
		const comparison = compareRuns(base, compare);
		const report = formatComparisonReport(comparison, { color: false });
		return textResult(report);
	} catch (error) {
		return formatError("compare runs", error);
	}
}
