import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installPrePushHook } from "./hook-installer.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "hook-install-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("installPrePushHook — husky", () => {
	it("creates .husky/pre-push", async () => {
		const result = await installPrePushHook(tempDir, "husky");
		expect(result.success).toBe(true);
		const content = await readFile(join(tempDir, ".husky", "pre-push"), "utf-8");
		expect(content).toContain("agent-evals run");
	});

	it("appends to existing hook", async () => {
		await mkdir(join(tempDir, ".husky"), { recursive: true });
		await writeFile(join(tempDir, ".husky", "pre-push"), "#!/bin/sh\necho existing\n");
		const result = await installPrePushHook(tempDir, "husky");
		expect(result.success).toBe(true);
		const content = await readFile(join(tempDir, ".husky", "pre-push"), "utf-8");
		expect(content).toContain("echo existing");
		expect(content).toContain("agent-evals run");
	});

	it("is idempotent", async () => {
		await installPrePushHook(tempDir, "husky");
		await installPrePushHook(tempDir, "husky");
		const content = await readFile(join(tempDir, ".husky", "pre-push"), "utf-8");
		const matches = content.match(/agent-evals run/g);
		expect(matches).toHaveLength(1);
	});
});

describe("installPrePushHook — lefthook", () => {
	it("adds pre-push to lefthook.yml", async () => {
		await writeFile(join(tempDir, "lefthook.yml"), "");
		const result = await installPrePushHook(tempDir, "lefthook");
		expect(result.success).toBe(true);
		const content = await readFile(join(tempDir, "lefthook.yml"), "utf-8");
		expect(content).toContain("agent-evals run");
	});

	it("creates lefthook.yml if missing", async () => {
		const result = await installPrePushHook(tempDir, "lefthook");
		expect(result.success).toBe(true);
		const content = await readFile(join(tempDir, "lefthook.yml"), "utf-8");
		expect(content).toContain("agent-evals run");
	});

	it("is idempotent", async () => {
		await installPrePushHook(tempDir, "lefthook");
		await installPrePushHook(tempDir, "lefthook");
		const content = await readFile(join(tempDir, "lefthook.yml"), "utf-8");
		const matches = content.match(/agent-evals run/g);
		expect(matches).toHaveLength(1);
	});
});

describe("installPrePushHook — simple-git-hooks", () => {
	it("adds to package.json", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
		const result = await installPrePushHook(tempDir, "simple-git-hooks");
		expect(result.success).toBe(true);
		const content = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8"));
		expect(content["simple-git-hooks"]["pre-push"]).toContain("agent-evals run");
	});

	it("chains with existing hook", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ name: "test", "simple-git-hooks": { "pre-push": "npm test" } }, null, 2),
		);
		const result = await installPrePushHook(tempDir, "simple-git-hooks");
		expect(result.success).toBe(true);
		const content = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8"));
		expect(content["simple-git-hooks"]["pre-push"]).toContain("npm test");
		expect(content["simple-git-hooks"]["pre-push"]).toContain("&&");
		expect(content["simple-git-hooks"]["pre-push"]).toContain("agent-evals run");
	});

	it("is idempotent", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
		await installPrePushHook(tempDir, "simple-git-hooks");
		await installPrePushHook(tempDir, "simple-git-hooks");
		const content = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8"));
		const matches = content["simple-git-hooks"]["pre-push"].match(/agent-evals run/g);
		expect(matches).toHaveLength(1);
	});

	it("fails without package.json", async () => {
		const result = await installPrePushHook(tempDir, "simple-git-hooks");
		expect(result.success).toBe(false);
	});
});

describe("installPrePushHook — raw git hook", () => {
	it("creates .git/hooks/pre-push", async () => {
		await mkdir(join(tempDir, ".git"), { recursive: true });
		const result = await installPrePushHook(tempDir, "none");
		expect(result.success).toBe(true);
		const content = await readFile(join(tempDir, ".git", "hooks", "pre-push"), "utf-8");
		expect(content).toContain("#!/bin/sh");
		expect(content).toContain("agent-evals run");
	});

	it("appends to existing hook", async () => {
		const hooksDir = join(tempDir, ".git", "hooks");
		await mkdir(hooksDir, { recursive: true });
		await writeFile(join(hooksDir, "pre-push"), "#!/bin/sh\necho existing\n");
		const result = await installPrePushHook(tempDir, "none");
		expect(result.success).toBe(true);
		const content = await readFile(join(hooksDir, "pre-push"), "utf-8");
		expect(content).toContain("echo existing");
		expect(content).toContain("agent-evals run");
	});

	it("sets executable permission", async () => {
		await mkdir(join(tempDir, ".git"), { recursive: true });
		await installPrePushHook(tempDir, "none");
		const stats = await stat(join(tempDir, ".git", "hooks", "pre-push"));
		// Check that owner execute bit is set
		expect(stats.mode & 0o100).toBe(0o100);
	});

	it("is idempotent", async () => {
		await mkdir(join(tempDir, ".git"), { recursive: true });
		await installPrePushHook(tempDir, "none");
		await installPrePushHook(tempDir, "none");
		const content = await readFile(join(tempDir, ".git", "hooks", "pre-push"), "utf-8");
		const matches = content.match(/agent-evals run/g);
		expect(matches).toHaveLength(1);
	});
});
