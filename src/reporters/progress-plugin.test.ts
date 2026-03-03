import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { Trial } from "../config/types.js";
import { createProgressPlugin } from "./progress-plugin.js";

function createMockStream(isTTY: boolean): Writable & { chunks: string[]; isTTY: boolean } {
	const chunks: string[] = [];
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(chunk.toString());
			callback();
		},
	}) as Writable & { chunks: string[]; isTTY: boolean };
	stream.chunks = chunks;
	stream.isTTY = isTTY;
	return stream;
}

const passTrial: Trial = {
	caseId: "H01",
	status: "pass",
	output: { text: "ok", latencyMs: 10 },
	grades: [],
	score: 1,
	durationMs: 10,
};

const failTrial: Trial = {
	caseId: "H02",
	status: "fail",
	output: { text: "bad", latencyMs: 250 },
	grades: [],
	score: 0.3,
	durationMs: 250,
};

const errorTrial: Trial = {
	caseId: "H03",
	status: "error",
	output: { text: "Target error: timeout", latencyMs: 5000 },
	grades: [],
	score: 0,
	durationMs: 5000,
};

describe("createProgressPlugin", () => {
	it("writes suite header on beforeRun", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 3,
			trialCount: 3,
		});

		expect(stream.chunks.some((c) => c.includes("smoke"))).toBe(true);
	});

	it("is a no-op on non-TTY stream", async () => {
		const stream = createMockStream(false);
		const plugin = createProgressPlugin({ stream });

		expect(plugin.hooks).toBeUndefined();
	});

	it("prints per-trial result line with status and counter", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream, noColor: true });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 3,
			trialCount: 3,
		});

		await plugin.hooks?.afterTrial?.(passTrial, {
			suiteId: "smoke",
			completedCount: 1,
			totalCount: 3,
		});

		const output = stream.chunks.join("");
		expect(output).toContain("✓ H01");
		expect(output).toContain("10ms");
		expect(output).toContain("1/3 (33%)");
	});

	it("shows distinct symbols for pass, fail, and error", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream, noColor: true });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 3,
			trialCount: 3,
		});

		await plugin.hooks?.afterTrial?.(passTrial, {
			suiteId: "smoke",
			completedCount: 1,
			totalCount: 3,
		});
		await plugin.hooks?.afterTrial?.(failTrial, {
			suiteId: "smoke",
			completedCount: 2,
			totalCount: 3,
		});
		await plugin.hooks?.afterTrial?.(errorTrial, {
			suiteId: "smoke",
			completedCount: 3,
			totalCount: 3,
		});

		const output = stream.chunks.join("");
		expect(output).toContain("✓ H01");
		expect(output).toContain("✗ H02");
		expect(output).toContain("! H03");
	});

	it("formats latency as seconds when >= 1000ms", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream, noColor: true });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 1,
			trialCount: 1,
		});

		await plugin.hooks?.afterTrial?.(errorTrial, {
			suiteId: "smoke",
			completedCount: 1,
			totalCount: 1,
		});

		const output = stream.chunks.join("");
		expect(output).toContain("5.0s");
	});

	it("does not erase progress on afterRun", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 1,
			trialCount: 1,
		});

		await plugin.hooks?.afterTrial?.(passTrial, {
			suiteId: "smoke",
			completedCount: 1,
			totalCount: 1,
		});

		const chunksBeforeAfterRun = stream.chunks.length;

		const run = {
			schemaVersion: "1.0.0",
			id: "x",
			suiteId: "smoke",
			mode: "live" as const,
			trials: [],
			summary: {
				totalCases: 0,
				passed: 0,
				failed: 0,
				errors: 0,
				passRate: 0,
				totalCost: 0,
				totalDurationMs: 0,
				p95LatencyMs: 0,
				gateResult: { pass: true, results: [] },
			},
			timestamp: "",
			configHash: "",
			frameworkVersion: "",
		};
		await plugin.hooks?.afterRun?.(run);

		expect(stream.chunks.length).toBe(chunksBeforeAfterRun);
	});

	it("shows replay label in beforeRun", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "replay",
			caseCount: 3,
			trialCount: 3,
		});

		expect(stream.chunks.some((c) => c.includes("(replay)"))).toBe(true);
	});

	it("includes ANSI color codes when noColor is false", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream, noColor: false });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 1,
			trialCount: 1,
		});

		await plugin.hooks?.afterTrial?.(passTrial, {
			suiteId: "smoke",
			completedCount: 1,
			totalCount: 1,
		});

		const output = stream.chunks.join("");
		// Green color code for pass
		expect(output).toContain("\x1b[32m✓\x1b[0m");
	});
});
