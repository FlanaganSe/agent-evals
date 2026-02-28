import { describe, expect, it } from "vitest";
import type { GraderConfig, GraderFn, ResolvedSuite } from "../config/types.js";
import { estimateCost } from "./cost-estimator.js";

const noopTarget = async () => ({ text: "ok", latencyMs: 0 });

const deterministicGrader: GraderFn = async (_output, _expected, context) => ({
	pass: true,
	score: 1,
	reason: "ok",
	graderName: context.graderName,
});

const llmGrader: GraderFn = Object.assign(
	async (_output: unknown, _expected: unknown, context: { readonly graderName: string }) => ({
		pass: true,
		score: 1,
		reason: "ok",
		graderName: context.graderName,
	}),
	{ requiresJudge: true as const },
) as unknown as GraderFn;

const makeSuite = (caseCount: number, graders: readonly GraderConfig[] = []): ResolvedSuite => ({
	name: "test",
	target: noopTarget,
	cases: Array.from({ length: caseCount }, (_, i) => ({
		id: `C${i}`,
		input: { prompt: "test" },
	})),
	defaultGraders: graders,
});

describe("estimateCost", () => {
	it("returns 0 calls for deterministic graders in replay mode", () => {
		const result = estimateCost(makeSuite(3, [{ grader: deterministicGrader }]), {
			mode: "replay",
		});
		expect(result.judgeCalls).toBe(0);
		expect(result.targetCalls).toBe(0);
		expect(result.summary).toContain("No LLM calls");
	});

	it("counts target calls in live mode", () => {
		const result = estimateCost(makeSuite(5), { mode: "live" });
		expect(result.targetCalls).toBe(5);
	});

	it("counts target calls × trials in live mode", () => {
		const result = estimateCost(makeSuite(3), { mode: "live", trials: 4 });
		expect(result.targetCalls).toBe(12);
	});

	it("counts judge calls for LLM graders", () => {
		const result = estimateCost(
			makeSuite(3, [{ grader: llmGrader }, { grader: deterministicGrader }]),
			{ mode: "replay" },
		);
		expect(result.judgeCalls).toBe(3); // 3 cases × 1 LLM grader
		expect(result.targetCalls).toBe(0); // replay mode
	});

	it("counts judge calls × trials", () => {
		const result = estimateCost(makeSuite(2, [{ grader: llmGrader }]), {
			mode: "replay",
			trials: 3,
		});
		expect(result.judgeCalls).toBe(6); // 2 cases × 3 trials × 1 LLM grader
	});

	it("counts multiple LLM graders", () => {
		const result = estimateCost(makeSuite(2, [{ grader: llmGrader }, { grader: llmGrader }]), {
			mode: "replay",
		});
		expect(result.judgeCalls).toBe(4); // 2 cases × 2 LLM graders
	});

	it("defaults trials to 1", () => {
		const result = estimateCost(makeSuite(5, [{ grader: llmGrader }]), { mode: "live" });
		expect(result.targetCalls).toBe(5);
		expect(result.judgeCalls).toBe(5);
	});

	it("produces readable summary", () => {
		const result = estimateCost(makeSuite(3, [{ grader: llmGrader }]), { mode: "live", trials: 2 });
		expect(result.summary).toContain("3 cases × 2 trial(s) = 6 executions");
		expect(result.summary).toContain("6 target LLM call(s)");
		expect(result.summary).toContain("6 judge LLM call(s)");
	});

	it("handles judge-only mode (0 target calls)", () => {
		const result = estimateCost(makeSuite(3, [{ grader: llmGrader }]), { mode: "judge-only" });
		expect(result.targetCalls).toBe(0);
		expect(result.judgeCalls).toBe(3);
	});
});
