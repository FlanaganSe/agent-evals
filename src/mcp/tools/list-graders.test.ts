import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUILT_IN_GRADERS } from "../../graders/registry.js";
import { handleListGraders } from "./list-graders.js";
import { createTempConfig } from "./test-helpers.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempConfig();
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("handleListGraders", () => {
	it("returns all built-in graders", async () => {
		const result = await handleListGraders({ includePlugins: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.total).toBe(BUILT_IN_GRADERS.length);
		expect(data.graders[0].name).toBe("contains");
	});

	it("each grader has required fields", async () => {
		const result = await handleListGraders({ includePlugins: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		for (const g of data.graders) {
			expect(g.name).toBeTruthy();
			expect(g.description).toBeTruthy();
			expect(g.tier).toBeTruthy();
			expect(g.category).toBeTruthy();
			expect(g.example).toBeTruthy();
		}
	});

	it("filters by tier", async () => {
		const result = await handleListGraders({ tier: "llm", includePlugins: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.total).toBe(3);
		expect(data.graders.every((g: { tier: string }) => g.tier === "llm")).toBe(true);
		expect(data.filters.tier).toBe("llm");
	});

	it("filters by category", async () => {
		const result = await handleListGraders(
			{ category: "tool-call", includePlugins: false },
			tempDir,
		);
		const data = JSON.parse(result.content[0].text);

		expect(data.total).toBe(4); // toolCalled, toolNotCalled, toolSequence, toolArgsMatch
		expect(data.graders.every((g: { category: string }) => g.category === "tool-call")).toBe(true);
	});

	it("filters by tier and category combined", async () => {
		const result = await handleListGraders(
			{ tier: "deterministic", category: "metric", includePlugins: false },
			tempDir,
		);
		const data = JSON.parse(result.content[0].text);

		expect(data.total).toBe(3); // latency, cost, tokenCount
	});

	it("includes filter metadata in response", async () => {
		const result = await handleListGraders({ tier: "composition", includePlugins: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.filters.tier).toBe("composition");
		expect(data.filters.category).toBeNull();
		expect(data.filters.includePlugins).toBe(false);
	});

	it("falls back to built-in when config load fails", async () => {
		const result = await handleListGraders({ includePlugins: true }, "/nonexistent/path");
		const data = JSON.parse(result.content[0].text);

		// Should still return built-in graders, not error
		expect(data.total).toBe(BUILT_IN_GRADERS.length);
		expect(result.isError).toBeUndefined();
	});

	it("returns empty array when filters match nothing", async () => {
		const result = await handleListGraders(
			{ category: "nonexistent", includePlugins: false },
			tempDir,
		);
		const data = JSON.parse(result.content[0].text);

		expect(data.total).toBe(0);
		expect(data.graders).toEqual([]);
	});
});
