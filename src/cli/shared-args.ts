import type { ArgsDef } from "citty";

export const globalArgs = {
	verbose: {
		type: "boolean" as const,
		alias: "v",
		description: "Show detailed output",
		default: false,
	},
	quiet: {
		type: "boolean" as const,
		alias: "q",
		description: "Suppress all output except errors",
		default: false,
	},
	"no-color": {
		type: "boolean" as const,
		description: "Disable colored output",
		default: false,
	},
	config: {
		type: "string" as const,
		alias: "c",
		description: "Path to config file (e.g. custom.config.ts) or directory",
	},
} satisfies ArgsDef;
