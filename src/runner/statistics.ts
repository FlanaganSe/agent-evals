import type { Trial } from "../config/types.js";

export interface TrialStats {
	readonly trialCount: number;
	readonly passCount: number;
	readonly failCount: number;
	readonly errorCount: number;
	readonly passRate: number;
	readonly meanScore: number;
	readonly scoreStdDev: number;
	readonly ci95Low: number;
	readonly ci95High: number;
	readonly flaky: boolean;
}

/**
 * Computes Wilson score interval for a proportion.
 * Superior to normal approximation for small N and proportions near 0 or 1.
 */
export function wilsonInterval(
	passes: number,
	total: number,
	z = 1.96,
): { readonly low: number; readonly high: number } {
	if (total === 0) return { low: 0, high: 0 };
	const phat = passes / total;
	const zz = z * z;
	const a = phat + zz / (2 * total);
	const b = z * Math.sqrt((phat * (1 - phat) + zz / (4 * total)) / total);
	const c = 1 + zz / total;
	return {
		low: Math.max(0, (a - b) / c),
		high: Math.min(1, (a + b) / c),
	};
}

export function computeTrialStats(trials: readonly Trial[], caseId: string): TrialStats {
	const caseTrials = trials.filter((t) => t.caseId === caseId);
	const n = caseTrials.length;

	if (n === 0) {
		return {
			trialCount: 0,
			passCount: 0,
			failCount: 0,
			errorCount: 0,
			passRate: 0,
			meanScore: 0,
			scoreStdDev: 0,
			ci95Low: 0,
			ci95High: 0,
			flaky: false,
		};
	}

	const passes = caseTrials.filter((t) => t.status === "pass").length;
	const fails = caseTrials.filter((t) => t.status === "fail").length;
	const errors = caseTrials.filter((t) => t.status === "error").length;

	const scores = caseTrials.map((t) => t.score);
	const meanScore = scores.reduce((a, b) => a + b, 0) / n;
	const variance = scores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0) / (n > 1 ? n - 1 : 1);
	const scoreStdDev = Math.sqrt(variance);

	const ci = wilsonInterval(passes, n);

	return {
		trialCount: n,
		passCount: passes,
		failCount: fails,
		errorCount: errors,
		passRate: n > 0 ? passes / n : 0,
		meanScore,
		scoreStdDev,
		ci95Low: ci.low,
		ci95High: ci.high,
		flaky: passes > 0 && passes < n,
	};
}

/**
 * Computes trial stats per case. Returns undefined for single-trial runs.
 */
export function computeAllTrialStats(
	trials: readonly Trial[],
	trialCount: number | undefined,
): Record<string, TrialStats> | undefined {
	if (!trialCount || trialCount <= 1) return undefined;
	if (trials.length === 0) return undefined;

	const caseIds = [...new Set(trials.map((t) => t.caseId))];
	const stats: Record<string, TrialStats> = {};
	for (const caseId of caseIds) {
		stats[caseId] = computeTrialStats(trials, caseId);
	}
	return stats;
}
