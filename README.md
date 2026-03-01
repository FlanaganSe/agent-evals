# agent-eval-kit

[![npm](https://img.shields.io/npm/v/agent-eval-kit)](https://www.npmjs.com/package/agent-eval-kit)
[![tests](https://img.shields.io/badge/tests-676%20passed-brightgreen)](https://github.com/FlanaganSe/agent-eval-kit)
[![license](https://img.shields.io/npm/l/agent-eval-kit)](LICENSE.md)

TypeScript-native evaluation framework for AI agent workflows.

Record agent responses, grade them with deterministic checks or LLM-as-judge rubrics, enforce quality gates in CI, and compare runs to catch regressions — all from a single config file.

> **v0.0.1** — API is not yet stable.

**[Documentation](https://flanaganse.github.io/agent-eval-kit/)** · **[GitHub](https://github.com/FlanaganSe/agent-eval-kit)**

---

## Why agent-eval-kit?

Testing AI agents is different from testing deterministic code. Outputs vary between runs, quality is subjective, and running live LLM calls in CI is slow and expensive.

agent-eval-kit solves this with a **record-replay** workflow:

1. **Record** — capture live agent responses as fixtures
2. **Replay** — grade recorded outputs instantly, zero API cost
3. **Gate** — enforce pass rates, cost budgets, and latency limits in CI
4. **Compare** — diff two runs to find regressions and improvements

## Install

```bash
npm install agent-eval-kit
# or
pnpm add agent-eval-kit
```

Requires **Node.js 20+**.

## Quick Start

### 1. Create a config

```bash
agent-eval-kit init
```

Or write one manually:

```typescript
// eval.config.ts
import { defineConfig } from "agent-eval-kit";
import { contains, latency } from "agent-eval-kit/graders";

export default defineConfig({
  suites: [
    {
      name: "basic-qa",
      target: async (input) => {
        // Call your agent/LLM here
        const response = await myAgent(input.prompt);
        return { text: response.text, latencyMs: response.duration };
      },
      cases: [
        {
          id: "capital-france",
          input: { prompt: "What is the capital of France?" },
          expected: { text: "Paris" },
        },
      ],
      defaultGraders: [
        { grader: contains("Paris"), required: true },
        { grader: latency(5000) },
      ],
      gates: { passRate: 0.95 },
    },
  ],
});
```

### 2. Record fixtures

```bash
agent-eval-kit record --suite basic-qa
```

### 3. Run evals in replay mode

```bash
agent-eval-kit run --mode replay
```

### 4. Compare runs

```bash
agent-eval-kit compare --base <run-id> --compare <run-id>
```

## Core Concepts

| Term | Description |
|------|-------------|
| **Suite** | A collection of cases sharing a target function, default graders, and gates |
| **Case** | A single input/expected pair — inline or loaded from JSONL/YAML files |
| **Grader** | A scoring function that returns `{ pass, score, reason }` |
| **Trial** | One execution of a case (run N trials for flakiness detection) |
| **Run** | The complete result of executing a suite — persisted for comparison |
| **Fixture** | A recorded `TargetOutput` used for deterministic replay |
| **Gate** | Suite-level pass/fail thresholds (pass rate, cost, latency) |

## Built-in Graders

### Text

| Grader | Description |
|--------|-------------|
| `contains(substring)` | Case-insensitive substring match |
| `notContains(substring)` | Substring must not appear |
| `exactMatch(expected)` | Exact string equality (with trim/case options) |
| `regex(pattern)` | Regex pattern match |

### Tool Calls

| Grader | Description |
|--------|-------------|
| `toolCalled(name)` | Tool was invoked |
| `toolNotCalled(name)` | Tool was not invoked |
| `toolSequence(tools, mode)` | Tools called in expected order (`strict`, `subset`, `superset`, `unordered`) |
| `toolArgsMatch(name, args, mode)` | Tool arguments match expected values (`exact`, `subset`, `contains`) |

### Metrics

| Grader | Description |
|--------|-------------|
| `latency(maxMs)` | Response time within limit |
| `cost(maxDollars)` | Cost within budget |
| `tokenCount(maxTokens)` | Token usage within limit |

### Safety

| Grader | Description |
|--------|-------------|
| `safetyKeywords(prohibited)` | Output contains none of the prohibited words |
| `noHallucinatedNumbers()` | Numbers in output are grounded in tool results |

### Structured Output

| Grader | Description |
|--------|-------------|
| `jsonSchema(zodSchema)` | Output parses as JSON and validates against a Zod schema |

### LLM-as-Judge

| Grader | Description |
|--------|-------------|
| `llmRubric(criteria)` | Score against natural language criteria (1–4 scale) |
| `factuality()` | Check factual consistency against `expected.text` |
| `llmClassify(categories)` | Classify output into categories with expected match |

### Composition

Combine any graders with `all()`, `any()`, and `not()`:

```typescript
import { all, any, not, contains, toolCalled } from "agent-eval-kit/graders";

const graders = [
  { grader: all(contains("result"), toolCalled("search")), required: true },
  { grader: not(contains("I don't know")) },
];
```

## CLI

```
agent-eval-kit run              Run eval suites (live, replay, or judge-only)
agent-eval-kit record           Record live agent responses as fixtures
agent-eval-kit compare          Diff two runs to find regressions
agent-eval-kit list             List previous runs
agent-eval-kit cache            Manage judge cache (stats, clear)
agent-eval-kit doctor           Validate project setup
agent-eval-kit init             Interactive setup wizard
agent-eval-kit install-hooks    Set up git hooks to run evals on commit
agent-eval-kit mcp              Start MCP server for AI assistant integration
```

Common flags: `--suite <name>`, `--mode <live|replay|judge-only>`, `--concurrency <n>`, `--trials <n>`

## Execution Modes

| Mode | What it does | Cost | Speed |
|------|-------------|------|-------|
| `live` | Calls your target function (real LLM calls) | Full | Slow |
| `replay` | Uses recorded fixtures | Zero | Instant |
| `judge-only` | Re-grades an existing run with different graders | Judge calls only | Fast |

## CI Integration

Add evals to your CI pipeline using gates:

```typescript
// eval.config.ts
{
  suites: [{
    // ...
    gates: {
      passRate: 0.95,        // 95% of cases must pass
      maxCost: 2.0,          // $2 budget per run
      p95LatencyMs: 5000,    // 5s p95 latency
    },
  }],
}
```

```yaml
# .github/workflows/evals.yml
- run: agent-eval-kit run --mode replay --suite my-suite
```

The CLI exits with a non-zero code when gates fail.

## MCP Server

agent-eval-kit includes an MCP server so AI assistants (Claude, etc.) can run evals, inspect results, and compare runs directly.

```bash
agent-eval-kit mcp
```

**8 tools**: `run-suite`, `list-runs`, `list-suites`, `list-graders`, `describe-config`, `validate-config`, `get-run-details`, `compare-runs`

**3 resources**: config schema, case schema, grader reference

See the [MCP guide](https://flanaganse.github.io/agent-eval-kit/advanced/mcp-server/) for setup instructions.

## Programmatic API

```typescript
import { loadConfig, runSuite } from "agent-eval-kit";

const { suites } = await loadConfig({ cwd: process.cwd() });
const run = await runSuite(suites[0], { mode: "replay" });

console.log(run.summary.passRate); // 0.95
```

Key exports from `agent-eval-kit`:

- `defineConfig()` — type-safe config helper
- `loadConfig()` — load and validate `eval.config.ts`
- `runSuite()` — execute a suite
- `compareRuns()` — diff two runs
- `saveRun()` / `loadRun()` / `listRuns()` — run persistence

Key exports from `agent-eval-kit/graders`:

- All 20 built-in graders listed above
- `all()`, `any()`, `not()` — composition operators
- `computeCaseResult()` — aggregate grader scores

Additional subpath exports: `agent-eval-kit/comparison`, `agent-eval-kit/reporters`, `agent-eval-kit/fixtures`, `agent-eval-kit/plugin`, `agent-eval-kit/watcher`

## Reporters

Four built-in output formats:

- **console** — colored terminal output (default)
- **json** — structured JSON
- **markdown** — markdown summary
- **junit** — JUnit XML for CI systems

## Plugins

Extend agent-eval-kit with custom graders and lifecycle hooks:

```typescript
import type { EvalPlugin } from "agent-eval-kit/plugin";

const myPlugin: EvalPlugin = {
  name: "my-plugin",
  graders: {
    "my-org/tone": myToneGrader,
  },
  hooks: {
    afterRun: async (context) => {
      // Post results to Slack, Datadog, etc.
    },
  },
};
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
pnpm install
pnpm test        # run tests
pnpm lint        # lint with Biome
pnpm typecheck   # type-check with tsc
```

## License

[MIT](LICENSE.md)
