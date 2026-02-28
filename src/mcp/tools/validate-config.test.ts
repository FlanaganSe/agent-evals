import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempConfig } from "./test-helpers.js";
import { handleValidateConfig } from "./validate-config.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempConfig();
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("handleValidateConfig", () => {
	it("reports valid config", async () => {
		const result = await handleValidateConfig({}, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.valid).toBe(true);
		expect(data.suiteCount).toBe(1);
		expect(data.totalCases).toBe(1);
	});

	it("reports invalid config with structured error", async () => {
		const result = await handleValidateConfig({}, "/nonexistent/path");
		const data = JSON.parse(result.content[0].text);

		expect(data.valid).toBe(false);
		expect(data.error).toBeTruthy();
		expect(result.isError).toBe(true);
	});

	it("warns about empty suites", async () => {
		const dir = await createTempConfig({
			suites: [{ name: "empty", cases: [] }],
		});

		try {
			const result = await handleValidateConfig({}, dir);
			const data = JSON.parse(result.content[0].text);

			expect(data.valid).toBe(true);
			expect(data.warnings).toContain('Suite "empty" has no cases');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("warns about suites with no graders", async () => {
		const result = await handleValidateConfig({}, tempDir);
		const data = JSON.parse(result.content[0].text);

		// Default test config has no graders
		expect(data.warnings.some((w: string) => w.includes("no default graders"))).toBe(true);
	});

	it("reports suite and case counts", async () => {
		const dir = await createTempConfig({
			suites: [
				{
					name: "a",
					cases: [
						{ id: "A01", input: {} },
						{ id: "A02", input: {} },
					],
				},
				{
					name: "b",
					cases: [{ id: "B01", input: {} }],
				},
			],
		});

		try {
			const result = await handleValidateConfig({}, dir);
			const data = JSON.parse(result.content[0].text);

			expect(data.suiteCount).toBe(2);
			expect(data.totalCases).toBe(3);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("handles broken config file gracefully", async () => {
		const dir = await mkdtemp(join(tmpdir(), "mcp-validate-"));
		await writeFile(join(dir, "eval.config.ts"), "this is not valid javascript {{{");

		try {
			const result = await handleValidateConfig({}, dir);
			const data = JSON.parse(result.content[0].text);

			expect(data.valid).toBe(false);
			expect(result.isError).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("accepts custom config path", async () => {
		// The default config path is "eval.config" — this should still work
		const result = await handleValidateConfig({ configPath: "eval.config" }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.valid).toBe(true);
	});
});
