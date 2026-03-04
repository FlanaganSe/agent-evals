import type { GradeResult, GraderFn } from "./types.js";

function hasJudge(graders: readonly GraderFn[]): boolean {
	return graders.some((g) => "requiresJudge" in g && g.requiresJudge === true);
}

/**
 * Conjunction: all graders must pass.
 * Score = minimum score. Does NOT short-circuit (all results needed for reporting).
 */
export function all(graders: readonly GraderFn[]): GraderFn {
	const fn: GraderFn = async (output, expected, context) => {
		if (graders.length === 0) {
			return {
				pass: true,
				score: 1,
				reason: "all() with empty grader list (vacuous truth)",
				graderName: "all()",
			};
		}

		const results: GradeResult[] = [];
		const collectedNames: string[] = [];

		for (const grader of graders) {
			const result = await grader(output, expected, context);
			results.push(result);
			collectedNames.push(result.graderName);
		}

		const allPassed = results.every((r) => r.pass);
		const minScore = Math.min(...results.map((r) => r.score));
		const failures = results.filter((r) => !r.pass);

		const graderName = `all(${collectedNames.join(", ")})`;
		const reason = allPassed
			? `All ${results.length} graders passed`
			: failures.map((f) => `${f.graderName}: ${f.reason}`).join("; ");

		return { pass: allPassed, score: minScore, reason, graderName };
	};
	if (hasJudge(graders)) return Object.assign(fn, { requiresJudge: true as const });
	return fn;
}

/**
 * Disjunction: at least one grader must pass.
 * Score = maximum score. Does NOT short-circuit.
 */
export function any(graders: readonly GraderFn[]): GraderFn {
	const fn: GraderFn = async (output, expected, context) => {
		if (graders.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: "any() with empty grader list (no successes possible)",
				graderName: "any()",
			};
		}

		const results: GradeResult[] = [];
		const collectedNames: string[] = [];

		for (const grader of graders) {
			const result = await grader(output, expected, context);
			results.push(result);
			collectedNames.push(result.graderName);
		}

		const anyPassed = results.some((r) => r.pass);
		const maxScore = Math.max(...results.map((r) => r.score));
		const graderName = `any(${collectedNames.join(", ")})`;

		if (anyPassed) {
			const bestPasser = results.filter((r) => r.pass).sort((a, b) => b.score - a.score)[0];
			return {
				pass: true,
				score: maxScore,
				reason: bestPasser?.reason ?? "At least one grader passed",
				graderName,
			};
		}

		const reason = results.map((f) => `${f.graderName}: ${f.reason}`).join("; ");
		return { pass: false, score: maxScore, reason, graderName };
	};
	if (hasJudge(graders)) return Object.assign(fn, { requiresJudge: true as const });
	return fn;
}

/**
 * Negation: inverts a grader's result.
 */
export function not(grader: GraderFn): GraderFn {
	const fn: GraderFn = async (output, expected, context) => {
		const result = await grader(output, expected, context);
		return {
			pass: !result.pass,
			score: 1 - result.score,
			reason: `NOT: ${result.reason}`,
			graderName: `not(${result.graderName})`,
		};
	};
	if ("requiresJudge" in grader && grader.requiresJudge === true) {
		return Object.assign(fn, { requiresJudge: true as const });
	}
	return fn;
}
