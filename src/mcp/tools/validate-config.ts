import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.js";
import { errorResult, type ToolResult, textResult } from "./types.js";

export interface ValidateConfigArgs {
	readonly configPath?: string | undefined;
}

export async function handleValidateConfig(
	args: ValidateConfigArgs,
	cwd: string,
): Promise<ToolResult> {
	try {
		if (args.configPath) {
			const resolved = resolve(cwd, args.configPath);
			if (!resolved.startsWith(`${cwd}/`) && resolved !== cwd) {
				return errorResult("configPath must resolve within the project directory");
			}
		}

		const config = await loadConfig({
			cwd,
			configPath: args.configPath,
		});

		const warnings: string[] = [];

		for (const suite of config.suites) {
			if (suite.cases.length === 0) {
				warnings.push(`Suite "${suite.name}" has no cases`);
			}
			if (!suite.defaultGraders || suite.defaultGraders.length === 0) {
				warnings.push(`Suite "${suite.name}" has no default graders configured`);
			}
		}

		return textResult(
			JSON.stringify(
				{
					valid: true,
					suiteCount: config.suites.length,
					totalCases: config.suites.reduce((sum, s) => sum + s.cases.length, 0),
					warnings,
				},
				null,
				2,
			),
		);
	} catch (error) {
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							valid: false,
							error: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}
