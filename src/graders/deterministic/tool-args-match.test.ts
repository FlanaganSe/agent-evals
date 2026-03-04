import { describe, expect, it } from "vitest";
import type { GraderContext, TargetOutput } from "../../config/types.js";
import { toolArgsMatch } from "./tool-args-match.js";

const ctx: GraderContext = { caseId: "t", suiteId: "s", mode: "live", graderName: "" };

const output: TargetOutput = {
	toolCalls: [
		{
			name: "search",
			args: { query: "weather in Seattle", limit: 10, nested: { a: 1 } },
		},
	],
	latencyMs: 0,
};

describe("toolArgsMatch — exact", () => {
	it("passes with exact match", async () => {
		const result = await toolArgsMatch(
			"search",
			{ query: "weather in Seattle", limit: 10, nested: { a: 1 } },
			"exact",
		)(output, undefined, ctx);
		expect(result.pass).toBe(true);
	});

	it("fails with extra key in actual", async () => {
		const result = await toolArgsMatch("search", { query: "weather in Seattle" }, "exact")(
			output,
			undefined,
			ctx,
		);
		expect(result.pass).toBe(false);
	});
});

describe("toolArgsMatch — subset", () => {
	it("passes when expected keys are subset", async () => {
		const result = await toolArgsMatch("search", { query: "weather in Seattle" }, "subset")(
			output,
			undefined,
			ctx,
		);
		expect(result.pass).toBe(true);
	});

	it("fails when expected key missing from actual", async () => {
		const result = await toolArgsMatch("search", { nonexistent: "value" }, "subset")(
			output,
			undefined,
			ctx,
		);
		expect(result.pass).toBe(false);
	});
});

describe("toolArgsMatch — contains", () => {
	it("passes when string values are substrings", async () => {
		const result = await toolArgsMatch("search", { query: "weather" }, "contains")(
			output,
			undefined,
			ctx,
		);
		expect(result.pass).toBe(true);
	});

	it("fails when string value is not a substring", async () => {
		const result = await toolArgsMatch("search", { query: "nonexistent" }, "contains")(
			output,
			undefined,
			ctx,
		);
		expect(result.pass).toBe(false);
	});

	it("uses deep equality for non-string values in contains mode", async () => {
		const result = await toolArgsMatch("search", { limit: 10 }, "contains")(output, undefined, ctx);
		expect(result.pass).toBe(true);
	});
});

describe("toolArgsMatch — edge cases", () => {
	it("fails when tool not found", async () => {
		const result = await toolArgsMatch("missing", {}, "subset")(output, undefined, ctx);
		expect(result.pass).toBe(false);
	});

	it("fails with no tool calls", async () => {
		const emptyOutput: TargetOutput = { latencyMs: 0 };
		const result = await toolArgsMatch("search", {}, "subset")(emptyOutput, undefined, ctx);
		expect(result.pass).toBe(false);
	});

	it("handles tool call with no args", async () => {
		const noArgsOutput: TargetOutput = {
			toolCalls: [{ name: "ping" }],
			latencyMs: 0,
		};
		const result = await toolArgsMatch("ping", {}, "exact")(noArgsOutput, undefined, ctx);
		expect(result.pass).toBe(true);
	});

	it("handles circular references without stack overflow", async () => {
		const actual: Record<string, unknown> = { name: "test" };
		actual.self = actual;
		const expected: Record<string, unknown> = { name: "test" };
		expected.self = expected;
		const circularOutput: TargetOutput = {
			toolCalls: [{ name: "search", args: actual }],
			latencyMs: 0,
		};
		// Should not throw — circular reference protection returns false for cycles
		const result = await toolArgsMatch("search", expected, "exact")(circularOutput, undefined, ctx);
		expect(result.pass).toBe(false);
	});

	it("default mode is subset", async () => {
		const result = await toolArgsMatch("search", { query: "weather in Seattle" })(
			output,
			undefined,
			ctx,
		);
		expect(result.pass).toBe(true);
	});
});
