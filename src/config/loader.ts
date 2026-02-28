import { resolve } from "node:path";
import { loadConfig as loadC12Config } from "c12";
import type { EvalPlugin } from "../plugin/types.js";
import { loadCases } from "./case-loader.js";
import type {
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
}

/**
 * Loads and validates an eval.config.ts file.
 * Resolves case file paths and returns a fully validated config.
 */
export async function loadConfig(options?: LoadConfigOptions): Promise<ValidatedConfig> {
	const configFile = options?.configPath ?? "eval.config";
	const basePath = options?.cwd ?? process.cwd();

	const { config } = await loadC12Config<EvalConfig>({
		name: "eval",
		configFile,
		cwd: basePath,
	});

	if (!config || !config.suites || config.suites.length === 0) {
		throw new Error(
			"No eval.config.ts found or config has no suites. Run 'agent-evals init' to create one.",
		);
	}

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
	};
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

async function resolveSuites(
	suites: readonly SuiteConfig[],
	basePath: string,
): Promise<readonly ResolvedSuite[]> {
	const resolved: ResolvedSuite[] = [];

	for (const suite of suites) {
		const cases =
			typeof suite.cases === "string"
				? await loadCases(resolve(basePath, suite.cases))
				: suite.cases;

		resolved.push({
			name: suite.name,
			description: suite.description,
			target: suite.target,
			cases,
			defaultGraders: suite.defaultGraders,
			gates: suite.gates,
			concurrency: suite.concurrency,
			tags: suite.tags,
		});
	}

	return resolved;
}
