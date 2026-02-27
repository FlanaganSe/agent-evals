import { describe, expect, it } from "vitest";
import { checkNodeVersion } from "./doctor.js";

describe("checkNodeVersion", () => {
	it("passes for Node >= 20", () => {
		const result = checkNodeVersion();
		// We're running on Node 20+ in this project
		expect(result.status).toBe("pass");
		expect(result.message).toContain("Node.js");
	});
});
