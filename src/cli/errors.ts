export class ConfigError extends Error {
	readonly exitCode = 2;
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

export class RuntimeError extends Error {
	readonly exitCode = 3;
	constructor(message: string) {
		super(message);
		this.name = "RuntimeError";
	}
}

export class EvalFailureError extends Error {
	readonly exitCode = 1;
	constructor(message: string) {
		super(message);
		this.name = "EvalFailureError";
	}
}

export function getExitCode(err: unknown): number {
	if (err instanceof ConfigError) return 2;
	if (err instanceof RuntimeError) return 3;
	if (err instanceof EvalFailureError) return 1;
	return 3; // Unknown errors are runtime errors
}
