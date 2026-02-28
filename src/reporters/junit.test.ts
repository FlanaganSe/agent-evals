import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Run, Trial } from "../config/types.js";
import { escapeXml, formatJunitXml, junitReporterPlugin } from "./junit.js";

// ─── Test fixtures ──────────────────────────────────────────────────────────

const makeTrial = (overrides: Partial<Trial> = {}): Trial => ({
	caseId: "H01",
	status: "pass",
	output: { text: "hello", latencyMs: 100 },
	grades: [],
	score: 1,
	durationMs: 100,
	...overrides,
});

const makeRun = (trials: Trial[], overrides: Partial<Run> = {}): Run => ({
	schemaVersion: "1.0.0",
	id: "run-1",
	suiteId: "test-suite",
	mode: "replay",
	trials,
	summary: {
		totalCases: trials.length,
		passed: trials.filter((t) => t.status === "pass").length,
		failed: trials.filter((t) => t.status === "fail").length,
		errors: trials.filter((t) => t.status === "error").length,
		passRate: trials.filter((t) => t.status === "pass").length / Math.max(trials.length, 1),
		totalCost: 0,
		totalDurationMs: trials.reduce((sum, t) => sum + t.durationMs, 0),
		p95LatencyMs: 100,
		gateResult: { pass: true, results: [] },
	},
	timestamp: "2026-01-01T00:00:00Z",
	configHash: "abc",
	frameworkVersion: "0.0.1",
	...overrides,
});

// ─── XML escaping ───────────────────────────────────────────────────────────

describe("escapeXml", () => {
	it("escapes angle brackets", () => {
		expect(escapeXml("<script>")).toBe("&lt;script&gt;");
	});

	it("escapes ampersands", () => {
		expect(escapeXml("a & b")).toBe("a &amp; b");
	});

	it("escapes quotes", () => {
		expect(escapeXml('He said "hello"')).toBe("He said &quot;hello&quot;");
	});

	it("escapes apostrophes", () => {
		expect(escapeXml("it's")).toBe("it&apos;s");
	});

	it("strips illegal control characters", () => {
		expect(escapeXml("foo\x00bar\x0Bbaz")).toBe("foobarbaz");
	});

	it("preserves tab, newline, carriage return", () => {
		expect(escapeXml("a\tb\nc\rd")).toBe("a\tb\nc\rd");
	});

	it("handles empty string", () => {
		expect(escapeXml("")).toBe("");
	});

	it("handles emoji safely", () => {
		const result = escapeXml("Result: \u2705 passed");
		expect(result).toContain("\u2705");
	});
});

// ─── JUnit XML structure ────────────────────────────────────────────────────

describe("formatJunitXml", () => {
	it("produces valid XML with declaration", () => {
		const xml = formatJunitXml(makeRun([makeTrial()]));
		expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
	});

	it("contains testsuites root element", () => {
		const xml = formatJunitXml(makeRun([makeTrial()]));
		expect(xml).toContain("<testsuites");
		expect(xml).toContain("</testsuites>");
	});

	it("contains testsuite with correct attributes", () => {
		const xml = formatJunitXml(makeRun([makeTrial()]));
		expect(xml).toContain('name="test-suite"');
		expect(xml).toContain('tests="1"');
		expect(xml).toContain('failures="0"');
		expect(xml).toContain('errors="0"');
		expect(xml).toContain('timestamp="2026-01-01T00:00:00Z"');
	});

	it("renders passing trial as testcase with no children", () => {
		const xml = formatJunitXml(makeRun([makeTrial()]));
		expect(xml).toContain('<testcase name="H01" classname="test-suite"');
		expect(xml).toContain("/>"); // self-closing
		expect(xml).not.toContain("<failure");
	});

	it("renders failing trial with failure element", () => {
		const xml = formatJunitXml(
			makeRun([
				makeTrial({
					status: "fail",
					grades: [
						{
							pass: false,
							score: 0,
							reason: "Expected tool not called",
							graderName: "tool-called",
						},
					],
				}),
			]),
		);
		expect(xml).toContain("<failure");
		expect(xml).toContain("tool-called: Expected tool not called");
		expect(xml).toContain('failures="1"');
	});

	it("renders error trial with error element", () => {
		const xml = formatJunitXml(
			makeRun([
				makeTrial({
					status: "error",
					grades: [{ pass: false, score: 0, reason: "Timeout after 5000ms", graderName: "error" }],
				}),
			]),
		);
		expect(xml).toContain("<error");
		expect(xml).toContain("Timeout after 5000ms");
		expect(xml).toContain('errors="1"');
	});

	it("expresses time in seconds", () => {
		const xml = formatJunitXml(makeRun([makeTrial({ durationMs: 1234 })]));
		expect(xml).toContain('time="1.234"');
	});

	it("deduplicates multi-trial cases to one testcase", () => {
		const trials = [
			makeTrial({ caseId: "H01", trialIndex: 0 }),
			makeTrial({ caseId: "H01", trialIndex: 1 }),
			makeTrial({ caseId: "H01", trialIndex: 2 }),
			makeTrial({ caseId: "H02", trialIndex: 0 }),
			makeTrial({ caseId: "H02", trialIndex: 1 }),
		];
		const xml = formatJunitXml(makeRun(trials));
		expect(xml).toContain('tests="2"');
		// Only 2 testcase elements
		const testcaseCount = (xml.match(/<testcase /g) ?? []).length;
		expect(testcaseCount).toBe(2);
	});

	it("includes pass count in multi-trial testcase name", () => {
		const trials = [
			makeTrial({ caseId: "H01", trialIndex: 0 }),
			makeTrial({ caseId: "H01", trialIndex: 1 }),
			makeTrial({
				caseId: "H01",
				trialIndex: 2,
				status: "fail",
				grades: [{ pass: false, score: 0, reason: "fail", graderName: "g" }],
			}),
		];
		const xml = formatJunitXml(makeRun(trials));
		expect(xml).toContain("H01 (2/3 passed)");
	});

	it("marks multi-trial case as failure if any trial fails", () => {
		const trials = [
			makeTrial({ caseId: "H01", trialIndex: 0 }),
			makeTrial({
				caseId: "H01",
				trialIndex: 1,
				status: "fail",
				grades: [{ pass: false, score: 0, reason: "fail", graderName: "g" }],
			}),
		];
		const xml = formatJunitXml(makeRun(trials));
		expect(xml).toContain("<failure");
		expect(xml).toContain('failures="1"');
	});

	it("escapes suite name with special characters", () => {
		const xml = formatJunitXml(makeRun([makeTrial()], { suiteId: "test <suite> & more" }));
		expect(xml).toContain("test &lt;suite&gt; &amp; more");
	});
});

// ─── Reporter plugin ────────────────────────────────────────────────────────

describe("junitReporterPlugin", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "junit-test-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("returns XML string when no output path", async () => {
		const result = await junitReporterPlugin.report(makeRun([makeTrial()]), {});
		expect(typeof result).toBe("string");
		expect(result).toContain("<?xml");
	});

	it("writes XML to file when output path given", async () => {
		const outputPath = join(tmpDir, "results.xml");
		const result = await junitReporterPlugin.report(makeRun([makeTrial()]), {
			output: outputPath,
		});
		expect(result).toBeUndefined();
		const content = await readFile(outputPath, "utf-8");
		expect(content).toContain("<?xml");
		expect(content).toContain("test-suite");
	});
});
