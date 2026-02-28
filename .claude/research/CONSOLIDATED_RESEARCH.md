# Consolidated Research: Agent Eval Framework

> Single reference for all implementation decisions. Organized by implementation plan section.
> Deduplicated from 3 research streams (Claude, GPT, Gemini) + external validation. February 2026.

---

## Table of Contents

1. [Market Gap & Competitive Landscape](#1-market-gap--competitive-landscape)
2. [Architecture & Execution Model](#2-architecture--execution-model)
3. [Record-Replay Engine](#3-record-replay-engine)
4. [Grader System](#4-grader-system)
5. [LLM-as-Judge](#5-llm-as-judge)
6. [Agent-Specific Evaluation](#6-agent-specific-evaluation)
7. [Configuration & Schema](#7-configuration--schema)
8. [CLI & Developer Experience](#8-cli--developer-experience)
9. [Reporting & Output](#9-reporting--output)
10. [Plugin & Extensibility](#10-plugin--extensibility)
11. [CI/CD & Git Hooks](#11-cicd--git-hooks)
12. [Statistical Rigor & Flakiness](#12-statistical-rigor--flakiness)
13. [Security Evaluation Patterns](#13-security-evaluation-patterns)
14. [Tech Stack Decisions](#14-tech-stack-decisions)
15. [Distribution & Packaging](#15-distribution--packaging)
16. [Agent-Readable Documentation](#16-agent-readable-documentation)
17. [Reference Implementations](#17-reference-implementations)
18. [External Sources](#18-external-sources)

---

## 1. Market Gap & Competitive Landscape

**No TypeScript-native, lightweight, framework-agnostic eval tool exists for AI agent workflows.** Confirmed across all research streams.

### Existing Tools — Strengths & Gaps

| Tool | Strength | Critical Gap for Us |
|------|----------|-------------------|
| **Promptfoo** | Best CI/CD story, 51k+ users, GitHub Action, red-teaming | Weak at agent trajectory eval. No record-replay. No judge-only mode. |
| **DeepEval** | Best agent metrics (6 agentic, 60+ total) | Python only. |
| **Evalite** (Matt Pocock) | TypeScript `defineConfig()`, watch mode, local UI, Vercel AI SDK trace capture, 10 built-in scorers, SQLite persistence | No record-replay (VCR). No trajectory eval (only single-call `toolCallAccuracy`). No judge-only mode. Vercel AI SDK coupling for tracing/caching. No `--trials`/flakiness. No run comparison. |
| **vitest-evals** (Sentry) | `describeEval()` API, Vitest integration | Tightly coupled to Vitest. Not standalone. |
| **autoevals** (Braintrust) | MIT, TypeScript, standalone LLM judge scorers | Library only — no runner, no CLI, no replay. |
| **AgentEvals** (LangChain) | Trajectory matching (4 modes), TypeScript | Has LangChain dependency. |
| **Ragas** | Best RAG metrics | Python only. |
| **LangSmith** | Production tracing + eval | Proprietary, vendor lock-in. |
| **Pydantic Evals** | Clean type-safe evals | Python only. |

### Our Differentiators (What No One Has)

1. **Record-Replay (VCR)**: $0 pre-push evals, millisecond execution. No TS framework does this end-to-end.
2. **Three eval modes** (live/replay/judge-only): Judge-only lets you iterate on grading criteria at zero cost.
3. **Trajectory evaluation** as core, not afterthought.
4. **Cost/latency budgets** as first-class gates.
5. **Diff-based run comparison**: "What changed" not just "what failed."

---

## 2. Architecture & Execution Model

### Core Design Principles (Consensus Across All Research)

1. **Adapter pattern for targets**: Framework doesn't call LLMs directly. Users provide `(input: CaseInput) => Promise<TargetOutput>`. Framework-agnostic.
2. **Graders are pure functions**: `(output, expected, context) => GradeResult`. No base classes. No framework state. Trivially testable.
3. **Runner owns orchestration**: Concurrency, rate limiting, timeout, retry all live in the runner. Graders and adapters are stateless.
4. **Config is code**: `eval.config.ts` is the entry point. Zod validates at load time.
5. **Fixtures are JSONL**: Git-friendly, streamable, append-only.

### Three Execution Modes

| Mode | What Happens | Cost | Speed | Use Case |
|------|-------------|------|-------|----------|
| **Live** | Calls real `target` function (real LLMs/tools) | $$$ | Seconds-minutes | Nightly CI, pre-release, initial fixture recording |
| **Replay** | Loads recorded fixtures, skips target entirely | $0 | Milliseconds | Pre-push hooks, PR CI, dev iteration |
| **Judge-Only** | Loads previous run outputs, re-runs graders only | $0 (deterministic) or $ (LLM judge) | Milliseconds-seconds | Iterating on grading criteria, re-scoring |

**Default mode should be `replay`** — safe, zero-cost. Error with helpful message if no fixtures exist.

### Mode Selection Logic

```
--mode flag provided? → use it
No flag → check config `run.defaultMode`
No config → default to 'replay'
No fixtures exist → error: "No fixtures found. Run with --mode=live --record first."
```

### `--trials` Behavior

- **Live**: Runs target N times per case. Reports per-case pass rate and confidence interval.
- **Replay**: Single fixture = deterministic. Warn user that trials have no effect.
- **Judge-only**: Meaningful only for LLM judge graders (which have variance).

### Cost/Latency in Replay Mode

Graders grade against **recorded** values from the original live run, not replay execution time. Cost and latency gates remain meaningful in replay.

---

## 3. Record-Replay Engine

### VCR Architecture (Highest-ROI Feature)

This is the single most important differentiator. Drops test time from ~15 seconds to ~15 milliseconds and costs $0.

### Recording (--mode=live --record)

1. Runner invokes `target(input)` normally
2. Full `TargetOutput` captured: text, tool calls, latency, tokens, cost, raw response
3. Written to `.eval-fixtures/<suite-name>/<case-id>.jsonl` as JSONL entry
4. Metadata header: config hash, model ID, timestamp, framework version
5. Errors and rate-limit retries are NOT recorded (always retry)

### Cache Key Formula

```
sha256(suite_name + case_id + JSON.stringify(input) + configHash)
```

**`configHash` includes**: model ID, temperature, system prompt text, tool schemas, explicit `targetVersion` string.

**`configHash` excludes**: Function source code. Formatting changes, comments, refactors must NOT invalidate fixtures. If agent logic changes without `targetVersion` bump, user must explicitly re-record with `--update-fixtures`.

### Fixture Format

```jsonl
{"_meta":{"schemaVersion":"1.0.0","configHash":"abc123","modelId":"gpt-4o","recordedAt":"2026-02-28T00:00:00Z","frameworkVersion":"1.0.0"}}
{"caseId":"H01","output":{"text":"Your portfolio contains...","toolCalls":[{"name":"get_portfolio","args":{"user_id":"123"},"result":{"holdings":["AAPL","GOOG"]}}],"latencyMs":1200,"tokenUsage":{"input":150,"output":280},"cost":0.0042}}
```

### Staleness Detection

- Warn when fixture age exceeds `replay.ttlDays` (default 14, Promptfoo's proven default)
- Error when config hash doesn't match (prompt/target changed)
- `--strict-fixtures` flag: fail on any staleness warning
- `--update-fixtures`: re-record all fixtures in live mode

### Git Considerations for Fixtures

Best practices from HTTP VCR libraries (Ruby VCR, Python vcrpy, nock):

- One JSON object per line, **minified** — diffs are line-level
- **Sort all object keys deterministically** to prevent spurious diffs
- **One `.jsonl` file per eval case** (cassette-per-test), named after case ID. Shared files cause merge conflicts.
- Strip auth headers and API keys before committing
- Normalize volatile fields (timestamps, `request-id`, streaming chunk boundaries)
- `.gitattributes`: `*.jsonl diff=json` for readable diffs
- Add `maxFixtureSize` config with warning for large outputs
- Strip `raw` field from fixtures by default (opt-in via `--record-raw`)
- Provide `agent-evals cache stats` command for monitoring

### Dependency-Aware Invalidation

If agent tests a WRITE operation, cache for subsequent READ operations should be invalidated. State-aware invalidation, not just TTL-based.

---

## 4. Grader System

### Tier 1: Deterministic (free, fast, zero deps)

These are the foundation. Ship all in v1.

| Grader | Input | Description |
|--------|-------|-------------|
| `contains(substring)` | Output text | Contains substring |
| `notContains(substring)` | Output text | Does not contain |
| `regex(pattern)` | Output text | Matches regex |
| `exactMatch(expected)` | Output text | Exact string equality |
| `jsonSchema(zodSchema)` | Output | Validates against Zod/JSON Schema |
| `toolCalled(name)` | Tool calls | Specific tool was invoked |
| `toolNotCalled(name)` | Tool calls | Specific tool was NOT invoked |
| `toolSequence(tools, mode)` | Tool calls | Sequence matches (strict/unordered/subset/superset) |
| `toolArgsMatch(tool, args, mode)` | Tool calls | Arguments match (exact/subset/contains) |
| `latency(maxMs)` | Metadata | Response time within threshold |
| `cost(maxDollars)` | Metadata | Dollar cost within budget (user-provided via TargetOutput.cost) |
| `tokenCount(maxTokens)` | Metadata | Total token usage within budget |
| `noHallucinatedNumbers(tolerance?)` | Output + tool results | Cross-references numbers. Default 0.5% tolerance. |
| `safetyKeywords(prohibited[])` | Output text | No prohibited content |

### noHallucinatedNumbers Algorithm (Production-Tested)

1. Extract all numeric tokens from response text
2. Extract all numeric tokens from tool results, recursively through nested objects
3. Cross-reference: every response number must appear in tool results within configurable tolerance (default 0.5%)
4. Skip non-financial numbers: years 1900-2100, common percentages, small integers <10
5. Tolerance configurable per assertion

### toolArgsMatch Substring Mode

Support `"contains:VALUE"` prefix for substring matching on argument values. Exact matching is too brittle for natural language arguments.

### Tier 2: LLM-as-Judge (optional, costly)

| Grader | Description |
|--------|-------------|
| `llmRubric(config)` | Scores against natural language criteria. Requires `judge` in config. |
| `factuality` | Is output factually consistent with reference? |

### Assertion Composition

Graders compose via `all`, `any`, `not`:

```typescript
all([contains('Paris'), toolCalled('search')])
any([contains('capital of France'), contains('Paris is the capital')])
not(contains("I don't know"))
```

### Scoring Model

- Each grader has `weight` (default 1.0) and optional `threshold`
- `required: true` causes immediate case failure regardless of other scores
- Case pass/fail: weighted average of non-required graders vs case-level threshold
- Suite-level gates: pass rate, p95 latency, cost ceiling

---

## 5. LLM-as-Judge

### Position: Deterministic-First, Judge as Optional Layer

All research streams agree: LLM judge should NOT be the default gate for every commit due to cost, non-determinism, and bias. Use deterministic graders as gates; LLM judge as optional evaluator.

### Known Biases (Quantified)

| Bias | Magnitude | Mitigation |
|------|-----------|------------|
| Position bias | 8-40% first-option preference | Evaluate both orderings; count only consistent wins |
| Verbosity bias | 15-70% prefer longer outputs | Use 1-4 scale; reward conciseness explicitly |
| Self-enhancement | 5-25% boost for own outputs | Use different model family as judge |
| Domain gap | 10-15% agreement drop | Calibrate with domain-expert few-shot examples |
| Judge drift | Unpredictable across API updates | Pin judge model version; re-validate on upgrade |

### Implementation Requirements

- Temperature 0 by default
- Chain-of-thought BEFORE verdict (65% → 77.5% accuracy improvement)
- Schema-constrained JSON output (reduce parsing errors)
- 2-3 few-shot examples per score level (25-30% accuracy improvement)
- Judge model configured globally via `judge.call` function — provider-agnostic
- Evaluate only — do NOT ask judge to suggest improvements simultaneously

### Cost at Scale

GPT-4-class judges at 1M daily evals ≈ $2,500/day. Forces multi-tiered strategy:
1. Deterministic checks first (free)
2. LLM judge only when deterministic checks are insufficient (expensive)

### Specialized Judge Models Worth Studying

- **autoevals** (Braintrust, MIT, TypeScript) — `Factuality`, `ClosedQA`, `ExactMatch`, all RAG metrics, no account needed
- Patronus AI Lynx (70B/8B) — hallucination detection
- GLIDER (3.8B) — 91% human agreement at fraction of GPT-4 cost

---

## 6. Agent-Specific Evaluation

### Tool Call Trajectory — Four Match Modes

From AgentEvals (LangChain, MIT, TypeScript):

| Mode | Behavior | Best For |
|------|----------|----------|
| `strict` | Exact tool calls, exact order | Deterministic workflows |
| `unordered` | Same tools, any order | Order-independent tasks |
| `subset` | Reference tools are subset of actual | Agent did expected + more |
| `superset` | Actual tools are subset of reference | Agent took fewer steps |

**`unordered` should be the default** — `strict` is too brittle for most real workflows.

### Tool Parameter Validation (3 Levels)

1. **Name only** — tool was called
2. **Parameter shape** — arguments match expected schema
3. **Parameter values** — specific argument values match

### pass@k vs. pass^k

| Metric | Definition | Use Case |
|--------|-----------|----------|
| `pass@k` | At least 1 of k attempts succeeds | Exploratory tasks |
| `pass^k` | ALL k attempts succeed | User-facing reliability |

A 90% pass@1 can yield only ~35% pass^8. For production agents, **pass^k is the right default**. Almost no TypeScript tool exposes this.

### Multi-Turn Conversation (Deferred to v1.5)

Requires `ConversationalTestCase` primitive with `Turn[]`. Design the type in v1, implement in v1.5. DeepEval has the most mature schema for this.

### Case Category Taxonomy

Standard typed `category` field with per-category reporting:

| Category | Prefix | What It Tests |
|----------|--------|--------------|
| `happy_path` | H | Baseline expected behavior |
| `edge_case` | E | Boundary and unusual inputs |
| `adversarial` | A | Tricky or injection-style inputs |
| `multi_step` | M | Multi-tool orchestration sequences |
| `regression` | R | Specific previously-fixed bugs |

Per-category pass rates are significantly more actionable than aggregate rates.

---

## 7. Configuration & Schema

### Resolved Decision: TS Config Primary, JSONL for Data

Research conflicted on config format. Resolution:
- **Framework config**: `eval.config.ts` with `defineConfig()` only. No YAML for framework config (doubles testing surface).
- **Test case data**: JSONL primary, YAML also supported via file extension detection. JSONL preferred for large datasets (streaming, partial execution).
- **Internal canonical format**: JSON with JSON Schema validation.
- **Schema validation**: Zod as single source of truth. `z.infer<>` for types.

### Zod → JSON Schema

Zod 4 ships `z.toJSONSchema()` natively. The third-party `zod-to-json-schema` is **no longer maintained** as of Nov 2025 (author defers to Zod 4).

```typescript
const jsonSchema = z.toJSONSchema(schema, {
  target: "draft-07",          // "draft-2020-12" default; use "draft-07" for LLM APIs (OpenAI/Anthropic expect Draft 7)
  io: "output",                // or "input" for pre-transform type
  unrepresentable: "any",      // suppress throws for bigint/Date/etc.
  cycles: "ref",               // break circular refs with $defs
})
```

**Non-representable types** (`bigint`, `symbol`, `undefined`, `void`, `Date`, `Map`, `Set`, `transform`, `NaN`, `custom`) throw by default — use `unrepresentable: "any"`.

**Decision**: Use **Zod v4** with native `z.toJSONSchema()`. Set `target: "draft-07"` when generating schemas for LLM tool/function calling.

### Schema Versioning

Every persisted artifact has `schemaVersion` (semver). Breaking changes to `Run`, `Trial`, or `GradeResult` shape bump this. Framework must load older `schemaVersion` artifacts without error (forward-compatible reads). Breaking changes require migration helpers.

### Config Loading: c12 (UnJS)

- **Current**: v3.3.3 stable. v4 in beta (v4.0.0-beta.3) — **not production-ready** (beta.3 had to revert a feature from beta.2).
- **v3 behavior**: `jiti` is a hard dependency and automatic fallback for `.ts` configs. Works reliably.
- **v4 behavior (avoid for now)**: `jiti` becomes optional peer dep. If not installed, `.ts` loading **silently returns `{}`** — a dangerous footgun.
- **Action**: Pin **c12 v3.3.3 + jiti as explicit dependency**. Upgrade to v4 post-GA. Integration test across Node 20/22.

---

## 8. CLI & Developer Experience

### CLI Framework: citty (UnJS)

- **Current**: v0.2.1 (released Feb 12, 2026). 16.6M downloads. Zero dependency.
- **API**: `defineCommand()` with typed args. Subcommands via `subCommands` map:

```typescript
const main = defineCommand({
  meta: { name: "agent-evals", version: "1.0.0" },
  subCommands: {
    run: () => import("./commands/run").then(m => m.default), // lazy-loaded for startup perf
    init: initCommand,   // eager
    record: () => import("./commands/record").then(m => m.default),
  },
  args: { verbose: { type: "boolean", alias: "v" } },
  run({ args }) { /* root handler */ },
})
runMain(main)
```

- **Lazy subcommand loading**: Built-in natively. Good for CLI startup performance.
- **Known Issues**: Type error on enum arguments was fixed (Issue #148, June 2024). No known critical issues.
- **vs Commander.js**:

| Aspect | citty | Commander.js |
|--------|-------|-------------|
| Type safety | First-class (args typed from definition) | Manual |
| Lazy subcommands | Built-in | Not built-in |
| Zero deps | Yes | Yes (v12+) |
| Stability | v0.2.x | v12.x |
| Error handling | `runMain` wraps automatically | Manual |

Nuxt CLI (Nuxi) depends on citty — sufficient production validation.

### CLI Commands

```bash
agent-evals run                          # Run all suites (default: replay mode)
agent-evals run --mode=live              # Run with real LLM calls
agent-evals run --mode=live --record     # Run live + save fixtures
agent-evals run --mode=judge-only --run-id=<id>  # Re-grade a previous run
agent-evals run --suite=smoke            # Run specific suite
agent-evals run --filter=H01,H02        # Run specific cases
agent-evals run --filter-failing=<id>   # Re-run only failures from a run
agent-evals run --trials=5              # Flakiness detection
agent-evals record                       # Alias: run --mode=live --record
agent-evals compare <runA> <runB>        # Diff two runs
agent-evals init                         # Interactive setup wizard
agent-evals doctor                       # Validate config, check deps
agent-evals install-hooks                # Auto-detect hook system, install
agent-evals cache clear                  # Clear fixture cache
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All evals passed, all gates met |
| 1 | Eval or gate failures |
| 2 | Configuration error |
| 3 | Runtime error (network, timeout) |

### Console Output Design

- Concise by default. One-line per case. Only show failing grader + reason on failure.
- `--verbose` for full transcript output.
- Respect `NO_COLOR` env var and `process.stdout.isTTY`.
- Progress indicator for live mode (case-level, not spinner).
- Auto-detect `$GITHUB_STEP_SUMMARY` and write markdown summary.

### Init Wizard

Using `@clack/prompts` (v1.0.1, 5.7M downloads, TypeScript-first, used by create-t3-app):

1. Project name (auto-detect from package.json)
2. Eval directory (default `./evals/`)
3. Agent framework detection (Vercel AI SDK, LangChain, CrewAI, custom)
4. Generate starter suite (smoke, 3-5 example cases)
5. Default mode (replay recommended)
6. Offer to install pre-push hooks
7. Print quickstart next steps

### Generated Files

```
evals/
├── eval.config.ts              # Ready-to-customize config
├── cases/
│   └── smoke.jsonl             # 3-5 starter cases
└── .eval-fixtures/
    └── .gitkeep
```

---

## 9. Reporting & Output

### Default Console Reporter

```
Suite: Agent Smoke Tests (replay)

  H01  Retrieves portfolio               PASS   1ms   $0.00
  H02  Formats currency correctly         PASS   1ms   $0.00
  E01  Handles missing user              FAIL   1ms   $0.00
       → tool-called: Expected "error_handler" to be called
  A01  Rejects injection                  PASS   1ms   $0.00

Results: 3 passed | 1 failed | Cost: $0.00 | Duration: 4ms
Gate: FAIL (pass rate 75% < required 95%)
```

### Machine-Readable Formats

| Format | Purpose | Status |
|--------|---------|--------|
| **JSON** (native rich schema) | Primary machine artifact | v1 core |
| **JUnit XML** | Universal CI ingestion (GitHub, GitLab, Jenkins, CircleCI) | v1 core |
| **CTRF** | Emerging standard, Datadog/GitHub Actions ingest | v1.1 optional reporter |
| **Markdown** | PR comments, GitHub Step Summary | v1 |

### JUnit XML — Minimal Required Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="eval-run" tests="3" failures="1" errors="0" time="12.4">
  <testsuite name="agent-smoke" tests="2" failures="0" time="8.1">
    <testcase name="follows instructions" classname="agent-smoke" time="4.2" />
    <testcase name="handles edge case" classname="agent-smoke" time="3.9" />
  </testsuite>
  <testsuite name="tool-use" tests="1" failures="1" time="4.3">
    <testcase name="calls correct tool" classname="tool-use" time="4.3">
      <failure message="Expected search_web, got get_weather" type="AssertionError">Full diff</failure>
    </testcase>
  </testsuite>
</testsuites>
```

- **Required**: `<testsuites>` or single `<testsuite>`, `name` on suite, `name` + `classname` on case
- **Strongly recommended**: `time`, `tests`/`failures`/`errors` counts — GitHub Actions uses these for PR annotations
- **Passing test**: no child elements needed — absence of `<failure>`/`<error>`/`<skipped>` = pass

**Recommendation**: Write a small internal generator (~30 lines, no extra dependency). The format is simple; only real edge case is XML escaping in test names. Add `junit-xml` npm package only if escaping issues arise.

### Run Comparison

```
Comparing run-abc123 → run-def456

  H01  Retrieves portfolio
    tool-sequence:  PASS → PASS  (=)
    llm-rubric:     0.92 → 0.74  (▼ regression)

  E01  Handles missing user
    tool-called:    FAIL → PASS  (▲ fixed)

Summary: 1 regression | 1 improvement | 2 unchanged
Cost delta: +$0.003
```

---

## 10. Plugin & Extensibility

### Plugin Interface

Plain objects and functions. No class hierarchies. No `BaseMetric` inheritance.

```typescript
interface EvalPlugin {
  readonly name: string
  readonly version: string
  readonly graders?: Record<string, GraderFn>
  readonly reporters?: Record<string, Reporter>
  readonly hooks?: {
    readonly beforeRun?: (context: RunContext) => Promise<void>
    readonly afterTrial?: (trial: Trial) => Promise<void>
    readonly afterRun?: (run: Run) => Promise<void>
  }
}
```

### Custom Grader Pattern

```typescript
import type { GraderFn } from 'agent-evals/plugin'

export const noInvestmentAdvice: GraderFn = async (output) => {
  const prohibited = ['you should buy', 'I recommend investing', 'guaranteed returns']
  const found = prohibited.find(p => output.text?.toLowerCase().includes(p))
  return {
    pass: !found,
    score: found ? 0 : 1,
    reason: found ? `Prohibited phrase: "${found}"` : 'No investment advice found',
  }
}
```

### Design Principles

- Composition over inheritance (`all()`, `any()`, `not()`)
- Trivially testable: `grader(mockOutput, undefined, mockContext)` — no framework bootstrap
- Versioned plugin API: `EvalPlugin.version` field, framework warns on mismatch
- Registration via `plugins: [myPlugin]` in `defineConfig()`

---

## 11. CI/CD & Git Hooks

### Tiered Pipeline (Recommended Default)

| Stage | Trigger | What Runs | Cost | Time |
|-------|---------|-----------|------|------|
| **Pre-push** | `git push` | `agent-evals run --mode=replay --suite=smoke` | $0 | <5s |
| **PR CI** | Pull request | `agent-evals run --mode=replay --reporter=junit` | $0 | <30s |
| **Nightly** | Cron | `agent-evals run --mode=live --reporter=json` | $$ | minutes |
| **Release** | Tag | Full live + comparison vs. last release | $$$ | minutes |

**Pre-commit intentionally excluded**: Eval replay adds 1-3s, too slow for pre-commit (<500ms target). Pre-commit should only run linting/formatting.

### Git Hook Detection

Auto-detect by checking:
- `.husky/` → Husky (7M weekly npm downloads)
- `lefthook.yml` → Lefthook (Go binary, 30-60% faster, native parallel)
- Neither → offer to install Husky or print standalone git hook

### GitHub Actions Example

```yaml
name: Evals
on: [pull_request]
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm agent-evals run --mode=replay --reporter=junit --output=results.xml
      - uses: mikepenz/action-junit-report@v4
        if: always()
        with: { report_paths: results.xml }
```

---

## 12. Statistical Rigor & Flakiness

### Key Findings (Anthropic Research)

- Always report SEM + 95% CI alongside scores, not just mean
- Non-overlapping CIs = genuine difference; overlapping = inconclusive
- Paired-difference analysis is a "free" variance reduction technique — frontier models correlate 0.3-0.7 on which questions they get right/wrong
- Many benchmarks violate CLT assumptions — need hundreds of examples before applying CLT; smaller evals need bootstrap/permutation tests

### Flakiness Detection

`--trials=N` runs each case N times. Report:
- Mean score ± standard deviation
- Confidence interval
- Flag cases where variance exceeds threshold

Single-run pass/fail is misleading for stochastic LLM outputs.

### Noise Types (arxiv:2512.21326)

Three noise types: prediction noise, data noise, total noise. Key finding: **paired prediction noise exceeds paired data noise** — averaging repeated runs significantly increases statistical power. Naive single-run CI gates produce false positives/negatives at higher rates than most teams assume.

---

## 13. Security Evaluation Patterns

### v1 Scope: Minimal But Extensible

The implementation plan correctly defers security policy packs (OWASP, NIST, EU AI Act) to community plugins. For v1, provide:

1. `safetyKeywords(prohibited[])` — deterministic prohibited content check
2. Plugin interface that enables community security packs

### Key Stats

- Prompt injection is #1 OWASP LLM vulnerability, present in >73% of production AI deployments
- Combined defenses reduced attack success from 73.2% → 8.7%
- STAR framework: automated jailbreak generation under 17 minutes for GPT-4

### Security Grader Ideas (Plugin-Ready, Not v1 Core)

| Type | Description |
|------|-------------|
| `injectionResistance` | Agent rejects prompt injection attempts |
| `noDataExfiltration` | Tool call arguments don't contain exfiltrated data |
| `refusalAccuracy` | Correctly refuses AND correctly permits (no false-positive refusals) |

---

## 14. Tech Stack Decisions

### Resolved Choices

| Component | Choice | Version/Status | Rationale |
|-----------|--------|---------------|-----------|
| **Runtime** | Node.js 20+ | LTS | Universal, ESM support |
| **Language** | TypeScript 5.x (strict) | Stable | `const`, `readonly`, functional, no `any` |
| **Build** | tsdown (pin exact) | v0.20.3 stable, v0.21.0-beta.2 latest | tsup is effectively abandoned (author shifted to AI/LLM work). tsdown has ESM-first defaults, auto DTS, active development. Pin exact minor to mitigate 0.x risk. |
| **CLI** | citty (UnJS) | v0.2.1, 16.6M downloads | Typed `defineCommand()`, zero deps, lighter than Commander |
| **Config loader** | c12 (UnJS) | v3.3.3 stable | Native `.ts` config loading. Pin v3 + explicit jiti dep. v4 not ready. |
| **Schema** | Zod v4 | GA | Native `z.toJSONSchema()`. `zod-to-json-schema` no longer maintained. |
| **Wizard** | @clack/prompts | v1.0.1, 5.7M downloads | Best wizard UX, TypeScript-first |
| **Colors** | picocolors | Stable | 14x smaller than chalk. Critical for hook speed. |
| **Testing** | Vitest | Stable | Fast, TypeScript-native |
| **Linter** | Biome | Stable | Replaces ESLint + Prettier, 10-100x faster |
| **Package manager** | pnpm | Stable | Fast, disk-efficient, strict deps |

### Dependency Philosophy

- **Zero runtime deps for core graders**: `contains`, `regex`, `exactMatch`, `toolCalled`, `toolSequence` use only Node builtins.
- **Minimal deps for framework**: Zod, picocolors, citty, c12, consola.
- **Optional deps for LLM graders**: Support any `fetch`-compatible API. Don't depend on `openai` or `@anthropic-ai/sdk` directly. Accept a `judge` function in config.

### tsdown Notes

tsdown is the tsup successor (same author ecosystem, Rolldown/Rust-based). Key differences from tsup:
- **Default output**: ESM (tsup defaults to CJS)
- **`clean`**: enabled by default
- **DTS**: auto-enabled if `package.json` has `types` field
- **`target`**: reads from `engines.node`
- **Known gap**: Cannot customize tsconfig path (tsup's `--tsconfig` flag has no equivalent yet)
- **Migration**: `npx tsdown-migrate` — automated, supports monorepos
- **Pin exact**: `"tsdown": "0.20.3"` — 0.x has no semver stability guarantee between minors

---

## 15. Distribution & Packaging

### v1: npm Only

```bash
npx agent-evals init          # Zero-install first use
npm install -g agent-evals    # Global
npm install --save-dev agent-evals  # Project dependency
```

### Package Format

- **CLI**: ESM-only. No reason to support CJS for an npx-invoked CLI in 2026.
- **Library exports**: ESM primary. Dual ESM/CJS only if consumer demand requires it.
- **Type/export validation**: `arethetypeswrong` in CI.

### Single Package (v1) — Not Monorepo

The implementation plan correctly chose single package with subpath exports:

```json
{
  "exports": {
    ".": { "import": "./dist/index.mjs", "types": "./dist/index.d.ts" },
    "./graders": { "import": "./dist/graders/index.mjs", "types": "./dist/graders/index.d.ts" },
    "./plugin": { "import": "./dist/plugin/types.mjs", "types": "./dist/plugin/types.d.ts" }
  }
}
```

Extract packages later when real consumers need `@agent-evals/core` without CLI. Zero users means zero signal about where boundaries should be.

### Homebrew: Deferred

npm covers the TS audience. Homebrew maintenance cost is high for Node CLIs with near-zero user gain.

---

## 16. Agent-Readable Documentation

### AGENTS.md (Generate on `init`)

Machine-readable instructions for AI coding assistants. Key sections:
- Executable commands first (agents try to run things immediately)
- Exact stack versions
- Code examples over prose
- Three-tier boundaries: always / ask first / never

### llms.txt (Optional, Not Runtime-Critical)

Markdown file at `/llms.txt` on docs site root. 844,000+ sites adopted. Useful for docs discoverability. Ship as docs site scaffold.

### MCP Server (Deferred to v1.5/v2)

Design APIs so MCP wrapping is trivial later. The eval framework as MCP server would let IDE agents `run_eval`, `get_results`, `compare_runs`, `add_golden_case`.

---

## 17. Reference Implementations

| Project | What to Study | License |
|---------|--------------|---------|
| [Evalite](https://github.com/mattpocock/evalite) | `defineConfig()` API, TypeScript DX | — |
| [vitest-evals](https://github.com/getsentry/vitest-evals) | `describeEval()` API, Vitest integration | — |
| [autoevals](https://github.com/braintrustdata/autoevals) | Standalone LLM judge implementation | MIT |
| [AgentEvals](https://github.com/langchain-ai/agentevals) | Trajectory matching (4 modes) | MIT |
| [Promptfoo](https://github.com/promptfoo/promptfoo) | CLI design, CI integration, red-teaming | MIT |
| [DeepEval](https://github.com/confident-ai/deepeval) | Agent metrics (6 agentic), metric design | — |

---

## 18. External Sources

### Primary (High Reliability)

- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Hamel Husain: Selecting the Right AI Evals Tool](https://hamel.dev/blog/posts/eval-tools/)
- [Hamel Husain: LLM Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)
- [Eval-Driven Development](https://evaldriven.org/)
- [Promptfoo CI/CD Integration](https://www.promptfoo.dev/docs/integrations/ci-cd/)
- OpenAI eval guides and graders docs
- MCP spec (2025-11-25) and SDK docs
- JSON Schema 2020-12 and OpenAPI 3.1
- OTel GenAI semantic conventions

### Secondary (Directional Signal)

- [Braintrust: Best AI Evals Tools for CI/CD 2025](https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025)
- [Braintrust: Top 5 Platforms for Agent Evals](https://www.braintrust.dev/articles/top-5-platforms-agent-evalss-2025)
- [Arize: Comparing LLM Evaluation Platforms](https://arize.com/llm-evaluation-platforms-top-frameworks/)
- [Arize: LLM-as-a-Judge](https://arize.com/llm-as-a-judge/)
- [Galileo: Four New Agent Evaluation Metrics](https://galileo.ai/blog/four-new-agent-evalsuation-metrics)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

### Research Papers

- arxiv:2512.21326 — Noise taxonomy for LLM evals (prediction noise vs data noise)
- STAR framework (2025) — Automated jailbreak generation
