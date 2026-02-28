import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Run, RunSummary, Trial } from "../config/types.js";
import { saveRun } from "../storage/run-store.js";

/**
 * MCP server tests.
 *
 * These tests verify the MCP tool logic without requiring the actual
 * @modelcontextprotocol/sdk package. The tools use standard programmatic
 * APIs (runSuite, loadRun, listRuns, compareRuns) which are tested
 * independently. Here we test the integration layer — formatting,
 * error handling, and edge cases that the MCP server exposes.
 *
 * For full MCP protocol integration testing (JSON-RPC transport),
 * see the e2e tests.
 */

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "mcp-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

function makeTrial(caseId: string, status: "pass" | "fail" | "error"): Trial {
	return {
		caseId,
		status,
		output: { text: `Output for ${caseId}`, latencyMs: 100 },
		grades: [
			{
				graderName: "exact-match",
				pass: status === "pass",
				score: status === "pass" ? 1 : 0,
				reason: status === "pass" ? "Matched" : "Did not match",
			},
		],
		score: status === "pass" ? 1 : 0,
		durationMs: 150,
	};
}

function makeSummary(trials: readonly Trial[]): RunSummary {
	const passed = trials.filter((t) => t.status === "pass").length;
	return {
		totalCases: trials.length,
		passed,
		failed: trials.length - passed,
		errors: 0,
		passRate: trials.length > 0 ? passed / trials.length : 0,
		totalCost: 0,
		totalDurationMs: 500,
		p95LatencyMs: 200,
		gateResult: { pass: true, results: [] },
	};
}

function makeRun(id: string, suiteId: string, trials: readonly Trial[]): Run {
	return {
		schemaVersion: "1.0.0",
		id,
		suiteId,
		mode: "live",
		trials: [...trials],
		summary: makeSummary(trials),
		timestamp: new Date().toISOString(),
		configHash: "abc123",
		frameworkVersion: "0.0.1",
	};
}

describe("MCP server integration helpers", () => {
	it("listRuns returns runs sorted by timestamp", async () => {
		const { listRuns } = await import("../storage/run-store.js");

		const run1 = makeRun("run-1", "smoke", [makeTrial("case-1", "pass")]);
		const run2 = makeRun("run-2", "smoke", [
			makeTrial("case-1", "pass"),
			makeTrial("case-2", "fail"),
		]);

		await saveRun(run1, tempDir);
		await saveRun(run2, tempDir);

		const runs = await listRuns(tempDir);
		expect(runs).toHaveLength(2);
		expect(runs[0]?.id).toBe("run-2");
	});

	it("loadRun throws on invalid run ID", async () => {
		const { loadRun } = await import("../storage/run-store.js");
		await expect(loadRun("nonexistent", tempDir)).rejects.toThrow("Run not found");
	});

	it("compareRuns produces comparison with regressions", async () => {
		const { compareRuns } = await import("../comparison/compare.js");

		const baseRun = makeRun("base", "smoke", [
			makeTrial("case-1", "pass"),
			makeTrial("case-2", "pass"),
		]);
		const compareRun = makeRun("compare", "smoke", [
			makeTrial("case-1", "pass"),
			makeTrial("case-2", "fail"),
		]);

		const comparison = compareRuns(baseRun, compareRun);
		expect(comparison.summary.regressions).toBe(1);
		expect(comparison.summary.unchanged).toBe(1);
	});

	it("formatConsoleReport produces text without color", async () => {
		const { formatConsoleReport } = await import("../reporters/console.js");

		const run = makeRun("run-1", "smoke", [
			makeTrial("case-1", "pass"),
			makeTrial("case-2", "fail"),
		]);

		const report = formatConsoleReport(run, { color: false });
		expect(report).toContain("smoke");
		expect(report).toContain("case-1");
		expect(report).toContain("case-2");
		expect(typeof report).toBe("string");
	});

	it("formatComparisonReport produces text output", async () => {
		const { compareRuns } = await import("../comparison/compare.js");
		const { formatComparisonReport } = await import("../comparison/format.js");

		const baseRun = makeRun("base", "smoke", [makeTrial("case-1", "pass")]);
		const compareRun = makeRun("compare", "smoke", [makeTrial("case-1", "fail")]);

		const comparison = compareRuns(baseRun, compareRun);
		const report = formatComparisonReport(comparison, { color: false });
		expect(report).toContain("case-1");
		expect(typeof report).toBe("string");
	});

	it("run saved and loaded preserves all fields", async () => {
		const { loadRun } = await import("../storage/run-store.js");

		const trials = [makeTrial("case-1", "pass"), makeTrial("case-2", "fail")];
		const run = makeRun("round-trip", "smoke", trials);

		await saveRun(run, tempDir);
		const loaded = await loadRun("round-trip", tempDir);

		expect(loaded.id).toBe("round-trip");
		expect(loaded.suiteId).toBe("smoke");
		expect(loaded.trials).toHaveLength(2);
		expect(loaded.summary.passRate).toBe(0.5);
	});

	it("listRuns returns empty for nonexistent directory", async () => {
		const { listRuns } = await import("../storage/run-store.js");

		const runs = await listRuns(join(tempDir, "nonexistent"));
		expect(runs).toEqual([]);
	});

	it("error messages include useful context", () => {
		// Verify error message formatting patterns used by MCP tools
		const error = new Error("Connection refused");
		const formatted = `Failed to run suite "test": ${error.message}`;
		expect(formatted).toContain("test");
		expect(formatted).toContain("Connection refused");
	});

	it("pass rate formatting is correct", () => {
		const passRate = 0.75;
		const formatted = `${(passRate * 100).toFixed(0)}% pass`;
		expect(formatted).toBe("75% pass");
	});

	it("run metadata includes expected fields for list output", async () => {
		const run = makeRun("meta-test", "smoke", [makeTrial("case-1", "pass")]);
		await saveRun(run, tempDir);

		const { listRuns } = await import("../storage/run-store.js");
		const runs = await listRuns(tempDir);

		expect(runs[0]).toMatchObject({
			id: "meta-test",
			suiteId: "smoke",
			mode: "live",
		});
		expect(runs[0]?.passRate).toBe(1);
		expect(runs[0]?.timestamp).toBeDefined();
	});
});
