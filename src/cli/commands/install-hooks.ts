import { resolve } from "node:path";
import { cancel, confirm, intro, isCancel, outro, select } from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import type { HookManager } from "../templates/types.js";
import { detectHookManager } from "./hook-detection.js";
import { installPrePushHook } from "./hook-installer.js";

const VALID_MANAGERS: readonly string[] = ["husky", "lefthook", "simple-git-hooks", "none"];

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "install-hooks", description: "Install pre-push eval hook" },
	args: {
		cwd: {
			type: "string" as const,
			description: "Project directory (default: current directory)",
		},
		manager: {
			type: "string" as const,
			description: "Force hook manager: husky | lefthook | simple-git-hooks | none",
		},
	},
	async run({ args }) {
		const cwd = resolve(args.cwd ?? ".");

		intro(pc.bold("agent-evals install-hooks"));

		// Detect or use forced manager
		let manager: HookManager;
		if (args.manager) {
			if (!VALID_MANAGERS.includes(args.manager)) {
				process.stderr.write(
					`Invalid --manager value: '${args.manager}'. Valid: ${VALID_MANAGERS.join(", ")}\n`,
				);
				process.exit(2);
			}
			manager = args.manager as HookManager;
		} else {
			const detected = await detectHookManager(cwd);
			if (detected) {
				process.stdout.write(`  Detected: ${pc.cyan(detected.manager)} (${detected.reason})\n`);
				manager = detected.manager;
			} else {
				const choice = await select({
					message: "No hook manager detected. How should we install the hook?",
					options: [
						{
							value: "husky" as const,
							label: "Husky",
							hint: "Most popular (7M+ weekly downloads)",
						},
						{
							value: "lefthook" as const,
							label: "Lefthook",
							hint: "Fast, Go-based, parallel hooks",
						},
						{
							value: "none" as const,
							label: "Raw git hook",
							hint: "Write directly to .git/hooks/",
						},
					],
				});
				if (isCancel(choice)) {
					cancel("Cancelled");
					process.exit(0);
				}
				manager = choice as HookManager;
			}
		}

		// Confirm before modifying
		if (manager !== "none") {
			const proceed = await confirm({
				message: `Install pre-push hook using ${manager}?`,
			});
			if (isCancel(proceed) || !proceed) {
				cancel("Cancelled");
				process.exit(0);
			}
		}

		const result = await installPrePushHook(cwd, manager);

		if (result.success) {
			process.stdout.write(`  ${pc.green("✓")} ${result.message}\n`);
		} else {
			process.stdout.write(`  ${pc.red("✗")} ${result.message}\n`);
			process.exit(1);
		}

		outro("Hook installed");
	},
});
