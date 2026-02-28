import { describe, expect, it } from "vitest";
import { parseClassificationResponse } from "./classify-parser.js";

const validCategories = ["helpful", "partial", "unhelpful"];

describe("parseClassificationResponse", () => {
	describe("Layer 1: strict JSON", () => {
		it("parses valid JSON with classification", () => {
			const result = parseClassificationResponse(
				'{"classification":"helpful","reasoning":"Good answer","confidence":0.9}',
				validCategories,
			);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.classification).toBe("helpful");
				expect(result.reasoning).toBe("Good answer");
				expect(result.confidence).toBe(0.9);
			}
		});

		it("rejects classification not in valid list", () => {
			const result = parseClassificationResponse(
				'{"classification":"excellent","reasoning":"Great"}',
				validCategories,
			);
			expect(result.success).toBe(false);
		});

		it("handles case-insensitive matching", () => {
			const result = parseClassificationResponse(
				'{"classification":"HELPFUL","reasoning":"Good"}',
				validCategories,
			);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.classification).toBe("helpful");
			}
		});
	});

	describe("Layer 2: JSON extraction", () => {
		it("extracts JSON from markdown code block", () => {
			const result = parseClassificationResponse(
				'Here is my analysis:\n```json\n{"classification":"partial","reasoning":"Partially addresses"}\n```',
				validCategories,
			);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.classification).toBe("partial");
			}
		});

		it("extracts JSON from surrounding text", () => {
			const result = parseClassificationResponse(
				'I believe the output is {"classification":"unhelpful","reasoning":"Does not address"}.',
				validCategories,
			);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.classification).toBe("unhelpful");
			}
		});
	});

	describe("Layer 3: text pattern matching", () => {
		it("matches 'Classification: helpful' pattern", () => {
			const result = parseClassificationResponse(
				"After analysis, Classification: helpful",
				validCategories,
			);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.classification).toBe("helpful");
			}
		});

		it("matches 'category: partial' pattern", () => {
			const result = parseClassificationResponse("Category: partial", validCategories);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.classification).toBe("partial");
			}
		});
	});

	describe("error cases", () => {
		it("returns error for empty string", () => {
			const result = parseClassificationResponse("", validCategories);
			expect(result.success).toBe(false);
		});

		it("returns error for unparseable text", () => {
			const result = parseClassificationResponse(
				"This is just random text with no classification.",
				validCategories,
			);
			expect(result.success).toBe(false);
		});

		it("returns error for invented category", () => {
			const result = parseClassificationResponse(
				'{"classification":"amazing","reasoning":"Wow"}',
				validCategories,
			);
			expect(result.success).toBe(false);
		});

		it("accepts 'category' field as alias", () => {
			const result = parseClassificationResponse(
				'{"category":"helpful","reasoning":"Good"}',
				validCategories,
			);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.classification).toBe("helpful");
			}
		});
	});
});
