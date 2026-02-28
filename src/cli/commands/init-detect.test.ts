import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	detectFramework,
	detectPackageRunner,
	detectProjectName,
	findExistingConfig,
	hasGitHubDir,
} from "./init-detect.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "init-detect-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("detectFramework", () => {
	it("detects Vercel AI SDK from 'ai' dependency", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ dependencies: { ai: "^3.0.0" } }),
		);
		expect(await detectFramework(tempDir)).toBe("vercel-ai-sdk");
	});

	it("detects Vercel AI SDK from '@ai-sdk/openai' dependency", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ devDependencies: { "@ai-sdk/openai": "^1.0.0" } }),
		);
		expect(await detectFramework(tempDir)).toBe("vercel-ai-sdk");
	});

	it("detects LangChain from 'langchain' dependency", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ dependencies: { langchain: "^0.3.0" } }),
		);
		expect(await detectFramework(tempDir)).toBe("langchain");
	});

	it("detects LangChain from '@langchain/core' dependency", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ dependencies: { "@langchain/core": "^0.3.0" } }),
		);
		expect(await detectFramework(tempDir)).toBe("langchain");
	});

	it("detects Mastra from '@mastra/core' dependency", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ dependencies: { "@mastra/core": "^1.0.0" } }),
		);
		expect(await detectFramework(tempDir)).toBe("mastra");
	});

	it("returns 'custom' for unknown framework", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ dependencies: { express: "^4.0.0" } }),
		);
		expect(await detectFramework(tempDir)).toBe("custom");
	});

	it("returns 'custom' when no package.json exists", async () => {
		expect(await detectFramework(tempDir)).toBe("custom");
	});
});

describe("detectProjectName", () => {
	it("reads name from package.json", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "my-project" }));
		expect(await detectProjectName(tempDir)).toBe("my-project");
	});

	it("falls back to directory basename", async () => {
		const name = await detectProjectName(tempDir);
		// tmpdir names are random, just verify it returns something
		expect(name.length).toBeGreaterThan(0);
	});
});

describe("findExistingConfig", () => {
	it("finds eval.config.ts", async () => {
		await writeFile(join(tempDir, "eval.config.ts"), "");
		expect(await findExistingConfig(tempDir)).toBe("eval.config.ts");
	});

	it("finds eval.config.js", async () => {
		await writeFile(join(tempDir, "eval.config.js"), "");
		expect(await findExistingConfig(tempDir)).toBe("eval.config.js");
	});

	it("returns undefined when no config exists", async () => {
		expect(await findExistingConfig(tempDir)).toBeUndefined();
	});
});

describe("hasGitHubDir", () => {
	it("returns true when .github/ exists", async () => {
		await mkdir(join(tempDir, ".github"), { recursive: true });
		expect(await hasGitHubDir(tempDir)).toBe(true);
	});

	it("returns false when .github/ does not exist", async () => {
		expect(await hasGitHubDir(tempDir)).toBe(false);
	});
});

describe("detectPackageRunner", () => {
	it("detects pnpm from lockfile", async () => {
		await writeFile(join(tempDir, "pnpm-lock.yaml"), "");
		expect(await detectPackageRunner(tempDir)).toBe("pnpm");
	});

	it("detects yarn from lockfile", async () => {
		await writeFile(join(tempDir, "yarn.lock"), "");
		expect(await detectPackageRunner(tempDir)).toBe("yarn");
	});

	it("detects bun from lockfile", async () => {
		await writeFile(join(tempDir, "bun.lockb"), "");
		expect(await detectPackageRunner(tempDir)).toBe("bun");
	});

	it("falls back to npx", async () => {
		expect(await detectPackageRunner(tempDir)).toBe("npx");
	});
});
