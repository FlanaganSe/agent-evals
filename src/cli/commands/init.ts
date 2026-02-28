import { resolve } from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	multiselect,
	note,
	outro,
	select,
	tasks,
	text,
} from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import type {
	AgentFramework,
	HookManager,
	InitAnswers,
	ReporterChoice,
} from "../templates/types.js";
import { detectHookManager } from "./hook-detection.js";
import { installPrePushHook } from "./hook-installer.js";
import {
	detectFramework,
	detectPackageRunner,
	detectProjectName,
	findExistingConfig,
	hasGitHubDir,
} from "./init-detect.js";
import { writeInitFiles } from "./init-writer.js";

interface Detections {
	readonly projectName: string;
	readonly framework: AgentFramework;
	readonly hasGitHub: boolean;
	readonly hookManager: { readonly manager: HookManager } | undefined;
	readonly packageRunner: string;
	readonly existingConfig: string | undefined;
}

function buildDefaultAnswers(detections: Detections): InitAnswers {
	return {
		projectName: detections.projectName,
		evalDir: ".",
		framework: detections.framework,
		defaultMode: "replay",
		reporters: ["console"],
		generateWorkflow: detections.hasGitHub,
		generateAgentsMd: true,
		installHooks: false, // Never auto-install hooks — too invasive
		hookManager: detections.hookManager?.manager,
		packageRunner: detections.packageRunner,
	};
}

async function runDetections(cwd: string): Promise<Detections> {
	const [projectName, framework, hasGitHub, hookDetection, packageRunner, existingConfig] =
		await Promise.all([
			detectProjectName(cwd),
			detectFramework(cwd),
			hasGitHubDir(cwd),
			detectHookManager(cwd),
			detectPackageRunner(cwd),
			findExistingConfig(cwd),
		]);

	return {
		projectName,
		framework,
		hasGitHub,
		hookManager: hookDetection ? { manager: hookDetection.manager } : undefined,
		packageRunner,
		existingConfig,
	};
}

function handleCancel(value: unknown): void {
	if (isCancel(value)) {
		cancel("Setup cancelled. No files were written.");
		process.exit(0);
	}
}

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "init", description: "Initialize eval configuration" },
	args: {
		cwd: {
			type: "string" as const,
			description: "Project directory to initialize (default: current directory)",
		},
		yes: {
			type: "boolean" as const,
			alias: "y",
			description: "Accept all defaults (non-interactive)",
			default: false,
		},
	},
	async run({ args }) {
		const cwd = resolve(args.cwd ?? ".");
		const detections = await runDetections(cwd);

		// Non-interactive mode
		if (args.yes) {
			const answers = buildDefaultAnswers(detections);
			const result = await writeInitFiles(cwd, answers);
			for (const f of result.filesCreated) {
				process.stdout.write(`  ${pc.green("+")} ${f}\n`);
			}
			for (const f of result.filesSkipped) {
				process.stdout.write(`  ${pc.yellow("~")} ${f} (already exists)\n`);
			}
			return;
		}

		// Interactive wizard
		intro(pc.bold("agent-evals init"));

		// Check for existing config
		if (detections.existingConfig) {
			const overwrite = await select({
				message: `Existing config found: ${detections.existingConfig}. What should we do?`,
				options: [
					{ value: "abort" as const, label: "Abort", hint: "Keep existing config" },
					{ value: "overwrite" as const, label: "Overwrite", hint: "Replace existing config" },
				],
			});
			handleCancel(overwrite);
			if (overwrite === "abort") {
				cancel("Keeping existing config. No changes made.");
				process.exit(0);
			}
		}

		// Project name
		const projectName = await text({
			message: "Project name",
			initialValue: detections.projectName,
			placeholder: detections.projectName,
		});
		handleCancel(projectName);

		// Agent framework
		const framework = await select({
			message: "Agent framework",
			initialValue: detections.framework as AgentFramework,
			options: [
				{ value: "vercel-ai-sdk" as const, label: "Vercel AI SDK" },
				{ value: "langchain" as const, label: "LangChain" },
				{ value: "mastra" as const, label: "Mastra" },
				{ value: "custom" as const, label: "Custom / Other" },
			],
		});
		handleCancel(framework);

		// Default mode
		const defaultMode = await select({
			message: "Default run mode",
			initialValue: "replay" as const,
			options: [
				{
					value: "replay" as const,
					label: "Replay (recommended)",
					hint: "Zero cost, millisecond execution",
				},
				{
					value: "live" as const,
					label: "Live",
					hint: "Real LLM calls, costs money",
				},
			],
		});
		handleCancel(defaultMode);

		// Reporters
		const reporters = await multiselect({
			message: "Reporters",
			initialValues: ["console" as ReporterChoice],
			options: [
				{ value: "console" as const, label: "Console" },
				{ value: "json" as const, label: "JSON" },
				{ value: "junit" as const, label: "JUnit XML", hint: "Best for CI" },
				{ value: "markdown" as const, label: "Markdown", hint: "For PR comments" },
			],
		});
		handleCancel(reporters);

		// GitHub Actions workflow
		const generateWorkflow = await confirm({
			message: "Generate GitHub Actions workflow?",
			initialValue: detections.hasGitHub,
		});
		handleCancel(generateWorkflow);

		// AGENTS.md
		const generateAgentsMd = await confirm({
			message: "Generate AGENTS.md for AI coding assistants?",
			initialValue: true,
		});
		handleCancel(generateAgentsMd);

		// Git hooks
		const installHooks = await confirm({
			message: "Install pre-push eval hook?",
			initialValue: true,
		});
		handleCancel(installHooks);

		let hookManager: HookManager | undefined;
		if (installHooks === true) {
			if (detections.hookManager) {
				hookManager = detections.hookManager.manager;
			} else {
				const choice = await select({
					message: "No hook manager detected. How should we install the hook?",
					options: [
						{
							value: "husky" as const,
							label: "Husky",
							hint: "Most popular (7M+ weekly downloads)",
						},
						{ value: "lefthook" as const, label: "Lefthook", hint: "Fast, Go-based" },
						{
							value: "none" as const,
							label: "Raw git hook",
							hint: ".git/hooks/pre-push",
						},
					],
				});
				handleCancel(choice);
				hookManager = choice as HookManager;
			}
		}

		const answers: InitAnswers = {
			projectName: projectName as string,
			evalDir: ".",
			framework: framework as AgentFramework,
			defaultMode: defaultMode as "replay" | "live",
			reporters: reporters as ReporterChoice[],
			generateWorkflow: generateWorkflow as boolean,
			generateAgentsMd: generateAgentsMd as boolean,
			installHooks: installHooks as boolean,
			hookManager,
			packageRunner: detections.packageRunner,
		};

		// Execute file writes
		const resolvedHookManager = hookManager;
		await tasks([
			{
				title: "Writing eval config and starter cases",
				task: async () => {
					const result = await writeInitFiles(cwd, answers, {
						overwrite: !!detections.existingConfig,
					});
					return `${result.filesCreated.length} files created${result.filesSkipped.length > 0 ? `, ${result.filesSkipped.length} skipped` : ""}`;
				},
			},
			...(answers.installHooks && resolvedHookManager
				? [
						{
							title: "Installing pre-push hook",
							task: async () => {
								const result = await installPrePushHook(cwd, resolvedHookManager);
								return result.message;
							},
						},
					]
				: []),
		]);

		// Next steps
		const r = answers.packageRunner === "npx" ? "npx" : answers.packageRunner;
		note(
			[
				`${pc.bold("Quick start:")}`,
				"",
				`  1. Edit ${pc.cyan("eval.config.ts")} to wire up your agent`,
				`  2. Edit ${pc.cyan("cases/smoke.jsonl")} with your test cases`,
				`  3. Run ${pc.cyan(`${r} agent-evals run --mode=live --record`)} to record fixtures`,
				`  4. Run ${pc.cyan(`${r} agent-evals run`)} for instant replay`,
			].join("\n"),
			"Next steps",
		);

		outro(pc.green("Done! Happy evaluating."));
	},
});
