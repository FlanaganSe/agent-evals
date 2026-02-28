import { describe, expect, it } from "vitest";
import type { JudgeCallFn, JudgeMessage, JudgeResponse } from "../../config/types.js";
import { createCachingJudge } from "./judge-cache.js";

function createMockJudge(response: JudgeResponse = { text: '{"reasoning":"ok","score":3}' }): {
	readonly judge: JudgeCallFn;
	readonly calls: Array<{ messages: readonly JudgeMessage[] }>;
} {
	const calls: Array<{ messages: readonly JudgeMessage[] }> = [];
	const judge: JudgeCallFn = async (messages) => {
		calls.push({ messages });
		return response;
	};
	return { judge, calls };
}

const sampleMessages: readonly JudgeMessage[] = [
	{ role: "system", content: "You are a judge." },
	{ role: "user", content: "Evaluate this." },
];

describe("createCachingJudge", () => {
	it("returns cached response for identical calls", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge);

		const result1 = await cached(sampleMessages, { temperature: 0 });
		const result2 = await cached(sampleMessages, { temperature: 0 });

		expect(result1).toBe(result2);
		expect(calls).toHaveLength(1);
	});

	it("caches when temperature is undefined (defaults to 0)", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge);

		await cached(sampleMessages);
		await cached(sampleMessages);

		expect(calls).toHaveLength(1);
	});

	it("does NOT cache when temperature > 0", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge);

		await cached(sampleMessages, { temperature: 0.5 });
		await cached(sampleMessages, { temperature: 0.5 });

		expect(calls).toHaveLength(2);
	});

	it("differentiates by message content", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge);

		await cached(sampleMessages);
		await cached([{ role: "user", content: "Different prompt" }]);

		expect(calls).toHaveLength(2);
	});

	it("differentiates by model", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge);

		await cached(sampleMessages, { model: "gpt-4" });
		await cached(sampleMessages, { model: "claude-3" });

		expect(calls).toHaveLength(2);
	});

	it("differentiates by maxTokens", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge);

		await cached(sampleMessages, { maxTokens: 1024 });
		await cached(sampleMessages, { maxTokens: 2048 });

		expect(calls).toHaveLength(2);
	});

	it("evicts oldest entry when at max capacity", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge, { maxEntries: 2 });

		// Fill cache with A, B
		await cached([{ role: "user", content: "A" }]);
		await cached([{ role: "user", content: "B" }]);
		expect(calls).toHaveLength(2);

		// Third entry C evicts A (oldest)
		await cached([{ role: "user", content: "C" }]);
		expect(calls).toHaveLength(3);

		// A should be evicted - calling it again triggers real call
		// This also evicts B (now oldest) since cache is [C, A_new]
		await cached([{ role: "user", content: "A" }]);
		expect(calls).toHaveLength(4);

		// C should still be cached
		await cached([{ role: "user", content: "C" }]);
		expect(calls).toHaveLength(4);
	});

	it("returns identical response object (not a copy)", async () => {
		const response: JudgeResponse = { text: "test", cost: 0.01 };
		const { judge } = createMockJudge(response);
		const cached = createCachingJudge(judge);

		const result = await cached(sampleMessages);
		expect(result).toBe(response);
	});

	it("handles explicit temperature: 0", async () => {
		const { judge, calls } = createMockJudge();
		const cached = createCachingJudge(judge);

		await cached(sampleMessages, { temperature: 0 });
		await cached(sampleMessages, { temperature: 0 });

		expect(calls).toHaveLength(1);
	});
});
