import { describe, expect, it } from "vitest";
import { buildClassificationPrompt } from "./classify-prompt.js";

const categories = {
	helpful: "Directly answers the question",
	partial: "Partially addresses the question",
	unhelpful: "Does not address the question",
};

describe("buildClassificationPrompt", () => {
	it("system prompt contains all categories", () => {
		const messages = buildClassificationPrompt({
			output: { text: "test output", latencyMs: 100 },
			categories,
		});
		const system = messages.find((m) => m.role === "system");
		expect(system?.content).toContain('"helpful"');
		expect(system?.content).toContain('"partial"');
		expect(system?.content).toContain('"unhelpful"');
		expect(system?.content).toContain("Directly answers the question");
	});

	it("output is wrapped in <output> tags", () => {
		const messages = buildClassificationPrompt({
			output: { text: "my agent output", latencyMs: 100 },
			categories,
		});
		const user = messages.find((m) => m.role === "user");
		expect(user?.content).toContain("<output>");
		expect(user?.content).toContain("my agent output");
		expect(user?.content).toContain("</output>");
	});

	it("includes additional criteria when provided", () => {
		const messages = buildClassificationPrompt({
			output: { text: "test", latencyMs: 100 },
			categories,
			criteria: "Focus on factual accuracy",
		});
		const system = messages.find((m) => m.role === "system");
		expect(system?.content).toContain("Focus on factual accuracy");
		expect(system?.content).toContain("Additional Criteria");
	});

	it("does not include criteria section when not provided", () => {
		const messages = buildClassificationPrompt({
			output: { text: "test", latencyMs: 100 },
			categories,
		});
		const system = messages.find((m) => m.role === "system");
		expect(system?.content).not.toContain("Additional Criteria");
	});

	it("includes anti-verbosity instruction", () => {
		const messages = buildClassificationPrompt({
			output: { text: "test", latencyMs: 100 },
			categories,
		});
		const system = messages.find((m) => m.role === "system");
		expect(system.content).toContain("Do not prefer longer outputs");
	});

	it("falls back to toolCalls when no text", () => {
		const messages = buildClassificationPrompt({
			output: {
				latencyMs: 100,
				toolCalls: [{ name: "search", args: { query: "test" } }],
			},
			categories,
		});
		const user = messages.find((m) => m.role === "user");
		expect(user?.content).toContain("search");
	});

	it("returns exactly 2 messages (system + user)", () => {
		const messages = buildClassificationPrompt({
			output: { text: "test", latencyMs: 100 },
			categories,
		});
		expect(messages).toHaveLength(2);
		expect(messages[0]?.role).toBe("system");
		expect(messages[1]?.role).toBe("user");
	});
});
