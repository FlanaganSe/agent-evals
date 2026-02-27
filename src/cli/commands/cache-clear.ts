import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import { createLogger } from "../logger.js";
import { globalArgs } from "../shared-args.js";

const DEFAULT_FIXTURE_DIR = ".eval-fixtures";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "clear", description: "Clear fixture cache" },
	args: {
		...globalArgs,
		suite: {
			type: "string" as const,
			description: "Clear fixtures for specific suite only",
		},
	},
	async run({ args }) {
		const logger = createLogger(args);
		const fixtureDir = DEFAULT_FIXTURE_DIR;

		const exists = await stat(fixtureDir).catch(() => null);
		if (!exists) {
			logger.info("No fixture directory found. Nothing to clear.");
			return;
		}

		if (args.suite) {
			const suiteDir = join(fixtureDir, args.suite);
			const suiteExists = await stat(suiteDir).catch(() => null);
			if (!suiteExists) {
				logger.info(`No fixtures found for suite '${args.suite}'.`);
				return;
			}
			const entries = await readdir(suiteDir);
			await rm(suiteDir, { recursive: true });
			logger.info(`Cleared ${entries.length} fixtures for suite '${args.suite}'.`);
		} else {
			const entries = await readdir(fixtureDir);
			await rm(fixtureDir, { recursive: true });
			logger.info(`Cleared fixture directory (${entries.length} entries removed).`);
		}
	},
});
