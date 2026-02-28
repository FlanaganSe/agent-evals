import { defineCommand, runMain } from "citty";
import { VERSION } from "../index.js";

const main = defineCommand({
	meta: {
		name: "agent-evals",
		version: VERSION,
		description: "Eval framework for AI agent workflows",
	},
	subCommands: {
		run: () => import("./commands/run.js").then((m) => m.default),
		record: () => import("./commands/record.js").then((m) => m.default),
		compare: () => import("./commands/compare.js").then((m) => m.default),
		list: () => import("./commands/list.js").then((m) => m.default),
		cache: () => import("./commands/cache.js").then((m) => m.default),
		doctor: () => import("./commands/doctor.js").then((m) => m.default),
		init: () => import("./commands/init.js").then((m) => m.default),
		"install-hooks": () => import("./commands/install-hooks.js").then((m) => m.default),
		mcp: () => import("./commands/mcp.js").then((m) => m.default),
	},
});

runMain(main);
