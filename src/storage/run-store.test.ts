import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Run } from "../config/types.js";
import { listRuns, loadRun, saveRun } from "./run-store.js";

let tempDir: string;

const validRun: Run = {
	schemaVersion: "1.0.0",
	id: "test-run-001",
	suiteId: "smoke",
	mode: "live",
	trials: [
		{
			caseId: "H01",
			status: "pass",
			output: { latencyMs: 100 },
			grades: [{ pass: true, score: 1, reason: "ok", graderName: "test" }],
			score: 1,
			durationMs: 150,
		},
	],
	summary: {
		totalCases: 1,
		passed: 1,
		failed: 0,
		errors: 0,
		passRate: 1,
		totalCost: 0,
		totalDurationMs: 150,
		p95LatencyMs: 100,
		gateResult: { pass: true, results: [] },
	},
	timestamp: "2026-02-28T12:00:00.000Z",
	configHash: "abc123",
	frameworkVersion: "0.0.1",
};

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "run-store-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("saveRun", () => {
	it("saves run to disk", async () => {
		const path = await saveRun(validRun, tempDir);
		expect(path).toContain("test-run-001.json");
	});
});

describe("loadRun", () => {
	it("loads saved run", async () => {
		await saveRun(validRun, tempDir);
		const loaded = await loadRun("test-run-001", tempDir);
		expect(loaded.id).toBe("test-run-001");
		expect(loaded.suiteId).toBe("smoke");
	});

	it("throws on nonexistent run", async () => {
		await expect(loadRun("nonexistent", tempDir)).rejects.toThrow(/not found/i);
	});

	it("rejects path traversal in runId", async () => {
		await expect(loadRun("../../etc/passwd", tempDir)).rejects.toThrow(/invalid run id/i);
	});

	it("rejects runId with slashes", async () => {
		await expect(loadRun("foo/bar", tempDir)).rejects.toThrow(/invalid run id/i);
	});
});

describe("listRuns", () => {
	it("lists saved runs", async () => {
		await saveRun(validRun, tempDir);
		await saveRun({ ...validRun, id: "test-run-002" }, tempDir);

		const runs = await listRuns(tempDir);
		expect(runs).toHaveLength(2);
	});

	it("returns empty array for nonexistent directory", async () => {
		const runs = await listRuns(`/tmp/nonexistent-dir-${Date.now()}`);
		expect(runs).toHaveLength(0);
	});

	it("returns metadata including passRate", async () => {
		await saveRun(validRun, tempDir);
		const runs = await listRuns(tempDir);
		expect(runs[0]?.passRate).toBe(1);
	});
});
