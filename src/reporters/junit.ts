import { writeFile } from "node:fs/promises";
import type { Run, Trial } from "../config/types.js";
import type { ReporterPlugin } from "./types.js";

/**
 * Escape a string for safe inclusion in XML attributes and text content.
 * Strips XML 1.0 illegal control characters (U+0000-U+0008, U+000B,
 * U+000C, U+000E-U+001F). LLM output commonly contains these.
 * Preserves: tab (0x09), newline (0x0A), carriage return (0x0D).
 */
export function escapeXml(str: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping XML 1.0 illegal control chars
	const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
	return cleaned
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export function formatJunitXml(run: Run): string {
	// Group trials by caseId for multi-trial dedup
	const caseMap = new Map<string, Trial[]>();
	for (const trial of run.trials) {
		const existing = caseMap.get(trial.caseId) ?? [];
		existing.push(trial);
		caseMap.set(trial.caseId, existing);
	}

	const totalTests = caseMap.size;
	let failures = 0;
	let errors = 0;
	const testcases: string[] = [];

	for (const [caseId, trials] of caseMap) {
		const isMultiTrial = trials.length > 1;
		const passCount = trials.filter((t) => t.status === "pass").length;
		const hasError = trials.some((t) => t.status === "error");
		const hasFail = trials.some((t) => t.status === "fail");
		const allPassed = passCount === trials.length;
		const totalTime = trials.reduce((sum, t) => sum + t.durationMs, 0);

		const name = isMultiTrial
			? `${escapeXml(caseId)} (${passCount}/${trials.length} passed)`
			: escapeXml(caseId);
		const classname = escapeXml(run.suiteId);
		const time = (totalTime / 1000).toFixed(3);

		if (allPassed) {
			testcases.push(`    <testcase name="${name}" classname="${classname}" time="${time}" />`);
		} else if (hasError && !hasFail) {
			errors++;
			const errorTrial = trials.find((t) => t.status === "error");
			const message = escapeXml(errorTrial?.grades.find((g) => !g.pass)?.reason ?? "Unknown error");
			testcases.push(
				`    <testcase name="${name}" classname="${classname}" time="${time}">`,
				`      <error message="${message}" type="EvalError">${message}</error>`,
				"    </testcase>",
			);
		} else {
			failures++;
			const failedGrades = trials.flatMap((t) => t.grades.filter((g) => !g.pass)).slice(0, 5);
			const message = escapeXml(
				failedGrades.map((g) => `${g.graderName}: ${g.reason}`).join("; ") || "Evaluation failed",
			);
			testcases.push(
				`    <testcase name="${name}" classname="${classname}" time="${time}">`,
				`      <failure message="${message}" type="AssertionError">${message}</failure>`,
				"    </testcase>",
			);
		}
	}

	const totalTimeSeconds = (run.summary.totalDurationMs / 1000).toFixed(3);

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<testsuites name="agent-evals" tests="${totalTests}" failures="${failures}" errors="${errors}" time="${totalTimeSeconds}">`,
		`  <testsuite name="${escapeXml(run.suiteId)}" tests="${totalTests}" failures="${failures}" errors="${errors}" time="${totalTimeSeconds}" timestamp="${run.timestamp}">`,
		...testcases,
		"  </testsuite>",
		"</testsuites>",
	].join("\n");
}

export const junitReporterPlugin: ReporterPlugin = {
	name: "junit",
	report: async (run, options) => {
		const xml = formatJunitXml(run);
		if (options.output) {
			await writeFile(options.output, xml, "utf-8");
			return undefined;
		}
		return xml;
	},
};
