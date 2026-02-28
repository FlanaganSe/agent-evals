/**
 * Generate starter JSONL cases.
 * Returns a string with one JSON object per line (valid JSONL).
 * Pure function — no I/O.
 */
export function generateStarterCases(): string {
	const cases = [
		{
			id: "H01",
			input: { prompt: "What is 2 + 2?" },
			expected: { text: "4" },
			category: "happy_path",
		},
		{
			id: "H02",
			input: {
				prompt: "Summarize the following text: 'The quick brown fox jumps over the lazy dog.'",
			},
			expected: { text: "A fox jumps over a dog." },
			category: "happy_path",
		},
		{
			id: "E01",
			input: { prompt: "" },
			expected: {},
			category: "edge_case",
		},
	];

	return `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`;
}
