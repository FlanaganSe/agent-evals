/** Answers collected from the init wizard. */
export interface InitAnswers {
	/** Project name (auto-detected from package.json or directory name). */
	readonly projectName: string;
	/** Where eval config and cases live (default: project root "."). */
	readonly evalDir: string;
	/** Agent framework detected or selected. */
	readonly framework: AgentFramework;
	/** Default run mode. */
	readonly defaultMode: "replay" | "live";
	/** Reporters to enable. */
	readonly reporters: readonly ReporterChoice[];
	/** Whether to generate GitHub Actions workflow. */
	readonly generateWorkflow: boolean;
	/** Whether to generate AGENTS.md. */
	readonly generateAgentsMd: boolean;
	/** Whether to install git hooks. */
	readonly installHooks: boolean;
	/** Detected git hook manager (if any). */
	readonly hookManager: HookManager | undefined;
	/** Detected package runner (pnpm, yarn, bun, or npx). */
	readonly packageRunner: string;
}

export type AgentFramework = "vercel-ai-sdk" | "langchain" | "mastra" | "custom";

export type ReporterChoice = "console" | "json" | "junit" | "markdown";

export type HookManager = "husky" | "lefthook" | "simple-git-hooks" | "none";
