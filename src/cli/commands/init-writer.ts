import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { generateAgentsMdTemplate } from "../templates/agents-md-template.js";
import { generateStarterCases } from "../templates/cases-template.js";
import { generateConfigTemplate } from "../templates/config-template.js";
import type { InitAnswers } from "../templates/types.js";
import { generateWorkflowTemplate } from "../templates/workflow-template.js";

export interface WriteResult {
	readonly filesCreated: readonly string[];
	readonly filesSkipped: readonly string[];
}

/**
 * Write all generated files to disk.
 * Creates directories as needed. Skips files that already exist (unless overwrite is true).
 */
export async function writeInitFiles(
	cwd: string,
	answers: InitAnswers,
	options?: { readonly overwrite?: boolean },
): Promise<WriteResult> {
	const created: string[] = [];
	const skipped: string[] = [];

	// 1. eval.config.ts
	const configPath = join(cwd, "eval.config.ts");
	await writeIfAbsent(
		configPath,
		generateConfigTemplate(answers),
		options?.overwrite,
		created,
		skipped,
	);

	// 2. Starter cases
	const casesDir = join(cwd, answers.evalDir === "." ? "cases" : `${answers.evalDir}/cases`);
	await mkdir(casesDir, { recursive: true });
	const casesPath = join(casesDir, "smoke.jsonl");
	await writeIfAbsent(casesPath, generateStarterCases(), options?.overwrite, created, skipped);

	// 3. .eval-fixtures/.gitkeep
	const fixturesDir = join(cwd, ".eval-fixtures");
	await mkdir(fixturesDir, { recursive: true });
	const gitkeepPath = join(fixturesDir, ".gitkeep");
	await writeIfAbsent(gitkeepPath, "", options?.overwrite, created, skipped);

	// 4. GitHub Actions workflow (optional)
	if (answers.generateWorkflow) {
		const workflowDir = join(cwd, ".github", "workflows");
		await mkdir(workflowDir, { recursive: true });
		const workflowPath = join(workflowDir, "evals.yml");
		await writeIfAbsent(
			workflowPath,
			generateWorkflowTemplate(answers),
			options?.overwrite,
			created,
			skipped,
		);
	}

	// 5. AGENTS.md (optional)
	if (answers.generateAgentsMd) {
		const agentsPath = join(cwd, "AGENTS.md");
		await writeIfAbsent(
			agentsPath,
			generateAgentsMdTemplate(answers),
			options?.overwrite,
			created,
			skipped,
		);
	}

	return { filesCreated: created, filesSkipped: skipped };
}

async function writeIfAbsent(
	path: string,
	content: string,
	overwrite: boolean | undefined,
	created: string[],
	skipped: string[],
): Promise<void> {
	if (!overwrite) {
		try {
			await access(path);
			skipped.push(path);
			return;
		} catch {
			// File doesn't exist — write it
		}
	}
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf-8");
	created.push(path);
}
