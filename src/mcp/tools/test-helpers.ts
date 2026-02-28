import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates a temp directory with an eval.config.ts exporting a minimal config.
 * The config uses inline cases and a dummy target — suitable for tools that
 * only need to load/inspect config (not execute targets).
 *
 * Returns the temp directory path. Caller is responsible for cleanup.
 */
export async function createTempConfig(options?: {
	readonly suites?: readonly {
		readonly name: string;
		readonly description?: string;
		readonly cases?: readonly { readonly id: string; readonly input: Record<string, unknown> }[];
		readonly tags?: readonly string[];
		readonly gates?: { readonly passRate?: number };
	}[];
	readonly fixtureDir?: string;
}): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "mcp-tool-test-"));

	const suites = options?.suites ?? [
		{
			name: "smoke",
			description: "Smoke tests",
			cases: [{ id: "H01", input: { prompt: "hello" } }],
		},
	];

	const suitesCode = suites
		.map(
			(s) => `{
		name: ${JSON.stringify(s.name)},
		description: ${JSON.stringify(s.description ?? undefined)},
		target: async () => ({ text: "ok", latencyMs: 1 }),
		cases: ${JSON.stringify(s.cases ?? [{ id: "H01", input: {} }])},
		tags: ${JSON.stringify(s.tags ?? [])},
		${s.gates ? `gates: ${JSON.stringify(s.gates)},` : ""}
	}`,
		)
		.join(",\n");

	const configContent = `
export default {
	suites: [${suitesCode}],
	${options?.fixtureDir ? `fixtureDir: ${JSON.stringify(options.fixtureDir)},` : ""}
};
`;

	await writeFile(join(dir, "eval.config.ts"), configContent);
	return dir;
}
