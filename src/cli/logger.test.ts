import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
	it("creates logger with default level 3", () => {
		const logger = createLogger();
		expect(logger.level).toBe(3);
	});

	it("creates verbose logger with level 4", () => {
		const logger = createLogger({ verbose: true });
		expect(logger.level).toBe(4);
	});

	it("creates quiet logger with level -999", () => {
		const logger = createLogger({ quiet: true });
		expect(logger.level).toBe(-999);
	});

	it("quiet takes precedence over verbose", () => {
		const logger = createLogger({ verbose: true, quiet: true });
		expect(logger.level).toBe(-999);
	});
});
