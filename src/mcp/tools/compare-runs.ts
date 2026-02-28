import { compareRuns } from "../../comparison/compare.js";
import { formatComparisonReport } from "../../comparison/format.js";
import { loadRun } from "../../storage/run-store.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export interface CompareRunsArgs {
	readonly baseRunId: string;
	readonly compareRunId: string;
}

export async function handleCompareRuns(args: CompareRunsArgs, _cwd: string): Promise<ToolResult> {
	try {
		const base = await loadRun(args.baseRunId);
		const compare = await loadRun(args.compareRunId);
		const comparison = compareRuns(base, compare);
		const report = formatComparisonReport(comparison, { color: false });
		return textResult(report);
	} catch (error) {
		return formatError("compare runs", error);
	}
}
