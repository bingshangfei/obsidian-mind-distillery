import type { JsonCallSpec } from "./service";
import type { CardSnapshot } from "../rules/cards";

/**
 * The only five LLM call sites in the product (architecture rule: the LLM
 * proposes in JSON, code disposes). Prompts are English for reliability; the
 * model is told to write user-visible content in the source note's language.
 */

const BASE_SYSTEM =
	"You are the distillation engine of a personal knowledge vault governed by a PARA protocol. " +
	"You never delete content; you classify, summarize, and propose cards. " +
	"User-visible text (summaries, card content) must be written in the SAME language as the source note.";

export interface ClassifyResult {
	tier: "deep" | "shallow";
	type: "area" | "resource" | "project" | "clip";
	area: string;
	hasDeadline: boolean;
	isAreaKnowledge: boolean;
	isReference: boolean;
	isDone: boolean;
	reason: string;
}

export function classifyCall(sourceText: string): JsonCallSpec {
	return {
		id: "classify",
		system: BASE_SYSTEM,
		user:
			`Classify this note for the PARA pipeline.\n` +
			`- tier: "deep" if it contains reusable concepts/methods/non-obvious insight not already trivial; else "shallow" (news, moods, duplicates, no lasting value). When unsure choose "shallow".\n` +
			`- hasDeadline: it is a concrete deliverable with a due date.\n` +
			`- isAreaKnowledge: it is personal capability/knowledge for a long-term area (name it in "area", e.g. Engineering, Cognition).\n` +
			`- isReference: it is third-party material/reading notes to keep as reference.\n` +
			`- isDone: it describes finished/expired work.\n` +
			`- type: the note kind (area|resource|project|clip).\n` +
			`- reason: one sentence why.\n\nNOTE:\n${sourceText.slice(0, 8000)}`,
		jsonShape:
			'{"tier":"deep"|"shallow","type":"area"|"resource"|"project"|"clip","area":string,"hasDeadline":boolean,"isAreaKnowledge":boolean,"isReference":boolean,"isDone":boolean,"reason":string}',
	};
}

export interface SummarizeResult {
	summary: string;
	keyPoints: string[];
	quote: string | null;
	sourceType: "external" | "other" | "personal";
}

export function summarizeCall(sourceText: string, mode: "standard" | "brief"): JsonCallSpec {
	return {
		id: "summarize",
		system: BASE_SYSTEM,
		user:
			(mode === "brief"
				? `Write a 1-3 sentence digest of this note.`
				: `Distill this note:\n` +
					`- summary: 1-3 sentences saying what it claims and why it is worth (or not worth) a deeper read.\n` +
					`- keyPoints: 3-5 bullet items, wrap the KEY PHRASE of each item in **bold**.\n` +
					`- quote: at most one verbatim sentence worth quoting, else null.\n` +
					`- sourceType: "personal" (author's own thought), "external" (external material), or "other" (someone else's view relayed).\n\n`) +
			`NOTE:\n${sourceText.slice(0, 12000)}`,
		jsonShape: '{"summary":string,"keyPoints":string[],"quote":string|null,"sourceType":"external"|"other"|"personal"}',
		maxTokens: mode === "brief" ? 300 : 800,
	};
}

export interface CardProposal {
	action: "merge" | "create";
	mergeTarget: string | null;
	card: {
		title: string;
		core: string;
		expand: string[];
		understanding: string[];
		selfTest: string;
		provenanceSource: string;
		tags: string[];
		depth: "overview" | "deep";
		variant: "engineering" | "cognition" | "generic";
	};
}

export function cardCall(sourceText: string, cards: CardSnapshot[]): JsonCallSpec {
	const inventory = cards
		.map((c) => `- [[${c.title}]] (related:${c.related}) ${c.core.slice(0, 90)}`)
		.join("\n");
	return {
		id: "card",
		system: BASE_SYSTEM,
		user:
			`Distill this note into a Zettelkasten card (one concept per card).\n` +
			`Existing cards in the vault:\n${inventory || "(none)"}\n\n` +
			`Rules:\n` +
			`- If an existing card ALREADY covers the same concept → action "merge", mergeTarget = its exact title; propose the delta only.\n` +
			`- Otherwise action "create" with a concept-named title (never "XX notes collection").\n` +
			`- card.core: ONE sentence saying what it is and why it matters.\n` +
			`- card.expand: 2-6 bullet items of substance (for merge: only the new delta, prefixed as additions).\n` +
			`- card.understanding: 1-3 bullets rewritten in the author's voice ("我的理解" style).\n` +
			`- card.selfTest: ONE question that tests real understanding, ideally scenario-based.\n` +
			`- card.variant: "engineering" (practices/patterns), "cognition" (mental models/methods), else "generic".\n` +
			`- card.depth: "overview" unless the concept needs full derivation, then "deep".\n` +
			`- card.tags: at most 2 from [cards, engineering, AI, writing, cognition, workplace, trading] or their one-level children like "AI/agent".\n\n` +
			`NOTE:\n${sourceText.slice(0, 12000)}`,
		jsonShape:
			'{"action":"merge"|"create","mergeTarget":string|null,"card":{"title":string,"core":string,"expand":string[],"understanding":string[],"selfTest":string,"provenanceSource":string,"tags":string[],"depth":"overview"|"deep","variant":"engineering"|"cognition"|"generic"}}',
		maxTokens: 1200,
	};
}

export interface ReviewVerdict {
	verdict: "keep" | "elevate" | "cull";
	reason: string;
	linkTo: string[];
}

export function reviewCardCall(card: CardSnapshot, cardBody: string): JsonCallSpec {
	return {
		id: "reviewCard",
		system: BASE_SYSTEM,
		user:
			`Assess this knowledge card for the weekly review.\n` +
			`- verdict "keep": still inside the active knowledge circle.\n` +
			`- verdict "elevate": can be improved NOW by linking to other cards — list exact target titles in linkTo (targets must exist in the inventory below; only propose links between strongly related concepts).\n` +
			`- verdict "cull": stale, duplicated, or was never a real card (pure transcription). Do NOT propose deleting — a human decides archiving.\n\n` +
			`Card [[${card.title}]] (related:${card.related}, reviewed:${card.reviewed ?? "never"}):\n${cardBody.slice(0, 4000)}`,
		jsonShape: '{"verdict":"keep"|"elevate"|"cull","reason":string,"linkTo":string[]}',
	};
}

export interface QuizResult {
	questions: Array<{ question: string; cardTitle: string }>;
}

export function quizCall(cards: Array<Pick<CardSnapshot, "title" | "core">>): JsonCallSpec {
	const inventory = cards.map((c) => `- [[${c.title}]] ${c.core.slice(0, 100)}`).join("\n");
	return {
		id: "quiz",
		system: BASE_SYSTEM,
		user:
			`Write 3-5 self-test questions from these knowledge cards, forcing active recall (answers live in the cards — do NOT include answers).\n` +
			`Prefer scenario questions ("given X, what should you do / why").\n` +
			`cardTitle must be the EXACT title of the card the question comes from.\n\n` +
			`Cards:\n${inventory}`,
		jsonShape: '{"questions":[{"question":string,"cardTitle":string}]}',
		maxTokens: 900,
	};
}

export const CALL_IDS = ["classify", "summarize", "card", "reviewCard", "quiz"] as const;
