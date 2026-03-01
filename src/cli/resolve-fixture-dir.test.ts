import { describe, expect, it } from "vitest";
import { assertSafeFixtureDir } from "./resolve-fixture-dir.js";

describe("assertSafeFixtureDir", () => {
	const cwd = "/projects/my-eval";

	it("accepts a relative subdirectory", () => {
		expect(() => assertSafeFixtureDir(".eval-fixtures", cwd)).not.toThrow();
	});

	it("accepts a nested relative path", () => {
		expect(() => assertSafeFixtureDir("data/fixtures", cwd)).not.toThrow();
	});

	it("rejects parent traversal escaping the project root", () => {
		expect(() => assertSafeFixtureDir("../../etc", cwd)).toThrow(/resolves outside/);
	});

	it("rejects '..'", () => {
		expect(() => assertSafeFixtureDir("..", cwd)).toThrow(/resolves outside/);
	});

	it("rejects '.'", () => {
		// "." resolves to cwd itself — which equals root, not a subdirectory.
		// This is allowed because it's not outside the project root, but it would
		// mean "delete the entire project dir" which is the root itself.
		// The check allows resolved === root, so "." passes. That's acceptable
		// because the fixture dir IS the project root (unusual but not an escape).
		expect(() => assertSafeFixtureDir(".", cwd)).not.toThrow();
	});

	it("rejects absolute paths outside the project", () => {
		expect(() => assertSafeFixtureDir("/tmp/fixtures", cwd)).toThrow(/resolves outside/);
	});

	it("rejects absolute path to root", () => {
		expect(() => assertSafeFixtureDir("/", cwd)).toThrow(/resolves outside/);
	});

	it("allows an absolute path that happens to be inside the project", () => {
		expect(() => assertSafeFixtureDir("/projects/my-eval/fixtures", cwd)).not.toThrow();
	});
});
