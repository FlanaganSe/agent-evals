/**
 * E2E eval with LLM-as-judge grading via OpenRouter.
 *
 * Demonstrates:
 *   - judge config (LLM evaluates LLM output)
 *   - llmRubric grader (natural language criteria)
 *   - factuality grader (checks output against expected reference)
 *   - llmClassify grader (categorize output into predefined classes)
 *   - deterministic + LLM graders in the same suite
 *   - judge caching (createCachingJudge)
 *
 * Two LLM calls per graded case: one for the target, one for the judge.
 *
 * Prerequisites:
 *   export OPENROUTER_API_KEY=sk-or-...
 *   pnpm build
 *
 * Run:
 *   node dist/cli/index.js run --config test/e2e/openrouter-judge
 *
 * Override models:
 *   EVAL_MODEL=google/gemini-2.0-flash-001 JUDGE_MODEL=anthropic/claude-sonnet-4 \
 *     node dist/cli/index.js run --config test/e2e/openrouter-judge
 */
import OpenAI from "openai";
import { defineConfig } from "../../../src/config/define-config.js";
import type {
	CaseInput,
	JudgeCallFn,
	JudgeMessage,
	TargetOutput,
} from "../../../src/config/types.js";
import {
	contains,
	createCachingJudge,
	factuality,
	latency,
	llmClassify,
	llmRubric,
} from "../../../src/graders/index.js";

// ─── Shared client ──────────────────────────────────────────────────────────

const client = new OpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Cost ───────────────────────────────────────────────────────────────────
// Approximate per-token rates for cheap models. In production, use your model's actual pricing.

const INPUT_COST_PER_TOKEN = 0.25 / 1_000_000; // $0.25 per million input tokens
const OUTPUT_COST_PER_TOKEN = 1.25 / 1_000_000; // $1.25 per million output tokens

function tokenCost(input: number, output: number): number {
	return input * INPUT_COST_PER_TOKEN + output * OUTPUT_COST_PER_TOKEN;
}

// ─── Target ─────────────────────────────────────────────────────────────────
// The agent being evaluated. Swap this to test your own agent.

const targetModel = process.env.EVAL_MODEL ?? "anthropic/claude-haiku-4.5";

const target = async (input: CaseInput): Promise<TargetOutput> => {
	const start = performance.now();

	const response = await client.chat.completions.create({
		model: targetModel,
		max_tokens: 256,
		messages: [{ role: "user", content: String(input.prompt) }],
	});

	const inputTokens = response.usage?.prompt_tokens ?? 0;
	const outputTokens = response.usage?.completion_tokens ?? 0;

	return {
		text: response.choices[0]?.message.content ?? "",
		latencyMs: performance.now() - start,
		tokenUsage: { input: inputTokens, output: outputTokens },
		cost: tokenCost(inputTokens, outputTokens),
	};
};

// ─── Judge ──────────────────────────────────────────────────────────────────
// Evaluates the target's output. Uses a separate (often stronger) model.
// The framework sends structured prompts and parses JSON responses automatically.

const judgeModel = process.env.JUDGE_MODEL ?? "anthropic/claude-haiku-4.5";

const judge: JudgeCallFn = async (messages, options) => {
	const response = await client.chat.completions.create({
		model: options?.model ?? judgeModel,
		max_tokens: options?.maxTokens ?? 1024,
		temperature: options?.temperature ?? 0,
		messages: messages.map((m: JudgeMessage) => ({ role: m.role, content: m.content })),
	});

	return {
		text: response.choices[0]?.message.content ?? "",
		modelId: options?.model ?? judgeModel,
		tokenUsage: {
			input: response.usage?.prompt_tokens ?? 0,
			output: response.usage?.completion_tokens ?? 0,
		},
	};
};

// ─── Suites ─────────────────────────────────────────────────────────────────

export default defineConfig({
	judge: { call: createCachingJudge(judge), model: judgeModel },

	suites: [
		// Suite 1: llmRubric — judge evaluates against natural language criteria.
		// No expected.text needed. The criteria IS the rubric.
		{
			name: "rubric",
			description: "LLM judge scores output against natural language criteria",
			target,
			cases: [
				{
					id: "helpful-explanation",
					input: { prompt: "Explain why the sky is blue in one sentence." },
				},
				{
					id: "concise-answer",
					input: { prompt: "What causes tides? Answer in under 20 words." },
				},
			],
			defaultGraders: [
				{
					grader: llmRubric(
						"The response is factually correct, concise, and directly answers the question.",
					),
					required: true,
				},
				{ grader: latency(15_000) },
			],
			gates: {
				passRate: 1.0,
				p95LatencyMs: 15_000,
			},
		},

		// Suite 2: factuality — judge checks output against a known reference.
		// Requires expected.text on each case.
		{
			name: "factuality",
			description: "LLM judge checks factual consistency against expected reference",
			target,
			cases: [
				{
					id: "boiling-point",
					input: { prompt: "At what temperature does water boil at sea level? Be precise." },
					expected: {
						text: "Water boils at 100 degrees Celsius (212 degrees Fahrenheit) at sea level.",
					},
				},
				{
					id: "speed-of-light",
					input: { prompt: "What is the speed of light in a vacuum? Be precise." },
					expected: {
						text: "The speed of light in a vacuum is approximately 299,792,458 meters per second.",
					},
				},
			],
			defaultGraders: [{ grader: factuality(), required: true }, { grader: latency(15_000) }],
			gates: {
				passRate: 1.0,
				p95LatencyMs: 15_000,
			},
		},

		// Suite 3: Mixed — deterministic + LLM graders together.
		// Shows that both grader types compose naturally.
		{
			name: "mixed",
			description: "Deterministic and LLM graders in the same suite",
			target,
			cases: [
				{
					id: "capital-france",
					input: { prompt: "What is the capital of France? Reply with only the city name." },
				},
			],
			defaultGraders: [
				{ grader: contains("Paris"), required: true },
				{ grader: llmRubric("The response contains only a city name with no extra text.") },
				{ grader: latency(15_000) },
			],
			gates: {
				passRate: 1.0,
				p95LatencyMs: 15_000,
			},
		},

		// Suite 4: llmClassify — judge classifies output into predefined categories.
		// Each case declares its expected category in expected.metadata.classification.
		{
			name: "classify",
			description: "LLM judge classifies output into predefined categories",
			target,
			cases: [
				{
					id: "sentiment-positive",
					input: { prompt: "Write a one-sentence product review for a pair of shoes you love." },
					expected: { metadata: { classification: "positive" } },
				},
				{
					id: "sentiment-negative",
					input: {
						prompt: "Write a one-sentence product review for headphones that broke after one day.",
					},
					expected: { metadata: { classification: "negative" } },
				},
			],
			defaultGraders: [
				{
					grader: llmClassify({
						categories: {
							positive: "The text expresses satisfaction, praise, or a favorable opinion.",
							negative: "The text expresses dissatisfaction, criticism, or an unfavorable opinion.",
							neutral: "The text is neither clearly positive nor clearly negative.",
						},
					}),
					required: true,
				},
				{ grader: latency(15_000) },
			],
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
