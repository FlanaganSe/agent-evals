import type { GradeResult, Run, RunSummary, Trial } from "../config/types.js";
import type {
	CaseComparison,
	CategoryComparisonSummary,
	ChangeDirection,
	ComparisonSummary,
	GraderChange,
	RunComparison,
} from "./types.js";

export interface CompareOptions {
	/** Score delta threshold to count as regression/improvement (default: 0.05) */
	readonly scoreThreshold?: number | undefined;
}

/**
 * Compares two runs and produces a structured comparison.
 *
 * The base run is the "before" (e.g., main branch).
 * The compare run is the "after" (e.g., PR branch).
 *
 * Only cases present in BOTH runs are compared as changed/unchanged.
 * Cases in only one run are reported as "added" or "removed".
 *
 * For multi-trial runs (trialStats present), uses aggregate pass^k
 * semantics and mean scores instead of raw trial-0 data.
 */
export function compareRuns(base: Run, compare: Run, options?: CompareOptions): RunComparison {
	const threshold = options?.scoreThreshold ?? 0.05;

	const baseTrials = buildCaseMap(base.trials, base.summary);
	const compareTrials = buildCaseMap(compare.trials, compare.summary);

	const allCaseIds = new Set([...baseTrials.keys(), ...compareTrials.keys()]);

	const cases: CaseComparison[] = [];
	for (const caseId of allCaseIds) {
		cases.push(
			compareSingleCase(caseId, baseTrials.get(caseId), compareTrials.get(caseId), threshold),
		);
	}

	// Sort: regressions first, then removed, added, unchanged, improvements, then by caseId
	cases.sort((a, b) => {
		const dirOrder = changeDirectionOrder(a.direction) - changeDirectionOrder(b.direction);
		if (dirOrder !== 0) return dirOrder;
		return a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0;
	});

	const summary = computeComparisonSummary(cases, base, compare, threshold);

	return {
		baseRunId: base.id,
		compareRunId: compare.id,
		suiteId: base.suiteId,
		cases,
		summary,
	};
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Builds a map from caseId to a representative trial.
 *
 * For multi-trial runs (trialStats present): aggregates all trials per case
 * using pass^k semantics (status) and mean score, consistent with how the
 * runner computes RunSummary.
 *
 * For single-trial runs: uses the trial directly.
 */
function buildCaseMap(trials: readonly Trial[], summary: RunSummary): Map<string, Trial> {
	const map = new Map<string, Trial>();

	if (!summary.trialStats) {
		for (const trial of trials) {
			if (!map.has(trial.caseId)) {
				map.set(trial.caseId, trial);
			}
		}
		return map;
	}

	// Multi-trial: group trials by caseId, then aggregate
	const grouped = new Map<string, Trial[]>();
	for (const trial of trials) {
		let group = grouped.get(trial.caseId);
		if (!group) {
			group = [];
			grouped.set(trial.caseId, group);
		}
		group.push(trial);
	}

	for (const [caseId, caseTrials] of grouped) {
		const stats = summary.trialStats[caseId];
		const first = caseTrials[0];
		if (!first) continue;

		// pass^k: pass only if all trials pass; error only if all error; else fail
		const aggregateStatus: "pass" | "fail" | "error" =
			stats && stats.passCount === stats.trialCount
				? "pass"
				: stats && stats.errorCount === stats.trialCount
					? "error"
					: "fail";

		const aggregateScore = stats?.meanScore ?? first.score;

		map.set(caseId, {
			...first,
			status: aggregateStatus,
			score: aggregateScore,
		});
	}

	return map;
}

function compareSingleCase(
	caseId: string,
	baseTrial: Trial | undefined,
	compareTrial: Trial | undefined,
	threshold: number,
): CaseComparison {
	if (!baseTrial && !compareTrial) {
		return {
			caseId,
			direction: "unchanged" as ChangeDirection,
			baseStatus: undefined,
			compareStatus: undefined,
			baseScore: undefined,
			compareScore: undefined,
			scoreDelta: 0,
			graderChanges: [],
		};
	}

	if (!baseTrial) {
		// compareTrial is guaranteed defined since we handled both-undefined above
		const ct = compareTrial as Trial;
		return {
			caseId,
			direction: "added",
			baseStatus: undefined,
			compareStatus: ct.status,
			baseScore: undefined,
			compareScore: ct.score,
			scoreDelta: 0,
			graderChanges: [],
		};
	}

	if (!compareTrial) {
		return {
			caseId,
			direction: "removed",
			baseStatus: baseTrial.status,
			compareStatus: undefined,
			baseScore: baseTrial.score,
			compareScore: undefined,
			scoreDelta: 0,
			graderChanges: [],
		};
	}

	const scoreDelta = compareTrial.score - baseTrial.score;
	const statusChanged = baseTrial.status !== compareTrial.status;

	let direction: ChangeDirection;
	if (statusChanged) {
		if (baseTrial.status === "pass" && compareTrial.status !== "pass") {
			direction = "regression";
		} else if (baseTrial.status !== "pass" && compareTrial.status === "pass") {
			direction = "improvement";
		} else {
			direction = classifyScoreDelta(scoreDelta, threshold);
		}
	} else {
		direction = classifyScoreDelta(scoreDelta, threshold);
	}

	const graderChanges = compareGraders(baseTrial.grades, compareTrial.grades, threshold);

	return {
		caseId,
		direction,
		baseStatus: baseTrial.status,
		compareStatus: compareTrial.status,
		baseScore: baseTrial.score,
		compareScore: compareTrial.score,
		scoreDelta,
		graderChanges,
	};
}

function classifyScoreDelta(delta: number, threshold: number): ChangeDirection {
	if (delta <= -threshold) return "regression";
	if (delta >= threshold) return "improvement";
	return "unchanged";
}

function compareGraders(
	baseGrades: readonly GradeResult[] | undefined,
	compareGrades: readonly GradeResult[] | undefined,
	threshold: number,
): readonly GraderChange[] {
	const baseMap = new Map((baseGrades ?? []).map((g) => [g.graderName, g]));
	const compareMap = new Map((compareGrades ?? []).map((g) => [g.graderName, g]));
	const allNames = new Set([...baseMap.keys(), ...compareMap.keys()]);

	const changes: GraderChange[] = [];
	for (const name of allNames) {
		const bg = baseMap.get(name);
		const cg = compareMap.get(name);
		const scoreDelta = (cg?.score ?? 0) - (bg?.score ?? 0);

		let direction: ChangeDirection;
		if (!bg) direction = "added";
		else if (!cg) direction = "removed";
		else if (bg.pass && !cg.pass) direction = "regression";
		else if (!bg.pass && cg.pass) direction = "improvement";
		else direction = classifyScoreDelta(scoreDelta, threshold);

		changes.push({
			graderName: name,
			direction,
			baseScore: bg?.score,
			compareScore: cg?.score,
			basePass: bg?.pass,
			comparePass: cg?.pass,
			scoreDelta,
		});
	}

	return changes;
}

function changeDirectionOrder(dir: ChangeDirection): number {
	const order: Record<ChangeDirection, number> = {
		regression: 0,
		removed: 1,
		added: 2,
		unchanged: 3,
		improvement: 4,
	};
	return order[dir];
}

function computeComparisonSummary(
	cases: readonly CaseComparison[],
	base: Run,
	compare: Run,
	threshold: number,
): ComparisonSummary {
	const regressions = cases.filter((c) => c.direction === "regression").length;
	const improvements = cases.filter((c) => c.direction === "improvement").length;
	const unchanged = cases.filter((c) => c.direction === "unchanged").length;
	const added = cases.filter((c) => c.direction === "added").length;
	const removed = cases.filter((c) => c.direction === "removed").length;

	const byCategory = computeCategoryComparisons(base, compare, threshold);

	return {
		totalCases: cases.length,
		regressions,
		improvements,
		unchanged,
		added,
		removed,
		costDelta: compare.summary.totalCost - base.summary.totalCost,
		durationDelta: compare.summary.totalDurationMs - base.summary.totalDurationMs,
		baseGatePass: base.summary.gateResult.pass,
		compareGatePass: compare.summary.gateResult.pass,
		byCategory,
	};
}

function computeCategoryComparisons(
	base: Run,
	compare: Run,
	threshold: number,
): readonly CategoryComparisonSummary[] {
	const baseCategories = base.summary.byCategory ?? {};
	const compareCategories = compare.summary.byCategory ?? {};
	const allCategories = new Set([
		...Object.keys(baseCategories),
		...Object.keys(compareCategories),
	]);

	const results: CategoryComparisonSummary[] = [];
	for (const category of allCategories) {
		const baseRate = baseCategories[category]?.passRate;
		const compareRate = compareCategories[category]?.passRate;
		const delta = (compareRate ?? 0) - (baseRate ?? 0);

		let direction: ChangeDirection;
		if (baseRate === undefined) direction = "added";
		else if (compareRate === undefined) direction = "removed";
		else if (delta <= -threshold) direction = "regression";
		else if (delta >= threshold) direction = "improvement";
		else direction = "unchanged";

		results.push({
			category,
			basePassRate: baseRate,
			comparePassRate: compareRate,
			passRateDelta: delta,
			direction,
		});
	}

	return results;
}
