import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./loader.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "loader-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
	it("loads a valid eval.config.ts", async () => {
		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async (input) => ({ text: "hello", latencyMs: 10 }),
		cases: [{ id: "H01", input: { query: "test" } }],
	}],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		const config = await loadConfig({ cwd: tempDir });
		expect(config.suites).toHaveLength(1);
		expect(config.suites[0]?.name).toBe("smoke");
		expect(config.suites[0]?.cases).toHaveLength(1);
	});

	it("applies default run options", async () => {
		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: [{ id: "H01", input: {} }],
	}],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		const config = await loadConfig({ cwd: tempDir });
		expect(config.run.defaultMode).toBe("live");
		expect(config.run.timeoutMs).toBe(30_000);
	});

	it("uses custom run options when provided", async () => {
		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: [{ id: "H01", input: {} }],
	}],
	run: {
		defaultMode: "replay",
		timeoutMs: 10000,
	},
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		const config = await loadConfig({ cwd: tempDir });
		expect(config.run.defaultMode).toBe("replay");
		expect(config.run.timeoutMs).toBe(10_000);
	});

	it("resolves cases from JSONL file path", async () => {
		const casesDir = join(tempDir, "cases");
		await mkdir(casesDir, { recursive: true });
		await writeFile(
			join(casesDir, "smoke.jsonl"),
			[
				JSON.stringify({ id: "H01", input: { query: "hello" } }),
				JSON.stringify({ id: "H02", input: { query: "world" } }),
			].join("\n"),
		);

		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: "cases/smoke.jsonl",
	}],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		const config = await loadConfig({ cwd: tempDir });
		expect(config.suites[0]?.cases).toHaveLength(2);
	});

	it("throws on duplicate case IDs across multiple files in a suite", async () => {
		const casesDir = join(tempDir, "cases");
		await mkdir(casesDir, { recursive: true });
		await writeFile(
			join(casesDir, "a.jsonl"),
			JSON.stringify({ id: "H01", input: { query: "hello" } }),
		);
		await writeFile(
			join(casesDir, "b.jsonl"),
			JSON.stringify({ id: "H01", input: { query: "world" } }),
		);

		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: ["cases/a.jsonl", "cases/b.jsonl"],
	}],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(/duplicate case id.*H01/i);
	});

	it("throws on duplicate case IDs between inline and file cases", async () => {
		const casesDir = join(tempDir, "cases");
		await mkdir(casesDir, { recursive: true });
		await writeFile(
			join(casesDir, "a.jsonl"),
			JSON.stringify({ id: "H01", input: { query: "from file" } }),
		);

		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: [
			{ id: "H01", input: { query: "inline" } },
			"cases/a.jsonl",
		],
	}],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(/duplicate case id.*H01/i);
	});

	it("throws on config with fixtureDir escaping project root", async () => {
		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: [{ id: "H01", input: {} }],
	}],
	fixtureDir: "../../etc",
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(/resolves outside/);
	});

	it("throws on config with missing target", async () => {
		const configContent = `
export default {
	suites: [{
		name: "smoke",
		cases: [{ id: "H01", input: {} }],
	}],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(/target.*must be a function/i);
	});

	it("throws on config with invalid cases", async () => {
		const configContent = `
export default {
	suites: [{
		name: "smoke",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: null,
	}],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(
			/cases.*must be an array or a file path/i,
		);
	});

	it("throws on config with non-object suite", async () => {
		const configContent = `
export default {
	suites: ["not an object"],
}
`;
		await writeFile(join(tempDir, "eval.config.ts"), configContent);

		await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(/must be an object/i);
	});

	it("throws on missing config", async () => {
		const emptyDir = await mkdtemp(join(tmpdir(), "empty-"));
		try {
			await expect(loadConfig({ cwd: emptyDir })).rejects.toThrow(/no eval\.config/i);
		} finally {
			await rm(emptyDir, { recursive: true, force: true });
		}
	});

	it("loads config from custom path", async () => {
		const configContent = `
export default {
	suites: [{
		name: "custom",
		target: async () => ({ text: "ok", latencyMs: 0 }),
		cases: [{ id: "C01", input: {} }],
	}],
}
`;
		await writeFile(join(tempDir, "custom.config.ts"), configContent);

		const config = await loadConfig({ configPath: "custom.config", cwd: tempDir });
		expect(config.suites[0]?.name).toBe("custom");
	});
});
