import type { GraderFn } from "../types.js";

/** Matching mode for `toolArgsMatch`: `"exact"` requires deep equality, `"subset"` checks that expected keys exist with matching values, `"contains"` is like subset but string values use `.includes()`. */
export type ToolArgsMatchMode = "exact" | "subset" | "contains";

/**
 * Checks that a tool call's arguments match the expected args.
 *
 * Modes:
 * - exact: deep equality of args objects
 * - subset: every key in expectedArgs exists in actual args with matching value
 * - contains: like subset but string values use .includes() (for NL args)
 */
export function toolArgsMatch(
	toolName: string,
	expectedArgs: Record<string, unknown>,
	mode: ToolArgsMatchMode = "subset",
): GraderFn {
	const graderName = `toolArgsMatch(${toolName}|${mode})`;

	return async (output) => {
		if (!output.toolCalls || output.toolCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: "No tool calls in output",
				graderName,
			};
		}

		const call = output.toolCalls.find((tc) => tc.name === toolName);
		if (!call) {
			return {
				pass: false,
				score: 0,
				reason: `Tool "${toolName}" was not called`,
				graderName,
			};
		}

		const actualArgs = (call.args ?? {}) as Record<string, unknown>;
		const result = matchArgs(actualArgs, expectedArgs, mode);

		return {
			pass: result.pass,
			score: result.pass ? 1 : 0,
			reason: result.pass
				? `Tool "${toolName}" args match (${mode})`
				: `Tool "${toolName}" args mismatch (${mode}): ${result.reason}`,
			graderName,
		};
	};
}

function matchArgs(
	actual: Record<string, unknown>,
	expected: Record<string, unknown>,
	mode: ToolArgsMatchMode,
): { readonly pass: boolean; readonly reason: string } {
	switch (mode) {
		case "exact": {
			const actualKeys = Object.keys(actual).sort();
			const expectedKeys = Object.keys(expected).sort();

			if (actualKeys.length !== expectedKeys.length) {
				return {
					pass: false,
					reason: `Key count mismatch: ${actualKeys.length} vs ${expectedKeys.length}`,
				};
			}

			for (const key of expectedKeys) {
				if (!deepEqual(actual[key], expected[key])) {
					return {
						pass: false,
						reason: `Key "${key}": expected ${safeStringify(expected[key])}, got ${safeStringify(actual[key])}`,
					};
				}
			}
			return { pass: true, reason: "" };
		}

		case "subset": {
			for (const key of Object.keys(expected)) {
				if (!(key in actual)) {
					return {
						pass: false,
						reason: `Missing key "${key}"`,
					};
				}
				if (!deepEqual(actual[key], expected[key])) {
					return {
						pass: false,
						reason: `Key "${key}": expected ${safeStringify(expected[key])}, got ${safeStringify(actual[key])}`,
					};
				}
			}
			return { pass: true, reason: "" };
		}

		case "contains": {
			for (const key of Object.keys(expected)) {
				if (!(key in actual)) {
					return { pass: false, reason: `Missing key "${key}"` };
				}

				const actualVal = actual[key];
				const expectedVal = expected[key];

				if (typeof actualVal === "string" && typeof expectedVal === "string") {
					if (!actualVal.includes(expectedVal)) {
						return {
							pass: false,
							reason: `Key "${key}": "${actualVal}" does not contain "${expectedVal}"`,
						};
					}
				} else if (!deepEqual(actualVal, expectedVal)) {
					return {
						pass: false,
						reason: `Key "${key}": expected ${safeStringify(expectedVal)}, got ${safeStringify(actualVal)}`,
					};
				}
			}
			return { pass: true, reason: "" };
		}
	}
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return "[circular]";
	}
}

function deepEqual(
	a: unknown,
	b: unknown,
	seenA: WeakSet<object> = new WeakSet(),
	seenB: WeakSet<object> = new WeakSet(),
): boolean {
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		if (seenA.has(a) || seenB.has(b)) return false;
		seenA.add(a);
		seenB.add(b);
		return a.every((val, i) => deepEqual(val, b[i], seenA, seenB));
	}

	if (typeof a === "object" && typeof b === "object") {
		if (seenA.has(a as object) || seenB.has(b as object)) return false;
		seenA.add(a as object);
		seenB.add(b as object);
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj).sort();
		const bKeys = Object.keys(bObj).sort();
		if (aKeys.length !== bKeys.length) return false;
		return aKeys.every((key) => deepEqual(aObj[key], bObj[key], seenA, seenB));
	}

	return false;
}
