import { describe, expect, it } from "vitest";
import type { Trial } from "../config/types.js";
import { computeAllTrialStats, computeTrialStats, wilsonInterval } from "./statistics.js";

function makeTrial(overrides: Partial<Trial> & { caseId: string }): Trial {
	return {
		status: "pass",
		output: { latencyMs: 100 },
		grades: [],
		score: 1,
		durationMs: 100,
		...overrides,
	};
}

describe("wilsonInterval", () => {
	it("returns [0, 0] for 0/0", () => {
		const ci = wilsonInterval(0, 0);
		expect(ci.low).toBe(0);
		expect(ci.high).toBe(0);
	});

	it("computes interval for 5/5 passes", () => {
		const ci = wilsonInterval(5, 5);
		expect(ci.low).toBeGreaterThan(0.5);
		expect(ci.high).toBe(1);
	});

	it("computes interval for 0/5 passes", () => {
		const ci = wilsonInterval(0, 5);
		expect(ci.low).toBe(0);
		expect(ci.high).toBeLessThan(0.5);
	});

	it("computes interval for 3/5 passes", () => {
		const ci = wilsonInterval(3, 5);
		expect(ci.low).toBeGreaterThan(0);
		expect(ci.high).toBeLessThan(1);
		expect(ci.low).toBeLessThan(0.6);
		expect(ci.high).toBeGreaterThan(0.6);
	});

	it("never returns values outside [0, 1]", () => {
		for (let p = 0; p <= 10; p++) {
			const ci = wilsonInterval(p, 10);
			expect(ci.low).toBeGreaterThanOrEqual(0);
			expect(ci.high).toBeLessThanOrEqual(1);
		}
	});
});

describe("computeTrialStats", () => {
	it("computes correct counts for mixed results", () => {
		const trials: readonly Trial[] = [
			makeTrial({ caseId: "H01", status: "pass", score: 1 }),
			makeTrial({ caseId: "H01", status: "fail", score: 0.3 }),
			makeTrial({ caseId: "H01", status: "pass", score: 0.9 }),
			makeTrial({ caseId: "H01", status: "error", score: 0 }),
			makeTrial({ caseId: "H01", status: "pass", score: 1 }),
		];

		const stats = computeTrialStats(trials, "H01");
		expect(stats.trialCount).toBe(5);
		expect(stats.passCount).toBe(3);
		expect(stats.failCount).toBe(1);
		expect(stats.errorCount).toBe(1);
		expect(stats.passRate).toBeCloseTo(0.6);
	});

	it("computes mean score correctly", () => {
		const trials: readonly Trial[] = [
			makeTrial({ caseId: "H01", score: 1.0 }),
			makeTrial({ caseId: "H01", score: 0.5 }),
			makeTrial({ caseId: "H01", score: 0.8 }),
		];
		const stats = computeTrialStats(trials, "H01");
		expect(stats.meanScore).toBeCloseTo(0.7667, 3);
	});

	it("detects flaky cases", () => {
		const trials: readonly Trial[] = [
			makeTrial({ caseId: "H01", status: "pass" }),
			makeTrial({ caseId: "H01", status: "fail" }),
		];
		expect(computeTrialStats(trials, "H01").flaky).toBe(true);
	});

	it("non-flaky when all pass", () => {
		const trials: readonly Trial[] = [
			makeTrial({ caseId: "H01", status: "pass" }),
			makeTrial({ caseId: "H01", status: "pass" }),
		];
		expect(computeTrialStats(trials, "H01").flaky).toBe(false);
	});

	it("non-flaky when all fail", () => {
		const trials: readonly Trial[] = [
			makeTrial({ caseId: "H01", status: "fail", score: 0 }),
			makeTrial({ caseId: "H01", status: "fail", score: 0 }),
		];
		expect(computeTrialStats(trials, "H01").flaky).toBe(false);
	});

	it("filters by caseId", () => {
		const trials: readonly Trial[] = [
			makeTrial({ caseId: "H01", status: "pass" }),
			makeTrial({ caseId: "H02", status: "fail", score: 0 }),
			makeTrial({ caseId: "H01", status: "pass" }),
		];
		const stats = computeTrialStats(trials, "H01");
		expect(stats.trialCount).toBe(2);
		expect(stats.passCount).toBe(2);
	});

	it("returns zeros for empty trials", () => {
		const stats = computeTrialStats([], "H01");
		expect(stats.trialCount).toBe(0);
		expect(stats.passRate).toBe(0);
		expect(stats.flaky).toBe(false);
	});

	it("computes standard deviation with Bessel correction", () => {
		const trials: readonly Trial[] = [
			makeTrial({ caseId: "H01", score: 1.0 }),
			makeTrial({ caseId: "H01", score: 0.0 }),
		];
		const stats = computeTrialStats(trials, "H01");
		expect(stats.meanScore).toBeCloseTo(0.5);
		// Sample stddev (n-1): sqrt(((1-0.5)^2 + (0-0.5)^2) / 1) = sqrt(0.5) ≈ 0.7071
		expect(stats.scoreStdDev).toBeCloseTo(Math.SQRT1_2);
	});
});

describe("computeAllTrialStats", () => {
	it("returns undefined for single-trial runs", () => {
		const trials = [makeTrial({ caseId: "H01" })];
		expect(computeAllTrialStats(trials, 1)).toBeUndefined();
		expect(computeAllTrialStats(trials, undefined)).toBeUndefined();
	});

	it("returns undefined for empty trials", () => {
		expect(computeAllTrialStats([], 3)).toBeUndefined();
	});

	it("computes stats per case", () => {
		const trials = [
			makeTrial({ caseId: "H01", status: "pass" }),
			makeTrial({ caseId: "H01", status: "fail", score: 0 }),
			makeTrial({ caseId: "H02", status: "pass" }),
			makeTrial({ caseId: "H02", status: "pass" }),
		];
		const stats = computeAllTrialStats(trials, 2);
		expect(stats).toBeDefined();
		expect(stats?.H01?.trialCount).toBe(2);
		expect(stats?.H01?.flaky).toBe(true);
		expect(stats?.H02?.trialCount).toBe(2);
		expect(stats?.H02?.flaky).toBe(false);
	});
});
