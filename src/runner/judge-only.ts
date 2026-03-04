import type { ResolvedSuite, Run, RunOptions, Trial } from "../config/types.js";
import { runGraderPipeline } from "./pipeline.js";

export interface JudgeOnlyOptions {
	readonly previousRun: Run;
	readonly suiteConfig: ResolvedSuite;
	readonly runOptions: RunOptions;
}

/**
 * Re-grades trials from a previous run using the current grader config.
 * Target outputs are taken from the previous run — the target function is never called.
 *
 * Expected values are looked up from the suite config's cases by caseId.
 * Graders come from the current suite config (not the previous run).
 */
export async function runJudgeOnly(options: JudgeOnlyOptions): Promise<readonly Trial[]> {
	const { previousRun, suiteConfig, runOptions } = options;
	const regraded: Trial[] = [];

	// Build a lookup for expected values from the current suite config
	const expectedByCaseId = new Map(suiteConfig.cases.map((c) => [c.id, c.expected]));

	for (const trial of previousRun.trials) {
		if (!expectedByCaseId.has(trial.caseId)) {
			process.stderr.write(
				`[warn] Case '${trial.caseId}' from previous run not found in current suite config. Grading with no expected value.\n`,
			);
		}
		const expected = expectedByCaseId.get(trial.caseId);

		const pipelineResult = await runGraderPipeline(
			trial.output,
			expected,
			suiteConfig.defaultGraders,
			{
				caseId: trial.caseId,
				suiteId: previousRun.suiteId,
				mode: "judge-only",
				judge: runOptions.judge,
			},
		);

		regraded.push({
			caseId: trial.caseId,
			status: pipelineResult.caseResult.pass ? "pass" : "fail",
			output: trial.output,
			grades: pipelineResult.grades,
			score: pipelineResult.caseResult.score,
			durationMs: trial.durationMs,
			trialIndex: trial.trialIndex,
		});
	}

	return regraded;
}
