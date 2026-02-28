import { loadConfig } from "../../config/loader.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export interface ListSuitesArgs {
	readonly verbose?: boolean | undefined;
}

export async function handleListSuites(args: ListSuitesArgs, cwd: string): Promise<ToolResult> {
	try {
		const config = await loadConfig({ cwd });

		const suites = config.suites.map((suite) => {
			const base = {
				name: suite.name,
				description: suite.description ?? null,
				caseCount: suite.cases.length,
				categories: [...new Set(suite.cases.map((c) => c.category).filter(Boolean))],
				gates: suite.gates ?? null,
				tags: suite.tags ?? [],
				graderCount: suite.defaultGraders?.length ?? 0,
			};

			if (!args.verbose) return base;

			return {
				...base,
				caseIds: suite.cases.map((c) => c.id),
			};
		});

		return textResult(JSON.stringify({ suites, totalSuites: suites.length }, null, 2));
	} catch (error) {
		return formatError("list suites", error);
	}
}
