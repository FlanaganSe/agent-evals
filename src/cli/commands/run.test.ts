import { describe, expect, it } from "vitest";
import type { ResolvedSuite } from "../../config/types.js";
import { ConfigError } from "../errors.js";
import { buildRunOptions, parseIntArg } from "./run.js";

const mockTarget = async () => ({ text: "ok", latencyMs: 0 });
const mockSignal = new AbortController().signal;

function makeSuite(overrides?: Partial<ResolvedSuite>): ResolvedSuite {
	return {
		name: "smoke",
		target: mockTarget,
		cases: [{ id: "H01", input: {} }],
		...overrides,
	};
}

describe("parseIntArg", () => {
	it("returns undefined for undefined input", () => {
		expect(parseIntArg(undefined, "trials")).toBeUndefined();
	});

	it("parses valid positive integers", () => {
		expect(parseIntArg("5", "trials")).toBe(5);
		expect(parseIntArg("1", "concurrency")).toBe(1);
	});

	it("throws ConfigError for non-integer values", () => {
		expect(() => parseIntArg("abc", "trials")).toThrow(ConfigError);
		expect(() => parseIntArg("1.5", "trials")).toThrow(ConfigError);
	});

	it("throws ConfigError for zero", () => {
		expect(() => parseIntArg("0", "trials")).toThrow(ConfigError);
	});

	it("throws ConfigError for negative values", () => {
		expect(() => parseIntArg("-1", "trials")).toThrow(ConfigError);
	});
});

describe("buildRunOptions", () => {
	const configDefaults = { defaultMode: "replay" as const, timeoutMs: 30_000 };

	it("uses CLI mode when provided", () => {
		const opts = buildRunOptions({ mode: "live" }, configDefaults, makeSuite(), mockSignal);
		expect(opts.mode).toBe("live");
	});

	it("falls back to config default mode", () => {
		const opts = buildRunOptions({}, configDefaults, makeSuite(), mockSignal);
		expect(opts.mode).toBe("replay");
	});

	it("uses config timeoutMs", () => {
		const opts = buildRunOptions(
			{},
			{ ...configDefaults, timeoutMs: 60_000 },
			makeSuite(),
			mockSignal,
		);
		expect(opts.timeoutMs).toBe(60_000);
	});

	it("CLI concurrency overrides suite concurrency", () => {
		const opts = buildRunOptions(
			{ concurrency: "3" },
			configDefaults,
			makeSuite({ concurrency: 10 }),
			mockSignal,
		);
		expect(opts.concurrency).toBe(3);
	});

	it("falls back to suite concurrency", () => {
		const opts = buildRunOptions({}, configDefaults, makeSuite({ concurrency: 5 }), mockSignal);
		expect(opts.concurrency).toBe(5);
	});

	it("passes signal through", () => {
		const opts = buildRunOptions({}, configDefaults, makeSuite(), mockSignal);
		expect(opts.signal).toBe(mockSignal);
	});

	it("parses trials from string", () => {
		const opts = buildRunOptions({ trials: "5" }, configDefaults, makeSuite(), mockSignal);
		expect(opts.trials).toBe(5);
	});

	it("passes rate limiter through", () => {
		const mockLimiter = {
			acquire: async () => {},
			dispose: () => {},
		};
		const opts = buildRunOptions({}, configDefaults, makeSuite(), mockSignal, mockLimiter);
		expect(opts.rateLimiter).toBe(mockLimiter);
	});
});
