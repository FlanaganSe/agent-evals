import { describe, expect, it } from "vitest";
import { generateConfigTemplate } from "./config-template.js";
import type { InitAnswers } from "./types.js";

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

describe("generateConfigTemplate", () => {
	it("generates valid TypeScript with defineConfig import", () => {
		const output = generateConfigTemplate(makeAnswers());
		expect(output).toContain('import { defineConfig } from "agent-evals"');
		expect(output).toContain("export default defineConfig(");
	});

	it("generates Vercel AI SDK stub", () => {
		const output = generateConfigTemplate(makeAnswers({ framework: "vercel-ai-sdk" }));
		expect(output).toContain("Vercel AI SDK");
		expect(output).toContain("generateText");
	});

	it("generates LangChain stub", () => {
		const output = generateConfigTemplate(makeAnswers({ framework: "langchain" }));
		expect(output).toContain("LangChain");
		expect(output).toContain("agent.invoke");
	});

	it("generates Mastra stub", () => {
		const output = generateConfigTemplate(makeAnswers({ framework: "mastra" }));
		expect(output).toContain("Mastra");
		expect(output).toContain("agent.generate");
	});

	it("generates custom stub", () => {
		const output = generateConfigTemplate(makeAnswers({ framework: "custom" }));
		expect(output).toContain("Replace with your agent/LLM call");
	});

	it("generates non-default reporters", () => {
		const output = generateConfigTemplate(makeAnswers({ reporters: ["json", "junit"] }));
		expect(output).toContain('reporters: ["json", "junit"]');
	});

	it("omits reporters for default (console only)", () => {
		const output = generateConfigTemplate(makeAnswers({ reporters: ["console"] }));
		expect(output).not.toContain("reporters:");
	});

	it("generates non-default mode", () => {
		const output = generateConfigTemplate(makeAnswers({ defaultMode: "live" }));
		expect(output).toContain('run: { defaultMode: "live" }');
	});

	it("omits run field for default mode (replay)", () => {
		const output = generateConfigTemplate(makeAnswers({ defaultMode: "replay" }));
		expect(output).not.toContain("defaultMode");
	});

	it("uses evalDir in cases path", () => {
		const output = generateConfigTemplate(makeAnswers({ evalDir: "evals" }));
		expect(output).toContain("./evals/cases/smoke.jsonl");
	});

	it("uses root cases path when evalDir is .", () => {
		const output = generateConfigTemplate(makeAnswers({ evalDir: "." }));
		expect(output).toContain("./cases/smoke.jsonl");
	});
});
