import type { Frontmatter } from "../io/vaultio";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

/** Split a markdown document into (frontmatter | null, body). */
export function splitFrontmatter(source: string): { fm: Frontmatter | null; body: string } {
	const match = FENCE.exec(source);
	if (!match) return { fm: null, body: source };
	try {
		const parsed: unknown = parseYaml(match[1]);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return { fm: parsed as Frontmatter, body: source.slice(match[0].length) };
		}
	} catch {
		// Unparseable frontmatter is treated as absent; body preserved below via full slice fallback.
		return { fm: null, body: source.slice(match[0].length) };
	}
	return { fm: null, body: source.slice(match[0].length) };
}

/** Serialize frontmatter + body. Empty/undefined fm yields the body unchanged. */
export function joinFrontmatter(fm: Frontmatter | null | undefined, body: string): string {
	if (!fm || Object.keys(fm).length === 0) return body;
	return `---\n${stringifyYaml(fm, { lineWidth: 0 })}---\n${body.startsWith("\n") ? body : `\n${body}`}`;
}

/** Merge patches into frontmatter without clobbering untouched keys. */
export function mergeFrontmatter(fm: Frontmatter | null | undefined, patch: Frontmatter): Frontmatter {
	return { ...(fm ?? {}), ...patch };
}

/** Wikilink array field: accepts string or list, always returns a list of link targets. */
export function asLinkList(value: unknown): string[] {
	if (value == null) return [];
	if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v) ?? ""));
	return [typeof value === "string" ? value : JSON.stringify(value) ?? ""];
}

/** Normalize mixed "[[X]]"/"X" entries and re-emit as canonical `[[X]]` strings. */
export function wikiList(links: string[]): string[] {
	const titles = links
		.map((l) => l.replace(/^\[\[|\]\]$/g, "").trim())
		.filter((l) => l.length > 0);
	return [...new Set(titles)].map((t) => `[[${t}]]`);
}

/** Count of links in related that actually point somewhere (non-empty entries). */
export function relatedCount(fm: Frontmatter | null): number {
	return asLinkList(fm?.related).filter((s) => s.trim().length > 0).length;
}
