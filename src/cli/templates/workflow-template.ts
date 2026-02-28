import type { InitAnswers, ReporterChoice } from "./types.js";

/**
 * Generate a GitHub Actions workflow for eval CI.
 * Pure function — no I/O.
 */
export function generateWorkflowTemplate(answers: InitAnswers): string {
	const reporter = selectCiReporter(answers.reporters);
	const outputFlag = reporter === "junit" ? " --output=results.xml" : "";
	const reporterFlag = reporter !== "console" ? ` --reporter=${reporter}` : "";
	const r = answers.packageRunner;
	const runCmd = r === "npx" ? "npx" : r;

	return `name: Evals
on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
${generateSetupSteps(r)}
      - run: ${runCmd} agent-evals run --mode=replay${reporterFlag}${outputFlag}
        name: Run evals (replay mode)
${reporter === "junit" ? generateJunitStep() : ""}`;
}

function selectCiReporter(reporters: readonly ReporterChoice[]): ReporterChoice {
	if (reporters.includes("junit")) return "junit";
	if (reporters.includes("json")) return "json";
	return "console";
}

function generateSetupSteps(packageRunner: string): string {
	switch (packageRunner) {
		case "pnpm":
			return `      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
`;
		case "yarn":
			return `      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: yarn
      - run: yarn install --frozen-lockfile
`;
		case "bun":
			return `      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
`;
		default:
			return `      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
`;
	}
}

function generateJunitStep(): string {
	return `      - uses: mikepenz/action-junit-report@v4
        if: always()
        with:
          report_paths: results.xml
          check_name: Eval Results
`;
}
