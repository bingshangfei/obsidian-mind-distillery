import { timestampSlug, slugify } from "../rules/naming";
import type { VaultIO } from "../io/vaultio";
import { vaultPath } from "../io/vaultio";

export interface CaptureResult {
	path: string;
}

/** Text capture: timestamped note in the inbox with minimal frontmatter; distillation normalizes the rest. */
export async function captureText(io: VaultIO, inboxFolder: string, text: string, slug: string): Promise<CaptureResult> {
	const base = `捕获-${timestampSlug()}-${slugify(slug, "note")}`;
	const path = await firstFree(io, inboxFolder, base);
	const content = ["---", `created: ${new Date().toISOString().slice(0, 10)}`, "source: capture（手动）", "---", "", `# 捕获：${slugify(slug, "note")}`, "", text.trim(), ""].join("\n");
	await io.write(path, content);
	return { path };
}

/** URL capture: fetch the page, extract the readable body, save as a clip draft in the inbox. */
export async function captureUrl(
	io: VaultIO,
	inboxFolder: string,
	url: string,
	fetchFn: (url: string) => Promise<string>,
): Promise<CaptureResult> {
	const html = await fetchFn(url);
	const article = extractArticle(html);
	const host = safeHost(url);
	const base = `剪藏-${timestampSlug()}-${slugify(article.title || host, host)}`;
	const path = await firstFree(io, inboxFolder, base);
	const content = [
		"---",
		`created: ${new Date().toISOString().slice(0, 10)}`,
		`source: ${url}`,
		"type: clip",
		"status: draft",
		"---",
		"",
		`# ${article.title || host}`,
		"",
		article.text,
		"",
	].join("\n");
	await io.write(path, content);
	return { path };
}

/** Readability-lite: strip scripts/styles/tags, collapse whitespace. Distillation does the real summarizing. */
export function extractArticle(html: string): { title: string; text: string } {
	const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	const title = decodeEntities((titleMatch?.[1] ?? "").trim());
	const withoutHead = html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<nav[\s\S]*?<\/nav>/gi, " ")
		.replace(/<footer[\s\S]*?<\/footer>/gi, " ")
		.replace(/<header[\s\S]*?<\/header>/gi, " ");
	const paragraphs: string[] = [];
	for (const match of withoutHead.matchAll(/<(?:p|h[1-6]|li)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li)>/gi)) {
		const text = decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
		if (text.length >= 20) paragraphs.push(text);
	}
	return { title, text: paragraphs.join("\n\n") };
}

export function decodeEntities(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export const safeHost = (url: string): string => {
	try {
		return new URL(url).hostname;
	} catch {
		return "url";
	}
};

async function firstFree(io: VaultIO, folder: string, base: string): Promise<string> {
	for (const candidate of nameCandidatesSafe(base)) {
		const p = vaultPath(folder, `${candidate}.md`);
		if (!(await io.exists(p))) return p;
	}
	return vaultPath(folder, `${base}-${Date.now()}.md`);
}

function nameCandidatesSafe(base: string): string[] {
	const list = [base];
	for (let i = 2; i <= 10; i++) list.push(`${base}-${i}`);
	return list;
}
