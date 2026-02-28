import type {
	CaseExpected,
	GradeResult,
	GraderContext,
	GraderFn,
	JudgeCallFn,
	TargetOutput,
} from "../../config/types.js";
import { parseClassificationResponse } from "./classify-parser.js";
import { buildClassificationPrompt } from "./classify-prompt.js";

export interface LlmClassifyOptions {
	/** The categories to classify into. Map of category name → description. */
	readonly categories: Readonly<Record<string, string>>;
	/** Optional classification criteria (additional instruction for the judge). */
	readonly criteria?: string | undefined;
	/** Override the judge function from config. */
	readonly judge?: JudgeCallFn | undefined;
}

/**
 * Creates a grader that classifies agent output into categories using an LLM judge.
 *
 * Expected value: `expected.metadata.classification` (string matching a category key).
 * Pass condition: Judge's classification matches expected classification.
 * Score: 1.0 for exact match, 0.0 for mismatch.
 *
 * @example
 * ```ts
 * llmClassify({
 *   categories: {
 *     helpful: "The response directly answers the user's question",
 *     partial: "The response partially addresses the question",
 *     unhelpful: "The response does not address the question",
 *   },
 * })
 * ```
 */
export function llmClassify(options: LlmClassifyOptions): GraderFn {
	const { categories, criteria, judge: overrideJudge } = options;

	const categoryNames = Object.keys(categories);
	if (categoryNames.length < 2) {
		throw new Error("llmClassify requires at least 2 categories");
	}

	const graderFn = async (
		output: TargetOutput,
		expected: CaseExpected | undefined,
		context: GraderContext,
	): Promise<GradeResult> => {
		const judge = overrideJudge ?? context.judge;
		if (!judge) {
			return {
				pass: false,
				score: 0,
				reason: "llmClassify requires a judge function. Configure judge in defineConfig().",
				graderName: context.graderName,
			};
		}

		const expectedCategory = expected?.metadata?.classification as string | undefined;

		const messages = buildClassificationPrompt({
			output,
			categories,
			criteria,
			expected: expectedCategory,
		});

		const response = await judge(messages, { temperature: 0 });
		const parsed = parseClassificationResponse(response.text, categoryNames);

		if (!parsed.success) {
			return {
				pass: false,
				score: 0,
				reason: `Classification parse error: ${parsed.error}`,
				graderName: context.graderName,
				metadata: {
					rawResponse: response.text.slice(0, 2000),
					judgeCost: response.cost,
				},
			};
		}

		const isMatch = expectedCategory ? parsed.classification === expectedCategory : true; // No expected = always pass (classification-only mode)

		return {
			pass: isMatch,
			score: isMatch ? 1 : 0,
			reason: isMatch
				? `Classified as '${parsed.classification}' (expected: '${expectedCategory ?? "any"}')`
				: `Classified as '${parsed.classification}', expected '${expectedCategory}'`,
			graderName: context.graderName,
			metadata: {
				classification: parsed.classification,
				reasoning: parsed.reasoning?.slice(0, 2000),
				confidence: parsed.confidence,
				judgeCost: response.cost,
			},
		};
	};

	return Object.assign(graderFn, { requiresJudge: true as const });
}
