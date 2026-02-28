import { formatConsoleReport } from "./console.js";
import type { ReporterPlugin } from "./types.js";

export const consoleReporterPlugin: ReporterPlugin = {
	name: "console",
	report: async (run, options) => {
		return formatConsoleReport(run, {
			color: options.color,
			verbose: options.verbose,
		});
	},
};
