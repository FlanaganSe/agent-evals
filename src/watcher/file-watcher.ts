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
 * Creates a file watcher with platform-appropriate backend.
 * macOS/Windows: uses native fs.watch({ recursive: true })
 * Linux: uses chokidar (dynamic import, only loaded on Linux)
 */
export async function createFileWatcher(options: FileWatcherOptions): Promise<FileWatcher> {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const ignorePatterns = options.ignore ?? DEFAULT_IGNORE;

	if (process.platform === "linux") {
		return createChokidarWatcher(options.paths, ignorePatterns, debounceMs);
	}
	return createNativeWatcher(options.paths, ignorePatterns, debounceMs);
}

function shouldIgnore(filePath: string, ignorePatterns: readonly string[]): boolean {
	return ignorePatterns.some((pattern) => filePath.includes(pattern));
}

function createNativeWatcher(
	paths: readonly string[],
	ignorePatterns: readonly string[],
	debounceMs: number,
): FileWatcher {
	const listeners: Array<(files: readonly string[]) => void> = [];
	const watchers: FSWatcher[] = [];
	let pendingFiles = new Set<string>();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	for (const dir of paths) {
		try {
			const watcher = fsWatch(dir, { recursive: true }, (_event, filename) => {
				if (!filename) return;
				const fullPath = `${dir}/${filename}`;
				if (shouldIgnore(fullPath, ignorePatterns)) return;

				pendingFiles.add(fullPath);

				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					const files = [...pendingFiles];
					pendingFiles = new Set();
					for (const listener of listeners) {
						listener(files);
					}
				}, debounceMs);
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

async function createChokidarWatcher(
	paths: readonly string[],
	ignorePatterns: readonly string[],
	debounceMs: number,
): Promise<FileWatcher> {
	const { watch } = await import("chokidar");
	const listeners: Array<(files: readonly string[]) => void> = [];
	let pendingFiles = new Set<string>();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const ignored = ignorePatterns.map((p) => `**/${p}/**`);
	const watcher = watch([...paths], {
		ignoreInitial: true,
		ignored,
	});

	const handleChange = (filePath: string): void => {
		pendingFiles.add(filePath);
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			const files = [...pendingFiles];
			pendingFiles = new Set();
			for (const listener of listeners) {
				listener(files);
			}
		}, debounceMs);
	};

	watcher.on("change", handleChange);
	watcher.on("add", handleChange);
	watcher.on("unlink", handleChange);

	return {
		on(_event, callback) {
			listeners.push(callback);
		},
		async close() {
			if (debounceTimer) clearTimeout(debounceTimer);
			await watcher.close();
		},
	};
}
