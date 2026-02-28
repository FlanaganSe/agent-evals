import { access, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AgentFramework } from "../templates/types.js";

/**
 * Detect agent framework from package.json dependencies.
 * Returns the most likely framework, or 'custom' if none detected.
 */
export async function detectFramework(cwd: string): Promise<AgentFramework> {
	const pkg = await readPackageJson(cwd);
	if (!pkg) return "custom";

	const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

	if ("ai" in allDeps || "@ai-sdk/openai" in allDeps || "@ai-sdk/anthropic" in allDeps) {
		return "vercel-ai-sdk";
	}
	if ("langchain" in allDeps || "@langchain/core" in allDeps) {
		return "langchain";
	}
	if ("@mastra/core" in allDeps || "mastra" in allDeps) {
		return "mastra";
	}

	return "custom";
}

/**
 * Detect project name from package.json or directory name.
 */
export async function detectProjectName(cwd: string): Promise<string> {
	const pkg = await readPackageJson(cwd);
	return pkg?.name ?? basename(cwd);
}

/**
 * Check if a config file already exists.
 */
export async function findExistingConfig(cwd: string): Promise<string | undefined> {
	const candidates = ["eval.config.ts", "eval.config.js", "eval.config.mjs"];
	for (const name of candidates) {
		try {
			await access(join(cwd, name));
			return name;
		} catch {
			// Not found, try next
		}
	}
	return undefined;
}

/** Check if .github/ directory exists (indicator for GitHub Actions usage). */
export async function hasGitHubDir(cwd: string): Promise<boolean> {
	try {
		await access(join(cwd, ".github"));
		return true;
	} catch {
		return false;
	}
}

/**
 * Detect the package runner by checking for lockfiles.
 * Falls back to npx which works universally.
 */
export async function detectPackageRunner(cwd: string): Promise<string> {
	const lockfiles: readonly (readonly [string, string])[] = [
		["pnpm-lock.yaml", "pnpm"],
		["yarn.lock", "yarn"],
		["bun.lockb", "bun"],
		["bun.lock", "bun"],
	];

	for (const [lockfile, runner] of lockfiles) {
		try {
			await access(join(cwd, lockfile));
			return runner;
		} catch {
			// next
		}
	}
	return "npx";
}

interface PackageJson {
	readonly name?: string;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly "simple-git-hooks"?: unknown;
}

async function readPackageJson(cwd: string): Promise<PackageJson | undefined> {
	try {
		const raw = await readFile(join(cwd, "package.json"), "utf-8");
		return JSON.parse(raw) as PackageJson;
	} catch {
		return undefined;
	}
}
