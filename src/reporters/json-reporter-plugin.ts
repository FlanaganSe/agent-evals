import { formatJsonReport } from "./json.js";
import type { ReporterPlugin } from "./types.js";

export const jsonReporterPlugin: ReporterPlugin = {
	name: "json",
	report: async (run) => {
		return formatJsonReport(run);
	},
};
