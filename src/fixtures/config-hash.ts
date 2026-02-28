import { createHash } from "node:crypto";
import type { ResolvedSuite } from "../config/types.js";

/**
 * Computes a config hash for fixture invalidation.
 *
 * Intentionally narrow: only suiteName and targetVersion are included.
 * The user controls invalidation by bumping targetVersion when agent logic changes.
 * Function source code, grader configs, and gate thresholds are excluded —
 * formatting/refactoring changes must NOT invalidate fixtures.
 */
export function computeFixtureConfigHash(suite: ResolvedSuite): string {
	const hashInput = JSON.stringify(
		sortKeysShallow({
			suiteName: suite.name,
			targetVersion: suite.targetVersion,
		}),
	);
	return createHash("sha256").update(hashInput).digest("hex").slice(0, 16);
}

function sortKeysShallow(obj: Record<string, unknown>): Record<string, unknown> {
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj).sort()) {
		sorted[key] = obj[key];
	}
	return sorted;
}
