import { describe, expect, it } from "vitest";
import type { GraderConfig, TargetOutput } from "../config/types.js";
import { runGraderPipeline } from "./pipeline.js";

const output: TargetOutput = { text: "hello world", latencyMs: 100 };
const pipelineCtx = { caseId: "H01", suiteId: "smoke", mode: "live" as const };

const passingConfig: GraderConfig = {
	grader: async () => ({
		pass: true,
		score: 1,
		reason: "ok",
		graderName: "pass",
	}),
};

const failingConfig: GraderConfig = {
	grader: async () => ({
		pass: false,
		score: 0,
		reason: "failed",
		graderName: "fail",
	}),
	required: true,
};

describe("runGraderPipeline", () => {
	it("runs all graders and collects results", async () => {
		const result = await runGraderPipeline(
			output,
			undefined,
			[passingConfig, passingConfig],
			pipelineCtx,
		);
		expect(result.grades).toHaveLength(2);
		expect(result.caseResult.pass).toBe(true);
	});

	it("uses provided graders", async () => {
		const result = await runGraderPipeline(output, undefined, [passingConfig], pipelineCtx);
		expect(result.grades).toHaveLength(1);
		expect(result.caseResult.pass).toBe(true);
	});

	it("handles mixed required + optional graders", async () => {
		const result = await runGraderPipeline(
			output,
			undefined,
			[passingConfig, failingConfig],
			pipelineCtx,
		);
		expect(result.caseResult.pass).toBe(false);
		expect(result.caseResult.failedGraders).toContain("fail");
	});

	it("passes with empty graders list", async () => {
		const result = await runGraderPipeline(output, undefined, [], pipelineCtx);
		expect(result.grades).toHaveLength(0);
		expect(result.caseResult.pass).toBe(true);
	});

	it("passes with undefined graders", async () => {
		const result = await runGraderPipeline(output, undefined, undefined, pipelineCtx);
		expect(result.grades).toHaveLength(0);
		expect(result.caseResult.pass).toBe(true);
	});

	it("catches grader throw and produces failing grade", async () => {
		const throwingConfig: GraderConfig = {
			grader: async () => {
				throw new Error("judge API unavailable");
			},
		};

		const result = await runGraderPipeline(
			output,
			undefined,
			[throwingConfig, passingConfig],
			pipelineCtx,
		);
		// Both graders still run — the throwing one produces a synthetic fail
		expect(result.grades).toHaveLength(2);
		expect(result.grades[0]?.pass).toBe(false);
		expect(result.grades[0]?.score).toBe(0);
		expect(result.grades[0]?.reason).toContain("Grader error:");
		expect(result.grades[0]?.reason).toContain("judge API unavailable");
		expect(result.grades[0]?.metadata).toEqual({ error: true });
		// Second grader still ran successfully
		expect(result.grades[1]?.pass).toBe(true);
	});

	it("catches non-Error throws in graders", async () => {
		const throwingConfig: GraderConfig = {
			grader: async () => {
				throw "string error";
			},
		};

		const result = await runGraderPipeline(output, undefined, [throwingConfig], pipelineCtx);
		expect(result.grades[0]?.reason).toContain("Grader error: string error");
	});
});
