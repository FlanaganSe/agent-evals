import { readdir, rm, stat } from "node:fs/promises";
import { confirm } from "@clack/prompts";
import { defineCommand } from "citty";
import { clearFixtures } from "../../fixtures/fixture-store.js";
import { clearJudgeCache } from "../../graders/llm/judge-disk-cache.js";
import { createLogger } from "../logger.js";
import { resolveFixtureDir } from "../resolve-fixture-dir.js";
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
		yes: {
			type: "boolean" as const,
			alias: "y",
			description: "Skip confirmation prompt",
			default: false,
		},
	},
	async run({ args }) {
		const logger = createLogger(args);

		// Judge-only mode — no confirmation needed, no fixture impact
		if (args.judge && !args.all) {
			const count = await clearJudgeCache();
			logger.info(
				count > 0 ? `Cleared ${count} judge cache entries.` : "No judge cache entries found.",
			);
			return;
		}

		// --all: confirm BEFORE deleting anything (judge + fixtures are atomic)
		if (args.all) {
			if (!args.yes && process.stdout.isTTY) {
				const shouldClear = await confirm({
					message: "Delete all caches (judge cache + fixtures)?",
				});
				if (shouldClear !== true) {
					logger.info("Cancelled.");
					return;
				}
			}

			const judgeCount = await clearJudgeCache();
			logger.info(
				judgeCount > 0
					? `Cleared ${judgeCount} judge cache entries.`
					: "No judge cache entries found.",
			);
		}

		// Safety: loadConfig (called inside resolveFixtureDir) already validates
		// that fixtureDir stays within the project root via assertSafeFixtureDir.
		const fixtureDir = await resolveFixtureDir(args.config);

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
			// Clearing ALL fixtures — require confirmation unless --yes or already confirmed via --all
			if (!args.all && !args.yes && process.stdout.isTTY) {
				const shouldClear = await confirm({
					message: `Delete all fixtures in ${fixtureDir}?`,
				});
				if (shouldClear !== true) {
					logger.info("Cancelled.");
					return;
				}
			}

			const entries = await readdir(fixtureDir);
			await rm(fixtureDir, { recursive: true });
			logger.info(`Cleared fixture directory (${entries.length} entries removed).`);
		}
	},
});
