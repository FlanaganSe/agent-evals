import { describe, expect, it } from "vitest";
import type { GraderContext, JudgeCallFn } from "../../config/types.js";
import { llmClassify } from "./llm-classify.js";

function createMockJudge(responseText: string): {
	readonly judge: JudgeCallFn;
	readonly calls: Array<{ messages: unknown }>;
} {
	const calls: Array<{ messages: unknown }> = [];
	const judge: JudgeCallFn = async (messages) => {
		calls.push({ messages });
		return { text: responseText, cost: 0.001 };
	};
	return { judge, calls };
}

const categories = {
	helpful: "Directly answers the question",
	partial: "Partially addresses the question",
	unhelpful: "Does not address the question",
};

const baseContext: GraderContext = {
	caseId: "C01",
	suiteId: "test",
	mode: "replay",
	graderName: "llm-classify",
};

describe("llmClassify", () => {
	it("passes when classification matches expected", async () => {
		const { judge } = createMockJudge(
			'{"classification":"helpful","reasoning":"Addresses the question","confidence":0.95}',
		);
		const grader = llmClassify({ categories, judge });
		const result = await grader(
			{ text: "The answer is Paris", latencyMs: 100 },
			{ metadata: { classification: "helpful" } },
			baseContext,
		);
		expect(result.pass).toBe(true);
		expect(result.score).toBe(1);
		expect(result.metadata?.classification).toBe("helpful");
	});

	it("fails when classification does not match expected", async () => {
		const { judge } = createMockJudge(
			'{"classification":"unhelpful","reasoning":"Off topic","confidence":0.9}',
		);
		const grader = llmClassify({ categories, judge });
		const result = await grader(
			{ text: "I like pizza", latencyMs: 100 },
			{ metadata: { classification: "helpful" } },
			baseContext,
		);
		expect(result.pass).toBe(false);
		expect(result.score).toBe(0);
		expect(result.reason).toContain("unhelpful");
		expect(result.reason).toContain("helpful");
	});

	it("passes when no expected classification (classification-only mode)", async () => {
		const { judge } = createMockJudge(
			'{"classification":"partial","reasoning":"Somewhat relevant"}',
		);
		const grader = llmClassify({ categories, judge });
		const result = await grader({ text: "Some text", latencyMs: 100 }, undefined, baseContext);
		expect(result.pass).toBe(true);
		expect(result.metadata?.classification).toBe("partial");
	});

	it("fails when no judge configured", async () => {
		const grader = llmClassify({ categories });
		const result = await grader({ text: "test", latencyMs: 100 }, undefined, baseContext);
		expect(result.pass).toBe(false);
		expect(result.reason).toContain("judge function");
	});

	it("throws at creation when fewer than 2 categories", () => {
		expect(() => llmClassify({ categories: { only: "One category" } })).toThrow(
			"at least 2 categories",
		);
	});

	it("tracks judge cost in metadata", async () => {
		const { judge } = createMockJudge('{"classification":"helpful","reasoning":"Good"}');
		const grader = llmClassify({ categories, judge });
		const result = await grader({ text: "test", latencyMs: 100 }, undefined, baseContext);
		expect(result.metadata?.judgeCost).toBe(0.001);
	});

	it("stores classification in metadata", async () => {
		const { judge } = createMockJudge('{"classification":"partial","reasoning":"Somewhat"}');
		const grader = llmClassify({ categories, judge });
		const result = await grader({ text: "test", latencyMs: 100 }, undefined, baseContext);
		expect(result.metadata?.classification).toBe("partial");
	});

	it("has requiresJudge tag", () => {
		const grader = llmClassify({ categories });
		expect((grader as unknown as Record<string, unknown>).requiresJudge).toBe(true);
	});

	it("returns parse error for invalid judge response", async () => {
		const { judge } = createMockJudge("This is not JSON at all and has no classification.");
		const grader = llmClassify({ categories, judge });
		const result = await grader({ text: "test", latencyMs: 100 }, undefined, baseContext);
		expect(result.pass).toBe(false);
		expect(result.reason).toContain("parse error");
	});

	it("uses judge from context when no override", async () => {
		const { judge, calls } = createMockJudge('{"classification":"helpful","reasoning":"Good"}');
		const grader = llmClassify({ categories });
		await grader({ text: "test", latencyMs: 100 }, undefined, { ...baseContext, judge });
		expect(calls).toHaveLength(1);
	});

	it("stores reasoning in metadata", async () => {
		const { judge } = createMockJudge(
			'{"classification":"helpful","reasoning":"Thorough analysis of the output"}',
		);
		const grader = llmClassify({ categories, judge });
		const result = await grader({ text: "test", latencyMs: 100 }, undefined, baseContext);
		expect(result.metadata?.reasoning).toBe("Thorough analysis of the output");
	});
});
