import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import { createLogger } from "../logger.js";
import { globalArgs } from "../shared-args.js";

const DEFAULT_FIXTURE_DIR = ".eval-fixtures";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "stats", description: "Show fixture cache statistics" },
	args: globalArgs,
	async run({ args }) {
		const logger = createLogger(args);
		const fixtureDir = DEFAULT_FIXTURE_DIR;

		const exists = await stat(fixtureDir).catch(() => null);
		if (!exists) {
			logger.info("No fixture directory found.");
			return;
		}

		const suites = await readdir(fixtureDir);
		let totalFiles = 0;
		let totalBytes = 0;
		let oldestMs = Number.POSITIVE_INFINITY;
		let newestMs = 0;
		let oldestLabel = "";
		let newestLabel = "";

		for (const suiteName of suites) {
			const suiteDir = join(fixtureDir, suiteName);
			const suiteStat = await stat(suiteDir).catch(() => null);
			if (!suiteStat?.isDirectory()) continue;

			const files = await readdir(suiteDir);
			for (const file of files) {
				const filePath = join(suiteDir, file);
				const fileStat = await stat(filePath).catch(() => null);
				if (!fileStat?.isFile()) continue;
				totalFiles++;
				totalBytes += fileStat.size;

				const mtime = fileStat.mtimeMs;
				if (mtime < oldestMs) {
					oldestMs = mtime;
					oldestLabel = `${suiteName}/${file}`;
				}
				if (mtime > newestMs) {
					newestMs = mtime;
					newestLabel = `${suiteName}/${file}`;
				}
			}
		}

		const lines = ["Fixture Cache Stats"];
		lines.push(`  Suites:    ${suites.length}`);
		lines.push(`  Fixtures:  ${totalFiles}`);
		lines.push(`  Disk:      ${formatBytes(totalBytes)}`);
		if (totalFiles > 0) {
			lines.push(`  Oldest:    ${formatAge(oldestMs)} (${oldestLabel})`);
			lines.push(`  Newest:    ${formatAge(newestMs)} (${newestLabel})`);
		}

		process.stdout.write(`${lines.join("\n")}\n`);
	},
});

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAge(timestampMs: number): string {
	const ageMs = Date.now() - timestampMs;
	const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
	const hours = Math.floor(ageMs / (1000 * 60 * 60));
	const minutes = Math.floor(ageMs / (1000 * 60));

	if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
	if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	return "just now";
}
