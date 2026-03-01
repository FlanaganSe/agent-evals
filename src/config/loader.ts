import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createJiti } from "jiti";
import type { EvalPlugin } from "../plugin/types.js";
import { loadCases } from "./case-loader.js";
import type {
	Case,
	EvalConfig,
	JudgeConfig,
	ReporterConfig,
	ResolvedSuite,
	RunMode,
	SuiteConfig,
} from "./types.js";

export interface LoadConfigOptions {
	readonly configPath?: string | undefined;
	readonly cwd?: string | undefined;
}

export interface ValidatedConfig {
	readonly suites: readonly ResolvedSuite[];
	readonly run: {
		readonly defaultMode: RunMode;
		readonly timeoutMs: number;
		readonly rateLimit?: number | undefined;
	};
	readonly judge?: JudgeConfig | undefined;
	readonly plugins: readonly EvalPlugin[];
	readonly reporters: readonly ReporterConfig[];
	readonly fixtureDir: string;
}

/**
 * Loads and validates an eval.config.ts file.
 * Resolves case file paths and returns a fully validated config.
 */
export async function loadConfig(options?: LoadConfigOptions): Promise<ValidatedConfig> {
	const configFile = options?.configPath ?? "eval.config";
	const basePath = options?.cwd ?? process.cwd();

	const configPath = await resolveConfigFile(configFile, basePath);
	const raw = configPath ? await importConfig(configPath) : undefined;

	if (!raw) {
		throw new Error(
			"No eval.config.ts found or config has no suites. Run 'agent-eval-kit init' to create one.",
		);
	}
	validateConfigShape(raw);
	const config = raw;

	const resolvedSuites = await resolveSuites(config.suites, basePath);
	const plugins = config.plugins ?? [];
	validatePlugins(plugins);

	return {
		suites: resolvedSuites,
		run: {
			defaultMode: config.run?.defaultMode ?? "live",
			timeoutMs: config.run?.timeoutMs ?? 30_000,
			rateLimit: config.run?.rateLimit,
		},
		judge: config.judge,
		plugins,
		reporters: config.reporters ?? [],
		fixtureDir: config.fixtureDir ?? ".eval-fixtures",
	};
}

const CONFIG_EXTENSIONS = [".ts", ".mts", ".js", ".mjs"] as const;

async function resolveConfigFile(stem: string, basePath: string): Promise<string | undefined> {
	for (const ext of CONFIG_EXTENSIONS) {
		const candidate = resolve(basePath, `${stem}${ext}`);
		try {
			await access(candidate);
			return candidate;
		} catch {
			// File doesn't exist, try next extension
		}
	}
	return undefined;
}

async function importConfig(filePath: string): Promise<EvalConfig | undefined> {
	const jiti = createJiti(import.meta.url, { interopDefault: true });
	try {
		const mod = (await jiti.import(filePath)) as EvalConfig | undefined;
		return mod;
	} catch (error) {
		throw new Error(
			`Failed to load config from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function validateConfigShape(config: unknown): asserts config is EvalConfig {
	if (!config || typeof config !== "object") {
		throw new Error("Config file must export an object. Run 'agent-eval-kit init' to create one.");
	}

	const cfg = config as Record<string, unknown>;

	if (!Array.isArray(cfg.suites) || cfg.suites.length === 0) {
		throw new Error(
			"No eval.config.ts found or config has no suites. Run 'agent-eval-kit init' to create one.",
		);
	}

	for (let i = 0; i < cfg.suites.length; i++) {
		const suite = cfg.suites[i] as Record<string, unknown>;
		if (!suite || typeof suite !== "object") {
			throw new Error(`suites[${i}]: must be an object`);
		}
		if (typeof suite.name !== "string" || suite.name.length === 0) {
			throw new Error(`suites[${i}]: missing or invalid 'name' (must be a non-empty string)`);
		}
		if (typeof suite.target !== "function") {
			throw new Error(
				`suites[${i}] ("${suite.name}"): missing or invalid 'target' (must be a function)`,
			);
		}
		if (!Array.isArray(suite.cases) && typeof suite.cases !== "string") {
			throw new Error(
				`suites[${i}] ("${suite.name}"): 'cases' must be an array or a file path string`,
			);
		}
	}
}

function validatePlugins(plugins: readonly EvalPlugin[]): void {
	const graderNames = new Map<string, string>();

	for (const plugin of plugins) {
		if (!plugin.name) {
			throw new Error("Plugin missing required 'name' field");
		}
		if (!plugin.version) {
			throw new Error(`Plugin '${plugin.name}' missing required 'version' field`);
		}

		if (plugin.graders) {
			for (const graderName of Object.keys(plugin.graders)) {
				const existing = graderNames.get(graderName);
				if (existing) {
					throw new Error(
						`Duplicate grader name '${graderName}' from plugin '${plugin.name}' (already registered by '${existing}')`,
					);
				}
				graderNames.set(graderName, plugin.name);
			}
		}
	}
}

async function resolveCases(
	cases: readonly (Case | string)[] | string,
	basePath: string,
): Promise<readonly Case[]> {
	// Single file path — load all cases from it
	if (typeof cases === "string") {
		return loadCases(resolve(basePath, cases));
	}

	// Mixed array — inline cases + file paths
	const result: Case[] = [];
	for (const entry of cases) {
		if (typeof entry === "string") {
			const loaded = await loadCases(resolve(basePath, entry));
			result.push(...loaded);
		} else {
			result.push(entry);
		}
	}
	return result;
}

async function resolveSuites(
	suites: readonly SuiteConfig[],
	basePath: string,
): Promise<readonly ResolvedSuite[]> {
	const resolved: ResolvedSuite[] = [];

	for (const suite of suites) {
		const cases = await resolveCases(suite.cases, basePath);

		resolved.push({
			name: suite.name,
			description: suite.description,
			target: suite.target,
			cases,
			defaultGraders: suite.defaultGraders,
			gates: suite.gates,
			concurrency: suite.concurrency,
			tags: suite.tags,
			targetVersion: suite.targetVersion,
			replay: suite.replay,
		});
	}

	return resolved;
}
