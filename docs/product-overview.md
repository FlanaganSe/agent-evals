# Product Overview

## What this is

Agent Eval Kit is a TypeScript-native evaluation framework for AI agent workflows. It lets you define test suites with cases, run your agent against them, and grade outputs using composable deterministic and LLM-as-judge graders — then compare runs across code changes with statistical rigor.

The core problem: AI agents are non-deterministic. You can't just write unit tests and call it done. You need to run the same inputs many times, grade outputs against rubrics (both hard rules and fuzzy LLM judgment), record fixtures for deterministic replay, and track whether your agent is getting better or worse over time. This framework does all of that with CI-friendly exit codes, file-based persistence (no database), and a provider-agnostic design that works with any LLM backend.

**Design philosophy**: The framework is deliberately low-infrastructure. No database, no bundler, no cloud dependency. Config is TypeScript (not YAML/JSON) so you get full IDE support and can define targets and judges as regular functions. Graders are pure functions. The judge is injected, not hardcoded. Everything persists as flat files. The goal is a tool that a single developer can adopt in an afternoon and a team can run in CI by the end of the week.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20.16+ | Minimum for recursive `fs.watch`. Dev uses Node 22 LTS for native TS type-stripping |
| Language | TypeScript 5.9+, strict, ESM-only | `erasableSyntaxOnly` enables Node's native TS execution — no enums, no `import =` |
| Build | Plain `tsc` | No bundler complexity. `isolatedDeclarations` disabled because Zod inference types are too complex for it |
| Tests | Vitest 4.x | Co-located (`foo.ts` → `foo.test.ts`). No mocking framework — plain objects |
| Package manager | pnpm | Workspace-aware, strict peer deps |
| Linter/Formatter | Biome 2.4.x | Fast, single-tool replacement for ESLint + Prettier |
| Schema validation | Zod 4.x | `z.strictObject()` everywhere — rejects unexpected keys to catch typos and drift |
| Config loading | jiti 2.x | Imports `eval.config.ts` at runtime without a build step |
| CLI | citty 0.2.x | Lightweight, lazy-loaded subcommands |
| MCP SDK | `@modelcontextprotocol/sdk` | Production dep (not dev) — enables IDE integration |
| Interactive prompts | `@clack/prompts` | Used in `init` wizard and `install-hooks` |
| Terminal colors | picocolors | Zero-dependency, fast |

No database. No bundler. No runtime transpilation beyond jiti for config loading.

## Architecture

### Pipeline overview

```
eval.config.ts                          ← User-authored TypeScript config
    ↓ loadConfig() via jiti             ← Probes .ts → .mts → .js → .mjs
    ↓ Case loading from .jsonl/.yaml    ← Inline cases or external files, deduped by ID
ValidatedConfig (resolved suites with loaded cases)
    ↓ runSuite()                        ← Concurrent case execution via worker pool
    │
    ├─ Live mode:   target(input) → TargetOutput  ← Call the agent
    │   └─ Optionally writeFixture()               ← Record for later replay
    ├─ Replay mode: readFixture() → TargetOutput   ← Load from .eval-fixtures/
    └─ Judge-only:  previous run's outputs          ← Re-grade without re-running
        │
        ↓ runGraderPipeline()           ← Case graders replace suite defaults (never merge)
        ↓ computeCaseResult()           ← Required check → weighted average → threshold
    Trial[] (one per case × trial count)
        ↓ computeAllTrialStats()        ← Wilson intervals, pass^k semantics, flakiness
        ↓ evaluateGates()               ← passRate, maxCost, p95LatencyMs thresholds
    Run artifact                        ← Complete result with schemaVersion
        ↓ saveRun() → .eval-runs/{runId}.json
        ↓ reporters: console, json, junit, markdown
        ↓ compareRuns(base, compare) → RunComparison (never persisted)
```

### Execution model

The runner uses a **bounded worker pool** (`concurrentMap`). N worker coroutines pull from a shared work queue. Each case × trial pair is one work item. Rate limiting (token bucket, `maxRequestsPerMinute`) gates the `acquire()` call before each target invocation in live mode only.

**Multi-trial runs** use **pass^k semantics**: a case passes only if *all* k trials pass. This is deliberately strict — it catches flaky behavior that single-trial runs miss. Statistics per case include Wilson score confidence intervals (superior to normal approximation for small N and extreme proportions like all-pass or all-fail), standard deviation, and a `flaky` flag (set when 0 < passCount < trialCount).

**Abort handling**: The runner checks `signal.aborted` before each work item and after the worker pool drains. Aborted runs still produce a valid `Run` artifact with `summary.aborted: true`.

### Scoring algorithm

`computeCaseResult()` in `src/graders/scoring.ts` works in three steps:

1. **Required graders first** — Any `{ required: true }` grader that fails causes immediate case failure (score 0). This is a hard gate, not weighted.
2. **Weighted average** — All grader scores are combined via `Σ(score × weight) / Σ(weight)`. Default weight is 1.0.
3. **Threshold check** — The aggregate score is compared against `caseThreshold` (inferred as the minimum of individual grader thresholds, or 0.5 if none specified).

Empty grader list = vacuous pass (score 1.0). This is intentional — a case with no graders is "not yet evaluated," not "failed."

## Directory structure

```
src/
├── cli/              CLI entry + 9 subcommands (citty-based, lazy-loaded)
│   ├── commands/     run, record, compare, list, init, doctor, mcp, cache, install-hooks
│   └── templates/    Scaffolding templates for init wizard
├── config/           Zod schemas, type system, config loader, case loaders (.jsonl, .yaml)
├── runner/           Execution engine, pipeline, gates, statistics, rate limiter, cost estimator
├── graders/          All grader implementations
│   ├── deterministic/  14 pure-function graders (text, tool-call, metric, safety)
│   ├── llm/            3 LLM graders + prompt builders + response parser + caching (memory + disk)
│   ├── compose.ts      all(), any(), not() — logic operators
│   └── scoring.ts      Case-level score aggregation
├── storage/          Run persistence (JSON files in .eval-runs/)
├── fixtures/         Record-replay fixture store (.eval-fixtures/)
├── comparison/       Run diffing (full outer join by case ID) + formatting
├── reporters/        Output formatters (console, json, junit, markdown) + progress plugin
├── plugin/           Plugin type definitions + hook dispatcher
├── mcp/              MCP server: 8 tools, 3 resources, stdio transport
│   └── tools/        Each tool handler is (args, cwd) => Promise<ToolResult> — testable without SDK
└── watcher/          File watcher for --watch mode (filters .ts, .js, .jsonl, .yaml, .yml)

bin/cli.mjs           5-line shim: dynamic import of dist/cli/index.js
docs/                 Astro/Starlight documentation site (separate node_modules)
.eval-runs/           Persisted run artifacts (JSON, one file per run)
.eval-fixtures/       Recorded agent outputs for replay mode
.eval-cache/          Judge response cache (disk LRU)
```

## Core concepts

The framework has **locked terminology** — these exact terms are used consistently in code, tests, docs, and comments. No synonyms.

| Term | Type/Interface | What it is |
|------|---------------|------------|
| **Suite** | `SuiteConfig` / `ResolvedSuite` | A named evaluation configuration. Contains `target`, `cases`, `defaultGraders`, optional `gates`. `ResolvedSuite` has cases loaded from files. |
| **Case** | `Case` | A single test scenario. Has `id`, `input` (messages, system prompt, tools), optional `expected`, optional `category`, optional `tags`. Cases are data (loaded from `.jsonl`/`.yaml`), so they don't carry grader functions — grading is configured at the suite level via `defaultGraders`. |
| **Trial** | `Trial` | One execution of one case. Multi-trial runs produce N trials per case. Contains `output`, `grades`, `score`, `status` (pass/fail/error). |
| **Run** | `Run` | The complete result artifact. All trials, summary (pass rate, cost, latency, gates, by-category breakdown), metadata. Persisted as JSON with `schemaVersion`. |
| **Grader** | `GraderFn` | `(output, expected, context) => GradeResult`. Returns `{pass, score, reason, graderName}`. Either deterministic (pure function, no I/O) or LLM-based (requires judge). |
| **Gate** | `GateConfig` | Quality thresholds: `passRate` (minimum fraction), `maxCost` (dollar cap), `p95LatencyMs` (latency ceiling). All three are optional; all must pass for the run to pass. |
| **Fixture** | — | A recorded `TargetOutput` for replay mode. Stored as 2-line JSONL in `.eval-fixtures/`. Keyed by suite + case + config hash. |
| **Target** | `Target` | The function being evaluated: `(input: CaseInput) => Promise<TargetOutput>`. This is *your* agent. |

### Input/Output shapes

**`CaseInput`**: `messages` (chat history), optional `systemPrompt`, optional `tools` (definitions), optional `metadata`.

**`TargetOutput`**: `text` (response), optional `toolCalls` (name + args + result), optional `tokenUsage`, optional `latencyMs`, optional `cost`, optional `raw` (provider payload — can be stripped at fixture write time), optional `metadata`.

### Critical rule: case graders replace, not merge

When a case specifies its own `graders`, the suite's `defaultGraders` are completely ignored for that case. The pipeline checks `caseGraders && caseGraders.length > 0 ? caseGraders : (suiteGraders ?? [])` — there is no merging. This makes each case self-contained and predictable; a case author always knows exactly which graders will run.

### Run modes

| Mode | Behavior | When to use |
|------|----------|-------------|
| `live` | Calls the target function. Optionally records fixtures (`--record`). | Normal evaluation, initial fixture recording |
| `replay` | Loads fixtures instead of calling target. Hard error if fixtures are missing or config-hash-mismatched. | CI, deterministic re-grading, cost-free iteration |
| `judge-only` | Re-grades a previous run's outputs without re-running the target. Requires `--run-id`. | Iterating on grader criteria without re-running (and re-paying for) the agent |

## Grader system

### Factory pattern

Every grader is a factory function that returns a `GraderFn`:

```ts
type GraderFactory<TConfig> = (config: TConfig) => GraderFn;
```

Config is closed over at creation time. The returned `GraderFn` is a pure function of `(output, expected, context)`. This separation means grader configuration is validated once at suite definition time, not on every case execution.

### Built-in graders (14 deterministic + 3 LLM + 3 composition operators)

**Deterministic — Text**: `contains`, `notContains`, `exactMatch`, `regex`, `jsonSchema`
**Deterministic — Tool calls**: `toolCalled`, `toolNotCalled`, `toolSequence` (strict/unordered/subset/superset modes), `toolArgsMatch` (exact/subset/contains modes)
**Deterministic — Metrics**: `latency`, `cost`, `tokenCount`
**Deterministic — Safety**: `safetyKeywords`, `noHallucinatedNumbers`

**LLM-as-judge**: `llmRubric` (4-point scale → 0.25/0.50/0.75/1.00), `factuality` (requires `expected.text`), `llmClassify` (N categories)

**Composition**: `all()` (min score), `any()` (max score), `not()` (inverted pass, 1-score). None short-circuit — all graders always run so every result appears in the report for debugging.

### LLM graders and the judge

LLM graders don't call an LLM directly. They receive a `judge` function through `GraderContext` — injected from `EvalConfig.judge.call` at the config root. This design:

1. **Keeps grader factories pure** — no closure over an LLM client
2. **Makes testing trivial** — `createMockJudge(responses)` returns `{ judge, calls }` for asserting prompt construction
3. **Is provider-agnostic** — the user implements `JudgeCallFn: (messages, options?) => Promise<JudgeResponse>` with whatever SDK they prefer (OpenAI, Anthropic, etc.)
4. **Shares one judge across all suites** — keeps the config surface small. If you need per-grader model routing, wrap the judge function.

LLM graders self-tag with `{ requiresJudge: true }` on the returned function so the cost estimator can identify them without executing them.

**3-layer response parser**: The judge response parser tries strict JSON → regex extraction → text pattern matching. This handles models that wrap JSON in markdown fences, omit braces, use `reasoning` vs `reason`, or score on a different field name. The fallback chain is deliberate — it maximizes compatibility across model providers without requiring prompt engineering for JSON mode.

### Judge caching

Two layers, both keyed on prompt content hash:

1. **In-memory LRU** (`createCachingJudge`) — Deduplicates within a single run. If the same prompt appears twice (e.g., same case in multi-trial), the second call returns the cached response.
2. **Disk LRU** (`createDiskCachingJudge`) — Persists to `.eval-cache/judge/{hash}.json` with configurable TTL (default 7 days) and max entries (default 10,000).

Both layers **only cache `temperature=0` calls**. Non-zero temperature is assumed to be intentionally stochastic.

## Comparison system

`compareRuns()` in `src/comparison/compare.ts` performs a **full outer join** by case ID across two runs.

Each case gets a `ChangeDirection`: `regression` | `improvement` | `unchanged` | `added` | `removed`. Classification logic:
- **Status change trumps score**: pass → not-pass is always `regression`, not-pass → pass is always `improvement`
- **Score delta threshold** (default 0.05): below-threshold score changes are `unchanged`
- **Added/removed**: cases present in only one run

For multi-trial runs, comparison uses the aggregate (pass^k status, mean score) rather than raw trial-0 data — consistent with how `RunSummary` is computed.

The comparison also drills down to **per-grader changes** (which graders flipped pass/fail?) and **per-category summaries** (did a specific category regress?). Results are sorted regressions-first for quick scanning.

`RunComparison` is computed on-demand and never persisted — no schema version, no storage format to maintain.

## Plugin system

```ts
interface EvalPlugin {
  readonly name: string;
  readonly version: string;
  readonly graders?: Record<string, GraderFn>;  // Custom graders, keyed by name
  readonly hooks?: {
    beforeRun?: (context: BeforeRunContext) => Promise<void>;
    afterTrial?: (trial: Trial, context: AfterTrialContext) => Promise<void>;
    afterRun?: (run: Run) => Promise<void>;
  };
}
```

Plugins are plain objects — no classes, no inheritance, no registration API. Pass them in `defineConfig({ plugins: [...] })`. Hooks are called sequentially in registration order.

**Error semantics**: `beforeRun` errors propagate and fail the run — setup failures indicate real problems. `afterTrial` and `afterRun` errors are logged and swallowed (non-breaking — a flaky telemetry or cleanup hook must not fail the evaluation).

The built-in `createProgressPlugin()` is implemented as a plugin — it uses `afterTrial` to render a progress bar to stderr.

## Reporter system

Reporters transform a `Run` artifact into an output format. Four built-in reporters:

| Reporter | Output | Use case |
|----------|--------|----------|
| `console` | Colored terminal table to stderr | Human review during development |
| `json` | JSON to stdout or file | Machine consumption, CI artifacts |
| `junit` | JUnit XML | Integration with CI systems (GitHub Actions, Jenkins) |
| `markdown` | Markdown summary | PR comments, documentation |

Custom reporters implement `ReporterPlugin: { name, report: (run, options) => Promise<string | undefined> }`. The framework handles file I/O — reporters just return a string. Return `undefined` if the reporter handles its own output.

Reporters can be configured as strings (`"console"`), plugin objects, or objects with options (`{ reporter: "json", output: "results.json" }`).

## Data layer

No database. All persistence is file-based:

### Run artifacts — `.eval-runs/{runId}.json`

Complete `Run` objects with `schemaVersion: "1.0.0"`. Run IDs are `run-YYYYMMDD-HHmmss-XXXX` — human-readable, time-sortable, with a 4-char random suffix to prevent same-second collisions.

`listRuns()` reads all files, parses minimally, sorts newest-first, and skips corrupt files gracefully (no crash on a malformed JSON file).

### Fixtures — `.eval-fixtures/{slugified-suite}/{slugified-case}.jsonl`

Two-line JSONL format: line 1 is metadata (`_meta` with schemaVersion, suiteId, caseId, configHash, recordedAt, frameworkVersion), line 2 is the `TargetOutput`. Suite/case names are slugified with an 8-char hash suffix to prevent filesystem collisions from similar names.

**Config hash for fixture invalidation** is intentionally narrow: `SHA256(suiteName + targetVersion)[0:16]`. Grader changes, gate threshold changes, and even target function source changes do NOT invalidate fixtures. The user explicitly bumps `targetVersion` when agent logic changes. This prevents unnecessary re-recording when iterating on evaluation criteria — you shouldn't have to re-run (and re-pay for) your agent just because you tweaked a grader.

### Run config hash (different purpose)

The `Run` artifact also has a `configHash`, but it's computed differently: `SHA256(name + caseCount + caseIds + gates)`. This wider hash tracks structural changes to the suite for comparison purposes. These two hashes serve different needs — fixture invalidation is about *target behavior*, run identity is about *suite structure*.

### Judge cache — `.eval-cache/judge/{hash}.json`

Disk-based LRU with configurable TTL and max entries. Only caches `temperature=0` calls.

## CLI commands

| Command | Purpose | Key flags |
|---------|---------|-----------|
| `run` | Execute suites | `--mode`, `--record`, `--suite`, `--filter`, `--filter-failing`, `--trials`, `--concurrency`, `--strict-fixtures`, `--rate-limit`, `--reporter`, `--watch`, `--confirm-cost`, `--auto-approve` |
| `record` | Shorthand for `run --mode=live --record` | Same as `run` |
| `compare` | Diff two runs | `--base`, `--compare`, `--fail-on-regression`, `--score-threshold`, `--format` |
| `list` | List stored runs | `--suite`, `--limit` |
| `init` | Interactive scaffolding wizard | Detects framework, package manager, hook manager |
| `doctor` | 7 diagnostic checks | Node version, config validity, duplicate suite names, storage, fixtures, git hooks, AGENTS.md |
| `cache clear` | Clear fixtures and/or judge cache | — |
| `cache stats` | Show cache sizes and age ranges | — |
| `install-hooks` | Set up git pre-push hooks | Supports husky, lefthook, simple-git-hooks, or raw `.git/hooks/` |
| `mcp` | Start MCP server (stdio) | — |

**Global flags** (shared across all commands via `src/cli/shared-args.ts`): `--verbose/-v`, `--quiet/-q`, `--no-color`, `--config/-c`.

**Exit codes**: 0 (pass), 1 (gate fail or regression), 2 (config error), 3 (runtime error), 130 (SIGINT). The logger writes exclusively to stderr; stdout is reserved for reporter output (and JSON-RPC in MCP mode).

### Cost estimator

Before a live run, `estimateCost()` scans all graders for the `requiresJudge` flag and estimates the total LLM judge spend based on case count × trial count × judge cost. The `--confirm-cost` flag shows this estimate and prompts for approval before proceeding. `--auto-approve` skips the prompt (for CI).

## MCP integration

The MCP server (`src/mcp/server.ts`) exposes the framework's capabilities to AI-powered IDEs.

**8 tools**: `run-suite`, `list-runs`, `get-run-details`, `compare-runs`, `list-suites`, `describe-config`, `list-graders`, `validate-config`

**3 resources**: `eval://schema/config` (JSON Schema), `eval://schema/case` (JSON Schema), `eval://reference/graders` (Markdown reference card)

The MCP SDK is dynamically imported to keep it out of the main bundle path. `cwd` is captured once at startup and threaded to every handler. All handlers catch errors and return `errorResult` rather than throwing. `validate-config` includes a path-traversal guard.

Handler signature: `async (args, cwd) => Promise<ToolResult>` — pure functions testable without the MCP SDK. The tests use plain objects, not a running JSON-RPC server.

Note: `run-suite` hardcodes `concurrency: 1`, ignoring the config's concurrency setting. This is a deliberate safety choice for MCP — IDE-triggered runs should be predictable and sequential.

## Package exports

```
agent-eval-kit             Main: schemas, types, runner, storage, graders, reporters, comparison
agent-eval-kit/graders     Grader functions only (tree-shakeable)
agent-eval-kit/comparison  Run comparison utilities
agent-eval-kit/plugin      Plugin type definitions
agent-eval-kit/reporters   Reporter utilities
agent-eval-kit/fixtures    Fixture store operations
agent-eval-kit/watcher     File watcher for watch mode
```

All export conditions list `types` before `default` — TypeScript resolves the first matching condition, so this ensures `.d.ts` files are found before `.js`.

## Environment and config

### Config file

`eval.config.ts` (or `.mts`, `.js`, `.mjs`) — loaded via jiti at runtime. `defineConfig()` provides type checking:

```ts
import { defineConfig } from "agent-eval-kit";

export default defineConfig({
  suites: [{
    name: "smoke",
    target: myAgent,
    cases: "cases/smoke.jsonl",
    defaultGraders: [{ grader: contains("hello"), weight: 1 }],
    gates: { passRate: 0.9, maxCost: 5.0 },
    targetVersion: "1.0.0",
  }],
  judge: { call: myJudgeFn },
  run: {
    defaultMode: "live",
    timeoutMs: 30_000,
    rateLimit: 60,
  },
  fixtureDir: ".eval-fixtures",
  plugins: [createProgressPlugin()],
  reporters: ["console", { reporter: "junit", output: "results.xml" }],
});
```

### Key config fields

- **`judge`**: Config-root level (shared by all LLM graders). Contains `call: JudgeCallFn` — a provider-agnostic function `(messages, options?) => Promise<JudgeResponse>`. Users wire in their own LLM client.
- **`run.defaultMode`**: `"live"` | `"replay"` — overrideable per CLI invocation with `--mode`.
- **`run.rateLimit`**: Token bucket (`maxRequestsPerMinute`) — only applies in live mode. Intentionally simple: no jitter, no exponential backoff, no per-endpoint differentiation.
- **`fixtureDir`**: Path for recorded fixtures. Validated against directory traversal.
- **`plugins`**: Array of `EvalPlugin` objects — contribute custom graders and lifecycle hooks.
- **`suites[].targetVersion`**: User-controlled version string. Bumping this invalidates fixtures, forcing re-recording. This is the only mechanism for fixture invalidation — function source changes do not invalidate.
- **`suites[].replay`**: `{ ttlDays, stripRaw }` — controls fixture TTL and whether the `raw` field is stripped at write time.

### No required env vars

The framework itself has zero required environment variables. LLM API keys are the user's responsibility, passed through their `judge` and `target` implementations.

## Testing

```bash
pnpm test          # Vitest run (all unit tests)
pnpm test:watch    # Vitest watch mode
pnpm typecheck     # tsc --noEmit
pnpm lint          # Biome check
pnpm verify        # typecheck + lint + test (CI gate)
```

**68 test files**, all co-located. Runnable examples in `examples/` hit real LLM APIs (OpenRouter) and are excluded from CI.

**Testing philosophy**:
- No mocking framework — plain objects and functions everywhere
- Temp dirs via `mkdtemp` + cleanup in `afterEach`
- Config loader tests use `cwd` option, never `process.chdir` (avoids global state)
- Mock judge: `createMockJudge(responses)` returns `{ judge, calls }` for asserting prompt construction and call counts
- MCP handlers tested as pure `(args, cwd) => Promise<ToolResult>` — no SDK or server required
- `createTempConfig()` helper writes a minimal `eval.config.ts` to a temp dir for integration tests

**Well-covered**: all 14 deterministic graders (with exhaustive edge cases), scoring, pipeline, statistics, config loading, case loading, fixture store, comparison logic, CLI commands, MCP tool handlers. **Less covered**: CLI end-to-end integration, MCP JSON-RPC transport level.

## Important decisions and tradeoffs

### Why TypeScript config (not YAML/JSON)?
Config contains functions (`target`, `judge.call`, grader factories). YAML/JSON would require a separate registration mechanism for functions, adding indirection. TypeScript config with `defineConfig()` gives full type checking, IDE autocompletion, and the ability to define everything in one place.

### Why file-based storage (not a database)?
Runs are infrequent (maybe dozens per day), individually small (< 1MB typically), and need to be human-inspectable and git-committable. A database would add infrastructure, connection management, migrations, and a deployment dependency — all overhead for a use case that flat JSON files handle perfectly. The `listRuns()` function just reads a directory.

### Why pure function graders?
Deterministic graders have no I/O, no side effects, no external state. This makes them trivially testable (pass in an output, check the result), composable (wrap in `all()`/`any()`/`not()`), and cacheable. LLM graders are the intentional exception — they need I/O by nature — but even they receive the judge function through injection rather than importing it.

### Why judge at config root, not per-grader?
One judge function is shared across all LLM graders in all suites. This keeps the config surface small, avoids the complexity of per-grader LLM routing, and ensures consistent model behavior across the evaluation. If you need different models for different graders, wrap the judge function with routing logic — the framework doesn't need to know.

### Why case graders replace, not merge?
Merging creates subtle interactions: a case author doesn't realize they're also getting suite-level graders, or adding a case grader unexpectedly changes the weight distribution. Replacement is predictable — if a case specifies graders, those are the only graders that run.

### Why two different config hashes?
**Fixture config hash** (narrow: `suiteName + targetVersion`) controls fixture invalidation. Grader changes must NOT invalidate fixtures because you shouldn't have to re-run your agent just to tweak evaluation criteria. **Run config hash** (wider: `name + caseCount + caseIds + gates`) tracks structural changes for comparison. These serve fundamentally different purposes — conflating them would mean either too-aggressive fixture invalidation or too-loose run identity.

### Why Wilson interval (not normal approximation)?
Normal approximation breaks down for small sample sizes (< 30 trials) and extreme proportions (100% pass or 0% pass) — exactly the scenarios most common in eval runs. Wilson intervals remain valid in these cases and naturally bound to [0, 1].

### Why pass^k semantics (not majority vote)?
Pass^k (all trials must pass) is deliberately strict. If a case passes 4/5 times, it's flaky — and flaky cases should not count as passing. This catches non-determinism that majority-vote would paper over. The `flaky` flag on `TrialStats` explicitly surfaces this.

### Why `afterTrial` errors are swallowed?
Plugin hooks like progress reporting and telemetry should never fail an evaluation. A flaky telemetry endpoint or a stderr write error in a progress bar must not turn a passing eval run into a failure. `beforeRun` and `afterRun` errors propagate because they indicate setup/teardown problems that likely affect the evaluation itself.

### `isolatedDeclarations` disabled
Zod 4's schema inference types are too complex for TypeScript's isolated declarations mode. The tsconfig notes to re-enable if switching to a faster type-checker (oxc, swc).

## Gotchas

1. **`z.record(CaseCategorySchema, ...)` doesn't accept partial records in Zod v4.** The `byCategory` field uses `z.record(z.string(), ...)` instead. If you try to use the category enum as the key type, Zod will reject records that don't have all categories.

2. **Fixture config-hash mismatch is a hard error in replay mode.** If you change `targetVersion` or suite name, you must re-record fixtures. The error message includes both the recorded and expected hashes.

3. **Watch mode filters by file extension** (`.ts`, `.js`, `.jsonl`, `.yaml`). Changes to `.json` files (including `.eval-runs/` artifacts) do not trigger re-runs.

4. **`noHallucinatedNumbers` skips years (1900–2100) and small integers (<10) by default.** Override with `skipSmallIntegers: false` if you need to catch those. It also extracts numbers from tool call results recursively, not just from `output.text`.

5. **Judge cache only works at temperature=0.** Non-zero temperature calls always pass through to the LLM. This applies to both in-memory and disk caches.

6. **MCP server uses stdio transport.** All logging goes to stderr (stdout is reserved for JSON-RPC). Don't `console.log` in target functions if running via MCP.

7. **The `raw` field on TargetOutput is stripped at fixture write time** (if `stripRaw` is enabled in config, or by default in replay config). Once stripped, it's gone — the fixture file won't have it.

8. **`all()` and `any()` do not short-circuit.** All graders run even if the first one determines the outcome. This is deliberate — it ensures all results appear in the report for debugging.

9. **Empty grader list = vacuous pass.** A case with no graders passes with score 1.0. A suite with no `defaultGraders` and cases without per-case graders will pass everything.

10. **`strictFixtures` mode makes stale fixtures a hard error.** Without it, stale fixtures produce a warning but still replay. Enable `--strict-fixtures` in CI to catch forgotten re-records.

11. **Plugin `afterTrial` errors are swallowed** (logged to stderr, don't fail the run). `beforeRun` and `afterRun` errors propagate.

12. **Run IDs contain timestamps** (`run-YYYYMMDD-HHmmss-XXXX`). They sort lexicographically by time. The 4-char random suffix prevents collisions within the same second.

13. **MCP `run-suite` hardcodes concurrency to 1**, ignoring the suite's concurrency setting. IDE-triggered runs are sequential by design.

14. **`runGraderPipeline()` has a `caseGraders` parameter that is never used by the runner.** Both `runner.ts` and `judge-only.ts` always pass `undefined` for `caseGraders`. The pipeline supports per-case grader override as an API capability, but since `Case` objects are data (loaded from `.jsonl`/`.yaml`) and don't carry function references, the runner always falls through to `suiteGraders`. All grading configuration happens at the suite level via `defaultGraders`.

15. **Config validation is hand-written, not Zod.** `SuiteConfig` contains functions (`target`, `judge.call`) which Zod can't validate. The loader does structural checks (array of suites, required fields, duplicate suite name detection, plugin validation) without schema parsing.
