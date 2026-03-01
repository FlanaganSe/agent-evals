import { type FSWatcher, watch as fsWatch } from "node:fs";

export interface FileWatcherOptions {
	readonly paths: readonly string[];
	readonly ignore?: readonly string[] | undefined;
	readonly debounceMs?: number | undefined;
}

export interface FileWatcher {
	readonly on: (event: "change", callback: (files: readonly string[]) => void) => void;
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
			watchers.push(watcher);
		} catch {
			// Directory may not exist — skip silently
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
	return ignorePatterns.some((pattern) => filePath.includes(pattern));
}
