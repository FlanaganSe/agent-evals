import { describe, expect, it } from "vitest";
import { resolveReporter } from "./registry.js";
import type { ReporterPlugin } from "./types.js";

describe("resolveReporter", () => {
	it("resolves built-in 'console' reporter", async () => {
		const reporter = await resolveReporter("console");
		expect(reporter.name).toBe("console");
		expect(typeof reporter.report).toBe("function");
	});

	it("resolves built-in 'json' reporter", async () => {
		const reporter = await resolveReporter("json");
		expect(reporter.name).toBe("json");
		expect(typeof reporter.report).toBe("function");
	});

	it("resolves built-in 'junit' reporter", async () => {
		const reporter = await resolveReporter("junit");
		expect(reporter.name).toBe("junit");
		expect(typeof reporter.report).toBe("function");
	});

	it("resolves built-in 'markdown' reporter", async () => {
		const reporter = await resolveReporter("markdown");
		expect(reporter.name).toBe("markdown");
		expect(typeof reporter.report).toBe("function");
	});

	it("returns custom plugin directly", async () => {
		const custom: ReporterPlugin = {
			name: "custom",
			report: async () => "custom output",
		};
		const result = await resolveReporter(custom);
		expect(result).toBe(custom);
	});

	it("throws on unknown reporter name", async () => {
		await expect(resolveReporter("unknown")).rejects.toThrow(
			"Unknown reporter 'unknown'. Built-in reporters: console, json, junit, markdown",
		);
	});
});
