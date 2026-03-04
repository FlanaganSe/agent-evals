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

/** Options for the `llmRubric` LLM-as-judge grader. */
export interface LlmRubricOptions {
	/** Natural language evaluation criteria the judge will score against. */
	readonly criteria: string;
	/** Few-shot examples for calibrating the judge's scoring. Improves consistency across runs. */
	readonly examples?: readonly LlmRubricExample[] | undefined;
	/** Override the judge function from config for this grader only. */
	readonly judge?: JudgeCallFn | undefined;
	/** Override judge call options (temperature, model, maxTokens). */
	readonly judgeOptions?: JudgeCallOptions | undefined;
	/** Minimum normalized score (0-1) to pass. The judge scores 1-4; this threshold is applied after normalization. @default 0.75 (i.e., score >= 3) */
	readonly passThreshold?: number | undefined;
}

/** A few-shot calibration example for `llmRubric`. Provides the judge with concrete scoring examples. */
export interface LlmRubricExample {
	/** Example output text to evaluate. */
	readonly output: string;
	/** Expected judge score (1 = poor, 4 = excellent). */
	readonly score: 1 | 2 | 3 | 4;
	/** Explanation of why this output deserves this score. */
	readonly reasoning: string;
}

/**
 * LLM-as-judge grader that evaluates output against natural language criteria.
 *
 * The judge scores 1-4, normalized to 0.25-1.0. Default pass threshold of 0.75
 * requires a judge score of 3 ("Good") or higher.
 *
 * @example
 * ```ts
 * // String shorthand
 * llmRubric("The response correctly identifies all entities.")
 *
 * // With calibration examples for consistent scoring
 * llmRubric({
 *   criteria: "The response is helpful and addresses the user's question.",
 *   examples: [
 *     { output: "Here is a detailed answer...", score: 4, reasoning: "Complete and accurate" },
 *     { output: "I don't know.", score: 1, reasoning: "Does not address the question" },
 *   ],
 * })
 * ```
 */
export function llmRubric(options: LlmRubricOptions): GraderFn;
export function llmRubric(criteria: string): GraderFn;
export function llmRubric(optionsOrCriteria: LlmRubricOptions | string): GraderFn {
	const opts: LlmRubricOptions =
		typeof optionsOrCriteria === "string" ? { criteria: optionsOrCriteria } : optionsOrCriteria;

	if (opts.passThreshold !== undefined) {
		if (!Number.isFinite(opts.passThreshold) || opts.passThreshold < 0 || opts.passThreshold > 1) {
			throw new RangeError(
				`passThreshold must be between 0 and 1, got ${String(opts.passThreshold)}`,
			);
		}
	}

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
