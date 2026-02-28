import { defineCommand } from "citty";

// biome-ignore lint/style/noDefaultExport: citty subcommands require default exports
export default defineCommand({
	meta: { name: "mcp", description: "Start MCP server for AI assistant integration" },
	async run() {
		// Detect missing optional peer dependency at runtime
		try {
			await import("@modelcontextprotocol/sdk/server/mcp.js");
		} catch {
			console.error(
				"MCP server requires @modelcontextprotocol/sdk.\n" +
					"Install it with: pnpm add @modelcontextprotocol/sdk",
			);
			process.exit(1);
		}
		// Dynamic import to keep MCP SDK out of the main bundle
		const { startMcpServer } = await import("../../mcp/server.js");
		await startMcpServer();
	},
});
