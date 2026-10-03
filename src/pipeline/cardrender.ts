import type { CardProposal } from "../llm/calls";
import { today } from "../rules/naming";

export interface RenderedCard {
	title: string;
	provenance: string;
	core: string;
	expand: string[];
	understanding: string[];
	selfTest: string;
	tags: string[];
}

const VARIANT_TAG: Record<CardProposal["card"]["variant"], string> = {
	engineering: "工程",
	cognition: "认知",
	generic: "卡片",
};

const DEPTH_TAG: Record<CardProposal["card"]["depth"], string> = {
	overview: "概览",
	deep: "深入",
};

/** Render a card proposal into canonical markdown (template equivalent). */
export function renderCard(
	proposal: CardProposal,
	options: { provenanceLink: string; related: string[] },
): RenderedCard {
	const c = proposal.card;
	const title = c.title.trim();
	const tags = dedupe([
		VARIANT_TAG[correctVariant(c.variant)],
		...(c.tags.length ? c.tags : ["卡片"]),
	]);
	return {
		title,
		provenance:
			`来源类型：${c.provenanceSource || "个人原创"} ｜ 首出：${options.provenanceLink} ｜ 引用：（可选，≤2 句原文）`,
		core: c.core.trim(),
		expand: c.expand.map(stripBullet),
		understanding: c.understanding.map(stripBullet),
		selfTest: c.selfTest.trim(),
		tags,
		related: options.related,
		depth: DEPTH_TAG[c.depth] ?? "概览",
		date: today(),
	} as RenderedCard & { related: string[]; depth: string; date: string };
}

/** Guard against the model emitting a variant we do not template. */
function correctVariant(v: CardProposal["card"]["variant"]): CardProposal["card"]["variant"] {
	return v === "engineering" || v === "cognition" || v === "generic" ? v : "generic";
}

const stripBullet = (line: string): string => line.replace(/^\s*[-*•]\s*/, "").trim();

const dedupe = (list: string[]): string[] => [...new Set(list.filter((s) => s && s.trim()))];

export function cardMarkdown(card: RenderedCard & { related: string[]; depth: string; date: string }): string {
	const fm = [
		"---",
		"type: card",
		"status: draft",
		`created: ${card.date}`,
		`reviewed: ${card.date}`,
		`depth: ${card.depth}`,
		"tags:",
		...card.tags.map((t) => `  - ${t}`),
		"related:",
		...(card.related.length ? card.related.map((r) => `  - "[[${r}]]"`) : ["  - []"]),
		"---",
		"",
		`# ${card.title}`,
		"",
		"> [!quote] 溯源",
		`> ${card.provenance}`,
		"",
		"> [!tip] 一句话核心",
		`> ${card.core}`,
		"",
		"## 展开",
		"",
		...card.expand.map((line) => `- ${line}`),
		"",
		"## 我的理解（用自己的话重写）",
		"",
		...(card.understanding.length ? card.understanding.map((line) => `- ${line}`) : ["- "]),
		"",
		"## 自测",
		"",
		`- ${card.selfTest}`,
		"",
		"## 关联",
		"",
		...(card.related.length ? card.related.map((r) => `- [[${r}]]`) : ["- [[]]"]),
		"",
		"## 迭代记录",
		"",
		`- ${card.date} 创建`,
		"",
	];
	return fm.join("\n");
}

/** Distill summary block prepended to the source note (protocol §5 standardization). */
export function summaryBlock(summary: string, keyPoints: string[], quote: string | null, sourceType: string, sourceRef: string): string {
	const lines = [
		"",
		"## 蒸馏摘要",
		"",
		summary.trim(),
		"",
		...keyPoints.map((p) => `- ${stripBullet(p)}`),
		"",
		"> [!info] 溯源",
		`> 来源类型：${sourceType} ｜ 出处：${sourceRef}${quote ? ` ｜ 引用：「${quote.trim()}」` : ""}`,
		"",
	];
	return lines.join("\n");
}
