import { describe, expect, it } from "vitest";
import type { EvalPlugin } from "../plugin/types.js";
import { allGraders, BUILT_IN_GRADERS } from "./registry.js";

describe("Grader Registry", () => {
	it("registers all 20 built-in graders", () => {
		expect(BUILT_IN_GRADERS).toHaveLength(20);
	});

	it("has no duplicate names", () => {
		const names = BUILT_IN_GRADERS.map((g) => g.name);
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	it("every descriptor has required fields", () => {
		for (const g of BUILT_IN_GRADERS) {
			expect(g.name).toBeTruthy();
			expect(g.description).toBeTruthy();
			expect(g.tier).toBeTruthy();
			expect(g.category).toBeTruthy();
			expect(g.parameters).toBeDefined();
			expect(g.example).toBeTruthy();
		}
	});

	it("every tier is a valid value", () => {
		const validTiers = new Set(["deterministic", "llm", "composition"]);
		for (const g of BUILT_IN_GRADERS) {
			expect(validTiers.has(g.tier)).toBe(true);
		}
	});

	it("every category is a valid value", () => {
		const validCategories = new Set([
			"text",
			"tool-call",
			"metric",
			"safety",
			"llm-judge",
			"composition",
		]);
		for (const g of BUILT_IN_GRADERS) {
			expect(validCategories.has(g.category)).toBe(true);
		}
	});

	it("allGraders with no plugins returns exactly BUILT_IN_GRADERS", () => {
		expect(allGraders()).toBe(BUILT_IN_GRADERS);
		expect(allGraders([])).toBe(BUILT_IN_GRADERS);
	});

	it("allGraders merges plugin graders with namespace prefix", () => {
		const plugin: EvalPlugin = {
			name: "my-plugin",
			version: "1.0.0",
			graders: {
				customCheck: async () => ({ pass: true, score: 1, reason: "ok", graderName: "custom" }),
			},
		};

		const result = allGraders([plugin]);
		expect(result.length).toBe(BUILT_IN_GRADERS.length + 1);

		const pluginGrader = result.find((g) => g.name === "my-plugin/customCheck");
		expect(pluginGrader).toBeDefined();
		expect(pluginGrader?.tier).toBe("deterministic");
		expect(pluginGrader?.notes).toContain("Plugin grader");
	});

	it("allGraders skips plugins with no graders", () => {
		const plugin: EvalPlugin = { name: "hooks-only", version: "1.0.0" };
		const result = allGraders([plugin]);
		expect(result.length).toBe(BUILT_IN_GRADERS.length);
	});

	it("has correct tier counts", () => {
		const deterministic = BUILT_IN_GRADERS.filter((g) => g.tier === "deterministic");
		const llm = BUILT_IN_GRADERS.filter((g) => g.tier === "llm");
		const composition = BUILT_IN_GRADERS.filter((g) => g.tier === "composition");

		expect(deterministic.length).toBe(14);
		expect(llm.length).toBe(3);
		expect(composition.length).toBe(3);
	});

	it("every parameter has required fields", () => {
		for (const g of BUILT_IN_GRADERS) {
			for (const p of g.parameters) {
				expect(p.name).toBeTruthy();
				expect(p.type).toBeTruthy();
				expect(p.description).toBeTruthy();
				expect(typeof p.required).toBe("boolean");
			}
		}
	});
});
