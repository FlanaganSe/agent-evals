import { resolve } from "node:path";
import { loadConfig } from "../config/loader.js";

const DEFAULT_FIXTURE_DIR = ".eval-fixtures";

/**
 * Validates that a fixture directory path stays within the project root.
 * Rejects absolute paths and parent-traversal that escape the working directory.
 */
export function assertSafeFixtureDir(fixtureDir: string, cwd: string): void {
	const resolved = resolve(cwd, fixtureDir);
	const root = resolve(cwd);
	if (!resolved.startsWith(`${root}/`) && resolved !== root) {
		throw new Error(
			`fixtureDir "${fixtureDir}" resolves outside the project root. It must be a relative path within the project.`,
		);
	}
}

/**
 * Resolves the fixture directory from config, falling back to the default
 * if no config is found or loading fails.
 */
export async function resolveFixtureDir(): Promise<string> {
	try {
		const config = await loadConfig();
		return config.fixtureDir;
	} catch {
		return DEFAULT_FIXTURE_DIR;
	}
}
