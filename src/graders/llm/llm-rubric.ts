import type {
	CaseExpected,
	GradeResult,
	GraderContext,
	GraderFn,
	JudgeCallFn,
	JudgeCallOptions,
	TargetOutput,
} from "../../config/types.js";
import {
	DEFAULT_JUDGE_PASS_THRESHOLD,
	judgeScoreToGradeScore,
	parseJudgeResponse,
} from "./judge-parser.js";
import { buildJudgePrompt } from "./judge-prompt.js";

export interface LlmRubricOptions {
	/** Natural language evaluation criteria */
	readonly criteria: string;
	/** Optional few-shot examples for calibration */
	readonly examples?: readonly LlmRubricExample[] | undefined;
	/** Override the judge function from config */
	readonly judge?: JudgeCallFn | undefined;
	/** Override judge call options */
	readonly judgeOptions?: JudgeCallOptions | undefined;
	/** Custom pass threshold (default: 0.75, i.e., score >= 3) */
	readonly passThreshold?: number | undefined;
}

export interface LlmRubricExample {
	readonly output: string;
	readonly score: 1 | 2 | 3 | 4;
	readonly reasoning: string;
}

/**
 * LLM-as-judge grader that evaluates output against natural language criteria.
 *
 * @example
 * ```ts
 * llmRubric({ criteria: "The response is helpful and addresses the user's question." })
 * llmRubric("The response correctly identifies all entities.")
 * ```
 */
export function llmRubric(options: LlmRubricOptions): GraderFn;
export function llmRubric(criteria: string): GraderFn;
export function llmRubric(optionsOrCriteria: LlmRubricOptions | string): GraderFn {
	const opts: LlmRubricOptions =
		typeof optionsOrCriteria === "string" ? { criteria: optionsOrCriteria } : optionsOrCriteria;

	const graderName = "llm-rubric";

	const graderFn = async (
		output: TargetOutput,
		expected: CaseExpected | undefined,
		context: GraderContext,
	): Promise<GradeResult> => {
		const judge = opts.judge ?? context.judge;
		if (!judge) {
			return {
				pass: false,
				score: 0,
				reason:
					"No judge configured. Set `judge.call` in eval.config.ts or pass `judge` option to llmRubric().",
				graderName,
			};
		}

		const messages = buildJudgePrompt({
			criteria: opts.criteria,
			output,
			expected,
			examples: opts.examples,
		});

		const judgeOptions: JudgeCallOptions = {
			temperature: opts.judgeOptions?.temperature ?? 0,
			model: opts.judgeOptions?.model,
			maxTokens: opts.judgeOptions?.maxTokens ?? 1024,
		};

		let response: Awaited<ReturnType<JudgeCallFn>>;
		try {
			response = await judge(messages, judgeOptions);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				pass: false,
				score: 0,
				reason: `Judge call failed: ${message}`,
				graderName,
				metadata: { error: message },
			};
		}

		const parseResult = parseJudgeResponse(response.text);
		if (!parseResult.success) {
			return {
				pass: false,
				score: 0,
				reason: `Judge response unparseable: ${parseResult.error}`,
				graderName,
				metadata: {
					rawJudgeResponse: response.text.slice(0, 500),
					error: parseResult.error,
				},
			};
		}

		const gradeScore = judgeScoreToGradeScore(parseResult.parsed.score);
		const passThreshold = opts.passThreshold ?? DEFAULT_JUDGE_PASS_THRESHOLD;

		return {
			pass: gradeScore >= passThreshold,
			score: gradeScore,
			reason: `Score ${parseResult.parsed.score}/4: ${parseResult.parsed.reasoning.slice(0, 200)}`,
			graderName,
			metadata: {
				reasoning: parseResult.parsed.reasoning,
				judgeScore: parseResult.parsed.score,
				judgeModelId: response.modelId,
				judgeCost: response.cost,
				judgeTokenUsage: response.tokenUsage,
			},
		};
	};

	return Object.assign(graderFn, { requiresJudge: true as const });
}
