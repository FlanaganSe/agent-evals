import { listRuns } from "../../storage/run-store.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export interface ListRunsArgs {
	readonly limit: number;
}

export async function handleListRuns(args: ListRunsArgs, _cwd: string): Promise<ToolResult> {
	try {
		const runs = await listRuns();
		const limited = runs.slice(0, args.limit);

		if (limited.length === 0) {
			return textResult("No eval runs found. Use run-suite to execute a suite first.");
		}

		const lines = limited.map(
			(r) =>
				`${r.id}  ${r.suiteId}  ${r.mode}  ${(r.passRate * 100).toFixed(0)}% pass  ${r.timestamp}`,
		);
		return textResult(`Recent runs (${limited.length}/${runs.length}):\n\n${lines.join("\n")}`);
	} catch (error) {
		return formatError("list runs", error);
	}
}
