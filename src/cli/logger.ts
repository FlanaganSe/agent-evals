import { createConsola } from "consola";

export interface LoggerOptions {
	readonly verbose?: boolean | undefined;
	readonly quiet?: boolean | undefined;
}

export type Logger = ReturnType<typeof createConsola>;

export function createLogger(options?: LoggerOptions): Logger {
	const level = options?.quiet ? -999 : options?.verbose ? 4 : 3;

	return createConsola({
		level,
		// Force all output to stderr so stdout is clean for piped reporter output
		stdout: process.stderr,
		stderr: process.stderr,
	});
}
