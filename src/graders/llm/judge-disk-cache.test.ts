import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JudgeCallFn, JudgeResponse } from "../../config/types.js";
import { clearJudgeCache, createDiskCachingJudge, judgeCacheStats } from "./judge-disk-cache.js";

let tempDir: string;

const mockResponse: JudgeResponse = {
	text: '{"score": 4, "reasoning": "Good answer"}',
	tokenUsage: { input: 100, output: 50 },
	cost: 0.001,
};

function createMockJudge(response: JudgeResponse = mockResponse): {
	judge: JudgeCallFn;
	callCount: () => number;
} {
	let calls = 0;
	const judge: JudgeCallFn = async () => {
		calls++;
		return response;
	};
	return { judge, callCount: () => calls };
}

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "judge-cache-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("createDiskCachingJudge", () => {
	it("calls judge on cache miss and caches result", async () => {
		const { judge, callCount } = createMockJudge();
		const cached = createDiskCachingJudge(judge, { cacheDir: tempDir });

		const messages = [{ role: "user" as const, content: "test" }];
		const result1 = await cached(messages);
		expect(result1.text).toBe(mockResponse.text);
		expect(callCount()).toBe(1);

		// Second call should hit cache
		const result2 = await cached(messages);
		expect(result2.text).toBe(mockResponse.text);
		expect(callCount()).toBe(1);
	});

	it("creates cache files on disk", async () => {
		const { judge } = createMockJudge();
		const cached = createDiskCachingJudge(judge, { cacheDir: tempDir });

		await cached([{ role: "user" as const, content: "test" }]);

		const files = await readdir(tempDir);
		expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(1);
	});

	it("returns different entries for different models", async () => {
		const resp1: JudgeResponse = { text: "model-a", tokenUsage: { input: 10, output: 10 } };
		const resp2: JudgeResponse = { text: "model-b", tokenUsage: { input: 10, output: 10 } };
		let callIdx = 0;
		const judge: JudgeCallFn = async () => {
			callIdx++;
			return callIdx === 1 ? resp1 : resp2;
		};

		const cached = createDiskCachingJudge(judge, { cacheDir: tempDir });
		const messages = [{ role: "user" as const, content: "test" }];

		const r1 = await cached(messages, { model: "gpt-4o" });
		const r2 = await cached(messages, { model: "claude-sonnet" });

		expect(r1.text).toBe("model-a");
		expect(r2.text).toBe("model-b");
	});

	it("bypasses cache for non-zero temperature", async () => {
		const { judge, callCount } = createMockJudge();
		const cached = createDiskCachingJudge(judge, { cacheDir: tempDir });
		const messages = [{ role: "user" as const, content: "test" }];

		await cached(messages, { temperature: 0.5 });
		await cached(messages, { temperature: 0.5 });

		// Both calls go through — no caching
		expect(callCount()).toBe(2);
	});

	it("expires entries past TTL", async () => {
		const { judge, callCount } = createMockJudge();
		const cached = createDiskCachingJudge(judge, { cacheDir: tempDir, ttlDays: 0 });

		const messages = [{ role: "user" as const, content: "test" }];

		await cached(messages);
		expect(callCount()).toBe(1);

		// Advance clock past TTL
		vi.useFakeTimers();
		vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000);

		await cached(messages);
		vi.useRealTimers();

		// Second call should miss cache due to TTL
		expect(callCount()).toBe(2);
	});

	it("evicts oldest entries when maxEntries exceeded", async () => {
		const { judge } = createMockJudge();
		const cached = createDiskCachingJudge(judge, {
			cacheDir: tempDir,
			maxEntries: 3,
		});

		// Create 4 entries (exceeds max of 3)
		for (let i = 0; i < 4; i++) {
			await cached([{ role: "user" as const, content: `test-${i}` }]);
		}

		const files = await readdir(tempDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));
		expect(jsonFiles.length).toBeLessThanOrEqual(3);
	});
});

describe("clearJudgeCache", () => {
	it("removes all cache entries", async () => {
		const { judge } = createMockJudge();
		const cached = createDiskCachingJudge(judge, { cacheDir: tempDir });

		await cached([{ role: "user" as const, content: "test" }]);
		const count = await clearJudgeCache(tempDir);
		expect(count).toBe(1);

		// Directory should be gone
		const exists = await stat(tempDir).catch(() => null);
		expect(exists).toBeNull();
	});

	it("returns 0 for non-existent directory", async () => {
		const count = await clearJudgeCache(join(tempDir, "nonexistent"));
		expect(count).toBe(0);
	});
});

describe("judgeCacheStats", () => {
	it("returns zeros for empty cache", async () => {
		const stats = await judgeCacheStats(tempDir);
		expect(stats.entries).toBe(0);
	});

	it("returns accurate stats", async () => {
		const { judge } = createMockJudge();
		const cached = createDiskCachingJudge(judge, { cacheDir: tempDir });

		await cached([{ role: "user" as const, content: "a" }]);
		await cached([{ role: "user" as const, content: "b" }]);

		const stats = await judgeCacheStats(tempDir);
		expect(stats.entries).toBe(2);
		expect(stats.totalBytes).toBeGreaterThan(0);
	});
});
