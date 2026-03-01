export interface LoggerOptions {
	readonly verbose?: boolean | undefined;
	readonly quiet?: boolean | undefined;
}

export interface Logger {
	readonly level: number;
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
}

// Log level thresholds: warn=1, info=3, verbose=4
const LOG_WARN = 1;
const LOG_INFO = 3;

export function createLogger(options?: LoggerOptions): Logger {
	const level = options?.quiet ? -999 : options?.verbose ? 4 : 3;

	const write = (msg: string): void => {
		process.stderr.write(`${msg}\n`);
	};

	return {
		level,
		info(message: string): void {
			if (level >= LOG_INFO) write(message);
		},
		warn(message: string): void {
			if (level >= LOG_WARN) write(`WARN ${message}`);
		},
		error(message: string): void {
			write(`ERROR ${message}`);
		},
	};
}
