import type { ResolvedSuite } from "../config/types.js";
import { loadRun } from "../storage/run-store.js";
import { ConfigError } from "./errors.js";

/**
 * Filters suites by comma-separated name list.
 */
export function filterSuites(
	suites: readonly ResolvedSuite[],
	suiteFilter: string | undefined,
): readonly ResolvedSuite[] {
	if (!suiteFilter) return suites;
	const names = new Set(suiteFilter.split(",").map((s) => s.trim()));
	const filtered = suites.filter((s) => names.has(s.name));

	if (filtered.length === 0) {
		throw new ConfigError(
			`No suites matched filter '${suiteFilter}'. Available suites: ${suites.map((s) => s.name).join(", ")}`,
		);
	}

	return filtered;
}

/**
 * Filters cases within a suite by comma-separated ID list.
 */
export function filterCases(suite: ResolvedSuite, caseFilter: string | undefined): ResolvedSuite {
	if (!caseFilter) return suite;
	const ids = new Set(caseFilter.split(",").map((s) => s.trim()));
	const filtered = suite.cases.filter((c) => ids.has(c.id));

	if (filtered.length === 0) {
		throw new ConfigError(
			`No cases matched filter '${caseFilter}' in suite '${suite.name}'. Available cases: ${suite.cases.map((c) => c.id).join(", ")}`,
		);
	}

	return { ...suite, cases: filtered };
}

/**
 * Filters cases to only those that failed in a previous run.
 */
export function filterCasesByIds(suite: ResolvedSuite, ids: ReadonlySet<string>): ResolvedSuite {
	const filtered = suite.cases.filter((c) => ids.has(c.id));
	if (filtered.length === 0) return { ...suite, cases: [] };
	return { ...suite, cases: filtered };
}

/**
 * Resolves failing case IDs from a previous run.
 */
export async function resolveFailingFilter(
	runId: string,
	runDir?: string,
): Promise<ReadonlySet<string>> {
	const previousRun = await loadRun(runId, runDir);
	const failingIds = previousRun.trials
		.filter((t) => t.status === "fail" || t.status === "error")
		.map((t) => t.caseId);
	return new Set(failingIds);
}

/**
 * Validates that --filter and --filter-failing are not both provided.
 */
export function validateFilterFlags(
	filter: string | undefined,
	filterFailing: string | undefined,
): void {
	if (filter && filterFailing) {
		throw new ConfigError("--filter and --filter-failing are mutually exclusive.");
	}
}
