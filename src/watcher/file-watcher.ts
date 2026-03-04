import { type FSWatcher, watch as fsWatch } from "node:fs";

/** Options for creating a file watcher. Used by `--watch` mode to re-run suites on file changes. */
export interface FileWatcherOptions {
	/** Directories to watch recursively. */
	readonly paths: readonly string[];
	/** Directory name patterns to ignore. @default ["node_modules", ".eval-runs", ".git", "dist", ".eval-cache"] */
	readonly ignore?: readonly string[] | undefined;
	/** Debounce interval in milliseconds. Batches rapid file changes into a single event. @default 300 */
	readonly debounceMs?: number | undefined;
	/** Error handler for fs.watch failures. Defaults to writing to stderr. */
	readonly onError?: (error: unknown, path: string) => void;
}

/** File watcher handle returned by `createFileWatcher()`. */
export interface FileWatcher {
	/** Register a callback for batched file change events. */
	readonly on: (event: "change", callback: (files: readonly string[]) => void) => void;
	/** Stop watching and release all resources. */
	readonly close: () => Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_IGNORE = ["node_modules", ".eval-runs", ".git", "dist", ".eval-cache"];

/**
 * Creates a file watcher using native fs.watch({ recursive: true }).
 * Requires Node.js >= 20.16.0 for stable recursive watching on all platforms.
 */
export function createFileWatcher(options: FileWatcherOptions): FileWatcher {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const ignorePatterns = options.ignore ?? DEFAULT_IGNORE;

	const listeners: Array<(files: readonly string[]) => void> = [];
	const watchers: FSWatcher[] = [];
	let pendingFiles = new Set<string>();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const flush = (): void => {
		const files = [...pendingFiles];
		pendingFiles = new Set();
		for (const listener of listeners) {
			listener(files);
		}
	};

	const handleError = (error: unknown, dir: string): void => {
		if (options.onError) {
			options.onError(error, dir);
		} else {
			process.stderr.write(`[eval-watch] fs.watch error on ${dir}: ${String(error)}\n`);
		}
	};

	for (const dir of options.paths) {
		try {
			const watcher = fsWatch(dir, { recursive: true }, (_event, filename) => {
				if (!filename) return;
				const fullPath = `${dir}/${filename}`;
				if (shouldIgnore(fullPath, ignorePatterns)) return;

				pendingFiles.add(fullPath);

				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(flush, debounceMs);
			});
			watcher.on("error", (err) => handleError(err, dir));
			watchers.push(watcher);
		} catch (err) {
			handleError(err, dir);
		}
	}

	return {
		on(_event, callback) {
			listeners.push(callback);
		},
		async close() {
			if (debounceTimer) clearTimeout(debounceTimer);
			for (const w of watchers) {
				w.close();
			}
		},
	};
}

function shouldIgnore(filePath: string, ignorePatterns: readonly string[]): boolean {
	const segments = filePath.split("/");
	return ignorePatterns.some((pattern) => segments.includes(pattern));
}
