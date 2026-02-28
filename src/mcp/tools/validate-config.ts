import { loadConfig } from "../../config/loader.js";
import { type ToolResult, textResult } from "./types.js";

export interface ValidateConfigArgs {
	readonly configPath?: string | undefined;
}

export async function handleValidateConfig(
	args: ValidateConfigArgs,
	cwd: string,
): Promise<ToolResult> {
	try {
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
