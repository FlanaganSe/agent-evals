import { describe, expect, it } from "vitest";
import type { Run } from "../config/types.js";
import { formatConsoleReport, formatMarkdownSummary } from "./console.js";

function makeRun(overrides?: Partial<Run>): Run {
	return {
		schemaVersion: "1.0.0",
		id: "test-run-id",
		suiteId: "smoke",
		mode: "live",
		trials: [
			{
				caseId: "H01",
				status: "pass",
				output: { latencyMs: 100, cost: 0.001 },
				grades: [{ pass: true, score: 1, reason: "ok", graderName: "contains" }],
				score: 1,
				durationMs: 100,
			},
			{
				caseId: "E01",
				status: "fail",
				output: { latencyMs: 200, cost: 0.002 },
				grades: [
					{
						pass: false,
						score: 0,
						reason: 'Expected "error_handler" to be called',
						graderName: "tool-called",
					},
				],
				score: 0,
				durationMs: 200,
			},
		],
		summary: {
			totalCases: 2,
			passed: 1,
			failed: 1,
			errors: 0,
			passRate: 0.5,
			totalCost: 0.003,
			totalDurationMs: 300,
			p95LatencyMs: 200,
			gateResult: {
				pass: false,
				results: [
					{
						gate: "passRate",
						pass: false,
						actual: 0.5,
						threshold: 0.9,
						reason: "Pass rate 50.0% < 90.0%",
					},
				],
			},
		},
		timestamp: "2026-02-28T00:00:00.000Z",
		configHash: "abc123",
		frameworkVersion: "0.0.1",
		...overrides,
	};
}

describe("formatConsoleReport", () => {
	it("includes suite name and mode", () => {
		const output = formatConsoleReport(makeRun(), { color: false });
		expect(output).toContain("Suite: smoke (live)");
	});

	it("shows passing and failing cases", () => {
		const output = formatConsoleReport(makeRun(), { color: false });
		expect(output).toContain("H01");
		expect(output).toContain("E01");
	});

	it("shows failure reasons", () => {
		const output = formatConsoleReport(makeRun(), { color: false });
		expect(output).toContain("tool-called");
		expect(output).toContain("error_handler");
	});

	it("shows results summary", () => {
		const output = formatConsoleReport(makeRun(), { color: false });
		expect(output).toContain("1 passed");
		expect(output).toContain("1 failed");
	});

	it("shows gate failure", () => {
		const output = formatConsoleReport(makeRun(), { color: false });
		expect(output).toContain("Gate: FAIL");
	});

	it("shows gate pass", () => {
		const run = makeRun({
			summary: {
				...makeRun().summary,
				gateResult: { pass: true, results: [] },
			},
		});
		const output = formatConsoleReport(run, { color: false });
		expect(output).toContain("Gate: PASS");
	});

	it("shows trial stats when present", () => {
		const run = makeRun({
			trials: [
				{
					caseId: "H01",
					status: "pass",
					output: { latencyMs: 100, cost: 0.001 },
					grades: [],
					score: 1,
					durationMs: 100,
					trialIndex: 0,
				},
				{
					caseId: "H01",
					status: "fail",
					output: { latencyMs: 110, cost: 0.001 },
					grades: [],
					score: 0,
					durationMs: 110,
					trialIndex: 1,
				},
			],
			summary: {
				...makeRun().summary,
				trialStats: {
					H01: {
						trialCount: 2,
						passCount: 1,
						failCount: 1,
						errorCount: 0,
						passRate: 0.5,
						meanScore: 0.5,
						scoreStdDev: 0.5,
						ci95Low: 0.095,
						ci95High: 0.905,
						flaky: true,
					},
				},
			},
		});
		const output = formatConsoleReport(run, { color: false });
		expect(output).toContain("flaky");
		expect(output).toContain("1/2 passed");
		expect(output).toContain("CI:");
	});

	it("shows aborted warning", () => {
		const run = makeRun({
			summary: { ...makeRun().summary, aborted: true },
		});
		const output = formatConsoleReport(run, { color: false });
		expect(output).toContain("aborted");
	});
});

describe("formatMarkdownSummary", () => {
	it("includes suite name in heading", () => {
		const md = formatMarkdownSummary(makeRun());
		expect(md).toContain("## ❌ smoke — live");
	});

	it("includes table with case results", () => {
		const md = formatMarkdownSummary(makeRun());
		expect(md).toContain("| H01 |");
		expect(md).toContain("| E01 |");
	});

	it("includes summary stats", () => {
		const md = formatMarkdownSummary(makeRun());
		expect(md).toContain("1 passed");
		expect(md).toContain("1 failed");
	});

	it("uses check emoji for passing gate", () => {
		const run = makeRun({
			summary: {
				...makeRun().summary,
				passRate: 1,
				passed: 2,
				failed: 0,
				gateResult: { pass: true, results: [] },
			},
		});
		const md = formatMarkdownSummary(run);
		expect(md).toContain("## ✅");
	});
});
