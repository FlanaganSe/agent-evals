import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
 *
 * Accepts the raw --config CLI value: a file path, a directory, or a stem.
 * Derives cwd from the config path so relative fixtureDir resolves correctly.
 */
export async function resolveFixtureDir(configArg?: string): Promise<string> {
	try {
		const options = await resolveConfigOptions(configArg);
		const config = await loadConfig(options);
		return config.fixtureDir;
	} catch (err) {
		if (configArg) {
			process.stderr.write(
				`[warn] Failed to load config from "${configArg}", using default fixture dir: ${err instanceof Error ? err.message : String(err)}\n`,
			);
		}
		return DEFAULT_FIXTURE_DIR;
	}
}

async function resolveConfigOptions(
	configArg: string | undefined,
): Promise<{ configPath?: string; cwd?: string } | undefined> {
	if (!configArg) return undefined;
	const resolved = resolve(configArg);
	const s = await stat(resolved).catch(() => null);
	if (s?.isFile()) {
		return { configPath: resolved, cwd: dirname(resolved) };
	}
	if (s?.isDirectory()) {
		return { cwd: resolved };
	}
	// Treat as stem or non-existent path — let loadConfig probe extensions
	return { configPath: configArg };
}
