import { readdir, rm, stat } from "node:fs/promises";
import { defineCommand } from "citty";
import { clearFixtures } from "../../fixtures/fixture-store.js";
import { clearJudgeCache } from "../../graders/llm/judge-disk-cache.js";
import { createLogger } from "../logger.js";
import { assertSafeFixtureDir, resolveFixtureDir } from "../resolve-fixture-dir.js";
import { globalArgs } from "../shared-args.js";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "clear", description: "Clear fixture or judge cache" },
	args: {
		...globalArgs,
		suite: {
			type: "string" as const,
			description: "Clear fixtures for specific suite only",
		},
		judge: {
			type: "boolean" as const,
			description: "Clear judge cache only",
			default: false,
		},
		all: {
			type: "boolean" as const,
			description: "Clear all caches (fixtures + judge)",
			default: false,
		},
	},
	async run({ args }) {
		const logger = createLogger(args);

		if (args.judge || args.all) {
			const count = await clearJudgeCache();
			logger.info(
				count > 0 ? `Cleared ${count} judge cache entries.` : "No judge cache entries found.",
			);
		}

		if (args.judge && !args.all) return;

		const fixtureDir = await resolveFixtureDir();
		assertSafeFixtureDir(fixtureDir, process.cwd());

		const exists = await stat(fixtureDir).catch(() => null);
		if (!exists) {
			logger.info("No fixture directory found. Nothing to clear.");
			return;
		}

		if (args.suite) {
			const count = await clearFixtures(args.suite, { baseDir: fixtureDir });
			logger.info(
				count > 0
					? `Cleared ${count} fixtures for suite '${args.suite}'.`
					: `No fixtures found for suite '${args.suite}'.`,
			);
		} else {
			const entries = await readdir(fixtureDir);
			await rm(fixtureDir, { recursive: true });
			logger.info(`Cleared fixture directory (${entries.length} entries removed).`);
		}
	},
});
