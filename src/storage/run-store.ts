import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RunSchema } from "../config/schema.js";
import type { Run, RunMeta } from "../config/types.js";

const DEFAULT_DIR = ".eval-runs";

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function validateRunId(runId: string): void {
	if (!SAFE_ID.test(runId)) {
		throw new Error(`Invalid run ID: ${runId}`);
	}
}

/**
 * Persists a Run artifact to disk as JSON.
 * Returns the file path.
 */
export async function saveRun(run: Run, baseDir?: string): Promise<string> {
	const dir = baseDir ?? DEFAULT_DIR;
	await mkdir(dir, { recursive: true });

	const filePath = join(dir, `${run.id}.json`);
	const content = JSON.stringify(run, null, 2);
	await writeFile(filePath, content, "utf-8");

	return filePath;
}

/**
 * Loads a Run artifact from disk and validates against RunSchema.
 */
export async function loadRun(runId: string, baseDir?: string): Promise<Run> {
	validateRunId(runId);
	const dir = baseDir ?? DEFAULT_DIR;
	const filePath = join(dir, `${runId}.json`);

	let content: string;
	try {
		content = await readFile(filePath, "utf-8");
	} catch {
		throw new Error(`Run not found: ${filePath}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new Error(`Corrupt run file (invalid JSON): ${filePath}`);
	}

	const result = RunSchema.safeParse(parsed);
	if (!result.success) {
		const issues = result.error.issues
			.map(
				(i: { path: readonly PropertyKey[]; message: string }) =>
					`${i.path.map(String).join(".")}: ${i.message}`,
			)
			.join("; ");
		throw new Error(`Invalid run file ${filePath}: ${issues}`);
	}

	return result.data;
}

/**
 * Lists all stored runs with minimal metadata.
 * Reads only the top-level fields from each run file.
 */
export async function listRuns(baseDir?: string): Promise<readonly RunMeta[]> {
	const dir = baseDir ?? DEFAULT_DIR;

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}

	const runs: RunMeta[] = [];

	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;

		try {
			const content = await readFile(join(dir, entry), "utf-8");
			const parsed = JSON.parse(content) as Record<string, unknown>;
			const summary = parsed.summary as Record<string, unknown> | undefined;

			runs.push({
				id: parsed.id as string,
				suiteId: parsed.suiteId as string,
				mode: parsed.mode as "live" | "replay" | "judge-only",
				timestamp: parsed.timestamp as string,
				passRate: (summary?.passRate as number) ?? 0,
			});
		} catch {
			// Skip corrupt files
		}
	}

	return runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
