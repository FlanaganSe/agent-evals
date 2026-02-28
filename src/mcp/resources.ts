import { z } from "zod";
import { CaseSchema, EvalConfigSchema } from "../config/schema.js";
import { BUILT_IN_GRADERS } from "../graders/registry.js";

// ─── Schema generators ──────────────────────────────────────────────────────

let cachedConfigSchema: string | undefined;
let cachedCaseSchema: string | undefined;
let cachedGraderReference: string | undefined;

export function generateConfigSchema(): string {
	if (!cachedConfigSchema) {
		const schema = z.toJSONSchema(EvalConfigSchema, {
			target: "draft-2020-12",
			unrepresentable: "any",
		});
		cachedConfigSchema = JSON.stringify(schema, null, 2);
	}
	return cachedConfigSchema;
}

export function generateCaseSchema(): string {
	if (!cachedCaseSchema) {
		const schema = z.toJSONSchema(CaseSchema, {
			target: "draft-2020-12",
			unrepresentable: "any",
		});
		cachedCaseSchema = JSON.stringify(schema, null, 2);
	}
	return cachedCaseSchema;
}

export function generateGraderReference(): string {
	if (!cachedGraderReference) {
		const sections = BUILT_IN_GRADERS.map((g) => {
			const params =
				g.parameters.length > 0
					? g.parameters
							.map(
								(p) =>
									`  - \`${p.name}\` (${p.type}${p.required ? ", required" : ""})${p.default !== undefined ? ` — default: ${JSON.stringify(p.default)}` : ""}: ${p.description}`,
							)
							.join("\n")
					: "  No parameters.";

			const lines = [
				`### ${g.name}`,
				"",
				g.description,
				"",
				`**Tier**: ${g.tier} | **Category**: ${g.category}`,
				"",
				"**Parameters**:",
				params,
				"",
				`**Example**: \`${g.example}\``,
			];

			if (g.notes) {
				lines.push("", `**Note**: ${g.notes}`);
			}

			return lines.join("\n");
		});

		cachedGraderReference = `# Grader Reference\n\n${sections.join("\n\n---\n\n")}`;
	}
	return cachedGraderReference;
}

// ─── Resource registration ───────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: McpServer type comes from optional peer dep
export function registerResources(server: any): void {
	const configSchema = generateConfigSchema();
	const caseSchema = generateCaseSchema();
	const graderRef = generateGraderReference();

	server.registerResource(
		"config-schema",
		"eval://schema/config",
		{
			title: "Eval Config JSON Schema",
			description:
				"JSON Schema for the serializable portion of eval.config.ts. Covers suites, cases, gates, and run settings. Functions (target, judge, graders) cannot be represented in JSON Schema — use describe-config for runtime config details and list-graders for available graders.",
			mimeType: "application/json",
		},
		async (uri: URL) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "application/json",
					text: configSchema,
				},
			],
		}),
	);

	server.registerResource(
		"case-schema",
		"eval://schema/case",
		{
			title: "Eval Case JSON Schema",
			description:
				"JSON Schema for an individual eval case. Use this when writing JSONL test case files. Each line in a .jsonl case file should conform to this schema.",
			mimeType: "application/json",
		},
		async (uri: URL) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "application/json",
					text: caseSchema,
				},
			],
		}),
	);

	server.registerResource(
		"grader-reference",
		"eval://reference/graders",
		{
			title: "Grader Reference",
			description:
				"Complete reference documentation for all built-in graders. Includes parameters, defaults, and usage examples. For structured grader data, use the list-graders tool instead.",
			mimeType: "text/markdown",
		},
		async (uri: URL) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "text/markdown",
					text: graderRef,
				},
			],
		}),
	);
}
