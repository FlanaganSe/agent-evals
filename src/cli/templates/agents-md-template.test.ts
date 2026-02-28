import { describe, expect, it } from "vitest";
import { generateAgentsMdTemplate } from "./agents-md-template.js";
import type { InitAnswers } from "./types.js";

function makeAnswers(overrides?: Partial<InitAnswers>): InitAnswers {
	return {
		projectName: "test-project",
		evalDir: ".",
		framework: "custom",
		defaultMode: "replay",
		reporters: ["console"],
		generateWorkflow: false,
		generateAgentsMd: true,
		installHooks: false,
		hookManager: undefined,
		packageRunner: "pnpm",
		...overrides,
	};
}

describe("generateAgentsMdTemplate", () => {
	it("contains commands section with package runner", () => {
		const output = generateAgentsMdTemplate(makeAnswers());
		expect(output).toContain("## Commands");
		expect(output).toContain("pnpm agent-evals run");
		expect(output).toContain("pnpm test");
	});

	it("contains three-tier boundaries", () => {
		const output = generateAgentsMdTemplate(makeAnswers());
		expect(output).toContain("### Always OK");
		expect(output).toContain("### Ask First");
		expect(output).toContain("### Never");
	});

	it("is 150 lines or fewer", () => {
		const output = generateAgentsMdTemplate(makeAnswers());
		const lineCount = output.split("\n").length;
		expect(lineCount).toBeLessThanOrEqual(150);
	});

	it("contains project structure section", () => {
		const output = generateAgentsMdTemplate(makeAnswers());
		expect(output).toContain("## Project Structure");
		expect(output).toContain(".eval-fixtures/");
		expect(output).toContain(".eval-runs/");
	});

	it("contains no placeholder text", () => {
		const output = generateAgentsMdTemplate(makeAnswers());
		expect(output).not.toContain("TODO");
		expect(output).not.toContain("FIXME");
	});

	it("uses npx/npm when packageRunner is npx", () => {
		const output = generateAgentsMdTemplate(makeAnswers({ packageRunner: "npx" }));
		expect(output).toContain("npx agent-evals run");
		expect(output).toContain("npm test");
		expect(output).toContain("npm run typecheck");
	});

	it("includes eval dir in project structure when non-root", () => {
		const output = generateAgentsMdTemplate(makeAnswers({ evalDir: "evals" }));
		expect(output).toContain("evals/eval.config.ts");
		expect(output).toContain("evals/cases/");
	});
});
