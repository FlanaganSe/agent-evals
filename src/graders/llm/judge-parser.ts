/**
 * 3-layer fallback parser for judge LLM responses.
 *
 * Layer 1: Strict JSON.parse of full response
 * Layer 2: Extract JSON object via regex (handles markdown code blocks, trailing text)
 * Layer 3: Extract score/reasoning via text patterns (last resort)
 *
 * CRITICAL: Never default to pass on parse failure. Parse failure = error grade.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Parsed judge response with reasoning and score. */
export interface ParsedJudgeResponse {
	readonly reasoning: string;
	readonly score: 1 | 2 | 3 | 4;
	readonly rawText: string;
}

export interface JudgeParseError {
	readonly success: false;
	readonly rawText: string;
	readonly error: string;
}

export type JudgeParseResult =
	| { readonly success: true; readonly parsed: ParsedJudgeResponse }
	| JudgeParseError;

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_REASONING_LENGTH = 2000;

/**
 * Maps a 4-point judge score to a GradeResult-compatible score.
 * Score 1 → 0.25, Score 2 → 0.50, Score 3 → 0.75, Score 4 → 1.00
 */
export function judgeScoreToGradeScore(score: 1 | 2 | 3 | 4): number {
	return score * 0.25;
}

/**
 * Default pass threshold for LLM judge graders.
 * Score >= 3 (0.75) = pass.
 */
export const DEFAULT_JUDGE_PASS_THRESHOLD = 0.75;

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseJudgeResponse(text: string): JudgeParseResult {
	if (!text || text.trim().length === 0) {
		return {
			success: false,
			rawText: text,
			error: "Empty judge response. Expected JSON with 'reasoning' and 'score' fields.",
		};
	}

	// Layer 1: Strict JSON.parse
	const strictResult = tryStrictJson(text);
	if (strictResult) return { success: true, parsed: strictResult };

	// Layer 2: Extract JSON from markdown code blocks or embedded JSON
	const extractedResult = tryExtractJson(text);
	if (extractedResult) return { success: true, parsed: extractedResult };

	// Layer 3: Text pattern matching
	const patternResult = tryPatternMatch(text);
	if (patternResult) return { success: true, parsed: patternResult };

	return {
		success: false,
		rawText: text,
		error: "Could not parse judge response. Expected JSON with 'reasoning' and 'score' fields.",
	};
}

// ─── Layer 1: Strict JSON ────────────────────────────────────────────────────

function tryStrictJson(text: string): ParsedJudgeResponse | null {
	try {
		const parsed: unknown = JSON.parse(text.trim());
		return validateParsed(parsed, text);
	} catch {
		return null;
	}
}

// ─── Layer 2: Regex JSON extraction ──────────────────────────────────────────

function tryExtractJson(text: string): ParsedJudgeResponse | null {
	// Try markdown code block first: ```json\n{...}\n```
	const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (codeBlockMatch?.[1]) {
		try {
			const parsed: unknown = JSON.parse(codeBlockMatch[1].trim());
			return validateParsed(parsed, text);
		} catch {
			/* fall through */
		}
	}

	// Try first {...} block in text
	const objectMatch = text.match(/\{[\s\S]*\}/);
	if (objectMatch?.[0]) {
		try {
			const parsed: unknown = JSON.parse(objectMatch[0]);
			return validateParsed(parsed, text);
		} catch {
			/* fall through */
		}
	}

	return null;
}

// ─── Layer 3: Text pattern matching ──────────────────────────────────────────

function tryPatternMatch(text: string): ParsedJudgeResponse | null {
	// Look for "Score: N" or "Rating: N" patterns (negative lookahead prevents "10" → "1")
	const scoreMatch = text.match(/(?:score|rating)\s*[:=]\s*([1-4])(?!\d)/i);
	if (!scoreMatch) return null;

	const score = Number(scoreMatch[1]) as 1 | 2 | 3 | 4;

	// Look for reasoning: everything before the score line, or after "reasoning:" label
	const reasoningMatch = text.match(
		/(?:reasoning|evaluation|explanation)\s*[:=]\s*([\s\S]+?)(?=\n\s*(?:score|rating)|$)/i,
	);
	const reasoning =
		reasoningMatch?.[1]?.trim() ?? text.slice(0, text.indexOf(scoreMatch[0])).trim();

	if (!reasoning) return null;

	const trimmed = reasoning.slice(0, MAX_REASONING_LENGTH);
	return {
		reasoning: reasoning.length > MAX_REASONING_LENGTH ? `${trimmed}...` : trimmed,
		score,
		rawText: text,
	};
}

// ─── Shared validation ───────────────────────────────────────────────────────

function validateParsed(obj: unknown, rawText: string): ParsedJudgeResponse | null {
	if (typeof obj !== "object" || obj === null) return null;

	const record = obj as Record<string, unknown>;

	// Score field: accept "score", "rating", "total_rating"
	const rawScore = record.score ?? record.rating ?? record.total_rating;
	if (typeof rawScore !== "number" || rawScore < 1 || rawScore > 4 || !Number.isInteger(rawScore)) {
		return null;
	}

	// Reasoning field: accept "reasoning", "evaluation", "explanation", "rationale"
	const rawReasoning =
		record.reasoning ?? record.evaluation ?? record.explanation ?? record.rationale;
	if (typeof rawReasoning !== "string" || rawReasoning.trim().length === 0) {
		return null;
	}

	const trimmed = rawReasoning.trim();
	const truncated = trimmed.slice(0, MAX_REASONING_LENGTH);
	return {
		reasoning: trimmed.length > MAX_REASONING_LENGTH ? `${truncated}...` : truncated,
		score: rawScore as 1 | 2 | 3 | 4,
		rawText,
	};
}
