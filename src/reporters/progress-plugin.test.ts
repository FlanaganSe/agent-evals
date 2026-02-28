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

const mockTrial: Trial = {
	caseId: "H01",
	status: "pass",
	output: { text: "ok", latencyMs: 10 },
	grades: [],
	score: 1,
	durationMs: 10,
};

describe("createProgressPlugin", () => {
	it("writes progress to TTY stream", async () => {
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

	it("updates progress after each trial", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 3,
			trialCount: 3,
		});

		await plugin.hooks?.afterTrial?.(mockTrial, {
			suiteId: "smoke",
			completedCount: 1,
			totalCount: 3,
		});

		expect(stream.chunks.some((c) => c.includes("1/3"))).toBe(true);
	});

	it("clears progress line on afterRun", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 1,
			trialCount: 1,
		});

		await plugin.hooks?.afterTrial?.(mockTrial, {
			suiteId: "smoke",
			completedCount: 1,
			totalCount: 1,
		});

		// afterRun should clear by writing ANSI escape
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

		// Should have escape sequences for clearing
		expect(stream.chunks.some((c) => c.includes("\x1b["))).toBe(true);
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

	it("shows correct percentage", async () => {
		const stream = createMockStream(true);
		const plugin = createProgressPlugin({ stream });

		await plugin.hooks?.beforeRun?.({
			suiteId: "smoke",
			mode: "live",
			caseCount: 4,
			trialCount: 4,
		});

		await plugin.hooks?.afterTrial?.(mockTrial, {
			suiteId: "smoke",
			completedCount: 2,
			totalCount: 4,
		});

		expect(stream.chunks.some((c) => c.includes("50%"))).toBe(true);
	});
});
