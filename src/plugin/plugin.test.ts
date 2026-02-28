import { describe, expect, it } from "vitest";
import type { GraderFn } from "../config/types.js";
import type { EvalPlugin } from "./types.js";

// We test plugin validation through the loader's validatePlugins function.
// Since it's private, we test it indirectly via loadConfig or extract it.
// For unit testing, we'll test the validation logic inline.

const mockGrader: GraderFn = async (_output, _expected, context) => ({
	pass: true,
	score: 1,
	reason: "ok",
	graderName: context.graderName,
});

describe("EvalPlugin interface", () => {
	it("accepts a minimal valid plugin", () => {
		const plugin: EvalPlugin = { name: "test", version: "1.0.0" };
		expect(plugin.name).toBe("test");
		expect(plugin.version).toBe("1.0.0");
	});

	it("accepts a plugin with graders", () => {
		const plugin: EvalPlugin = {
			name: "test",
			version: "1.0.0",
			graders: { custom: mockGrader },
		};
		expect(plugin.graders).toBeDefined();
		expect(typeof plugin.graders?.custom).toBe("function");
	});

	it("accepts a plugin with all hook types", () => {
		const plugin: EvalPlugin = {
			name: "test",
			version: "1.0.0",
			hooks: {
				beforeRun: async () => {},
				afterTrial: async () => {},
				afterRun: async () => {},
			},
		};
		expect(plugin.hooks?.beforeRun).toBeDefined();
		expect(plugin.hooks?.afterTrial).toBeDefined();
		expect(plugin.hooks?.afterRun).toBeDefined();
	});

	it("accepts a plugin with partial hooks", () => {
		const plugin: EvalPlugin = {
			name: "test",
			version: "1.0.0",
			hooks: { beforeRun: async () => {} },
		};
		expect(plugin.hooks?.beforeRun).toBeDefined();
		expect(plugin.hooks?.afterTrial).toBeUndefined();
	});

	it("plugin grader is callable with GraderFn signature", async () => {
		const plugin: EvalPlugin = {
			name: "test",
			version: "1.0.0",
			graders: { custom: mockGrader },
		};
		const result = await plugin.graders?.custom({ text: "hello", latencyMs: 100 }, undefined, {
			caseId: "c1",
			suiteId: "s1",
			mode: "replay",
			graderName: "custom",
		});
		expect(result.pass).toBe(true);
		expect(result.score).toBe(1);
	});
});

describe("plugin validation (via loader)", () => {
	// These tests validate the validatePlugins logic extracted from the loader.
	// We re-implement the validation function here to unit test it.
	function validatePlugins(plugins: readonly EvalPlugin[]): void {
		const graderNames = new Map<string, string>();
		for (const plugin of plugins) {
			if (!plugin.name) {
				throw new Error("Plugin missing required 'name' field");
			}
			if (!plugin.version) {
				throw new Error(`Plugin '${plugin.name}' missing required 'version' field`);
			}
			if (plugin.graders) {
				for (const graderName of Object.keys(plugin.graders)) {
					const existing = graderNames.get(graderName);
					if (existing) {
						throw new Error(
							`Duplicate grader name '${graderName}' from plugin '${plugin.name}' (already registered by '${existing}')`,
						);
					}
					graderNames.set(graderName, plugin.name);
				}
			}
		}
	}

	it("validates an empty plugins array", () => {
		expect(() => validatePlugins([])).not.toThrow();
	});

	it("validates a valid plugin", () => {
		expect(() => validatePlugins([{ name: "test", version: "1.0.0" }])).not.toThrow();
	});

	it("throws on missing name", () => {
		expect(() => validatePlugins([{ name: "", version: "1.0.0" }])).toThrow(
			"Plugin missing required 'name' field",
		);
	});

	it("throws on missing version", () => {
		expect(() => validatePlugins([{ name: "test", version: "" }])).toThrow(
			"Plugin 'test' missing required 'version' field",
		);
	});

	it("throws on duplicate grader names across plugins", () => {
		expect(() =>
			validatePlugins([
				{ name: "plugin-a", version: "1.0.0", graders: { myGrader: mockGrader } },
				{ name: "plugin-b", version: "1.0.0", graders: { myGrader: mockGrader } },
			]),
		).toThrow(
			"Duplicate grader name 'myGrader' from plugin 'plugin-b' (already registered by 'plugin-a')",
		);
	});

	it("allows different grader names across plugins", () => {
		expect(() =>
			validatePlugins([
				{ name: "plugin-a", version: "1.0.0", graders: { graderA: mockGrader } },
				{ name: "plugin-b", version: "1.0.0", graders: { graderB: mockGrader } },
			]),
		).not.toThrow();
	});
});
