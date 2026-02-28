import { defineCommand } from "citty";
import { fixtureStats } from "../../fixtures/fixture-store.js";
import { judgeCacheStats } from "../../graders/llm/judge-disk-cache.js";
import { globalArgs } from "../shared-args.js";

const DEFAULT_FIXTURE_DIR = ".eval-fixtures";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "stats", description: "Show cache statistics" },
	args: globalArgs,
	async run() {
		// Fixture stats
		const fStats = await fixtureStats({ baseDir: DEFAULT_FIXTURE_DIR });

		const lines = ["Cache Stats", ""];
		lines.push("Fixtures:");
		lines.push(`  Suites:    ${fStats.suiteCount}`);
		lines.push(`  Fixtures:  ${fStats.totalFixtures}`);
		lines.push(`  Disk:      ${formatBytes(fStats.totalBytes)}`);
		if (fStats.totalFixtures > 0) {
			lines.push(`  Oldest:    ${fStats.oldestAgeDays} days ago`);
			lines.push(`  Newest:    ${fStats.newestAgeDays} days ago`);
		}

		// Judge cache stats
		const jStats = await judgeCacheStats();
		lines.push("");
		lines.push("Judge Cache:");
		lines.push(`  Entries:   ${jStats.entries}`);
		lines.push(`  Disk:      ${formatBytes(jStats.totalBytes)}`);

		process.stdout.write(`${lines.join("\n")}\n`);
	},
});

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
