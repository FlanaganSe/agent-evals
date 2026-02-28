import type { EvalPlugin } from "../plugin/types.js";

// ─── Descriptor types ────────────────────────────────────────────────────────

export interface GraderParameter {
	readonly name: string;
	/** Conceptual type: "string" | "number" | "boolean" | "RegExp" | "ZodType" | "string[]" | "Record<string, unknown>" */
	readonly type: string;
	readonly description: string;
	readonly required: boolean;
	readonly default?: unknown;
}

export interface GraderDescriptor {
	readonly name: string;
	readonly description: string;
	readonly tier: "deterministic" | "llm" | "composition";
	readonly category: "text" | "tool-call" | "metric" | "safety" | "llm-judge" | "composition";
	readonly parameters: readonly GraderParameter[];
	readonly example: string;
	readonly notes?: string | undefined;
}

// ─── Built-in grader descriptors ─────────────────────────────────────────────

export const BUILT_IN_GRADERS: readonly GraderDescriptor[] = [
	// ── Text graders ──
	{
		name: "contains",
		description: "Checks if output text contains a substring. Case-insensitive by default.",
		tier: "deterministic",
		category: "text",
		parameters: [
			{ name: "substring", type: "string", description: "Text to search for", required: true },
			{
				name: "options.caseSensitive",
				type: "boolean",
				description: "Enable case-sensitive matching",
				required: false,
				default: false,
			},
		],
		example: 'contains("Paris")',
	},
	{
		name: "notContains",
		description:
			"Checks that output text does NOT contain a substring. Case-insensitive by default.",
		tier: "deterministic",
		category: "text",
		parameters: [
			{
				name: "substring",
				type: "string",
				description: "Text that must not appear",
				required: true,
			},
			{
				name: "options.caseSensitive",
				type: "boolean",
				description: "Enable case-sensitive matching",
				required: false,
				default: false,
			},
		],
		example: 'notContains("sorry")',
	},
	{
		name: "exactMatch",
		description:
			"Checks that output text exactly equals the expected string. Trims whitespace by default.",
		tier: "deterministic",
		category: "text",
		parameters: [
			{ name: "expected", type: "string", description: "Text to match against", required: true },
			{
				name: "options.trim",
				type: "boolean",
				description: "Trim whitespace before comparing",
				required: false,
				default: true,
			},
			{
				name: "options.caseSensitive",
				type: "boolean",
				description: "Enable case-sensitive comparison",
				required: false,
				default: true,
			},
		],
		example: 'exactMatch("42")',
	},
	{
		name: "regex",
		description:
			"Checks that output text matches a regular expression pattern. Accepts string or RegExp.",
		tier: "deterministic",
		category: "text",
		parameters: [
			{
				name: "pattern",
				type: "string | RegExp",
				description: "Regex pattern to test against",
				required: true,
			},
			{
				name: "options.flags",
				type: "string",
				description: "Regex flags (only for string patterns)",
				required: false,
			},
		],
		example: "regex(/\\d{3}-\\d{4}/)",
	},
	{
		name: "jsonSchema",
		description:
			"Parses output text as JSON and validates against a Zod schema. Fails if text is not valid JSON or does not match the schema.",
		tier: "deterministic",
		category: "text",
		parameters: [
			{
				name: "schema",
				type: "ZodType",
				description: "Zod schema to validate against",
				required: true,
			},
		],
		example: "jsonSchema(z.object({ name: z.string() }))",
	},

	// ── Tool call graders ──
	{
		name: "toolCalled",
		description: "Checks that a specific tool was invoked in the output tool calls.",
		tier: "deterministic",
		category: "tool-call",
		parameters: [
			{
				name: "toolName",
				type: "string",
				description: "Name of the tool to check for",
				required: true,
			},
		],
		example: 'toolCalled("search")',
	},
	{
		name: "toolNotCalled",
		description: "Checks that a specific tool was NOT invoked in the output tool calls.",
		tier: "deterministic",
		category: "tool-call",
		parameters: [
			{
				name: "toolName",
				type: "string",
				description: "Name of the tool that must not be called",
				required: true,
			},
		],
		example: 'toolNotCalled("deleteAll")',
	},
	{
		name: "toolSequence",
		description:
			"Checks that tool calls match an expected sequence. Four modes: strict (exact order), unordered (same tools any order), subset (expected tools appear in actual), superset (actual tools appear in expected).",
		tier: "deterministic",
		category: "tool-call",
		parameters: [
			{
				name: "tools",
				type: "string[]",
				description: "Expected tool names in order",
				required: true,
			},
			{
				name: "mode",
				type: "string",
				description: "Match mode: strict | unordered | subset | superset",
				required: false,
				default: "unordered",
			},
		],
		example: 'toolSequence(["search", "summarize"], "subset")',
	},
	{
		name: "toolArgsMatch",
		description:
			"Checks that a tool call's arguments match expected values. Modes: exact (deep equality), subset (expected keys in actual), contains (like subset but strings use .includes()).",
		tier: "deterministic",
		category: "tool-call",
		parameters: [
			{
				name: "toolName",
				type: "string",
				description: "Name of the tool to check",
				required: true,
			},
			{
				name: "expectedArgs",
				type: "Record<string, unknown>",
				description: "Expected argument key-value pairs",
				required: true,
			},
			{
				name: "mode",
				type: "string",
				description: "Match mode: exact | subset | contains",
				required: false,
				default: "subset",
			},
		],
		example: 'toolArgsMatch("search", { query: "weather" }, "contains")',
	},

	// ── Metric graders ──
	{
		name: "latency",
		description: "Checks that response latency (output.latencyMs) is within the allowed threshold.",
		tier: "deterministic",
		category: "metric",
		parameters: [
			{
				name: "maxMs",
				type: "number",
				description: "Maximum allowed latency in milliseconds",
				required: true,
			},
		],
		example: "latency(5000)",
	},
	{
		name: "cost",
		description:
			"Checks that response cost (output.cost) is within the allowed budget. Skips if cost is not reported.",
		tier: "deterministic",
		category: "metric",
		parameters: [
			{
				name: "maxDollars",
				type: "number",
				description: "Maximum allowed cost in dollars",
				required: true,
			},
		],
		example: "cost(0.05)",
	},
	{
		name: "tokenCount",
		description:
			"Checks that total token usage (input + output) is within the allowed limit. Skips if token usage is not reported.",
		tier: "deterministic",
		category: "metric",
		parameters: [
			{
				name: "maxTokens",
				type: "number",
				description: "Maximum allowed total tokens",
				required: true,
			},
		],
		example: "tokenCount(4096)",
	},

	// ── Safety graders ──
	{
		name: "safetyKeywords",
		description:
			"Checks that output text does NOT contain any of the prohibited keywords. Case-insensitive matching.",
		tier: "deterministic",
		category: "safety",
		parameters: [
			{
				name: "prohibited",
				type: "string[]",
				description: "List of prohibited keywords",
				required: true,
			},
		],
		example: 'safetyKeywords(["guaranteed returns", "buy now"])',
	},
	{
		name: "noHallucinatedNumbers",
		description:
			"Checks that numbers in output text are grounded in tool call results. Catches fabricated numbers — the #1 most dangerous agent failure mode.",
		tier: "deterministic",
		category: "safety",
		parameters: [
			{
				name: "options.tolerance",
				type: "number",
				description: "Relative tolerance for matching (0.005 = 0.5%)",
				required: false,
				default: 0.005,
			},
			{
				name: "options.skipSmallIntegers",
				type: "boolean",
				description: "Skip integers with absolute value < 10",
				required: false,
				default: true,
			},
		],
		example: "noHallucinatedNumbers({ tolerance: 0.01 })",
		notes:
			"Always skips year-like numbers (1900-2100). Score is proportional: (checked - hallucinated) / checked.",
	},

	// ── LLM judge graders ──
	{
		name: "llmRubric",
		description:
			"Scores agent output against natural language criteria using an LLM judge. Requires a judge function in the config. Judge scores 1-4 (poor to excellent).",
		tier: "llm",
		category: "llm-judge",
		parameters: [
			{
				name: "criteria",
				type: "string",
				description: "Natural language evaluation criteria",
				required: true,
			},
			{
				name: "options.examples",
				type: "LlmRubricExample[]",
				description: "Few-shot calibration examples (output, score 1-4, reasoning)",
				required: false,
			},
			{
				name: "options.passThreshold",
				type: "number",
				description: "Score threshold for passing (0-1)",
				required: false,
				default: 0.75,
			},
			{
				name: "options.judge",
				type: "JudgeCallFn",
				description: "Override the judge function from config",
				required: false,
			},
		],
		example: 'llmRubric("Response is helpful and accurate")',
		notes:
			"Requires judge function in config. Default pass threshold 0.75 maps to judge score >= 3.",
	},
	{
		name: "factuality",
		description:
			"Specialized LLM judge that evaluates factual consistency against a reference. Requires expected.text as the ground truth reference.",
		tier: "llm",
		category: "llm-judge",
		parameters: [
			{
				name: "options.passThreshold",
				type: "number",
				description: "Score threshold for passing (0-1)",
				required: false,
				default: 0.75,
			},
			{
				name: "options.judge",
				type: "JudgeCallFn",
				description: "Override the judge function from config",
				required: false,
			},
		],
		example: "factuality()",
		notes:
			"Requires expected.text in the case. Evaluates accuracy, completeness, and no fabrication.",
	},
	{
		name: "llmClassify",
		description:
			"Classifies agent output into one of N categories using an LLM judge. Pass condition: classification matches expected.metadata.classification.",
		tier: "llm",
		category: "llm-judge",
		parameters: [
			{
				name: "categories",
				type: "Record<string, string>",
				description: "Map of category name to description (minimum 2 categories)",
				required: true,
			},
			{
				name: "options.criteria",
				type: "string",
				description: "Additional classification instructions",
				required: false,
			},
			{
				name: "options.judge",
				type: "JudgeCallFn",
				description: "Override the judge function from config",
				required: false,
			},
		],
		example: 'llmClassify({ helpful: "Answers the question", unhelpful: "Does not answer" })',
		notes:
			"Requires judge function in config. If no expected classification is set, runs in classification-only mode (always passes).",
	},

	// ── Composition operators ──
	{
		name: "all",
		description:
			"Conjunction: all graders must pass. Score is the minimum of all scores. Does not short-circuit — collects all results for reporting.",
		tier: "composition",
		category: "composition",
		parameters: [
			{
				name: "graders",
				type: "GraderFn[]",
				description: "Array of graders that must all pass",
				required: true,
			},
		],
		example: 'all([contains("Paris"), toolCalled("search")])',
		notes: "Empty list returns pass (vacuous truth).",
	},
	{
		name: "any",
		description:
			"Disjunction: at least one grader must pass. Score is the maximum of all scores. Does not short-circuit.",
		tier: "composition",
		category: "composition",
		parameters: [
			{
				name: "graders",
				type: "GraderFn[]",
				description: "Array of graders — at least one must pass",
				required: true,
			},
		],
		example: 'any([contains("capital of France"), contains("Paris")])',
		notes: "Empty list returns fail.",
	},
	{
		name: "not",
		description: "Negation: inverts a grader's result. Score becomes 1 - original score.",
		tier: "composition",
		category: "composition",
		parameters: [
			{
				name: "grader",
				type: "GraderFn",
				description: "Single grader to negate",
				required: true,
			},
		],
		example: 'not(contains("I don\'t know"))',
	},
] as const;

// ─── Query helpers ───────────────────────────────────────────────────────────

/** Returns all graders (built-in + plugin-contributed). */
export function allGraders(plugins?: readonly EvalPlugin[]): readonly GraderDescriptor[] {
	if (!plugins || plugins.length === 0) {
		return BUILT_IN_GRADERS;
	}

	const pluginDescriptors: GraderDescriptor[] = [];

	for (const plugin of plugins) {
		if (!plugin.graders) continue;
		for (const name of Object.keys(plugin.graders)) {
			pluginDescriptors.push({
				name: `${plugin.name}/${name}`,
				description: `Custom grader from plugin "${plugin.name}"`,
				tier: "deterministic",
				category: "text",
				parameters: [],
				example: `plugins: [${plugin.name}] → graders: ["${name}"]`,
				notes: "Plugin grader — see plugin documentation for parameters.",
			});
		}
	}

	return [...BUILT_IN_GRADERS, ...pluginDescriptors];
}
