/**
 * E2E smoke eval — Anthropic API direct.
 *
 * Calls Claude via the Anthropic API. Requires an Anthropic API key.
 *
 * Run:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   pnpm build
 *   node dist/cli/index.js run --config test/e2e/anthropic
 */
import Anthropic from "@anthropic-ai/sdk";
import { defineConfig } from "../../../src/config/define-config.js";
import type { CaseInput, TargetOutput } from "../../../src/config/types.js";
import { contains, latency } from "../../../src/graders/index.js";

// ─── Cost ───────────────────────────────────────────────────────────────────
// Haiku 4.5 pricing. In production, use your model's actual pricing.

const INPUT_COST_PER_TOKEN = 0.80 / 1_000_000; // $0.80 per million input tokens
const OUTPUT_COST_PER_TOKEN = 4.0 / 1_000_000; // $4.00 per million output tokens

function tokenCost(input: number, output: number): number {
	return input * INPUT_COST_PER_TOKEN + output * OUTPUT_COST_PER_TOKEN;
}

// ─── Target ─────────────────────────────────────────────────────────────────

const client = new Anthropic();

const target = async (input: CaseInput): Promise<TargetOutput> => {
	const start = performance.now();

	const response = await client.messages.create({
		model: "claude-haiku-4-5-20251001",
		max_tokens: 64,
		messages: [{ role: "user", content: String(input.prompt) }],
	});

	const text = response.content
		.filter((block): block is Anthropic.TextBlock => block.type === "text")
		.map((block) => block.text)
		.join("");

	const { input_tokens, output_tokens } = response.usage;

	return {
		text,
		latencyMs: performance.now() - start,
		tokenUsage: { input: input_tokens, output: output_tokens },
		cost: tokenCost(input_tokens, output_tokens),
	};
};

// ─── Suites ─────────────────────────────────────────────────────────────────

export default defineConfig({
	suites: [
		{
			name: "content-check",
			description: "Known-answer case graded by exact substring match",
			target,
			cases: [
				{
					id: "capital-france",
					input: { prompt: "What is the capital of France? Reply with only the city name." },
				},
			],
			defaultGraders: [{ grader: contains("Paris"), required: true }, { grader: latency(15_000) }],
			gates: {
				passRate: 1.0,
				p95LatencyMs: 15_000,
			},
		},
		{
			name: "pipeline",
			description: "Multiple cases to exercise runner concurrency and gates",
			target,
			cases: [
				{
					id: "capital-japan",
					input: { prompt: "What is the capital of Japan? Reply with only the city name." },
					category: "happy_path",
				},
				{
					id: "multiply",
					input: { prompt: "What is 7 * 8? Reply with only the number." },
					category: "happy_path",
				},
				{
					id: "color-list",
					input: {
						prompt:
							"List the three primary colors of light, comma-separated. Reply with only the list.",
					},
					category: "happy_path",
				},
			],
			defaultGraders: [{ grader: latency(15_000) }],
			gates: {
				passRate: 1.0,
				p95LatencyMs: 15_000,
			},
		},
	],
	run: {
		defaultMode: "live",
		timeoutMs: 30_000,
	},
});
