import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { HookManager } from "../templates/types.js";
import { detectPackageRunner } from "./init-detect.js";

const HOOK_COMMENT = "# agent-evals: pre-push eval check";

async function buildHookCommand(cwd: string): Promise<string> {
	const runner = await detectPackageRunner(cwd);
	return runner === "npx"
		? "npx agent-evals run --mode=replay --quiet"
		: `${runner} agent-evals run --mode=replay --quiet`;
}

export interface InstallResult {
	readonly success: boolean;
	readonly message: string;
	readonly filePath?: string;
}

/**
 * Install a pre-push git hook for the detected hook manager.
 */
export async function installPrePushHook(
	cwd: string,
	manager: HookManager,
): Promise<InstallResult> {
	switch (manager) {
		case "husky":
			return installHuskyHook(cwd);
		case "lefthook":
			return installLefthookHook(cwd);
		case "simple-git-hooks":
			return installSimpleGitHook(cwd);
		case "none":
			return installRawGitHook(cwd);
		default: {
			const _exhaustive: never = manager;
			throw new Error(`Unknown hook manager: ${String(_exhaustive)}`);
		}
	}
}

async function installHuskyHook(cwd: string): Promise<InstallResult> {
	const hookPath = join(cwd, ".husky", "pre-push");
	const content = await safeReadFile(hookPath);
	const cmd = await buildHookCommand(cwd);

	if (content?.includes("agent-evals run")) {
		return {
			success: true,
			message: "Pre-push hook already contains eval command",
			filePath: hookPath,
		};
	}

	const newContent = content
		? `${content.trimEnd()}\n\n${HOOK_COMMENT}\n${cmd}\n`
		: `${HOOK_COMMENT}\n${cmd}\n`;

	await mkdir(join(cwd, ".husky"), { recursive: true });
	await writeFile(hookPath, newContent, "utf-8");
	await chmod(hookPath, 0o755);
	return { success: true, message: `Wrote pre-push hook to ${hookPath}`, filePath: hookPath };
}

async function installLefthookHook(cwd: string): Promise<InstallResult> {
	const configPath = join(cwd, "lefthook.yml");
	const content = await safeReadFile(configPath);
	const cmd = await buildHookCommand(cwd);

	if (content?.includes("agent-evals run")) {
		return {
			success: true,
			message: "lefthook.yml already contains eval command",
			filePath: configPath,
		};
	}

	const doc = content ? (parseYaml(content) as Record<string, unknown>) : {};
	const prePush = (doc["pre-push"] ?? {}) as Record<string, unknown>;
	const commands = (prePush.commands ?? {}) as Record<string, unknown>;
	commands.evals = { run: cmd };
	prePush.commands = commands;
	doc["pre-push"] = prePush;

	await writeFile(configPath, stringifyYaml(doc), "utf-8");
	return {
		success: true,
		message: `Added pre-push hook to ${configPath}`,
		filePath: configPath,
	};
}

async function installSimpleGitHook(cwd: string): Promise<InstallResult> {
	const pkgPath = join(cwd, "package.json");
	const raw = await safeReadFile(pkgPath);
	if (!raw) {
		return { success: false, message: "package.json not found" };
	}

	const pkg = JSON.parse(raw);

	if (pkg["simple-git-hooks"]?.["pre-push"]?.includes("agent-evals run")) {
		return {
			success: true,
			message: "simple-git-hooks already contains eval command",
			filePath: pkgPath,
		};
	}

	const cmd = await buildHookCommand(cwd);
	pkg["simple-git-hooks"] = pkg["simple-git-hooks"] ?? {};
	const existing = pkg["simple-git-hooks"]["pre-push"] as string | undefined;
	pkg["simple-git-hooks"]["pre-push"] = existing ? `${existing} && ${cmd}` : cmd;

	await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
	return {
		success: true,
		message: "Added pre-push hook to package.json simple-git-hooks",
		filePath: pkgPath,
	};
}

async function installRawGitHook(cwd: string): Promise<InstallResult> {
	const hooksDir = join(cwd, ".git", "hooks");
	const hookPath = join(hooksDir, "pre-push");

	const content = await safeReadFile(hookPath);
	if (content?.includes("agent-evals run")) {
		return {
			success: true,
			message: "Git hook already contains eval command",
			filePath: hookPath,
		};
	}

	const cmd = await buildHookCommand(cwd);
	const shebang = "#!/bin/sh";
	const newContent = content
		? `${content.trimEnd()}\n\n${HOOK_COMMENT}\n${cmd}\n`
		: `${shebang}\n\n${HOOK_COMMENT}\n${cmd}\n`;

	await mkdir(hooksDir, { recursive: true });
	await writeFile(hookPath, newContent, "utf-8");
	await chmod(hookPath, 0o755);
	return { success: true, message: `Wrote pre-push hook to ${hookPath}`, filePath: hookPath };
}

async function safeReadFile(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch {
		return undefined;
	}
}
