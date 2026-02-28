import type { InitAnswers } from "./types.js";

/**
 * Generate an AGENTS.md file for AI coding assistants.
 * Follows the AGENTS.md spec: <=150 lines, executable commands first,
 * three-tier boundaries (always/ask first/never).
 * Pure function — no I/O.
 */
export function generateAgentsMdTemplate(answers: InitAnswers): string {
	const r = answers.packageRunner;
	const run = r === "npx" ? "npx" : r;
	const pkgRun = r === "npx" ? "npm" : r;
	return `# AGENTS.md

## Commands

\`\`\`bash
# Run all evals (default: replay mode, zero cost)
${run} agent-evals run

# Run evals in live mode (real LLM calls, costs money)
${run} agent-evals run --mode=live

# Record fixtures for replay mode
${run} agent-evals record

# Run specific suite
${run} agent-evals run --suite=smoke

# Compare two runs
${run} agent-evals compare --base=<runId> --compare=<runId>

# Validate project setup
${run} agent-evals doctor

# Run tests
${pkgRun} test

# Type-check
${pkgRun} run typecheck

# Lint
${pkgRun} run lint
\`\`\`

## Project Structure

\`\`\`
${answers.evalDir === "." ? "" : `${answers.evalDir}/`}eval.config.ts     # Eval configuration (suites, graders, judge)
${answers.evalDir === "." ? "" : `${answers.evalDir}/`}cases/             # Test case data (JSONL files)
.eval-fixtures/         # Recorded fixtures for replay mode
.eval-runs/             # Saved run results (JSON)
\`\`\`

## Eval Framework

- **Framework**: agent-evals (TypeScript, ESM-only)
- **Config**: \`eval.config.ts\` using \`defineConfig()\`
- **Modes**: live (real calls), replay (recorded fixtures), judge-only (re-grade)
- **Graders**: Deterministic (contains, regex, toolCalled, etc.) + LLM-as-judge (llmRubric, factuality)
- **Reports**: console, JSON, JUnit XML, Markdown

## Code Conventions

- TypeScript strict mode, ESM-only
- Prefer \`const\`, \`readonly\`, immutable patterns
- Functional style: pure functions, composition, early returns
- Co-located tests: \`foo.ts\` -> \`foo.test.ts\`
- Named exports over default exports

## Boundaries

### Always OK
- Running \`${run} agent-evals run\` (replay mode is safe, zero cost)
- Running tests, typecheck, and lint
- Reading and editing eval config or test cases
- Adding new graders or test cases

### Ask First
- Running \`${run} agent-evals run --mode=live\` (costs money via real API calls)
- Modifying \`.eval-fixtures/\` (affects replay results)
- Changing gate thresholds (affects CI pass/fail)

### Never
- Committing API keys or secrets
- Deleting \`.eval-runs/\` without user confirmation
- Running \`--mode=live\` in CI without explicit approval
`;
}
