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

/** Options for the `llmClassify` LLM-as-judge grader. Requires at least 2 categories. */
export interface LlmClassifyOptions {
	/** Categories to classify into. Map of category name to description. Must have at least 2 entries. */
	readonly categories: Readonly<Record<string, string>>;
	/** Additional instruction for the judge beyond the category descriptions. */
	readonly criteria?: string | undefined;
	/** Override the judge function from config for this grader only. */
	readonly judge?: JudgeCallFn | undefined;
}

/**
 * Creates a grader that classifies agent output into categories using an LLM judge.
 *
 * Expected value: `expected.metadata.classification` (string matching a category key).
 * Pass condition: Judge's classification matches expected classification.
 * When no expected classification is set, the grader always passes (classification-only mode
 * — useful for labeling output without asserting a specific category).
 * Score: 1.0 for exact match, 0.0 for mismatch.
 *
 * @example
 * ```ts
 * // Assert a specific classification
 * llmClassify({
 *   categories: {
 *     helpful: "The response directly answers the user's question",
 *     partial: "The response partially addresses the question",
 *     unhelpful: "The response does not address the question",
 *   },
 * })
 *
 * // Classification-only (always passes, label in metadata)
 * // Omit expected.metadata.classification on the case
 * ```
 */
export function llmClassify(options: LlmClassifyOptions): GraderFn {
	const { categories, criteria, judge: overrideJudge } = options;

	const categoryNames = Object.keys(categories);
	if (categoryNames.length < 2) {
		throw new Error("llmClassify requires at least 2 categories");
	}

	const lowerNames = new Set<string>();
	for (const name of categoryNames) {
		const lower = name.toLowerCase();
		if (lowerNames.has(lower)) {
			throw new Error(
				`llmClassify: duplicate category '${name}' (case-insensitive collision with existing key)`,
			);
		}
		lowerNames.add(lower);
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
				graderName: "llm-classify",
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
				graderName: "llm-classify",
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
			graderName: "llm-classify",
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
