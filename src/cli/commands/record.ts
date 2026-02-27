import { defineCommand } from "citty";
import { globalArgs } from "../shared-args.js";
import { executeRun } from "./run.js";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: {
		name: "record",
		description: "Record fixtures (alias for: run --mode=live --record)",
	},
	args: {
		...globalArgs,
		suite: {
			type: "string" as const,
			alias: "s",
			description: "Record specific suite(s) by name",
		},
		concurrency: {
			type: "string" as const,
			description: "Max concurrent cases",
		},
		"rate-limit": {
			type: "string" as const,
			description: "Max requests per minute",
		},
	},
	async run({ args }) {
		await executeRun({
			...args,
			mode: "live",
			record: true,
		});
	},
});
