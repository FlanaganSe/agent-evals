import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleListSuites } from "./list-suites.js";
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
				tags: ["ci"],
				gates: { passRate: 0.95 },
			},
			{
				name: "edge",
				cases: [{ id: "E01", input: { prompt: "edge" } }],
			},
		],
	});
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("handleListSuites", () => {
	it("returns all suites with case counts", async () => {
		const result = await handleListSuites({ verbose: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.totalSuites).toBe(2);
		expect(data.suites[0].name).toBe("smoke");
		expect(data.suites[0].caseCount).toBe(2);
		expect(data.suites[1].name).toBe("edge");
		expect(data.suites[1].caseCount).toBe(1);
	});

	it("includes gates when configured", async () => {
		const result = await handleListSuites({ verbose: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.suites[0].gates).toEqual({ passRate: 0.95 });
		expect(data.suites[1].gates).toBeNull();
	});

	it("includes tags", async () => {
		const result = await handleListSuites({ verbose: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.suites[0].tags).toEqual(["ci"]);
	});

	it("includes case IDs when verbose", async () => {
		const result = await handleListSuites({ verbose: true }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.suites[0].caseIds).toEqual(["H01", "H02"]);
	});

	it("omits case IDs when not verbose", async () => {
		const result = await handleListSuites({ verbose: false }, tempDir);
		const data = JSON.parse(result.content[0].text);

		expect(data.suites[0].caseIds).toBeUndefined();
	});

	it("returns error for missing config", async () => {
		const result = await handleListSuites({}, "/nonexistent/path");
		expect(result.isError).toBe(true);
	});
});
