import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectHookManager } from "./hook-detection.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "hook-detect-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("detectHookManager", () => {
	it("detects Husky with dir + devDep (high confidence)", async () => {
		await mkdir(join(tempDir, ".husky"), { recursive: true });
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ devDependencies: { husky: "^9.0.0" } }),
		);
		const result = await detectHookManager(tempDir);
		expect(result).toBeDefined();
		expect(result?.manager).toBe("husky");
		expect(result?.confidence).toBe("high");
	});

	it("detects Husky with dir only (medium confidence)", async () => {
		await mkdir(join(tempDir, ".husky"), { recursive: true });
		await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
		const result = await detectHookManager(tempDir);
		expect(result).toBeDefined();
		expect(result?.manager).toBe("husky");
		expect(result?.confidence).toBe("medium");
	});

	it("detects Husky with devDep only (medium confidence)", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ devDependencies: { husky: "^9.0.0" } }),
		);
		const result = await detectHookManager(tempDir);
		expect(result).toBeDefined();
		expect(result?.manager).toBe("husky");
		expect(result?.confidence).toBe("medium");
	});

	it("detects Lefthook from config file", async () => {
		await writeFile(join(tempDir, "lefthook.yml"), "pre-push:\n  commands: {}\n");
		await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
		const result = await detectHookManager(tempDir);
		expect(result).toBeDefined();
		expect(result?.manager).toBe("lefthook");
		expect(result?.confidence).toBe("high");
	});

	it("detects simple-git-hooks from package.json", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ "simple-git-hooks": { "pre-push": "npm test" } }),
		);
		const result = await detectHookManager(tempDir);
		expect(result).toBeDefined();
		expect(result?.manager).toBe("simple-git-hooks");
		expect(result?.confidence).toBe("high");
	});

	it("returns undefined when no manager detected", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({}));
		const result = await detectHookManager(tempDir);
		expect(result).toBeUndefined();
	});

	it("returns undefined for empty directory", async () => {
		const result = await detectHookManager(tempDir);
		expect(result).toBeUndefined();
	});
});
