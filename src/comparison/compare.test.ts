import { describe, expect, it } from "vitest";
import type { GradeResult, Run, Trial } from "../config/types.js";
import { compareRuns } from "./compare.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTrial(
	caseId: string,
	status: "pass" | "fail" | "error",
	score: number,
	grades?: readonly GradeResult[],
): Trial {
	return {
		caseId,
		status,
		output: { text: "output", latencyMs: 100, cost: 0.01 },
		grades: grades ?? [],
		score,
		durationMs: 100,
	};
}

function makeRun(id: string, trials: readonly Trial[], overrides?: Partial<Run>): Run {
	const passed = trials.filter((t) => t.status === "pass").length;
	const failed = trials.filter((t) => t.status === "fail").length;
	const errors = trials.filter((t) => t.status === "error").length;
	return {
		schemaVersion: "1.0.0",
		id,
		suiteId: "test-suite",
		mode: "live",
		trials,
		summary: {
			totalCases: trials.length,
			passed,
			failed,
			errors,
			passRate: trials.length > 0 ? passed / trials.length : 0,
			totalCost: trials.reduce((sum, t) => sum + (t.output.cost ?? 0), 0),
			totalDurationMs: 500,
			p95LatencyMs: 100,
			gateResult: { pass: true, results: [] },
			...overrides?.summary,
		},
		timestamp: new Date().toISOString(),
		configHash: "abc123",
		frameworkVersion: "0.0.1",
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("compareRuns", () => {
	describe("core comparison logic", () => {
		it("two identical runs → all unchanged, 0 regressions", () => {
			const trials = [makeTrial("C01", "pass", 1), makeTrial("C02", "pass", 0.75)];
			const base = makeRun("base-id", trials);
			const compare = makeRun("compare-id", trials);

			const result = compareRuns(base, compare);

			expect(result.summary.regressions).toBe(0);
			expect(result.summary.improvements).toBe(0);
			expect(result.summary.unchanged).toBe(2);
			expect(result.cases.every((c) => c.direction === "unchanged")).toBe(true);
		});

		it("pass → fail = regression", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 1)]);
			const compare = makeRun("compare", [makeTrial("C01", "fail", 0)]);

			const result = compareRuns(base, compare);

			expect(result.summary.regressions).toBe(1);
			expect(result.cases[0]?.direction).toBe("regression");
		});

		it("fail → pass = improvement", () => {
			const base = makeRun("base", [makeTrial("C01", "fail", 0)]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 1)]);

			const result = compareRuns(base, compare);

			expect(result.summary.improvements).toBe(1);
			expect(result.cases[0]?.direction).toBe("improvement");
		});

		it("score drop above threshold = regression", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 0.9)]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 0.75)]);

			const result = compareRuns(base, compare);

			expect(result.summary.regressions).toBe(1);
			expect(result.cases[0]?.scoreDelta).toBeCloseTo(-0.15);
		});

		it("score drop below threshold = unchanged", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 0.9)]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 0.87)]);

			const result = compareRuns(base, compare);

			expect(result.summary.unchanged).toBe(1);
		});

		it("case only in compare = added", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 1)]);
			const compare = makeRun("compare", [
				makeTrial("C01", "pass", 1),
				makeTrial("C02", "pass", 1),
			]);

			const result = compareRuns(base, compare);

			expect(result.summary.added).toBe(1);
			const addedCase = result.cases.find((c) => c.caseId === "C02");
			expect(addedCase?.direction).toBe("added");
			expect(addedCase?.baseStatus).toBeUndefined();
		});

		it("case only in base = removed", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 1), makeTrial("C02", "pass", 1)]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 1)]);

			const result = compareRuns(base, compare);

			expect(result.summary.removed).toBe(1);
		});

		it("custom threshold (0.01) detects smaller changes", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 0.9)]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 0.87)]);

			const result = compareRuns(base, compare, { scoreThreshold: 0.01 });

			expect(result.summary.regressions).toBe(1);
		});
	});

	describe("grader-level comparison", () => {
		it("grader pass → fail = regression", () => {
			const baseGrades: GradeResult[] = [{ pass: true, score: 1, reason: "ok", graderName: "g1" }];
			const compareGrades: GradeResult[] = [
				{ pass: false, score: 0, reason: "failed", graderName: "g1" },
			];

			const base = makeRun("base", [makeTrial("C01", "pass", 1, baseGrades)]);
			const compare = makeRun("compare", [makeTrial("C01", "fail", 0, compareGrades)]);

			const result = compareRuns(base, compare);
			const graderChange = result.cases[0]?.graderChanges[0];

			expect(graderChange?.direction).toBe("regression");
			expect(graderChange?.basePass).toBe(true);
			expect(graderChange?.comparePass).toBe(false);
		});

		it("grader added in compare", () => {
			const baseGrades: GradeResult[] = [{ pass: true, score: 1, reason: "ok", graderName: "g1" }];
			const compareGrades: GradeResult[] = [
				{ pass: true, score: 1, reason: "ok", graderName: "g1" },
				{ pass: true, score: 1, reason: "ok", graderName: "g2" },
			];

			const base = makeRun("base", [makeTrial("C01", "pass", 1, baseGrades)]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 1, compareGrades)]);

			const result = compareRuns(base, compare);
			const addedGrader = result.cases[0]?.graderChanges.find((g) => g.graderName === "g2");

			expect(addedGrader?.direction).toBe("added");
		});

		it("grader removed in compare", () => {
			const baseGrades: GradeResult[] = [
				{ pass: true, score: 1, reason: "ok", graderName: "g1" },
				{ pass: true, score: 1, reason: "ok", graderName: "g2" },
			];
			const compareGrades: GradeResult[] = [
				{ pass: true, score: 1, reason: "ok", graderName: "g1" },
			];

			const base = makeRun("base", [makeTrial("C01", "pass", 1, baseGrades)]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 1, compareGrades)]);

			const result = compareRuns(base, compare);
			const removedGrader = result.cases[0]?.graderChanges.find((g) => g.graderName === "g2");

			expect(removedGrader?.direction).toBe("removed");
		});
	});

	describe("summary", () => {
		it("cost delta computed correctly", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 1)], {
				summary: {
					totalCases: 1,
					passed: 1,
					failed: 0,
					errors: 0,
					passRate: 1,
					totalCost: 0.05,
					totalDurationMs: 500,
					p95LatencyMs: 100,
					gateResult: { pass: true, results: [] },
				},
			});
			const compare = makeRun("compare", [makeTrial("C01", "pass", 1)], {
				summary: {
					totalCases: 1,
					passed: 1,
					failed: 0,
					errors: 0,
					passRate: 1,
					totalCost: 0.08,
					totalDurationMs: 600,
					p95LatencyMs: 100,
					gateResult: { pass: true, results: [] },
				},
			});

			const result = compareRuns(base, compare);

			expect(result.summary.costDelta).toBeCloseTo(0.03);
			expect(result.summary.durationDelta).toBe(100);
		});

		it("gate change detected", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 1)], {
				summary: {
					totalCases: 1,
					passed: 1,
					failed: 0,
					errors: 0,
					passRate: 1,
					totalCost: 0,
					totalDurationMs: 100,
					p95LatencyMs: 100,
					gateResult: { pass: true, results: [] },
				},
			});
			const compare = makeRun("compare", [makeTrial("C01", "fail", 0)], {
				summary: {
					totalCases: 1,
					passed: 0,
					failed: 1,
					errors: 0,
					passRate: 0,
					totalCost: 0,
					totalDurationMs: 100,
					p95LatencyMs: 100,
					gateResult: {
						pass: false,
						results: [{ gate: "passRate", pass: false, reason: "failed" }],
					},
				},
			});

			const result = compareRuns(base, compare);

			expect(result.summary.baseGatePass).toBe(true);
			expect(result.summary.compareGatePass).toBe(false);
		});

		it("category comparisons computed", () => {
			const base = makeRun("base", [makeTrial("C01", "pass", 1)], {
				summary: {
					totalCases: 1,
					passed: 1,
					failed: 0,
					errors: 0,
					passRate: 1,
					totalCost: 0,
					totalDurationMs: 100,
					p95LatencyMs: 100,
					gateResult: { pass: true, results: [] },
					byCategory: { happy_path: { total: 1, passed: 1, failed: 0, errors: 0, passRate: 1 } },
				},
			});
			const compare = makeRun("compare", [makeTrial("C01", "fail", 0)], {
				summary: {
					totalCases: 1,
					passed: 0,
					failed: 1,
					errors: 0,
					passRate: 0,
					totalCost: 0,
					totalDurationMs: 100,
					p95LatencyMs: 100,
					gateResult: { pass: false, results: [] },
					byCategory: { happy_path: { total: 1, passed: 0, failed: 1, errors: 0, passRate: 0 } },
				},
			});

			const result = compareRuns(base, compare);

			expect(result.summary.byCategory).toHaveLength(1);
			expect(result.summary.byCategory[0]?.category).toBe("happy_path");
			expect(result.summary.byCategory[0]?.direction).toBe("regression");
		});
	});

	describe("edge cases", () => {
		it("empty runs → 0 cases, no crash", () => {
			const base = makeRun("base", []);
			const compare = makeRun("compare", []);

			const result = compareRuns(base, compare);

			expect(result.summary.totalCases).toBe(0);
			expect(result.cases).toHaveLength(0);
		});

		it("multi-trial runs without trialStats → uses first trial per case", () => {
			const base = makeRun("base", [
				makeTrial("C01", "pass", 1),
				{ ...makeTrial("C01", "fail", 0), trialIndex: 1 },
			]);
			const compare = makeRun("compare", [makeTrial("C01", "pass", 1)]);

			const result = compareRuns(base, compare);

			expect(result.cases).toHaveLength(1);
			// Without trialStats, uses first trial (pass)
			expect(result.cases[0]?.baseStatus).toBe("pass");
		});

		it("multi-trial runs with trialStats → uses pass^k aggregate", () => {
			// Base: case C01 is flaky (trial 0 passes, trial 1 fails) → aggregate = fail
			const base = makeRun(
				"base",
				[makeTrial("C01", "pass", 1), { ...makeTrial("C01", "fail", 0), trialIndex: 1 }],
				{
					summary: {
						totalCases: 1,
						passed: 0,
						failed: 1,
						errors: 0,
						passRate: 0,
						totalCost: 0.02,
						totalDurationMs: 200,
						p95LatencyMs: 100,
						gateResult: { pass: false, results: [] },
						trialStats: {
							C01: {
								trialCount: 2,
								passCount: 1,
								failCount: 1,
								errorCount: 0,
								passRate: 0.5,
								meanScore: 0.5,
								scoreStdDev: 0.5,
								ci95Low: 0.1,
								ci95High: 0.9,
								flaky: true,
							},
						},
					},
				},
			);
			// Compare: case C01 passes all trials → aggregate = pass
			const compare = makeRun(
				"compare",
				[makeTrial("C01", "pass", 1), { ...makeTrial("C01", "pass", 0.9), trialIndex: 1 }],
				{
					summary: {
						totalCases: 1,
						passed: 1,
						failed: 0,
						errors: 0,
						passRate: 1,
						totalCost: 0.02,
						totalDurationMs: 200,
						p95LatencyMs: 100,
						gateResult: { pass: true, results: [] },
						trialStats: {
							C01: {
								trialCount: 2,
								passCount: 2,
								failCount: 0,
								errorCount: 0,
								passRate: 1,
								meanScore: 0.95,
								scoreStdDev: 0.05,
								ci95Low: 0.8,
								ci95High: 1.0,
								flaky: false,
							},
						},
					},
				},
			);

			const result = compareRuns(base, compare);

			expect(result.cases).toHaveLength(1);
			// With trialStats, base uses aggregate: fail (flaky, not all pass)
			expect(result.cases[0]?.baseStatus).toBe("fail");
			// Compare uses aggregate: pass (all pass)
			expect(result.cases[0]?.compareStatus).toBe("pass");
			expect(result.cases[0]?.direction).toBe("improvement");
			// Scores use meanScore from trialStats
			expect(result.cases[0]?.baseScore).toBeCloseTo(0.5);
			expect(result.cases[0]?.compareScore).toBeCloseTo(0.95);
		});

		it("regressions sorted before improvements", () => {
			const base = makeRun("base", [makeTrial("A01", "fail", 0), makeTrial("B01", "pass", 1)]);
			const compare = makeRun("compare", [
				makeTrial("A01", "pass", 1),
				makeTrial("B01", "fail", 0),
			]);

			const result = compareRuns(base, compare);

			expect(result.cases[0]?.direction).toBe("regression");
			expect(result.cases[1]?.direction).toBe("improvement");
		});
	});
});
