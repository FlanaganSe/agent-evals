import { describe, expect, it } from "vitest";
import type { ResolvedSuite } from "../config/types.js";
import { ConfigError } from "./errors.js";
import { filterCases, filterSuites, validateFilterFlags } from "./filter.js";

const mockTarget = async () => ({ text: "ok", latencyMs: 0 });

function makeSuite(name: string, caseIds: readonly string[]): ResolvedSuite {
	return {
		name,
		target: mockTarget,
		cases: caseIds.map((id) => ({ id, input: {} })),
		gates: { passRate: 0.9 },
	};
}

describe("filterSuites", () => {
	const suites = [makeSuite("smoke", ["H01"]), makeSuite("regression", ["R01"])];

	it("returns all suites when filter is undefined", () => {
		expect(filterSuites(suites, undefined)).toBe(suites);
	});

	it("filters by comma-separated names", () => {
		const filtered = filterSuites(suites, "smoke");
		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.name).toBe("smoke");
	});

	it("supports multiple names", () => {
		const filtered = filterSuites(suites, "smoke, regression");
		expect(filtered).toHaveLength(2);
	});

	it("throws ConfigError when no suites match", () => {
		expect(() => filterSuites(suites, "nonexistent")).toThrow(ConfigError);
		expect(() => filterSuites(suites, "nonexistent")).toThrow("Available suites:");
	});
});

describe("filterCases", () => {
	const suite = makeSuite("smoke", ["H01", "H02", "E01"]);

	it("returns full suite when filter is undefined", () => {
		expect(filterCases(suite, undefined)).toBe(suite);
	});

	it("filters by comma-separated IDs", () => {
		const filtered = filterCases(suite, "H01, E01");
		expect(filtered.cases).toHaveLength(2);
		expect(filtered.cases.map((c) => c.id)).toEqual(["H01", "E01"]);
	});

	it("preserves suite config", () => {
		const filtered = filterCases(suite, "H01");
		expect(filtered.gates).toEqual(suite.gates);
		expect(filtered.target).toBe(suite.target);
	});

	it("throws ConfigError when no cases match", () => {
		expect(() => filterCases(suite, "NONEXISTENT")).toThrow(ConfigError);
		expect(() => filterCases(suite, "NONEXISTENT")).toThrow("Available cases:");
	});
});

describe("validateFilterFlags", () => {
	it("passes when neither flag is set", () => {
		expect(() => validateFilterFlags(undefined, undefined)).not.toThrow();
	});

	it("passes when only --filter is set", () => {
		expect(() => validateFilterFlags("H01", undefined)).not.toThrow();
	});

	it("passes when only --filter-failing is set", () => {
		expect(() => validateFilterFlags(undefined, "run-123")).not.toThrow();
	});

	it("throws when both flags are set", () => {
		expect(() => validateFilterFlags("H01", "run-123")).toThrow(ConfigError);
		expect(() => validateFilterFlags("H01", "run-123")).toThrow("mutually exclusive");
	});
});
