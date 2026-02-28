import { loadConfig } from "../../config/loader.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export async function handleDescribeConfig(
	_args: Record<string, never>,
	cwd: string,
): Promise<ToolResult> {
	try {
		const config = await loadConfig({ cwd });

		const description = {
			suites: config.suites.map((suite) => ({
				name: suite.name,
				description: suite.description ?? null,
				caseCount: suite.cases.length,
				gates: suite.gates ?? null,
				concurrency: suite.concurrency ?? null,
				targetVersion: suite.targetVersion ?? null,
				replay: suite.replay ?? null,
				tags: suite.tags ?? [],
				graderCount: suite.defaultGraders?.length ?? 0,
				cases: suite.cases.map((c) => ({
					id: c.id,
					description: c.description ?? null,
					category: c.category ?? null,
					tags: c.tags ?? [],
					hasExpected: c.expected !== undefined,
				})),
			})),
			run: {
				defaultMode: config.run.defaultMode,
				timeoutMs: config.run.timeoutMs,
				rateLimit: config.run.rateLimit ?? null,
			},
			hasJudge: config.judge !== undefined,
			pluginCount: config.plugins.length,
			plugins: config.plugins.map((p) => ({ name: p.name, version: p.version })),
			reporters: config.reporters.map((r) => (typeof r === "string" ? r : "custom")),
			fixtureDir: config.fixtureDir,
		};

		return textResult(JSON.stringify(description, null, 2));
	} catch (error) {
		return formatError("describe config", error);
	}
}
