import type {
	CaseExpected,
	GradeResult,
	GraderConfig,
	GraderContext,
	JudgeCallFn,
	RunMode,
	TargetOutput,
} from "../config/types.js";
import { computeCaseResult } from "../graders/scoring.js";
import type { CaseResult } from "../graders/types.js";

export interface PipelineResult {
	readonly grades: readonly GradeResult[];
	readonly caseResult: CaseResult;
}

export interface PipelineContext {
	readonly caseId: string;
	readonly suiteId: string;
	readonly mode: RunMode;
	readonly judge?: JudgeCallFn | undefined;
}

/**
 * Runs all graders against a target output and computes the aggregate result.
 */
export async function runGraderPipeline(
	output: TargetOutput,
	expected: CaseExpected | undefined,
	graders: readonly GraderConfig[] | undefined,
	context: PipelineContext,
): Promise<PipelineResult> {
	const configs = graders ?? [];

	const grades: GradeResult[] = [];

	for (const config of configs) {
		const graderContext: GraderContext = {
			caseId: context.caseId,
			suiteId: context.suiteId,
			mode: context.mode,
			graderName: config.grader.name || "unknown",
			judge: context.judge,
		};

		try {
			const grade = await config.grader(output, expected, graderContext);
			grades.push(grade);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			grades.push({
				pass: false,
				score: 0,
				reason: `Grader error: ${message}`,
				graderName: graderContext.graderName,
				metadata: { error: true },
			});
		}
	}

	const caseThreshold = inferThreshold(configs);
	const caseResult = computeCaseResult(grades, configs, caseThreshold);

	return { grades, caseResult };
}

function inferThreshold(configs: readonly GraderConfig[]): number {
	// Use the minimum individual threshold, or 0.5 as default
	const thresholds = configs.map((c) => c.threshold).filter((t): t is number => t !== undefined);

	return thresholds.length > 0 ? Math.min(...thresholds) : 0.5;
}
