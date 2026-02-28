import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleDescribeConfig } from "./describe-config.js";
import { createTempConfig } from "./test-helpers.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempConfig({
		suites: [
			{
				name: "smoke",
				description: "Basic smoke tests",
				cases: [
					{ id: "H01", input: { prompt: "hello" } },
					{ id: "H02", input: { prompt: "world" } },
				],
			},
		],
		fixtureDir: ".my-fixtures",
	});
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("handleDescribeConfig", () => {
	it("returns structured config description", async () => {
		const result = await handleDescribeConfig({} as Record<string, never>, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.suites).toHaveLength(1);
		expect(data.suites[0].name).toBe("smoke");
		expect(data.suites[0].caseCount).toBe(2);
	});

	it("includes run settings", async () => {
		const result = await handleDescribeConfig({} as Record<string, never>, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.run).toBeDefined();
		expect(data.run.defaultMode).toBeDefined();
		expect(data.run.timeoutMs).toBeDefined();
	});

	it("includes case details", async () => {
		const result = await handleDescribeConfig({} as Record<string, never>, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.suites[0].cases).toHaveLength(2);
		expect(data.suites[0].cases[0].id).toBe("H01");
	});

	it("reports hasJudge as false when no judge configured", async () => {
		const result = await handleDescribeConfig({} as Record<string, never>, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.hasJudge).toBe(false);
	});

	it("uses configured fixtureDir", async () => {
		const result = await handleDescribeConfig({} as Record<string, never>, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.fixtureDir).toBe(".my-fixtures");
	});

	it("returns error for missing config", async () => {
		const result = await handleDescribeConfig({} as Record<string, never>, "/nonexistent/path");
		expect(result.isError).toBe(true);
	});
});
