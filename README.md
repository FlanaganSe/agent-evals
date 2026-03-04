# agent-eval-kit

[![npm](https://img.shields.io/npm/v/agent-eval-kit)](https://www.npmjs.com/package/agent-eval-kit)
[![tests](https://img.shields.io/badge/tests-737%20passed-brightgreen)](https://github.com/FlanaganSe/agent-eval-kit)
[![license](https://img.shields.io/npm/l/agent-eval-kit)](LICENSE.md)

> TypeScript-native eval framework for AI agent workflows. Record once, replay forever, grade instantly.

**[Documentation](https://flanaganse.github.io/agent-eval-kit/)** · **[GitHub](https://github.com/FlanaganSe/agent-eval-kit)**

---

Testing AI agents is expensive, slow, and non-deterministic. agent-eval-kit fixes this with a **record-replay** workflow:

1. **Record** — capture live agent responses as fixtures (one-time API cost)
2. **Replay** — grade recorded outputs instantly at zero cost
3. **Gate** — enforce pass rates, cost budgets, and latency limits in CI
4. **Compare** — diff two runs to catch regressions

## Quick Start

```bash
npm install agent-eval-kit
```

Requires **Node.js 20+**. Generate a starter config with `agent-eval-kit init`, or write one manually:

```typescript
// eval.config.ts
import { defineConfig, contains, latency } from "agent-eval-kit";

export default defineConfig({
  suites: [
    {
      name: "basic-qa",
      target: async (input) => {
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

```bash
agent-eval-kit record --suite basic-qa   # record fixtures (live API calls)
agent-eval-kit run --mode replay         # replay instantly (after generation), $0 cost
```

## Features

- **20 built-in graders** — text (`contains`, `regex`, `exactMatch`), tool calls (`toolSequence`, `toolArgsMatch`), metrics (`latency`, `cost`, `tokenCount`), safety (`safetyKeywords`, `noHallucinatedNumbers`), structured output (`jsonSchema`), and LLM-as-judge (`llmRubric`, `factuality`, `llmClassify`)
- **Grader composition** — combine with `all()`, `any()`, `not()`
- **3 execution modes** — `live` (real calls), `replay` (cached fixtures), `judge-only` (re-grade with new graders, no re-run)
- **Quality gates** — enforce pass rate, max cost, and p95 latency thresholds; non-zero exit on failure
- **Run comparison** — diff any two runs to surface regressions and improvements
- **Multi-trial runs** — flakiness detection with Wilson score confidence intervals
- **Watch mode** — re-run evals on file changes (`--watch`)
- **External cases** — load from JSONL or YAML files alongside inline cases
- **Plugin system** — custom graders and lifecycle hooks (`beforeRun`, `afterTrial`, `afterRun`)
- **4 reporters** — console, JSON, JUnit XML, Markdown
- **MCP server** — 8 tools + 3 resources for AI assistant integration
- **CI-native** — JUnit reporter, GitHub Actions Step Summary, git hook installation

## Examples

| Example | What it covers | Run it |
|---------|---------------|--------|
| [`quickstart/`](examples/quickstart/) | Minimal setup — 1 case, 2 graders | `agent-eval-kit run --config examples/quickstart` |
| [`text-grading/`](examples/text-grading/) | Text, safety, metric, composition, and LLM judge graders | `agent-eval-kit run --config examples/text-grading` |
| [`tool-agent/`](examples/tool-agent/) | Tool call grading, hallucination detection, plugins | `agent-eval-kit run --config examples/tool-agent` |

See [`examples/README.md`](examples/README.md) for setup details.

## Documentation

Full docs at **[flanaganse.github.io/agent-eval-kit](https://flanaganse.github.io/agent-eval-kit/)**:

- [Quick Start](https://flanaganse.github.io/agent-eval-kit/getting-started/quick-start/) — first eval in 5 minutes
- [Graders Guide](https://flanaganse.github.io/agent-eval-kit/guides/graders/) — all graders with examples
- [CLI Reference](https://flanaganse.github.io/agent-eval-kit/reference/cli/) — every command and flag
- [Config Reference](https://flanaganse.github.io/agent-eval-kit/reference/config/) — full config schema
- [Programmatic API](https://flanaganse.github.io/agent-eval-kit/reference/programmatic-api/) — use as a library

## Contributing

Contributions welcome — please [open an issue](https://github.com/FlanaganSe/agent-eval-kit/issues) first to discuss changes.

```bash
pnpm install && pnpm test && pnpm lint
```

## License

[MIT](LICENSE.md)
