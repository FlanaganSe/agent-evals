import type { Run } from "../config/types.js";

/**
 * Reporter plugin interface.
 * Reporters transform a Run artifact into an output format.
 * They are pure functions: Run → string (or undefined for file-writing reporters).
 *
 * Register via: defineConfig({ reporters: [myReporter] })
 */
export interface ReporterPlugin {
	/** Unique reporter name (e.g., 'junit', 'markdown', 'ctrf') */
	readonly name: string;

	/**
	 * Generate report output from a completed run.
	 * Return a string for text-based output, or undefined if the reporter handles its own I/O.
	 */
	readonly report: (run: Run, options: ReporterOptions) => Promise<string | undefined>;
}

export interface ReporterOptions {
	/** Output file path. If undefined, write to stdout. */
	readonly output?: string | undefined;
	/** Enable verbose output (reporter-specific). */
	readonly verbose?: boolean | undefined;
	/** Enable color output (reporter-specific, for terminal reporters). */
	readonly color?: boolean | undefined;
}
