import type { GraderFn, Run, RunMode, Trial } from "../config/types.js";

/**
 * Plugin interface for extending agent-evals.
 * Plugins are plain objects — no classes, no inheritance.
 *
 * Plugins contribute:
 * - Custom graders (same GraderFn signature as built-in graders)
 * - Lifecycle hooks (beforeRun, afterTrial, afterRun)
 *
 * Register via: defineConfig({ plugins: [myPlugin] })
 */
export interface EvalPlugin {
	readonly name: string;
	readonly version: string;

	/** Custom graders contributed by this plugin. Keyed by grader name. */
	readonly graders?: Readonly<Record<string, GraderFn>> | undefined;

	/** Lifecycle hooks. All hooks are sequential (called in plugin registration order). */
	readonly hooks?: PluginHooks | undefined;
}

export interface PluginHooks {
	/**
	 * Called before a suite run begins.
	 * Use for setup: logging, telemetry start, resource initialization.
	 */
	readonly beforeRun?: (context: BeforeRunContext) => Promise<void>;

	/**
	 * Called after each trial completes.
	 * Use for streaming progress, live updates, incremental logging.
	 * Must not throw — errors are logged and swallowed to avoid breaking the pipeline.
	 */
	readonly afterTrial?: (trial: Trial, context: AfterTrialContext) => Promise<void>;

	/**
	 * Called after the entire run completes (including aborted runs).
	 * Use for cleanup: telemetry end, resource disposal, summary notifications.
	 */
	readonly afterRun?: (run: Run) => Promise<void>;
}

export interface BeforeRunContext {
	readonly suiteId: string;
	readonly mode: RunMode;
	readonly caseCount: number;
	readonly trialCount: number;
}

export interface AfterTrialContext {
	readonly suiteId: string;
	readonly completedCount: number;
	readonly totalCount: number;
}
