import type { GraderConfig, ResolvedSuite, RunOptions } from "../config/types.js";

export interface CostEstimate {
	/** Total estimated judge calls */
	readonly judgeCalls: number;
	/** Total estimated target calls (live mode only) */
	readonly targetCalls: number;
	/** Human-readable summary */
	readonly summary: string;
}

/**
 * Estimates the number of LLM calls a run will make.
 * Does NOT estimate dollar cost (we don't know the user's model pricing).
 * Provides call counts so the user can make an informed decision.
 */
export function estimateCost(
	suite: ResolvedSuite,
	options: Pick<RunOptions, "mode" | "trials">,
): CostEstimate {
	const caseCount = suite.cases.length;
	const trialCount = options.trials ?? 1;
	const totalTrials = caseCount * trialCount;

	const llmGraderCount = countLlmGraders(suite.defaultGraders ?? []);
	const judgeCalls = totalTrials * llmGraderCount;

	const targetCalls = options.mode === "live" ? totalTrials : 0;

	const parts: string[] = [];
	parts.push(`${caseCount} cases × ${trialCount} trial(s) = ${totalTrials} executions`);
	if (targetCalls > 0) {
		parts.push(`${targetCalls} target LLM call(s) (live mode)`);
	}
	if (judgeCalls > 0) {
		parts.push(`${judgeCalls} judge LLM call(s) (${llmGraderCount} LLM grader(s) per trial)`);
	}
	if (targetCalls === 0 && judgeCalls === 0) {
		parts.push("No LLM calls (deterministic graders only)");
	}

	return {
		judgeCalls,
		targetCalls,
		summary: parts.join("\n"),
	};
}

/**
 * Counts graders that require a judge call.
 * Uses the `requiresJudge` tag on grader functions (set by llmRubric, factuality, llmClassify).
 */
function countLlmGraders(graders: readonly GraderConfig[]): number {
	return graders.filter((g) => "requiresJudge" in g.grader && g.grader.requiresJudge === true)
		.length;
}
