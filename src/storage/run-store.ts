import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { RunModeSchema, RunSchema } from "../config/schema.js";
import type { Run, RunMeta } from "../config/types.js";

/** Lightweight schema for extracting metadata from run files without full validation. */
const RunFileMetaSchema = z.object({
	id: z.string(),
	suiteId: z.string(),
	mode: RunModeSchema,
	timestamp: z.string(),
	summary: z.object({ passRate: z.number() }).optional(),
});

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
	const tmpPath = `${filePath}.tmp`;
	const content = JSON.stringify(run, null, 2);
	await writeFile(tmpPath, content, "utf-8");
	await rename(tmpPath, filePath);

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
			const parsed: unknown = JSON.parse(content);
			const result = RunFileMetaSchema.safeParse(parsed);
			if (!result.success) continue;

			runs.push({
				id: result.data.id,
				suiteId: result.data.suiteId,
				mode: result.data.mode,
				timestamp: result.data.timestamp,
				passRate: result.data.summary?.passRate ?? 0,
			});
		} catch {
			// Skip files with invalid JSON
		}
	}

	return runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
