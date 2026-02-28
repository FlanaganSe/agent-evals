import type { AgentFramework, InitAnswers, ReporterChoice } from "./types.js";

/**
 * Generate an eval.config.ts file content.
 * Pure function — no I/O.
 */
export function generateConfigTemplate(answers: InitAnswers): string {
	const lines: string[] = [];

	lines.push('import { defineConfig } from "agent-evals";');
	lines.push("");
	lines.push("export default defineConfig({");
	lines.push("  suites: [");
	lines.push("    {");
	lines.push('      name: "smoke",');
	lines.push("      target: async (input) => {");
	lines.push(generateTargetStub(answers.framework));
	lines.push("      },");
	lines.push(`      cases: ${JSON.stringify(generateStarterCasesPath(answers.evalDir))},`);
	lines.push("      defaultGraders: [");
	lines.push("        // Add graders here. Examples:");
	lines.push('        // contains("expected substring"),');
	lines.push('        // toolCalled("search"),');
	lines.push("      ],");
	lines.push("    },");
	lines.push("  ],");

	if (answers.defaultMode !== "replay") {
		lines.push(`  run: { defaultMode: "${answers.defaultMode}" },`);
	}

	if (answers.reporters.length > 0 && !isDefaultReporters(answers.reporters)) {
		const reporterEntries = answers.reporters.map((r) => `"${r}"`).join(", ");
		lines.push(`  reporters: [${reporterEntries}],`);
	}

	lines.push("});");
	lines.push("");

	return lines.join("\n");
}

function generateTargetStub(framework: AgentFramework): string {
	switch (framework) {
		case "vercel-ai-sdk":
			return [
				"        // Replace with your Vercel AI SDK agent call",
				'        // import { generateText } from "ai";',
				"        // const result = await generateText({ model, prompt: input.prompt });",
				'        return { text: "TODO: wire up your agent", latencyMs: 0 };',
			].join("\n");
		case "langchain":
			return [
				"        // Replace with your LangChain agent call",
				"        // const result = await agent.invoke({ input: input.prompt });",
				'        return { text: "TODO: wire up your agent", latencyMs: 0 };',
			].join("\n");
		case "mastra":
			return [
				"        // Replace with your Mastra agent call",
				"        // const result = await agent.generate(input.prompt);",
				'        return { text: "TODO: wire up your agent", latencyMs: 0 };',
			].join("\n");
		default:
			return [
				"        // Replace with your agent/LLM call",
				'        return { text: "TODO: wire up your agent", latencyMs: 0 };',
			].join("\n");
	}
}

function generateStarterCasesPath(evalDir: string): string {
	return evalDir === "." ? "./cases/smoke.jsonl" : `./${evalDir}/cases/smoke.jsonl`;
}

function isDefaultReporters(reporters: readonly ReporterChoice[]): boolean {
	return reporters.length === 1 && reporters[0] === "console";
}
