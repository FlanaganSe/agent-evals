import pc from "picocolors";
import type { Run, TrialStats } from "../config/types.js";

export interface ConsoleReportOptions {
	readonly color?: boolean | undefined;
	readonly verbose?: boolean | undefined;
}

/**
 * Formats a Run artifact as a human-readable console report.
 * Returns a string intended for stdout.
 */
export function formatConsoleReport(run: Run, options?: ConsoleReportOptions): string {
	const useColor = options?.color !== false;
	const c = useColor ? pc : noColor;
	const lines: string[] = [];
	const trialCount = run.summary.trialStats
		? Math.max(...Object.values(run.summary.trialStats).map((s) => s.trialCount))
		: undefined;
	const modeLabel = trialCount ? `${run.mode}, ${trialCount} trials` : run.mode;

	lines.push(`Suite: ${c.bold(run.suiteId)} (${modeLabel})`);
	lines.push("");

	// Group trials by caseId
	const caseIds = [...new Set(run.trials.map((t) => t.caseId))];

	for (const caseId of caseIds) {
		const trialStats = run.summary.trialStats?.[caseId];
		const firstTrial = run.trials.find((t) => t.caseId === caseId);
		if (!firstTrial) continue;

		if (trialStats) {
			lines.push(formatTrialStatLine(caseId, trialStats, firstTrial, c));
		} else {
			lines.push(formatSingleTrialLine(caseId, firstTrial, c));
		}

		// Show failure reason for failing cases
		if (
			firstTrial.status === "fail" ||
			(trialStats && !trialStats.flaky && trialStats.passCount === 0)
		) {
			const failedGrades = firstTrial.grades.filter((g) => !g.pass);
			for (const grade of failedGrades) {
				lines.push(`       ${c.dim(`→ ${grade.graderName}: ${grade.reason}`)}`);
			}
		}
	}

	lines.push("");

	// Summary line
	if (trialCount) {
		const flakyCount = run.summary.trialStats
			? Object.values(run.summary.trialStats).filter((s) => s.flaky).length
			: 0;
		const passedCases = run.summary.trialStats
			? Object.values(run.summary.trialStats).filter((s) => s.passCount === s.trialCount).length
			: run.summary.passed;
		const failedCases = caseIds.length - passedCases - flakyCount;

		const parts: string[] = [];
		if (passedCases > 0) parts.push(c.green(`${passedCases} passed`));
		if (flakyCount > 0) parts.push(c.yellow(`${flakyCount} flaky`));
		if (failedCases > 0) parts.push(c.red(`${failedCases} failed`));
		if (run.summary.errors > 0) parts.push(c.red(`${run.summary.errors} errors`));
		lines.push(`Results: ${parts.join(" | ")}`);

		const totalTrials = run.trials.length;
		const passedTrials = run.trials.filter((t) => t.status === "pass").length;
		const failedTrials = totalTrials - passedTrials;
		lines.push(`Trials: ${totalTrials} total (${passedTrials} passed, ${failedTrials} failed)`);
	} else {
		const parts: string[] = [];
		if (run.summary.passed > 0) parts.push(c.green(`${run.summary.passed} passed`));
		if (run.summary.failed > 0) parts.push(c.red(`${run.summary.failed} failed`));
		if (run.summary.errors > 0) parts.push(c.red(`${run.summary.errors} errors`));
		lines.push(`Results: ${parts.join(" | ")}`);
	}

	lines.push(
		`Cost: $${run.summary.totalCost.toFixed(4)} | Duration: ${run.summary.totalDurationMs}ms`,
	);

	// Gate result
	const gateLabel = run.summary.gateResult.pass ? c.green("PASS") : c.red("FAIL");
	const failedGateDetails = run.summary.gateResult.results
		.filter((r) => !r.pass)
		.map((r) => r.reason)
		.join("; ");
	lines.push(`Gate: ${gateLabel}${failedGateDetails ? ` (${failedGateDetails})` : ""}`);

	if (run.summary.aborted) {
		lines.push(c.yellow("Run was aborted — results are partial."));
	}

	return lines.join("\n");
}

/**
 * Formats a Run artifact as a markdown summary (for GitHub Actions $GITHUB_STEP_SUMMARY).
 */
export function formatMarkdownSummary(run: Run): string {
	const lines: string[] = [];
	const gateEmoji = run.summary.gateResult.pass ? "✅" : "❌";

	lines.push(`## ${gateEmoji} ${run.suiteId} — ${run.mode}`);
	lines.push("");
	lines.push("| Case | Status | Score | Duration |");
	lines.push("|------|--------|-------|----------|");

	const caseIds = [...new Set(run.trials.map((t) => t.caseId))];
	for (const caseId of caseIds) {
		const trialStats = run.summary.trialStats?.[caseId];
		const firstTrial = run.trials.find((t) => t.caseId === caseId);
		if (!firstTrial) continue;

		if (trialStats) {
			const statusEmoji = trialStats.flaky
				? "⚠️"
				: trialStats.passCount === trialStats.trialCount
					? "✅"
					: "❌";
			const passLabel = `${trialStats.passCount}/${trialStats.trialCount}`;
			lines.push(
				`| ${caseId} | ${statusEmoji} ${passLabel} | ${trialStats.meanScore.toFixed(2)} | ${firstTrial.durationMs}ms |`,
			);
		} else {
			const statusEmoji =
				firstTrial.status === "pass" ? "✅" : firstTrial.status === "error" ? "💥" : "❌";
			lines.push(
				`| ${caseId} | ${statusEmoji} ${firstTrial.status} | ${firstTrial.score.toFixed(2)} | ${firstTrial.durationMs}ms |`,
			);
		}
	}

	lines.push("");
	lines.push(
		`**Results:** ${run.summary.passed} passed, ${run.summary.failed} failed | **Cost:** $${run.summary.totalCost.toFixed(4)} | **Duration:** ${run.summary.totalDurationMs}ms`,
	);

	for (const gate of run.summary.gateResult.results) {
		if (!gate.pass) {
			lines.push(`- ❌ ${gate.reason}`);
		}
	}

	return lines.join("\n");
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function formatSingleTrialLine(
	caseId: string,
	trial: {
		readonly status: string;
		readonly output: { readonly latencyMs: number; readonly cost?: number | undefined };
	},
	c: Colors,
): string {
	const icon =
		trial.status === "pass" ? c.green("✓") : trial.status === "error" ? c.red("!") : c.red("✗");
	const latency = `${trial.output.latencyMs}ms`;
	const cost = `$${(trial.output.cost ?? 0).toFixed(4)}`;
	const statusPad = trial.status.padEnd(5);
	return `  ${icon} ${caseId.padEnd(6)} ${c.dim(statusPad)} ${c.dim(latency.padStart(8))} ${c.dim(cost.padStart(8))}`;
}

function formatTrialStatLine(
	caseId: string,
	stats: TrialStats,
	firstTrial: {
		readonly output: { readonly latencyMs: number; readonly cost?: number | undefined };
	},
	c: Colors,
): string {
	const icon = stats.flaky
		? c.yellow("~")
		: stats.passCount === stats.trialCount
			? c.green("✓")
			: c.red("✗");
	const passLabel = `${stats.passCount}/${stats.trialCount} passed`;
	const ciLabel = `CI: [${(stats.ci95Low * 100).toFixed(1)}%, ${(stats.ci95High * 100).toFixed(1)}%]`;
	const latency = `${firstTrial.output.latencyMs}ms`;
	const cost = `$${(firstTrial.output.cost ?? 0).toFixed(4)}`;
	const flakyTag = stats.flaky ? c.yellow(" (flaky)") : "";

	return `  ${icon} ${caseId.padEnd(6)}${flakyTag} ${passLabel.padEnd(14)} ${c.dim(ciLabel)} ${c.dim(latency.padStart(8))} ${c.dim(cost.padStart(8))}`;
}

type Colors = typeof pc;

const noColor: Colors = new Proxy(pc, {
	get(_target, prop: string) {
		if (typeof prop === "string") {
			// Return identity function for all color methods
			return (s: string) => s;
		}
		return undefined;
	},
}) as Colors;
