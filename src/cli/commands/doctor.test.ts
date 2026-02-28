import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAgentsMd, checkGitHooks, checkNodeVersion } from "./doctor.js";

describe("checkNodeVersion", () => {
	it("passes for Node >= 20", () => {
		const result = checkNodeVersion();
		// We're running on Node 20+ in this project
		expect(result.status).toBe("pass");
		expect(result.message).toContain("Node.js");
	});
});

describe("checkGitHooks", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "doctor-hooks-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("passes when hook manager is detected", async () => {
		await mkdir(join(tempDir, ".husky"), { recursive: true });
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ devDependencies: { husky: "^9.0.0" } }),
		);
		const result = await checkGitHooks(tempDir);
		expect(result.status).toBe("pass");
		expect(result.message).toContain("husky");
	});

	it("warns when no hook manager detected", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
		const result = await checkGitHooks(tempDir);
		expect(result.status).toBe("warn");
		expect(result.message).toContain("install-hooks");
	});
});

describe("checkAgentsMd", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "doctor-agents-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("passes when AGENTS.md exists", async () => {
		await writeFile(join(tempDir, "AGENTS.md"), "# AGENTS.md\n");
		const result = await checkAgentsMd(tempDir);
		expect(result.status).toBe("pass");
		expect(result.message).toContain("AGENTS.md found");
	});

	it("warns when no AGENTS.md found", async () => {
		const result = await checkAgentsMd(tempDir);
		expect(result.status).toBe("warn");
		expect(result.message).toContain("agent-evals init");
	});
});
