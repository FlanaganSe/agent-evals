import { describe, expect, it } from "vitest";
import type { ResolvedSuite } from "../config/types.js";
import { computeFixtureConfigHash } from "./config-hash.js";

const baseSuite: ResolvedSuite = {
	name: "test-suite",
	target: async () => ({ text: "mock", latencyMs: 0 }),
	cases: [{ id: "H01", input: { query: "hello" } }],
};

describe("computeFixtureConfigHash", () => {
	it("returns a 16-char hex string", () => {
		const hash = computeFixtureConfigHash(baseSuite);
		expect(hash).toMatch(/^[a-f0-9]{16}$/);
	});

	it("is deterministic for same input", () => {
		const a = computeFixtureConfigHash(baseSuite);
		const b = computeFixtureConfigHash(baseSuite);
		expect(a).toBe(b);
	});

	it("changes when suite name changes", () => {
		const a = computeFixtureConfigHash(baseSuite);
		const b = computeFixtureConfigHash({ ...baseSuite, name: "other-suite" });
		expect(a).not.toBe(b);
	});

	it("changes when targetVersion changes", () => {
		const a = computeFixtureConfigHash(baseSuite);
		const b = computeFixtureConfigHash({ ...baseSuite, targetVersion: "v2" });
		expect(a).not.toBe(b);
	});

	it("does NOT change when cases change", () => {
		const a = computeFixtureConfigHash(baseSuite);
		const b = computeFixtureConfigHash({
			...baseSuite,
			cases: [...baseSuite.cases, { id: "H02", input: { query: "world" } }],
		});
		expect(a).toBe(b);
	});

	it("does NOT change when graders change", () => {
		const a = computeFixtureConfigHash(baseSuite);
		const b = computeFixtureConfigHash({
			...baseSuite,
			defaultGraders: [
				{
					grader: async () => ({
						pass: true,
						score: 1,
						reason: "ok",
						graderName: "test",
					}),
				},
			],
		});
		expect(a).toBe(b);
	});
});
