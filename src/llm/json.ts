/**
 * Tolerant JSON extraction from LLM output.
 * Chain: raw parse → strip markdown fences → outermost-braces slice → fail.
 */
export function extractJson<T = unknown>(text: string): T {
	const raw = tryParse(text);
	if (raw !== undefined) return raw as T;

	const unfenced = text.replace(/```(?:json)?/gi, "").trim();
	const unfencedParsed = tryParse(unfenced);
	if (unfencedParsed !== undefined) return unfencedParsed as T;

	const start = unfenced.search(/[{[]/);
	const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
	if (start >= 0 && end > start) {
		const sliced = tryParse(unfenced.slice(start, end + 1));
		if (sliced !== undefined) return sliced as T;
	}
	throw new Error(`No valid JSON found in model output (${text.slice(0, 120)}…)`);
}

const tryParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};
