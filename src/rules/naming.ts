export function timestampSlug(date = new Date()): string {
	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Turn a free-text title into a filename-safe slug (keeps CJK, drops path-hostile chars). */
export function slugify(title: string, fallback = "note"): string {
	const cleaned = title
		.replace(/[/\\:*?"<>|#^[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);
	return cleaned || fallback;
}

/**
 * Collision-safe candidate: base, then base-2, base-3… The IO layer decides if
 * a candidate exists; this only generates the sequence.
 */
export function nameCandidates(base: string, ext = "md"): string[] {
	const list = [`${base}.${ext}`];
	for (let i = 2; i <= 20; i++) list.push(`${base}-${i}.${ext}`);
	return list;
}

export function today(): string {
	return new Date().toISOString().slice(0, 10);
}
