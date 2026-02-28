import { describe, expect, it } from "vitest";
import type { InitAnswers } from "./types.js";
import { generateWorkflowTemplate } from "./workflow-template.js";

function makeAnswers(overrides?: Partial<InitAnswers>): InitAnswers {
	return {
		projectName: "test-project",
		evalDir: ".",
		framework: "custom",
		defaultMode: "replay",
		reporters: ["console"],
		generateWorkflow: true,
		generateAgentsMd: false,
		installHooks: false,
		hookManager: undefined,
		packageRunner: "pnpm",
		...overrides,
	};
}

describe("generateWorkflowTemplate", () => {
	it("generates JUnit reporter with output flag and report step", () => {
		const output = generateWorkflowTemplate(makeAnswers({ reporters: ["junit"] }));
		expect(output).toContain("--reporter=junit");
		expect(output).toContain("--output=results.xml");
		expect(output).toContain("mikepenz/action-junit-report@v4");
	});

	it("generates console reporter without flags", () => {
		const output = generateWorkflowTemplate(makeAnswers({ reporters: ["console"] }));
		expect(output).not.toContain("--reporter=");
		expect(output).not.toContain("mikepenz");
	});

	it("generates JSON reporter without JUnit step", () => {
		const output = generateWorkflowTemplate(makeAnswers({ reporters: ["json"] }));
		expect(output).toContain("--reporter=json");
		expect(output).not.toContain("mikepenz");
	});

	it("prefers JUnit when multiple reporters selected", () => {
		const output = generateWorkflowTemplate(
			makeAnswers({ reporters: ["console", "json", "junit"] }),
		);
		expect(output).toContain("--reporter=junit");
	});

	it("contains required GitHub Actions", () => {
		const output = generateWorkflowTemplate(makeAnswers());
		expect(output).toContain("actions/checkout@v4");
		expect(output).toContain("pnpm/action-setup@v4");
		expect(output).toContain("actions/setup-node@v4");
	});

	it("uses node version 22", () => {
		const output = generateWorkflowTemplate(makeAnswers());
		expect(output).toContain('"22"');
	});

	it("generates yarn setup when packageRunner is yarn", () => {
		const output = generateWorkflowTemplate(makeAnswers({ packageRunner: "yarn" }));
		expect(output).toContain("cache: yarn");
		expect(output).toContain("yarn install --frozen-lockfile");
	});

	it("generates bun setup when packageRunner is bun", () => {
		const output = generateWorkflowTemplate(makeAnswers({ packageRunner: "bun" }));
		expect(output).toContain("oven-sh/setup-bun@v2");
		expect(output).toContain("bun install --frozen-lockfile");
	});

	it("generates npm setup when packageRunner is npx", () => {
		const output = generateWorkflowTemplate(makeAnswers({ packageRunner: "npx" }));
		expect(output).toContain("npm ci");
		expect(output).toContain("npx agent-evals run");
	});
});
