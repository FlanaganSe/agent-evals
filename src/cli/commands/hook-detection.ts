import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HookManager } from "../templates/types.js";

export interface DetectedHookManager {
	readonly manager: HookManager;
	readonly confidence: "high" | "medium";
	readonly reason: string;
}

/**
 * Detect the git hook manager in use.
 * Checks filesystem first, then package.json devDependencies.
 * Returns undefined if no manager is detected.
 */
export async function detectHookManager(cwd: string): Promise<DetectedHookManager | undefined> {
	// 1. Husky: .husky/ directory + devDependency
	const huskyDir = await pathExists(join(cwd, ".husky"));
	const huskyDep = await hasDevDep(cwd, "husky");
	if (huskyDir && huskyDep) {
		return {
			manager: "husky",
			confidence: "high",
			reason: ".husky/ directory + husky devDependency",
		};
	}
	if (huskyDir) {
		return {
			manager: "husky",
			confidence: "medium",
			reason: ".husky/ directory exists (husky not in devDeps)",
		};
	}

	// 2. Lefthook: lefthook.yml config file
	const lefthookConfig = await pathExists(join(cwd, "lefthook.yml"));
	if (lefthookConfig) {
		return { manager: "lefthook", confidence: "high", reason: "lefthook.yml found" };
	}

	// 3. simple-git-hooks: key in package.json
	const simpleGitHooks = await hasSimpleGitHooks(cwd);
	if (simpleGitHooks) {
		return {
			manager: "simple-git-hooks",
			confidence: "high",
			reason: "simple-git-hooks key in package.json",
		};
	}

	// 4. Husky devDep without .husky/ directory (not yet initialized)
	if (huskyDep) {
		return {
			manager: "husky",
			confidence: "medium",
			reason: "husky in devDependencies (not yet initialized)",
		};
	}

	// 5. No hook manager detected
	return undefined;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function hasDevDep(cwd: string, pkg: string): Promise<boolean> {
	try {
		const raw = await readFile(join(cwd, "package.json"), "utf-8");
		const parsed = JSON.parse(raw);
		return pkg in (parsed.devDependencies ?? {});
	} catch {
		return false;
	}
}

async function hasSimpleGitHooks(cwd: string): Promise<boolean> {
	try {
		const raw = await readFile(join(cwd, "package.json"), "utf-8");
		const parsed = JSON.parse(raw);
		return "simple-git-hooks" in parsed;
	} catch {
		return false;
	}
}
