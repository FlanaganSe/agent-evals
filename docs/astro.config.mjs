import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [
		starlight({
			title: "agent-evals",
			description:
				"TypeScript-native eval framework for AI agent workflows",
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/FlanaganSe/agent-evals",
				},
			],
			sidebar: [
				{
					label: "Getting Started",
					items: [
						{ label: "Installation", slug: "getting-started/installation" },
						{ label: "Quick Start", slug: "getting-started/quick-start" },
						{ label: "Concepts", slug: "getting-started/concepts" },
					],
				},
				{
					label: "Guides",
					items: [
						{ label: "Record & Replay", slug: "guides/record-replay" },
						{ label: "Graders", slug: "guides/graders" },
						{ label: "LLM Judge", slug: "guides/llm-judge" },
						{ label: "CI Integration", slug: "guides/ci-integration" },
						{ label: "Watch Mode", slug: "guides/watch-mode" },
						{ label: "Plugins", slug: "guides/plugins" },
					],
				},
				{
					label: "Reference",
					items: [
						{ label: "CLI", slug: "reference/cli" },
						{ label: "Config", slug: "reference/config" },
						{ label: "Graders API", slug: "reference/graders-api" },
						{ label: "Reporters", slug: "reference/reporters" },
						{ label: "Plugin API", slug: "reference/plugin-api" },
					],
				},
				{
					label: "Advanced",
					items: [
						{ label: "MCP Server", slug: "advanced/mcp-server" },
						{ label: "Custom Graders", slug: "advanced/custom-graders" },
						{ label: "Statistics", slug: "advanced/statistics" },
					],
				},
			],
		}),
	],
});
