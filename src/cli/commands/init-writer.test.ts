import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InitAnswers } from "../templates/types.js";
import { writeInitFiles } from "./init-writer.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "init-writer-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

function makeAnswers(overrides?: Partial<InitAnswers>): InitAnswers {
	return {
		projectName: "test-project",
		evalDir: ".",
		framework: "custom",
		defaultMode: "replay",
		reporters: ["console"],
		generateWorkflow: false,
		generateAgentsMd: false,
		installHooks: false,
		hookManager: undefined,
		packageRunner: "pnpm",
		...overrides,
	};
}

describe("writeInitFiles", () => {
	it("creates config file", async () => {
		await writeInitFiles(tempDir, makeAnswers());
		const content = await readFile(join(tempDir, "eval.config.ts"), "utf-8");
		expect(content).toContain("defineConfig");
	});

	it("creates cases directory and file", async () => {
		await writeInitFiles(tempDir, makeAnswers());
		const content = await readFile(join(tempDir, "cases", "smoke.jsonl"), "utf-8");
		expect(content).toContain("H01");
	});

	it("creates .eval-fixtures/.gitkeep", async () => {
		await writeInitFiles(tempDir, makeAnswers());
		await expect(access(join(tempDir, ".eval-fixtures", ".gitkeep"))).resolves.toBeUndefined();
	});

	it("creates workflow when selected", async () => {
		await writeInitFiles(tempDir, makeAnswers({ generateWorkflow: true }));
		const content = await readFile(join(tempDir, ".github", "workflows", "evals.yml"), "utf-8");
		expect(content).toContain("agent-evals run");
	});

	it("creates AGENTS.md when selected", async () => {
		await writeInitFiles(tempDir, makeAnswers({ generateAgentsMd: true }));
		const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
		expect(content).toContain("## Commands");
	});

	it("skips workflow when not selected", async () => {
		await writeInitFiles(tempDir, makeAnswers({ generateWorkflow: false }));
		await expect(access(join(tempDir, ".github"))).rejects.toThrow();
	});

	it("skips AGENTS.md when not selected", async () => {
		await writeInitFiles(tempDir, makeAnswers({ generateAgentsMd: false }));
		await expect(access(join(tempDir, "AGENTS.md"))).rejects.toThrow();
	});

	it("skips existing files without overwrite", async () => {
		await writeFile(join(tempDir, "eval.config.ts"), "existing content", "utf-8");
		const result = await writeInitFiles(tempDir, makeAnswers());
		expect(result.filesSkipped.some((f) => f.includes("eval.config.ts"))).toBe(true);
		const content = await readFile(join(tempDir, "eval.config.ts"), "utf-8");
		expect(content).toBe("existing content");
	});

	it("overwrites existing files with overwrite=true", async () => {
		await writeFile(join(tempDir, "eval.config.ts"), "old content", "utf-8");
		const result = await writeInitFiles(tempDir, makeAnswers(), { overwrite: true });
		expect(result.filesCreated.some((f) => f.includes("eval.config.ts"))).toBe(true);
		const content = await readFile(join(tempDir, "eval.config.ts"), "utf-8");
		expect(content).toContain("defineConfig");
	});

	it("reports created and skipped files", async () => {
		const result = await writeInitFiles(tempDir, makeAnswers({ generateAgentsMd: true }));
		expect(result.filesCreated.length).toBeGreaterThan(0);
		expect(Array.isArray(result.filesSkipped)).toBe(true);
	});

	it("uses evalDir for cases path when not root", async () => {
		await writeInitFiles(tempDir, makeAnswers({ evalDir: "evals" }));
		const content = await readFile(join(tempDir, "evals", "cases", "smoke.jsonl"), "utf-8");
		expect(content).toContain("H01");
	});
});
