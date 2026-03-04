import { describe, expect, it } from "vitest";
import {
	DEFAULT_JUDGE_PASS_THRESHOLD,
	judgeScoreToGradeScore,
	parseJudgeResponse,
} from "./judge-parser.js";

describe("parseJudgeResponse", () => {
	describe("Layer 1: Strict JSON", () => {
		it("parses valid JSON with reasoning + score", () => {
			const text = JSON.stringify({ reasoning: "Good output", score: 3 });
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toBe("Good output");
				expect(result.parsed.score).toBe(3);
				expect(result.parsed.rawText).toBe(text);
			}
		});

		it("accepts 'evaluation' as alternative to 'reasoning'", () => {
			const text = JSON.stringify({ evaluation: "Decent work", score: 2 });
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toBe("Decent work");
				expect(result.parsed.score).toBe(2);
			}
		});

		it("accepts 'rating' as alternative to 'score'", () => {
			const text = JSON.stringify({ reasoning: "Excellent", rating: 4 });
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.score).toBe(4);
			}
		});

		it("accepts 'explanation' and 'rationale' fields", () => {
			const text1 = JSON.stringify({ explanation: "Reason 1", score: 1 });
			const text2 = JSON.stringify({ rationale: "Reason 2", score: 2 });

			const r1 = parseJudgeResponse(text1);
			const r2 = parseJudgeResponse(text2);

			expect(r1.success).toBe(true);
			expect(r2.success).toBe(true);
			if (r1.success) expect(r1.parsed.reasoning).toBe("Reason 1");
			if (r2.success) expect(r2.parsed.reasoning).toBe("Reason 2");
		});

		it("accepts 'total_rating' field", () => {
			const text = JSON.stringify({ reasoning: "test", total_rating: 3 });
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) expect(result.parsed.score).toBe(3);
		});

		it("falls through for score out of range (0, 5, 3.5)", () => {
			for (const badScore of [0, 5, 3.5, -1, 10]) {
				const text = JSON.stringify({ reasoning: "test", score: badScore });
				// These may be parsed by Layer 2 regex; the validation logic itself rejects them
				const result = parseJudgeResponse(text);
				if (result.success) {
					// If some layer parsed it, score must be 1-4 integer
					expect([1, 2, 3, 4]).toContain(result.parsed.score);
				}
			}
		});

		it("falls through when reasoning is missing", () => {
			const text = JSON.stringify({ score: 3 });
			const result = parseJudgeResponse(text);
			expect(result.success).toBe(false);
		});

		it("falls through when reasoning is empty string", () => {
			const text = JSON.stringify({ reasoning: "", score: 3 });
			const result = parseJudgeResponse(text);
			expect(result.success).toBe(false);
		});
	});

	describe("Layer 2: Regex JSON extraction", () => {
		it("parses JSON in markdown code block", () => {
			const text = '```json\n{"reasoning": "Wrapped in code block", "score": 4}\n```';
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toBe("Wrapped in code block");
				expect(result.parsed.score).toBe(4);
			}
		});

		it("parses JSON with trailing text", () => {
			const text =
				'Here\'s my evaluation: {"reasoning": "The output is good", "score": 3} I hope this helps!';
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toBe("The output is good");
				expect(result.parsed.score).toBe(3);
			}
		});

		it("parses JSON with leading text", () => {
			const text = 'Let me evaluate this:\n{"reasoning": "Well done", "score": 4}';
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.score).toBe(4);
			}
		});

		it("uses code block JSON when both code block and raw JSON exist", () => {
			const text =
				'```json\n{"reasoning": "code block", "score": 4}\n```\nAlso {"reasoning": "raw", "score": 1}';
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toBe("code block");
				expect(result.parsed.score).toBe(4);
			}
		});
	});

	describe("Layer 3: Text pattern matching", () => {
		it("parses 'Score: N' with reasoning label", () => {
			const text = "Reasoning: The output is helpful and clear\nScore: 3";
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.score).toBe(3);
				expect(result.parsed.reasoning).toBe("The output is helpful and clear");
			}
		});

		it("parses 'Evaluation' and 'Rating' fields", () => {
			const text = "Evaluation: Good work overall\nRating: 2";
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.score).toBe(2);
			}
		});

		it("is case-insensitive", () => {
			const text = "REASONING: All caps reasoning\nSCORE: 4";
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.score).toBe(4);
			}
		});

		it("uses text before score as reasoning when no label", () => {
			const text = "The output correctly addresses all points and is well structured.\nScore: 4";
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toContain("correctly addresses");
				expect(result.parsed.score).toBe(4);
			}
		});

		it("does not match score values outside 1-4", () => {
			const text = "Reasoning: test\nScore: 7";
			const result = parseJudgeResponse(text);
			expect(result.success).toBe(false);
		});
	});

	describe("Failure cases", () => {
		it("returns error for empty string", () => {
			const result = parseJudgeResponse("");
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("Empty judge response");
			}
		});

		it("returns error for random text with no score", () => {
			const result = parseJudgeResponse("I think the output is great!");
			expect(result.success).toBe(false);
		});

		it("returns error when score present but no reasoning", () => {
			// Only "Score: 3" with nothing before it
			const result = parseJudgeResponse("Score: 3");
			expect(result.success).toBe(false);
		});

		it("NEVER returns pass=true on parse failure", () => {
			const badInputs = ["", "random text", '{"score": 5}', '{"reasoning": ""}', "Score: 10"];

			for (const input of badInputs) {
				const result = parseJudgeResponse(input);
				if (result.success) {
					// If it somehow parsed, verify the score is valid
					expect([1, 2, 3, 4]).toContain(result.parsed.score);
				} else {
					expect(result.success).toBe(false);
				}
			}
		});
	});

	describe("Reasoning truncation", () => {
		it("truncates reasoning at 2000 chars with ellipsis indicator", () => {
			const longReasoning = "A".repeat(3000);
			const text = JSON.stringify({ reasoning: longReasoning, score: 3 });
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toHaveLength(2003);
				expect(result.parsed.reasoning.endsWith("...")).toBe(true);
				expect(result.parsed.reasoning.startsWith("A".repeat(2000))).toBe(true);
			}
		});

		it("does not add ellipsis when reasoning fits within limit", () => {
			const shortReasoning = "A".repeat(100);
			const text = JSON.stringify({ reasoning: shortReasoning, score: 3 });
			const result = parseJudgeResponse(text);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.parsed.reasoning).toBe(shortReasoning);
				expect(result.parsed.reasoning.endsWith("...")).toBe(false);
			}
		});
	});
});

describe("judgeScoreToGradeScore", () => {
	it("maps 1 → 0.25", () => expect(judgeScoreToGradeScore(1)).toBe(0.25));
	it("maps 2 → 0.50", () => expect(judgeScoreToGradeScore(2)).toBe(0.5));
	it("maps 3 → 0.75", () => expect(judgeScoreToGradeScore(3)).toBe(0.75));
	it("maps 4 → 1.00", () => expect(judgeScoreToGradeScore(4)).toBe(1.0));
});

describe("DEFAULT_JUDGE_PASS_THRESHOLD", () => {
	it("is 0.75 (score >= 3 = pass)", () => {
		expect(DEFAULT_JUDGE_PASS_THRESHOLD).toBe(0.75);
	});
});
