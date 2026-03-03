import { describe, expect, it } from "vitest";
import {
	CaseCategorySchema,
	CaseExpectedSchema,
	CaseSchema,
	GateConfigSchema,
	GradeResultSchema,
	RunSchema,
	RunSummarySchema,
	SerializedGraderConfigSchema,
	TargetOutputSchema,
	TokenUsageSchema,
	ToolCallSchema,
	TrialSchema,
} from "./schema.js";

describe("TokenUsageSchema", () => {
	it("accepts valid token usage", () => {
		const result = TokenUsageSchema.safeParse({ input: 100, output: 200 });
		expect(result.success).toBe(true);
	});

	it("rejects negative values", () => {
		const result = TokenUsageSchema.safeParse({ input: -1, output: 200 });
		expect(result.success).toBe(false);
	});

	it("rejects non-integer values", () => {
		const result = TokenUsageSchema.safeParse({ input: 1.5, output: 200 });
		expect(result.success).toBe(false);
	});

	it("accepts partial token usage (input only)", () => {
		const result = TokenUsageSchema.safeParse({ input: 100 });
		expect(result.success).toBe(true);
	});

	it("accepts partial token usage (output only)", () => {
		const result = TokenUsageSchema.safeParse({ output: 200 });
		expect(result.success).toBe(true);
	});

	it("accepts empty token usage", () => {
		const result = TokenUsageSchema.safeParse({});
		expect(result.success).toBe(true);
	});
});

describe("ToolCallSchema", () => {
	it("accepts minimal tool call", () => {
		const result = ToolCallSchema.safeParse({ name: "search" });
		expect(result.success).toBe(true);
	});

	it("accepts tool call with args and result", () => {
		const result = ToolCallSchema.safeParse({
			name: "search",
			args: { query: "hello" },
			result: { found: true },
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing name", () => {
		const result = ToolCallSchema.safeParse({ args: {} });
		expect(result.success).toBe(false);
	});
});

describe("CaseCategorySchema", () => {
	it("accepts all valid categories", () => {
		for (const cat of ["happy_path", "edge_case", "adversarial", "multi_step", "regression"]) {
			expect(CaseCategorySchema.safeParse(cat).success).toBe(true);
		}
	});

	it("rejects invalid category", () => {
		expect(CaseCategorySchema.safeParse("unknown").success).toBe(false);
	});
});

describe("TargetOutputSchema", () => {
	it("accepts minimal output", () => {
		const result = TargetOutputSchema.safeParse({ latencyMs: 100 });
		expect(result.success).toBe(true);
	});

	it("accepts full output", () => {
		const result = TargetOutputSchema.safeParse({
			text: "Hello",
			toolCalls: [{ name: "search", args: { q: "test" } }],
			latencyMs: 150,
			tokenUsage: { input: 100, output: 200 },
			cost: 0.002,
			raw: { some: "data" },
		});
		expect(result.success).toBe(true);
	});

	it("accepts cost: 0 (free operation)", () => {
		const result = TargetOutputSchema.safeParse({ latencyMs: 0, cost: 0 });
		expect(result.success).toBe(true);
	});

	it("rejects negative latency", () => {
		const result = TargetOutputSchema.safeParse({ latencyMs: -1 });
		expect(result.success).toBe(false);
	});

	it("rejects unknown properties (strict)", () => {
		const result = TargetOutputSchema.safeParse({
			latencyMs: 100,
			unknownField: true,
		});
		expect(result.success).toBe(false);
	});

	it("round-trips through JSON serialization", () => {
		const original = {
			text: "Hello world",
			toolCalls: [{ name: "search" }],
			latencyMs: 150,
			tokenUsage: { input: 100, output: 200 },
			cost: 0.002,
		};
		const roundTripped = JSON.parse(JSON.stringify(original));
		const result = TargetOutputSchema.safeParse(roundTripped);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.text).toBe(original.text);
			expect(result.data.latencyMs).toBe(original.latencyMs);
		}
	});
});

describe("GradeResultSchema", () => {
	it("accepts valid grade result", () => {
		const result = GradeResultSchema.safeParse({
			pass: true,
			score: 1,
			reason: "All good",
			graderName: "contains(hello)",
		});
		expect(result.success).toBe(true);
	});

	it("accepts score boundaries (0 and 1)", () => {
		expect(
			GradeResultSchema.safeParse({
				pass: false,
				score: 0,
				reason: "Failed",
				graderName: "test",
			}).success,
		).toBe(true);
		expect(
			GradeResultSchema.safeParse({
				pass: true,
				score: 1,
				reason: "Passed",
				graderName: "test",
			}).success,
		).toBe(true);
	});

	it("rejects score out of range", () => {
		expect(
			GradeResultSchema.safeParse({
				pass: true,
				score: 1.5,
				reason: "test",
				graderName: "test",
			}).success,
		).toBe(false);
		expect(
			GradeResultSchema.safeParse({
				pass: false,
				score: -0.1,
				reason: "test",
				graderName: "test",
			}).success,
		).toBe(false);
	});

	it("accepts metadata", () => {
		const result = GradeResultSchema.safeParse({
			pass: true,
			score: 1,
			reason: "OK",
			graderName: "test",
			metadata: { hallucinated: [42] },
		});
		expect(result.success).toBe(true);
	});
});

describe("CaseExpectedSchema", () => {
	it("accepts empty expected", () => {
		expect(CaseExpectedSchema.safeParse({}).success).toBe(true);
	});

	it("accepts text and toolCalls", () => {
		const result = CaseExpectedSchema.safeParse({
			text: "expected output",
			toolCalls: [{ name: "search" }],
		});
		expect(result.success).toBe(true);
	});
});

describe("SerializedGraderConfigSchema", () => {
	it("applies defaults", () => {
		const result = SerializedGraderConfigSchema.safeParse({
			graderName: "contains",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.weight).toBe(1.0);
			expect(result.data.required).toBe(false);
			expect(result.data.threshold).toBe(0.5);
		}
	});
});

describe("GateConfigSchema", () => {
	it("accepts partial gates", () => {
		const result = GateConfigSchema.safeParse({ passRate: 0.95 });
		expect(result.success).toBe(true);
	});

	it("rejects out of range passRate", () => {
		expect(GateConfigSchema.safeParse({ passRate: 1.5 }).success).toBe(false);
	});
});

describe("CaseSchema", () => {
	it("accepts minimal case", () => {
		const result = CaseSchema.safeParse({
			id: "H01",
			input: { query: "hello" },
		});
		expect(result.success).toBe(true);
	});

	it("accepts full case", () => {
		const result = CaseSchema.safeParse({
			id: "H01",
			description: "Test case",
			input: { query: "hello" },
			expected: { text: "world" },
			category: "happy_path",
			tags: ["smoke"],
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing id", () => {
		const result = CaseSchema.safeParse({ input: {} });
		expect(result.success).toBe(false);
	});
});

describe("TrialSchema", () => {
	it("accepts valid trial", () => {
		const result = TrialSchema.safeParse({
			caseId: "H01",
			status: "pass",
			output: { latencyMs: 100 },
			grades: [
				{
					pass: true,
					score: 1,
					reason: "OK",
					graderName: "contains",
				},
			],
			score: 1,
			durationMs: 150,
		});
		expect(result.success).toBe(true);
	});

	it("accepts error status", () => {
		const result = TrialSchema.safeParse({
			caseId: "H01",
			status: "error",
			output: { text: "Target error: timeout", latencyMs: 30000 },
			grades: [],
			score: 0,
			durationMs: 30000,
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid status", () => {
		const result = TrialSchema.safeParse({
			caseId: "H01",
			status: "unknown",
			output: { latencyMs: 0 },
			grades: [],
			score: 0,
			durationMs: 0,
		});
		expect(result.success).toBe(false);
	});
});

describe("RunSummarySchema", () => {
	it("accepts valid summary", () => {
		const result = RunSummarySchema.safeParse({
			totalCases: 10,
			passed: 8,
			failed: 1,
			errors: 1,
			passRate: 0.8,
			totalCost: 0.05,
			totalDurationMs: 5000,
			p95LatencyMs: 500,
			gateResult: { pass: true, results: [] },
		});
		expect(result.success).toBe(true);
	});
});

describe("RunSchema", () => {
	const validRun = {
		schemaVersion: "1.0.0",
		id: "test-run-id",
		suiteId: "smoke",
		mode: "live" as const,
		trials: [
			{
				caseId: "H01",
				status: "pass" as const,
				output: { latencyMs: 100 },
				grades: [
					{
						pass: true,
						score: 1,
						reason: "OK",
						graderName: "contains",
					},
				],
				score: 1,
				durationMs: 150,
			},
		],
		summary: {
			totalCases: 1,
			passed: 1,
			failed: 0,
			errors: 0,
			passRate: 1,
			totalCost: 0,
			totalDurationMs: 150,
			p95LatencyMs: 100,
			gateResult: { pass: true, results: [] },
		},
		timestamp: "2026-02-28T12:00:00.000Z",
		configHash: "abc123",
		frameworkVersion: "0.0.1",
	};

	it("accepts valid run", () => {
		const result = RunSchema.safeParse(validRun);
		expect(result.success).toBe(true);
	});

	it("round-trips through JSON", () => {
		const roundTripped = JSON.parse(JSON.stringify(validRun));
		const result = RunSchema.safeParse(roundTripped);
		expect(result.success).toBe(true);
	});

	it("has schemaVersion", () => {
		const result = RunSchema.safeParse(validRun);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.schemaVersion).toBe("1.0.0");
		}
	});

	it("accepts all valid modes", () => {
		for (const mode of ["live", "replay", "judge-only"]) {
			const result = RunSchema.safeParse({ ...validRun, mode });
			expect(result.success).toBe(true);
		}
	});

	it("rejects invalid mode", () => {
		const result = RunSchema.safeParse({ ...validRun, mode: "invalid" });
		expect(result.success).toBe(false);
	});

	it("handles unicode in text fields", () => {
		const runWithUnicode = {
			...validRun,
			trials: [
				{
					...validRun.trials[0],
					output: { text: "日本語テスト 🎉", latencyMs: 100 },
				},
			],
		};
		const result = RunSchema.safeParse(runWithUnicode);
		expect(result.success).toBe(true);
	});
});
