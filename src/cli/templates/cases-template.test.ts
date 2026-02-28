import { describe, expect, it } from "vitest";
import { generateStarterCases } from "./cases-template.js";

describe("generateStarterCases", () => {
	it("produces valid JSONL (each line parses as JSON)", () => {
		const output = generateStarterCases();
		const lines = output.trimEnd().split("\n");
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
	});

	it("generates three starter cases", () => {
		const output = generateStarterCases();
		const lines = output.trimEnd().split("\n");
		expect(lines).toHaveLength(3);
	});

	it("includes H01, H02, E01 case IDs", () => {
		const output = generateStarterCases();
		const cases = output
			.trimEnd()
			.split("\n")
			.map((l) => JSON.parse(l));
		const ids = cases.map((c: { id: string }) => c.id);
		expect(ids).toEqual(["H01", "H02", "E01"]);
	});

	it("includes happy_path and edge_case categories", () => {
		const output = generateStarterCases();
		const cases = output
			.trimEnd()
			.split("\n")
			.map((l) => JSON.parse(l));
		const categories = [...new Set(cases.map((c: { category: string }) => c.category))];
		expect(categories).toContain("happy_path");
		expect(categories).toContain("edge_case");
	});

	it("ends with exactly one newline", () => {
		const output = generateStarterCases();
		expect(output.endsWith("\n")).toBe(true);
		expect(output.endsWith("\n\n")).toBe(false);
	});
});
