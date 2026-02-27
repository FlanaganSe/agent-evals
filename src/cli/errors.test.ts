import { describe, expect, it } from "vitest";
import { ConfigError, EvalFailureError, getExitCode, RuntimeError } from "./errors.js";

describe("ConfigError", () => {
	it("has exitCode 2", () => {
		const err = new ConfigError("bad config");
		expect(err.exitCode).toBe(2);
		expect(err.name).toBe("ConfigError");
		expect(err.message).toBe("bad config");
	});
});

describe("RuntimeError", () => {
	it("has exitCode 3", () => {
		const err = new RuntimeError("network failure");
		expect(err.exitCode).toBe(3);
		expect(err.name).toBe("RuntimeError");
	});
});

describe("EvalFailureError", () => {
	it("has exitCode 1", () => {
		const err = new EvalFailureError("gate failed");
		expect(err.exitCode).toBe(1);
		expect(err.name).toBe("EvalFailureError");
	});
});

describe("getExitCode", () => {
	it("returns 2 for ConfigError", () => {
		expect(getExitCode(new ConfigError("x"))).toBe(2);
	});

	it("returns 3 for RuntimeError", () => {
		expect(getExitCode(new RuntimeError("x"))).toBe(3);
	});

	it("returns 1 for EvalFailureError", () => {
		expect(getExitCode(new EvalFailureError("x"))).toBe(1);
	});

	it("returns 3 for unknown Error", () => {
		expect(getExitCode(new Error("unknown"))).toBe(3);
	});

	it("returns 3 for non-Error values", () => {
		expect(getExitCode("string error")).toBe(3);
		expect(getExitCode(42)).toBe(3);
		expect(getExitCode(null)).toBe(3);
	});
});
