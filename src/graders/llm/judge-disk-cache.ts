import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	JudgeCallFn,
	JudgeCallOptions,
	JudgeMessage,
	JudgeResponse,
} from "../../config/types.js";
import { computeCacheKey } from "./judge-cache.js";

export interface DiskCacheOptions {
	readonly cacheDir: string;
	readonly ttlDays: number;
	readonly maxEntries?: number | undefined;
}

interface DiskCacheEntry {
	readonly key: string;
	readonly response: JudgeResponse;
	readonly model: string | undefined;
	readonly cachedAt: string;
}

const DEFAULT_CACHE_DIR = ".eval-cache/judge";
const DEFAULT_TTL_DAYS = 7;
const DEFAULT_MAX_ENTRIES = 10_000;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Wraps a JudgeCallFn with persistent disk-based caching.
 * Only caches deterministic calls (temperature 0 or undefined).
 * Cache key is the same SHA-256 hash used by the in-memory cache.
 */
export function createDiskCachingJudge(
	judge: JudgeCallFn,
	options?: Partial<DiskCacheOptions>,
): JudgeCallFn {
	const cacheDir = options?.cacheDir ?? DEFAULT_CACHE_DIR;
	const ttlDays = options?.ttlDays ?? DEFAULT_TTL_DAYS;
	const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;

	return async (
		messages: readonly JudgeMessage[],
		callOptions?: JudgeCallOptions,
	): Promise<JudgeResponse> => {
		// Only cache deterministic calls
		const temperature = callOptions?.temperature ?? 0;
		if (temperature !== 0) {
			return judge(messages, callOptions);
		}

		const key = computeCacheKey(messages, callOptions);
		const filePath = join(cacheDir, `${key.slice(0, 32)}.json`);

		// Try reading from disk
		const cached = await readCacheEntry(filePath, ttlDays);
		if (cached) {
			return cached;
		}

		// Cache miss — call judge
		const response = await judge(messages, callOptions);

		// Write to disk
		await writeCacheEntry(filePath, key, response, callOptions?.model, cacheDir, maxEntries);

		return response;
	};
}

async function readCacheEntry(filePath: string, ttlDays: number): Promise<JudgeResponse | null> {
	try {
		const fileStat = await stat(filePath);
		const ageDays = (Date.now() - fileStat.mtimeMs) / MS_PER_DAY;

		if (ageDays > ttlDays) {
			// Expired — delete and return miss
			await rm(filePath, { force: true });
			return null;
		}

		const content = await readFile(filePath, "utf8");
		const entry = JSON.parse(content) as DiskCacheEntry;
		return entry.response;
	} catch {
		return null;
	}
}

async function writeCacheEntry(
	filePath: string,
	key: string,
	response: JudgeResponse,
	model: string | undefined,
	cacheDir: string,
	maxEntries: number,
): Promise<void> {
	await mkdir(cacheDir, { recursive: true });

	// LRU eviction if at capacity
	await evictIfNeeded(cacheDir, maxEntries);

	const entry: DiskCacheEntry = {
		key,
		response,
		model,
		cachedAt: new Date().toISOString(),
	};

	await writeFile(filePath, JSON.stringify(entry), "utf8");
}

async function evictIfNeeded(cacheDir: string, maxEntries: number): Promise<void> {
	let files: string[];
	try {
		files = await readdir(cacheDir);
	} catch {
		return;
	}

	const jsonFiles = files.filter((f) => f.endsWith(".json"));
	if (jsonFiles.length < maxEntries) return;

	// Get mtimes and sort by oldest
	const withStats = await Promise.all(
		jsonFiles.map(async (f) => {
			const filePath = join(cacheDir, f);
			const fileStat = await stat(filePath).catch(() => null);
			return { file: f, mtimeMs: fileStat?.mtimeMs ?? 0 };
		}),
	);

	withStats.sort((a, b) => a.mtimeMs - b.mtimeMs);

	// Delete oldest entries to make room
	const toDelete = withStats.slice(0, Math.max(1, jsonFiles.length - maxEntries + 1));
	for (const entry of toDelete) {
		await rm(join(cacheDir, entry.file), { force: true });
	}
}

/** Clear all judge cache entries. Returns count deleted. */
export async function clearJudgeCache(cacheDir: string = DEFAULT_CACHE_DIR): Promise<number> {
	try {
		const files = await readdir(cacheDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));
		await rm(cacheDir, { recursive: true });
		return jsonFiles.length;
	} catch {
		return 0;
	}
}

/** Get judge cache stats. */
export async function judgeCacheStats(
	cacheDir: string = DEFAULT_CACHE_DIR,
): Promise<{ entries: number; totalBytes: number }> {
	try {
		const files = await readdir(cacheDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));
		let totalBytes = 0;
		for (const f of jsonFiles) {
			const s = await stat(join(cacheDir, f)).catch(() => null);
			if (s) totalBytes += s.size;
		}
		return { entries: jsonFiles.length, totalBytes };
	} catch {
		return { entries: 0, totalBytes: 0 };
	}
}
