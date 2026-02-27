import { resolve } from "node:path";
import { loadConfig as loadC12Config } from "c12";
import { loadCases } from "./case-loader.js";
import type { EvalConfig, ResolvedSuite, RunMode, SuiteConfig } from "./types.js";

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

	return {
		suites: resolvedSuites,
		run: {
			defaultMode: config.run?.defaultMode ?? "live",
			timeoutMs: config.run?.timeoutMs ?? 30_000,
			rateLimit: config.run?.rateLimit,
		},
	};
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
