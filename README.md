# agent-evals

A TypeScript-native evaluation framework for AI agent workflows.

> **Work in progress** — the API is not yet stable.

## What it does

agent-evals lets you define test suites that grade AI agent outputs using deterministic checks, LLM-as-judge rubrics, or both. It supports a record-replay workflow: capture live agent responses as fixtures, then replay and grade them repeatably.

## Key concepts

- **Suite** — a collection of evaluation cases
- **Case** — a single input/output pair with graders attached
- **Grader** — a scoring function (deterministic or LLM-based)
- **Run** — the result of executing a suite
- **Fixture** — a recorded agent response used for replay

## CLI

```
agent-evals run        # run eval suites
agent-evals record     # record live fixtures
agent-evals compare    # compare two runs
agent-evals list       # list previous runs
agent-evals doctor     # validate project setup
```

## Example plugins

- Slack/webhook notifier — afterRun posts pass rate and regressions to a channel
- Datadog/telemetry — beforeRun starts a span, afterTrial adds events, afterRun closes it
- Custom grader pack — a plugin with graders: { "my-org/tone": toneGrader } that your team shares as an npm package
- Failure screenshotter — afterTrial captures screenshots for failed UI agent cases
- Cost budget guard — afterTrial tracks cumulative cost and throws if it exceeds a threshold

## Requirements

- Node.js 20+
- pnpm

## License

MIT
