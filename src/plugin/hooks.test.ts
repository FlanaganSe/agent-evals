import { describe, expect, it } from "vitest";
import type { Run, Trial } from "../config/types.js";
import { createHookDispatcher } from "./hooks.js";
import type { AfterTrialContext, BeforeRunContext, EvalPlugin } from "./types.js";

const mockTrial: Trial = {
	caseId: "H01",
	status: "pass",
	output: { text: "hello", latencyMs: 100 },
	grades: [],
	score: 1,
	durationMs: 100,
};

const mockRun: Run = {
	schemaVersion: "1.0.0",
	id: "run-1",
	suiteId: "test-suite",
	mode: "replay",
	trials: [mockTrial],
	summary: {
		totalCases: 1,
		passed: 1,
		failed: 0,
		errors: 0,
		passRate: 1,
		totalCost: 0,
		totalDurationMs: 100,
		p95LatencyMs: 100,
		gateResult: { pass: true, results: [] },
	},
	timestamp: "2026-01-01T00:00:00Z",
	configHash: "abc",
	frameworkVersion: "0.0.1",
};

const mockBeforeRunContext: BeforeRunContext = {
	suiteId: "test-suite",
	mode: "replay",
	caseCount: 1,
	trialCount: 1,
};

const mockAfterTrialContext: AfterTrialContext = {
	suiteId: "test-suite",
	completedCount: 1,
	totalCount: 1,
};

describe("createHookDispatcher", () => {
	describe("beforeRun", () => {
		it("dispatches in registration order", async () => {
			const order: string[] = [];
			const plugins: EvalPlugin[] = [
				{
					name: "first",
					version: "1.0.0",
					hooks: {
						beforeRun: async () => {
							order.push("first");
						},
					},
				},
				{
					name: "second",
					version: "1.0.0",
					hooks: {
						beforeRun: async () => {
							order.push("second");
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await dispatcher.beforeRun(mockBeforeRunContext);
			expect(order).toEqual(["first", "second"]);
		});

		it("propagates errors", async () => {
			const plugins: EvalPlugin[] = [
				{
					name: "failing",
					version: "1.0.0",
					hooks: {
						beforeRun: async () => {
							throw new Error("setup failed");
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await expect(dispatcher.beforeRun(mockBeforeRunContext)).rejects.toThrow("setup failed");
		});

		it("receives correct context", async () => {
			let receivedContext: BeforeRunContext | undefined;
			const plugins: EvalPlugin[] = [
				{
					name: "spy",
					version: "1.0.0",
					hooks: {
						beforeRun: async (ctx) => {
							receivedContext = ctx;
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await dispatcher.beforeRun(mockBeforeRunContext);
			expect(receivedContext).toEqual(mockBeforeRunContext);
		});
	});

	describe("afterTrial", () => {
		it("dispatches in registration order", async () => {
			const order: string[] = [];
			const plugins: EvalPlugin[] = [
				{
					name: "first",
					version: "1.0.0",
					hooks: {
						afterTrial: async () => {
							order.push("first");
						},
					},
				},
				{
					name: "second",
					version: "1.0.0",
					hooks: {
						afterTrial: async () => {
							order.push("second");
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await dispatcher.afterTrial(mockTrial, mockAfterTrialContext);
			expect(order).toEqual(["first", "second"]);
		});

		it("swallows errors and continues to next plugin", async () => {
			const order: string[] = [];
			const warnings: string[] = [];
			const plugins: EvalPlugin[] = [
				{
					name: "failing",
					version: "1.0.0",
					hooks: {
						afterTrial: async () => {
							order.push("failing");
							throw new Error("broken");
						},
					},
				},
				{
					name: "healthy",
					version: "1.0.0",
					hooks: {
						afterTrial: async () => {
							order.push("healthy");
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins, {
				warn: (msg) => warnings.push(msg),
			});
			await dispatcher.afterTrial(mockTrial, mockAfterTrialContext);
			expect(order).toEqual(["failing", "healthy"]);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain("Plugin 'failing' afterTrial hook failed: broken");
		});

		it("receives correct trial and context", async () => {
			let receivedTrial: Trial | undefined;
			let receivedContext: AfterTrialContext | undefined;
			const plugins: EvalPlugin[] = [
				{
					name: "spy",
					version: "1.0.0",
					hooks: {
						afterTrial: async (trial, ctx) => {
							receivedTrial = trial;
							receivedContext = ctx;
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await dispatcher.afterTrial(mockTrial, mockAfterTrialContext);
			expect(receivedTrial).toBe(mockTrial);
			expect(receivedContext).toEqual(mockAfterTrialContext);
		});
	});

	describe("afterRun", () => {
		it("dispatches in registration order", async () => {
			const order: string[] = [];
			const plugins: EvalPlugin[] = [
				{
					name: "first",
					version: "1.0.0",
					hooks: {
						afterRun: async () => {
							order.push("first");
						},
					},
				},
				{
					name: "second",
					version: "1.0.0",
					hooks: {
						afterRun: async () => {
							order.push("second");
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await dispatcher.afterRun(mockRun);
			expect(order).toEqual(["first", "second"]);
		});

		it("propagates errors", async () => {
			const plugins: EvalPlugin[] = [
				{
					name: "failing",
					version: "1.0.0",
					hooks: {
						afterRun: async () => {
							throw new Error("teardown failed");
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await expect(dispatcher.afterRun(mockRun)).rejects.toThrow("teardown failed");
		});
	});

	describe("edge cases", () => {
		it("handles no plugins", async () => {
			const dispatcher = createHookDispatcher([]);
			await dispatcher.beforeRun(mockBeforeRunContext);
			await dispatcher.afterTrial(mockTrial, mockAfterTrialContext);
			await dispatcher.afterRun(mockRun);
		});

		it("skips plugins without hooks", async () => {
			const order: string[] = [];
			const plugins: EvalPlugin[] = [
				{ name: "no-hooks", version: "1.0.0" },
				{
					name: "has-hooks",
					version: "1.0.0",
					hooks: {
						beforeRun: async () => {
							order.push("has-hooks");
						},
					},
				},
			];
			const dispatcher = createHookDispatcher(plugins);
			await dispatcher.beforeRun(mockBeforeRunContext);
			expect(order).toEqual(["has-hooks"]);
		});
	});
});
