import { loadConfig } from "../../config/loader.js";
import { allGraders, BUILT_IN_GRADERS, type GraderDescriptor } from "../../graders/registry.js";
import { formatError, type ToolResult, textResult } from "./types.js";

export interface ListGradersArgs {
	readonly tier?: "deterministic" | "llm" | "composition" | undefined;
	readonly category?: string | undefined;
	readonly includePlugins?: boolean | undefined;
}

export async function handleListGraders(args: ListGradersArgs, cwd: string): Promise<ToolResult> {
	try {
		let graders: readonly GraderDescriptor[];

		if (args.includePlugins !== false) {
			try {
				const config = await loadConfig({ cwd });
				graders = allGraders(config.plugins);
			} catch {
				// Config load failed — return built-in only
				graders = BUILT_IN_GRADERS;
			}
		} else {
			graders = BUILT_IN_GRADERS;
		}

		// Apply filters
		if (args.tier) {
			graders = graders.filter((g) => g.tier === args.tier);
		}
		if (args.category) {
			graders = graders.filter((g) => g.category === args.category);
		}

		return textResult(
			JSON.stringify(
				{
					graders: graders.map((g) => ({
						name: g.name,
						description: g.description,
						tier: g.tier,
						category: g.category,
						parameters: g.parameters,
						example: g.example,
						notes: g.notes ?? null,
					})),
					total: graders.length,
					filters: {
						tier: args.tier ?? null,
						category: args.category ?? null,
						includePlugins: args.includePlugins !== false,
					},
				},
				null,
				2,
			),
		);
	} catch (error) {
		return formatError("list graders", error);
	}
}
