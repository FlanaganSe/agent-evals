import type {
	CaseExpected,
	GradeResult,
	GraderContext,
	GraderFn,
	JudgeCallFn,
	JudgeCallOptions,
	TargetOutput,
} from "../../config/types.js";
import { llmRubric } from "./llm-rubric.js";

export interface FactualityOptions {
	/** Override the judge function from config */
	readonly judge?: JudgeCallFn | undefined;
	/** Override judge call options */
	readonly judgeOptions?: JudgeCallOptions | undefined;
	/** Custom pass threshold (default: 0.75) */
	readonly passThreshold?: number | undefined;
}

const FACTUALITY_CRITERIA = `Is the agent's output factually consistent with the expected reference?

Evaluate along these dimensions:
1. ACCURACY: Are all factual claims in the output supported by the reference?
2. COMPLETENESS: Does the output cover the key facts from the reference?
3. NO FABRICATION: Does the output avoid stating facts not present in the reference?

A response that is accurate but incomplete scores higher than one that fabricates details.
The reference is the source of truth. If the output contradicts the reference, that is a factual error.`;

const FACTUALITY_EXAMPLES = [
	{
		output: "The capital of France is Paris, which has a population of about 2.1 million.",
		score: 4 as const,
		reasoning: "All facts match the reference. Population figure is accurate.",
	},
	{
		output: "The capital of France is Paris, a city of 10 million people.",
		score: 2 as const,
		reasoning:
			"Capital is correct, but population is significantly overstated compared to reference.",
	},
	{
		output: "I'm not sure about the capital of France.",
		score: 1 as const,
		reasoning: "Fails to provide the factual content present in the reference.",
	},
];

/**
 * Factuality grader — evaluates whether output is factually consistent with
 * the expected reference. Requires `expected.text` to be set on the case.
 *
 * Implemented as a specialized llmRubric with locked criteria and calibration examples.
 *
 * @example
 * ```ts
 * factuality()
 * factuality({ passThreshold: 0.5 })
 * ```
 */
export function factuality(options?: FactualityOptions): GraderFn {
	const inner = llmRubric({
		criteria: FACTUALITY_CRITERIA,
		examples: FACTUALITY_EXAMPLES,
		judge: options?.judge,
		judgeOptions: options?.judgeOptions,
		passThreshold: options?.passThreshold,
	});

	const graderFn = async (
		output: TargetOutput,
		expected: CaseExpected | undefined,
		context: GraderContext,
	): Promise<GradeResult> => {
		if (!expected?.text) {
			return {
				pass: false,
				score: 0,
				reason:
					"factuality grader requires `expected.text` on the case. Cannot evaluate factual accuracy without a reference.",
				graderName: "factuality",
			};
		}

		const result = await inner(output, expected, context);
		return { ...result, graderName: "factuality" };
	};

	return Object.assign(graderFn, { requiresJudge: true as const });
}
