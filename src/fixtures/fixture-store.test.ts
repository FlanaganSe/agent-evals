import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetOutput } from "../config/types.js";
import type { FixtureStoreOptions } from "./fixture-store.js";
import {
	clearFixtures,
	fixtureStats,
	listFixtures,
	readFixture,
	sanitizeName,
	sortKeysDeep,
	writeFixture,
} from "./fixture-store.js";

let tempDir: string;
let opts: FixtureStoreOptions;

const sampleOutput: TargetOutput = {
	text: "Your portfolio contains AAPL and GOOG",
	toolCalls: [{ name: "get_portfolio", args: { user_id: "123" } }],
	latencyMs: 1200,
	tokenUsage: { input: 150, output: 280 },
	cost: 0.0042,
};

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "fixture-test-"));
	opts = { baseDir: tempDir, stripRaw: true, ttlDays: 14, strictFixtures: false };
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("writeFixture + readFixture", () => {
	it("round-trips a fixture", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		const result = await readFixture("suite-a", "H01", "abc123", opts);

		expect(result.status).toBe("hit");
		if (result.status === "hit") {
			expect(result.output.text).toBe(sampleOutput.text);
			expect(result.output.latencyMs).toBe(sampleOutput.latencyMs);
			expect(result.output.cost).toBe(sampleOutput.cost);
		}
	});

	it("returns not-found for missing fixture", async () => {
		const result = await readFixture("suite-a", "missing", "abc123", opts);
		expect(result.status).toBe("miss");
		if (result.status === "miss") {
			expect(result.reason).toBe("not-found");
		}
	});

	it("returns config-hash-mismatch when hash differs", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "hash-A", opts);
		const result = await readFixture("suite-a", "H01", "hash-B", opts);

		expect(result.status).toBe("miss");
		if (result.status === "miss") {
			expect(result.reason).toBe("config-hash-mismatch");
			if (result.reason === "config-hash-mismatch") {
				expect(result.recordedHash).toBe("hash-A");
			}
		}
	});

	it("detects stale fixtures past TTL", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);

		// Advance clock past TTL - use ttlDays: 0 so any age is stale
		const staleOpts = { ...opts, ttlDays: 0 };
		vi.useFakeTimers();
		vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days later
		const result = await readFixture("suite-a", "H01", "abc123", staleOpts);
		vi.useRealTimers();

		expect(result.status).toBe("stale");
		if (result.status === "stale") {
			expect(result.output.text).toBe(sampleOutput.text);
			expect(result.ageDays).toBeGreaterThanOrEqual(0);
		}
	});
});

describe("fixture format", () => {
	it("writes JSONL with meta on first line and data on second", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		const filePath = join(tempDir, sanitizeName("suite-a"), `${sanitizeName("H01")}.jsonl`);
		const content = await readFile(filePath, "utf8");
		const lines = content.split("\n").filter(Boolean);

		expect(lines).toHaveLength(2);
		const meta = JSON.parse(lines[0] as string);
		expect(meta._meta).toBeDefined();
		expect(meta._meta.schemaVersion).toBe("1.0.0");
		expect(meta._meta.suiteId).toBe("suite-a");
		expect(meta._meta.caseId).toBe("H01");
		expect(meta._meta.configHash).toBe("abc123");

		const data = JSON.parse(lines[1] as string);
		expect(data.output).toBeDefined();
	});

	it("sorts keys deterministically", async () => {
		const output: TargetOutput = {
			text: "test",
			latencyMs: 100,
			cost: 0.01,
			tokenUsage: { output: 200, input: 100 },
		};
		await writeFixture("suite-a", "H01", output, "abc123", opts);
		const filePath = join(tempDir, sanitizeName("suite-a"), `${sanitizeName("H01")}.jsonl`);
		const content = await readFile(filePath, "utf8");
		const lines = content.split("\n").filter(Boolean);
		const dataLine = lines[1] as string;

		// Keys should be sorted in the output object
		const parsed = JSON.parse(dataLine);
		const keys = Object.keys(parsed.output);
		expect(keys).toEqual([...keys].sort());
	});

	it("strips raw field when stripRaw is true", async () => {
		const outputWithRaw: TargetOutput = {
			...sampleOutput,
			raw: { chunks: ["big", "data", "here"] },
		};
		await writeFixture("suite-a", "H01", outputWithRaw, "abc123", opts);

		const filePath = join(tempDir, sanitizeName("suite-a"), `${sanitizeName("H01")}.jsonl`);
		const content = await readFile(filePath, "utf8");
		expect(content).not.toContain("raw");
	});

	it("preserves raw field when stripRaw is false", async () => {
		const outputWithRaw: TargetOutput = {
			...sampleOutput,
			raw: { chunks: ["big", "data", "here"] },
		};
		const noStripOpts = { ...opts, stripRaw: false };
		await writeFixture("suite-a", "H01", outputWithRaw, "abc123", noStripOpts);

		const filePath = join(tempDir, sanitizeName("suite-a"), `${sanitizeName("H01")}.jsonl`);
		const content = await readFile(filePath, "utf8");
		expect(content).toContain("chunks");
	});

	it("idempotent writes produce identical files", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		const filePath = join(tempDir, sanitizeName("suite-a"), `${sanitizeName("H01")}.jsonl`);
		const content1 = await readFile(filePath, "utf8");

		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		const content2 = await readFile(filePath, "utf8");

		// Meta timestamps differ, but data line should be identical
		const data1 = content1.split("\n").filter(Boolean)[1];
		const data2 = content2.split("\n").filter(Boolean)[1];
		expect(data1).toBe(data2);
	});
});

describe("directory handling", () => {
	it("auto-creates nested directories", async () => {
		await writeFixture("deep/nested/suite", "H01", sampleOutput, "abc123", opts);
		const filePath = join(
			tempDir,
			sanitizeName("deep/nested/suite"),
			`${sanitizeName("H01")}.jsonl`,
		);
		const fileStat = await stat(filePath);
		expect(fileStat.isFile()).toBe(true);
	});

	it("creates .gitattributes on first write", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		const gitattributes = await readFile(join(tempDir, ".gitattributes"), "utf8");
		expect(gitattributes).toBe("*.jsonl diff=json\n");
	});
});

describe("listFixtures", () => {
	it("returns empty array for non-existent suite", async () => {
		const result = await listFixtures("nope", { baseDir: tempDir });
		expect(result).toEqual([]);
	});

	it("lists fixtures for a suite", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		await writeFixture("suite-a", "H02", sampleOutput, "abc123", opts);

		const result = await listFixtures("suite-a", { baseDir: tempDir });
		expect(result).toHaveLength(2);
		expect(result.map((f) => f.caseId).sort()).toEqual(
			[sanitizeName("H01"), sanitizeName("H02")].sort(),
		);
	});
});

describe("clearFixtures", () => {
	it("removes all fixtures for a suite", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		await writeFixture("suite-a", "H02", sampleOutput, "abc123", opts);

		const count = await clearFixtures("suite-a", { baseDir: tempDir });
		expect(count).toBe(2);

		const remaining = await listFixtures("suite-a", { baseDir: tempDir });
		expect(remaining).toHaveLength(0);
	});

	it("returns 0 for non-existent suite", async () => {
		const count = await clearFixtures("nope", { baseDir: tempDir });
		expect(count).toBe(0);
	});
});

describe("fixtureStats", () => {
	it("returns zeros for empty directory", async () => {
		const stats = await fixtureStats({ baseDir: tempDir });
		expect(stats.totalFixtures).toBe(0);
		expect(stats.suiteCount).toBe(0);
	});

	it("returns accurate stats across suites", async () => {
		await writeFixture("suite-a", "H01", sampleOutput, "abc123", opts);
		await writeFixture("suite-a", "H02", sampleOutput, "abc123", opts);
		await writeFixture("suite-b", "E01", sampleOutput, "def456", opts);

		const stats = await fixtureStats({ baseDir: tempDir });
		expect(stats.totalFixtures).toBe(3);
		expect(stats.suiteCount).toBe(2);
		expect(stats.totalBytes).toBeGreaterThan(0);
	});
});

describe("sortKeysDeep", () => {
	it("sorts top-level keys", () => {
		const result = sortKeysDeep({ b: 1, a: 2 });
		expect(Object.keys(result as Record<string, unknown>)).toEqual(["a", "b"]);
	});

	it("sorts nested object keys", () => {
		const result = sortKeysDeep({ z: { b: 1, a: 2 } }) as Record<string, Record<string, unknown>>;
		expect(Object.keys(result.z as Record<string, unknown>)).toEqual(["a", "b"]);
	});

	it("handles arrays without sorting elements", () => {
		const result = sortKeysDeep([3, 1, 2]);
		expect(result).toEqual([3, 1, 2]);
	});

	it("handles null and primitives", () => {
		expect(sortKeysDeep(null)).toBe(null);
		expect(sortKeysDeep(42)).toBe(42);
		expect(sortKeysDeep("hello")).toBe("hello");
	});
});

describe("sanitizeName collision resistance", () => {
	it("produces distinct names for IDs that differ only by special characters", () => {
		const a = sanitizeName("What is 2+2?");
		const b = sanitizeName("What is 2-2?");
		const c = sanitizeName("What is 2*2?");
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
		expect(b).not.toBe(c);
	});

	it("round-trips fixtures with colliding slugs", async () => {
		const outputA: TargetOutput = { text: "four", latencyMs: 0 };
		const outputB: TargetOutput = { text: "zero", latencyMs: 0 };

		await writeFixture("suite", "What is 2+2?", outputA, "hash", opts);
		await writeFixture("suite", "What is 2-2?", outputB, "hash", opts);

		const resultA = await readFixture("suite", "What is 2+2?", "hash", opts);
		const resultB = await readFixture("suite", "What is 2-2?", "hash", opts);

		expect(resultA.status).toBe("hit");
		expect(resultB.status).toBe("hit");
		if (resultA.status === "hit" && resultB.status === "hit") {
			expect(resultA.output.text).toBe("four");
			expect(resultB.output.text).toBe("zero");
		}
	});
});

describe("concurrent writes", () => {
	it("writes to different cases concurrently without corruption", async () => {
		const writes = Array.from({ length: 10 }, (_, i) =>
			writeFixture("suite-a", `case-${i}`, sampleOutput, "abc123", opts),
		);
		await Promise.all(writes);

		const fixtures = await listFixtures("suite-a", { baseDir: tempDir });
		expect(fixtures).toHaveLength(10);
	});
});
