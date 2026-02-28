export interface ClassificationResult {
	readonly success: true;
	readonly classification: string;
	readonly reasoning?: string | undefined;
	readonly confidence?: number | undefined;
}

export interface ClassificationError {
	readonly success: false;
	readonly error: string;
}

/**
 * Parses a classification response from the judge LLM.
 * Uses the same 3-layer fallback strategy as judge-parser.ts.
 * Validates that the classification is one of the valid categories.
 */
export function parseClassificationResponse(
	text: string,
	validCategories: readonly string[],
): ClassificationResult | ClassificationError {
	if (!text || text.trim().length === 0) {
		return {
			success: false,
			error: "Empty classification response.",
		};
	}

	// Layer 1: Strict JSON.parse
	const strictResult = tryStrictJson(text, validCategories);
	if (strictResult) return strictResult;

	// Layer 2: Extract JSON from markdown code blocks or embedded JSON
	const extractedResult = tryExtractJson(text, validCategories);
	if (extractedResult) return extractedResult;

	// Layer 3: Text pattern matching ("Classification: <category>")
	const patternResult = tryPatternMatch(text, validCategories);
	if (patternResult) return patternResult;

	return {
		success: false,
		error: `Could not parse classification. Valid categories: ${validCategories.join(", ")}`,
	};
}

function tryStrictJson(
	text: string,
	validCategories: readonly string[],
): ClassificationResult | null {
	try {
		const parsed: unknown = JSON.parse(text.trim());
		return validateParsed(parsed, validCategories);
	} catch {
		return null;
	}
}

function tryExtractJson(
	text: string,
	validCategories: readonly string[],
): ClassificationResult | null {
	// Try markdown code block first
	const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (codeBlockMatch?.[1]) {
		try {
			const parsed: unknown = JSON.parse(codeBlockMatch[1].trim());
			const result = validateParsed(parsed, validCategories);
			if (result) return result;
		} catch {
			/* fall through */
		}
	}

	// Try first {...} block
	const objectMatch = text.match(/\{[\s\S]*\}/);
	if (objectMatch?.[0]) {
		try {
			const parsed: unknown = JSON.parse(objectMatch[0]);
			return validateParsed(parsed, validCategories);
		} catch {
			/* fall through */
		}
	}

	return null;
}

function tryPatternMatch(
	text: string,
	validCategories: readonly string[],
): ClassificationResult | null {
	// Look for "Classification: <category>" pattern
	const classMatch = text.match(/(?:classification|category|class)\s*[:=]\s*"?([a-z0-9_-]+)"?/i);
	if (classMatch?.[1]) {
		const matched = classMatch[1].toLowerCase();
		const category = validCategories.find((c) => c.toLowerCase() === matched);
		if (category) {
			return { success: true, classification: category };
		}
	}
	return null;
}

function validateParsed(
	obj: unknown,
	validCategories: readonly string[],
): ClassificationResult | null {
	if (typeof obj !== "object" || obj === null) return null;

	const record = obj as Record<string, unknown>;
	const classification = record.classification ?? record.category ?? record.class;

	if (typeof classification !== "string") return null;

	const normalizedCategory = validCategories.find(
		(c) => c.toLowerCase() === classification.toLowerCase(),
	);
	if (!normalizedCategory) return null;

	const reasoning = typeof record.reasoning === "string" ? record.reasoning : undefined;
	const confidence = typeof record.confidence === "number" ? record.confidence : undefined;

	return {
		success: true,
		classification: normalizedCategory,
		reasoning,
		confidence,
	};
}
