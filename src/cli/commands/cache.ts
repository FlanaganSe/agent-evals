import { defineCommand } from "citty";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "cache", description: "Manage fixture cache" },
	subCommands: {
		clear: () => import("./cache-clear.js").then((m) => m.default),
		stats: () => import("./cache-stats.js").then((m) => m.default),
	},
});
