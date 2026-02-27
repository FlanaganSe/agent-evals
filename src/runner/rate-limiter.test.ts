import { afterEach, describe, expect, it } from "vitest";
import { createTokenBucketLimiter, type RateLimiter } from "./rate-limiter.js";

describe("createTokenBucketLimiter", () => {
	let limiter: RateLimiter | undefined;

	afterEach(() => {
		limiter?.dispose();
		limiter = undefined;
	});

	it("resolves first request immediately", async () => {
		limiter = createTokenBucketLimiter({ maxRequestsPerMinute: 60 });
		const start = Date.now();
		await limiter.acquire();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(50);
	});

	it("throttles subsequent requests", async () => {
		// 60 RPM = 1 per second
		limiter = createTokenBucketLimiter({ maxRequestsPerMinute: 6000 });
		// 6000 RPM = 10ms interval

		await limiter.acquire(); // immediate
		const start = Date.now();
		await limiter.acquire(); // should wait ~10ms
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(5);
	});

	it("rejects pending acquires on abort", async () => {
		limiter = createTokenBucketLimiter({ maxRequestsPerMinute: 1 });
		await limiter.acquire(); // take the first token

		const controller = new AbortController();
		const promise = limiter.acquire(controller.signal);
		controller.abort();

		await expect(promise).rejects.toThrow("Rate limiter acquire aborted");
	});

	it("rejects immediately if signal already aborted", async () => {
		limiter = createTokenBucketLimiter({ maxRequestsPerMinute: 60 });
		const controller = new AbortController();
		controller.abort();

		await expect(limiter.acquire(controller.signal)).rejects.toThrow(
			"Rate limiter acquire aborted",
		);
	});

	it("rejects all pending on dispose", async () => {
		limiter = createTokenBucketLimiter({ maxRequestsPerMinute: 1 });
		await limiter.acquire(); // take the first token

		const p1 = limiter.acquire();
		const p2 = limiter.acquire();
		limiter.dispose();
		limiter = undefined; // already disposed

		await expect(p1).rejects.toThrow("Rate limiter disposed");
		await expect(p2).rejects.toThrow("Rate limiter disposed");
	});
});
