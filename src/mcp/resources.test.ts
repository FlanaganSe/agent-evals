import { describe, expect, it } from "vitest";
import { BUILT_IN_GRADERS } from "../graders/registry.js";
import { generateCaseSchema, generateConfigSchema, generateGraderReference } from "./resources.js";

describe("MCP Resources", () => {
	describe("generateConfigSchema", () => {
		it("produces valid JSON", () => {
			const schema = generateConfigSchema();
			const parsed = JSON.parse(schema);
			expect(parsed).toBeDefined();
		});

		it("includes suites property", () => {
			const parsed = JSON.parse(generateConfigSchema());
			expect(parsed.properties?.suites).toBeDefined();
		});

		it("has a $schema or type field", () => {
			const parsed = JSON.parse(generateConfigSchema());
			expect(parsed.type || parsed.$schema).toBeTruthy();
		});

		it("returns cached result on subsequent calls", () => {
			const first = generateConfigSchema();
			const second = generateConfigSchema();
			expect(first).toBe(second); // same reference = cached
		});
	});

	describe("generateCaseSchema", () => {
		it("produces valid JSON", () => {
			const schema = generateCaseSchema();
			const parsed = JSON.parse(schema);
			expect(parsed).toBeDefined();
		});

		it("includes id and input properties", () => {
			const parsed = JSON.parse(generateCaseSchema());
			expect(parsed.properties?.id).toBeDefined();
			expect(parsed.properties?.input).toBeDefined();
		});

		it("is reasonably sized", () => {
			const schema = generateCaseSchema();
			expect(schema.length).toBeGreaterThan(50);
		});
	});

	describe("generateGraderReference", () => {
		it("includes all built-in grader names", () => {
			const ref = generateGraderReference();
			for (const g of BUILT_IN_GRADERS) {
				expect(ref).toContain(`### ${g.name}`);
			}
		});

		it("is valid markdown with headers", () => {
			const ref = generateGraderReference();
			expect(ref).toMatch(/^# Grader Reference/);
			expect(ref).toContain("### contains");
			expect(ref).toContain("**Tier**:");
			expect(ref).toContain("**Example**:");
		});

		it("has reasonable length", () => {
			const ref = generateGraderReference();
			expect(ref.length).toBeGreaterThan(500);
		});

		it("returns cached result on subsequent calls", () => {
			const first = generateGraderReference();
			const second = generateGraderReference();
			expect(first).toBe(second);
		});
	});
});
