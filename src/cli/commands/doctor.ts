import { access, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { defineCommand } from "citty";
import pc from "picocolors";
import { loadConfig } from "../../config/loader.js";
import { globalArgs } from "../shared-args.js";
import { detectHookManager } from "./hook-detection.js";

export interface CheckResult {
	readonly status: "pass" | "warn" | "fail";
	readonly message: string;
}

export type DoctorCheck = () => Promise<CheckResult>;

// ─── Individual checks (exported for testing) ───────────────────────────────

export function checkNodeVersion(): CheckResult {
	const version = process.versions.node;
	const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
	if (major >= 20) {
		return { status: "pass", message: `Node.js v${version} (>= 20.0.0 required)` };
	}
	return { status: "fail", message: `Node.js v${version} — requires >= 20.0.0` };
}

export async function checkConfig(cwd?: string): Promise<CheckResult> {
	try {
		const config = await loadConfig({ cwd });
		const totalCases = config.suites.reduce((sum, s) => sum + s.cases.length, 0);
		return {
			status: "pass",
			message: `Config validates: ${config.suites.length} suite${config.suites.length === 1 ? "" : "s"}, ${totalCases} case${totalCases === 1 ? "" : "s"}`,
		};
	} catch (err) {
		return {
			status: "fail",
			message: `Config error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export async function checkDuplicateSuiteNames(cwd?: string): Promise<CheckResult> {
	try {
		const config = await loadConfig({ cwd });
		const names = config.suites.map((s) => s.name);
		const dupes = names.filter((n, i) => names.indexOf(n) !== i);
		if (dupes.length > 0) {
			return {
				status: "warn",
				message: `Duplicate suite names: ${[...new Set(dupes)].join(", ")}`,
			};
		}
		return { status: "pass", message: "No duplicate suite names" };
	} catch {
		return { status: "pass", message: "Suite name check skipped (config error)" };
	}
}

export async function checkRunStorage(): Promise<CheckResult> {
	const dir = ".eval-runs";
	try {
		await access(dir);
		return { status: "pass", message: `Run storage directory exists: ${dir}` };
	} catch {
		return {
			status: "warn",
			message: `Run storage directory not found: ${dir} (will be created on first run)`,
		};
	}
}

export async function checkFixtureDir(): Promise<CheckResult> {
	const dir = ".eval-fixtures";
	try {
		await access(dir);
		const entries = await readdir(dir);
		return { status: "pass", message: `Fixture directory found: ${entries.length} entries` };
	} catch {
		return {
			status: "warn",
			message:
				"No fixture directory (.eval-fixtures/). Run 'agent-evals record' to create fixtures.",
		};
	}
}

export async function checkGitHooks(cwd?: string): Promise<CheckResult> {
	const dir = cwd ?? ".";
	const detected = await detectHookManager(dir);
	if (detected) {
		return {
			status: "pass",
			message: `Git hooks: ${detected.manager} (${detected.reason})`,
		};
	}
	return {
		status: "warn",
		message:
			"No git hook manager detected. Run 'agent-evals install-hooks' to set up pre-push eval checks.",
	};
}

export async function checkAgentsMd(cwd?: string): Promise<CheckResult> {
	const dir = cwd ?? ".";
	try {
		await access(join(dir, "AGENTS.md"));
		return { status: "pass", message: "AGENTS.md found" };
	} catch {
		return {
			status: "warn",
			message:
				"No AGENTS.md found. Run 'agent-evals init' to generate one for AI coding assistants.",
		};
	}
}

// ─── Command ────────────────────────────────────────────────────────────────

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "doctor", description: "Validate project setup" },
	args: globalArgs,
	async run({ args }) {
		const cwd = args.config ? await resolveDir(args.config) : undefined;
		const noColor = args["no-color"];

		const checks: readonly CheckResult[] = [
			checkNodeVersion(),
			await checkConfig(cwd),
			await checkDuplicateSuiteNames(cwd),
			await checkRunStorage(),
			await checkFixtureDir(),
			await checkGitHooks(cwd),
			await checkAgentsMd(cwd),
		];

		const lines = ["agent-evals doctor", ""];

		let passes = 0;
		let warnings = 0;
		let failures = 0;

		for (const check of checks) {
			const icon = formatIcon(check.status, noColor);
			lines.push(`  ${icon} ${check.message}`);
			if (check.status === "pass") passes++;
			else if (check.status === "warn") warnings++;
			else failures++;
		}

		lines.push("");
		lines.push(
			`${passes} checks passed${warnings > 0 ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}${failures > 0 ? `, ${failures} issue${failures === 1 ? "" : "s"}` : ""}`,
		);

		process.stdout.write(`${lines.join("\n")}\n`);

		if (failures > 0) {
			process.exit(1);
		}
	},
});

function formatIcon(status: "pass" | "warn" | "fail", noColor?: boolean): string {
	if (noColor) {
		if (status === "pass") return "[OK]";
		if (status === "warn") return "[!!]";
		return "[FAIL]";
	}
	if (status === "pass") return pc.green("✓");
	if (status === "warn") return pc.yellow("⚠");
	return pc.red("✗");
}

async function resolveDir(configPath: string): Promise<string | undefined> {
	const resolved = resolve(configPath);
	const s = await stat(resolved).catch(() => null);
	if (s?.isFile()) return dirname(resolved);
	if (s?.isDirectory()) return resolved;
	return resolved;
}
