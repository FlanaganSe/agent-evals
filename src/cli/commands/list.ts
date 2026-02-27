import { defineCommand } from "citty";
import pc from "picocolors";
import { listRuns } from "../../storage/run-store.js";
import { createLogger } from "../logger.js";
import { globalArgs } from "../shared-args.js";
import { parseIntArg } from "./run.js";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "list", description: "List previous eval runs" },
	args: {
		...globalArgs,
		limit: {
			type: "string" as const,
			alias: "n",
			description: "Maximum runs to show (default: 10)",
		},
		suite: {
			type: "string" as const,
			description: "Filter by suite name",
		},
	},
	async run({ args }) {
		const logger = createLogger(args);
		const limit = parseIntArg(args.limit, "limit") ?? 10;
		const allRuns = await listRuns();

		const filtered = args.suite ? allRuns.filter((r) => r.suiteId === args.suite) : allRuns;

		const display = filtered.slice(0, limit);

		if (display.length === 0) {
			logger.info("No runs found.");
			return;
		}

		// Header
		const header = [
			"ID".padEnd(16),
			"Suite".padEnd(16),
			"Mode".padEnd(12),
			"Pass Rate".padEnd(12),
			"Date",
		].join("  ");
		process.stdout.write(`${header}\n`);
		process.stdout.write(`${"─".repeat(header.length)}\n`);

		for (const run of display) {
			const id = run.id.slice(0, 12).padEnd(16);
			const suite = run.suiteId.padEnd(16);
			const mode = run.mode.padEnd(12);
			const rate = (run.passRate * 100).toFixed(1);
			const rateStr = formatPassRate(rate, args["no-color"]);
			const date = new Date(run.timestamp).toLocaleString();
			process.stdout.write(`${id}  ${suite}  ${mode}  ${rateStr.padEnd(12)}  ${date}\n`);
		}

		if (filtered.length > limit) {
			logger.info(`Showing ${limit} of ${filtered.length} runs. Use --limit to see more.`);
		}
	},
});

function formatPassRate(rate: string, noColor?: boolean): string {
	const label = `${rate}%`;
	if (noColor) return label;
	const n = Number.parseFloat(rate);
	if (n >= 90) return pc.green(label);
	if (n >= 70) return pc.yellow(label);
	return pc.red(label);
}
