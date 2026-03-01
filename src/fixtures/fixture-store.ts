import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TargetOutput } from "../config/types.js";
import { VERSION } from "../index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FixtureStoreOptions {
	readonly baseDir: string;
	readonly stripRaw: boolean;
	readonly ttlDays: number;
	readonly strictFixtures: boolean;
}

export type FixtureReadResult =
	| { readonly status: "hit"; readonly output: TargetOutput }
	| { readonly status: "miss"; readonly reason: "not-found" }
	| {
			readonly status: "miss";
			readonly reason: "config-hash-mismatch";
			readonly recordedHash: string;
	  }
	| { readonly status: "stale"; readonly output: TargetOutput; readonly ageDays: number };

export interface FixtureInfo {
	readonly suiteId: string;
	readonly caseId: string;
	readonly ageDays: number;
	readonly sizeBytes: number;
}

export interface FixtureStatsResult {
	readonly totalFixtures: number;
	readonly totalBytes: number;
	readonly suiteCount: number;
	readonly oldestAgeDays: number;
	readonly newestAgeDays: number;
}

interface FixtureMeta {
	readonly _meta: {
		readonly schemaVersion: string;
		readonly suiteId: string;
		readonly caseId: string;
		readonly configHash: string;
		readonly recordedAt: string;
		readonly frameworkVersion: string;
	};
}

// ─── Public API ─────────────────────────────────────────────────────────────

const FIXTURE_SCHEMA_VERSION = "1.0.0";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Write a fixture entry for a case. Creates file if not exists, replaces if exists. */
export async function writeFixture(
	suiteId: string,
	caseId: string,
	output: TargetOutput,
	configHash: string,
	options: FixtureStoreOptions,
): Promise<void> {
	const dir = join(options.baseDir, sanitizeName(suiteId));
	await mkdir(dir, { recursive: true });

	const sanitizedOutput = sanitizeOutput(output, options.stripRaw);
	const meta: FixtureMeta = {
		_meta: {
			schemaVersion: FIXTURE_SCHEMA_VERSION,
			suiteId,
			caseId,
			configHash,
			recordedAt: new Date().toISOString(),
			frameworkVersion: VERSION,
		},
	};

	const metaLine = stableStringify(meta);
	const dataLine = stableStringify({ output: sanitizedOutput });
	const content = `${metaLine}\n${dataLine}\n`;

	const filePath = join(dir, `${sanitizeName(caseId)}.jsonl`);
	await writeFile(filePath, content, "utf8");

	// Ensure .gitattributes exists
	await ensureGitattributes(options.baseDir);
}

/** Read a fixture entry for a case. Returns a discriminated union result. */
export async function readFixture(
	suiteId: string,
	caseId: string,
	configHash: string,
	options: FixtureStoreOptions,
): Promise<FixtureReadResult> {
	const filePath = join(options.baseDir, sanitizeName(suiteId), `${sanitizeName(caseId)}.jsonl`);

	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		return { status: "miss", reason: "not-found" };
	}

	const lines = content.split("\n").filter(Boolean);
	if (lines.length < 2) {
		return { status: "miss", reason: "not-found" };
	}

	const meta = JSON.parse(lines[0] as string) as FixtureMeta;
	const data = JSON.parse(lines[1] as string) as { readonly output: TargetOutput };

	// Check config hash
	if (meta._meta.configHash !== configHash) {
		return {
			status: "miss",
			reason: "config-hash-mismatch",
			recordedHash: meta._meta.configHash,
		};
	}

	// Check staleness
	const recordedAt = new Date(meta._meta.recordedAt).getTime();
	const ageDays = (Date.now() - recordedAt) / MS_PER_DAY;

	if (ageDays > options.ttlDays) {
		return { status: "stale", output: data.output, ageDays: Math.floor(ageDays) };
	}

	return { status: "hit", output: data.output };
}

/** List all fixtures for a suite with staleness info. */
export async function listFixtures(
	suiteId: string,
	options: Pick<FixtureStoreOptions, "baseDir">,
): Promise<readonly FixtureInfo[]> {
	const dir = join(options.baseDir, sanitizeName(suiteId));

	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return [];
	}

	const results: FixtureInfo[] = [];
	for (const file of files) {
		if (!file.endsWith(".jsonl")) continue;
		const filePath = join(dir, file);
		const fileStat = await stat(filePath).catch(() => null);
		if (!fileStat?.isFile()) continue;

		const ageDays = (Date.now() - fileStat.mtimeMs) / MS_PER_DAY;
		results.push({
			suiteId,
			caseId: file.replace(/\.jsonl$/, ""),
			ageDays: Math.floor(ageDays),
			sizeBytes: fileStat.size,
		});
	}

	return results;
}

/** Delete all fixtures for a suite. Returns count of deleted files. */
export async function clearFixtures(
	suiteId: string,
	options: Pick<FixtureStoreOptions, "baseDir">,
): Promise<number> {
	const dir = join(options.baseDir, sanitizeName(suiteId));

	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return 0;
	}

	const count = files.filter((f) => f.endsWith(".jsonl")).length;
	await rm(dir, { recursive: true });
	return count;
}

/** Get aggregate stats across all fixtures. */
export async function fixtureStats(
	options: Pick<FixtureStoreOptions, "baseDir">,
): Promise<FixtureStatsResult> {
	let suites: string[];
	try {
		suites = await readdir(options.baseDir);
	} catch {
		return {
			totalFixtures: 0,
			totalBytes: 0,
			suiteCount: 0,
			oldestAgeDays: 0,
			newestAgeDays: 0,
		};
	}

	let totalFixtures = 0;
	let totalBytes = 0;
	let suiteCount = 0;
	let oldestMs = Number.POSITIVE_INFINITY;
	let newestMs = 0;

	for (const suiteName of suites) {
		const suiteDir = join(options.baseDir, suiteName);
		const suiteStat = await stat(suiteDir).catch(() => null);
		if (!suiteStat?.isDirectory()) continue;
		suiteCount++;

		const files = await readdir(suiteDir);
		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;
			const filePath = join(suiteDir, file);
			const fileStat = await stat(filePath).catch(() => null);
			if (!fileStat?.isFile()) continue;

			totalFixtures++;
			totalBytes += fileStat.size;
			if (fileStat.mtimeMs < oldestMs) oldestMs = fileStat.mtimeMs;
			if (fileStat.mtimeMs > newestMs) newestMs = fileStat.mtimeMs;
		}
	}

	const now = Date.now();
	return {
		totalFixtures,
		totalBytes,
		suiteCount,
		oldestAgeDays:
			oldestMs === Number.POSITIVE_INFINITY ? 0 : Math.floor((now - oldestMs) / MS_PER_DAY),
		newestAgeDays: newestMs === 0 ? 0 : Math.floor((now - newestMs) / MS_PER_DAY),
	};
}

// ─── Internals ──────────────────────────────────────────────────────────────

function sanitizeOutput(output: TargetOutput, stripRaw: boolean): TargetOutput {
	if (stripRaw) {
		const { raw: _raw, ...rest } = output;
		return sortKeysDeep(rest) as TargetOutput;
	}
	return sortKeysDeep(output) as TargetOutput;
}

/** Deep sort all object keys for deterministic JSON output. */
export function sortKeysDeep(obj: unknown): unknown {
	if (obj === null || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(sortKeysDeep);
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
		sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key]);
	}
	return sorted;
}

/** JSON.stringify with sorted keys for deterministic output. */
function stableStringify(obj: unknown): string {
	return JSON.stringify(sortKeysDeep(obj));
}

/** Sanitize a name for use as a directory/file name. Appends a short hash to prevent collisions from lossy character replacement. */
export function sanitizeName(name: string): string {
	const slug = name
		.replace(/[^a-zA-Z0-9_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 100);
	const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
	return slug ? `${slug}-${hash}` : hash;
}

/** Ensure .gitattributes exists in the fixture base directory. */
async function ensureGitattributes(baseDir: string): Promise<void> {
	const gitattributesPath = join(baseDir, ".gitattributes");
	try {
		await stat(gitattributesPath);
	} catch {
		await writeFile(gitattributesPath, "*.jsonl diff=json\n", "utf8");
	}
}
