import type { ReporterPlugin } from "./types.js";

const builtInReporters = new Map<string, () => Promise<ReporterPlugin>>();

/** Resolve a reporter name or plugin to a ReporterPlugin. */
export async function resolveReporter(
	nameOrPlugin: string | ReporterPlugin,
): Promise<ReporterPlugin> {
	if (typeof nameOrPlugin !== "string") {
		return nameOrPlugin;
	}
	const loader = builtInReporters.get(nameOrPlugin);
	if (!loader) {
		throw new Error(
			`Unknown reporter '${nameOrPlugin}'. Built-in reporters: ${[...builtInReporters.keys()].join(", ")}`,
		);
	}
	return loader();
}

// Register built-in reporters (lazy imports for startup performance)
builtInReporters.set("console", () =>
	import("./console-reporter-plugin.js").then((m) => m.consoleReporterPlugin),
);
builtInReporters.set("json", () =>
	import("./json-reporter-plugin.js").then((m) => m.jsonReporterPlugin),
);
builtInReporters.set("junit", () => import("./junit.js").then((m) => m.junitReporterPlugin));
builtInReporters.set("markdown", () =>
	import("./markdown.js").then((m) => m.markdownReporterPlugin),
);
