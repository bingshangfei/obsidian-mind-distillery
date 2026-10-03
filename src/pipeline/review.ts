import type { VaultIO } from "../io/vaultio";
import { vaultPath, extension } from "../io/vaultio";
import { splitFrontmatter, joinFrontmatter, mergeFrontmatter, asLinkList, wikiList, relatedCount } from "../rules/frontmatter";
import { reviewQueue, type CardSnapshot } from "../rules/cards";
import { today } from "../rules/naming";
import type { LlmService } from "../llm/service";
import type { ReviewVerdict, QuizResult } from "../llm/calls";
import { reviewCardCall, quizCall } from "../llm/calls";
import { snapshotCards } from "./cardsio";

export interface WeeklyReviewOptions {
	cardsFolder: string;
	journalFolder: string; // "journal"
	projectsFolder: string;
	areasFolder: string;
	excludeFolders: string[]; // _system, wiki, …
	/** strict/semi: elevate writes ask first? Elevate is production-like → always auto (protocol). */
	onProgress?: (msg: string) => void;
}

export interface ReviewStats {
	windowStart: string;
	newNotes: number;
	stalled: Array<{ file: string; tasks: number; days: number }>;
	lastDistillAt: string | null;
	lastReviewAt: string | null;
	expressUpdated: number;
	queue: Array<{ title: string; verdict: string; reason: string; linksAdded: string[] }>;
	quizPath: string | null;
}

const DAY = 86_400_000;

export class WeeklyReviewPipeline {
	constructor(
		private readonly io: VaultIO,
		private readonly llm: LlmService,
		private readonly opts: WeeklyReviewOptions,
	) {}

	async run(now = new Date()): Promise<ReviewStats> {
		const windowStart = new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10);

		const all = await this.io.listAllFiles();
		const markdown = all.filter((f) => extension(f.path) === "md");
		const inWindow = markdown.filter((f) => f.mtime >= now.getTime() - 7 * DAY && !f.path.startsWith("journal/"));

		const stalled: ReviewStats["stalled"] = [];
		for (const f of markdown) {
			if (this.opts.excludeFolders.some((x) => f.path.startsWith(x))) continue;
			if (f.path.startsWith(this.opts.journalFolder + "/")) continue;
			const idleDays = Math.floor((now.getTime() - f.mtime) / DAY);
			if (idleDays <= 14) continue;
			const content = await this.io.read(f.path);
			const tasks = (content.match(/^\s*- \[ \]/gm) ?? []).length;
			if (tasks > 0) stalled.push({ file: f.path, tasks, days: idleDays });
		}
		stalled.sort((a, b) => b.days - a.days);

		const expressUpdated = markdown.filter(
			(f) => f.mtime >= now.getTime() - 7 * DAY && (f.path.startsWith(this.opts.projectsFolder) || f.path.startsWith(this.opts.areasFolder)),
		).length;

		// Review queue
		const cards = await snapshotCards(this.io, this.opts.cardsFolder);
		const queue = reviewQueue(cards, now.getTime());
		const queueResults: ReviewStats["queue"] = [];

		for (const card of queue) {
			const body = await this.io.read(card.path);
			const verdict = await this.llm.json<ReviewVerdict>(reviewCardCall(card, body));
			const applied = await this.applyVerdict(card, verdict, cards, now);
			queueResults.push({ title: card.title, verdict: verdict.verdict, reason: verdict.reason ?? "", linksAdded: applied });
		}

		// Quiz from cards touched this week + queue sample
		const recentTitles = new Set(queue.slice(0, 5).map((c) => c.title));
		for (const f of inWindow) {
			if (f.path.startsWith(this.opts.cardsFolder)) recentTitles.add(f.basename);
		}
		const quizCards = cards.filter((c) => recentTitles.has(c.title) && c.status !== "archived").slice(0, 5);
		let quizPath: string | null = null;
		if (quizCards.length > 0) {
			const quiz = await this.llm.json<QuizResult>(quizCall(quizCards));
			quizPath = await this.writeReviewFile(now, {
				windowStart,
				newNotes: inWindow.length,
				stalled,
				expressUpdated,
				queue: queueResults,
				questions: quiz.questions.filter((q) => quizCards.some((c) => c.title === q.cardTitle)),
			});
		}

		return {
			windowStart,
			newNotes: inWindow.length,
			stalled,
			lastDistillAt: null,
			lastReviewAt: today(),
			expressUpdated,
			queue: queueResults,
			quizPath,
		};
	}

	/** Apply a verdict with protocol §5 semantics: keep→touch, elevate→link (validated), cull→mark only. */
	private async applyVerdict(card: CardSnapshot, verdict: ReviewVerdict, all: CardSnapshot[], now: Date): Promise<string[]> {
		const dateStr = now.toISOString().slice(0, 10);
		const source = await this.io.read(card.path);
		const { fm, body } = splitFrontmatter(source);
		const linksAdded: string[] = [];

		if (verdict.verdict === "elevate" && Array.isArray(verdict.linkTo)) {
			const titles = all.filter((c) => c.status !== "archived").map((c) => c.title);
			const valid = verdict.linkTo.filter((t) => titles.includes(t) && t !== card.title);
			if (valid.length > 0) {
				const nextRelated = wikiList([...asLinkList(fm?.related), ...valid]);
				const relatedBefore = relatedCount(fm);
				linksAdded.push(...nextRelated.slice(relatedBefore));
			}
			const nextFm = mergeFrontmatter(fm, {
				related: linksAdded.length > 0 ? wikiList([...asLinkList(fm?.related), ...linksAdded]) : fm?.related,
				review: "elevate",
				reviewed: dateStr,
			});
			await this.io.write(card.path, joinFrontmatter(nextFm, body));
		} else if (verdict.verdict === "cull") {
			// Mark only — status and files untouched; a human decides archiving.
			const nextFm = mergeFrontmatter(fm, { review: "cull" });
			await this.io.write(card.path, joinFrontmatter(nextFm, body));
		} else {
			const nextFm = mergeFrontmatter(fm, { review: "keep", reviewed: dateStr });
			await this.io.write(card.path, joinFrontmatter(nextFm, body));
		}
		return linksAdded;
	}

	private async writeReviewFile(
		now: Date,
		data: {
			windowStart: string;
			newNotes: number;
			stalled: ReviewStats["stalled"];
			expressUpdated: number;
			queue: ReviewStats["queue"];
			questions: Array<{ question: string; cardTitle: string }>;
		},
	): Promise<string> {
		const pad = (n: number) => String(n).padStart(2, "0");
		const dateStr = now.toISOString().slice(0, 10);
		const year = now.getFullYear();
		const path = vaultPath(this.opts.journalFolder, String(year), `复盘-${dateStr}.md`);
		const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

		const queueTable = [
			"| 卡片 | 处置 | 理由 |",
			"| --- | --- | --- |",
			...data.queue.map((q) => `| [[${q.title}]] | ${q.verdict} | ${q.reason.slice(0, 80)} |`),
		].join("\n");

		const quizSection = [
			"## 自测（先自己答，再点卡核对）",
			"",
			...data.questions.map((q, i) => `${i + 1}. [[${q.cardTitle}]] —— ${q.question}`),
		].join("\n");

		const stalledLines =
			data.stalled.length > 0
				? data.stalled.map((s) => `- [[${s.file.replace(/\.md$/, "")}]]（${s.tasks} 条未完成，停滞 ${s.days} 天）`).join("\n")
				: "- 无停滞任务（>14 天未动且有未完成项）";

		const cullPending = data.queue.filter((q) => q.verdict === "cull");
		const cullSection =
			cullPending.length > 0
				? `\n**处置清单（cull 待人确认，未自动归档）**\n\n${cullPending.map((q) => `- [ ] [[${q.title}]] — ${q.reason.slice(0, 100)}`).join("\n")}\n`
				: "";

		const exists = await this.io.exists(path);
		if (exists) {
			const section = [
				"",
				`## 追加执行 ${hhmm}`,
				"",
				`窗口 ${data.windowStart} 起 ｜ 新增 ${data.newNotes} 篇 ｜ 本周表达类更新 ${data.expressUpdated} 篇（仅事实）`,
				"",
				"**卡点与节奏**",
				"",
				stalledLines,
				"",
				"**回顾队列**",
				"",
				queueTable,
				cullSection,
				quizSection,
				"",
			].join("\n");
			await this.io.append(path, section);
			return path;
		}

		const content = [
			"---",
			"type: review",
			"status: done",
			`created: ${dateStr}`,
			"period: weekly",
			"tags:",
			"  - 复盘",
			"related: []",
			"---",
			"",
			`# 复盘：${dateStr}`,
			"",
			`> [!info] 窗口 ${data.windowStart} 起 ｜ Mind Distillery 自动备料，结论区留白供人决策`,
			"",
			"## 一、本周概况",
			"",
			`- 新增/更新笔记：${data.newNotes} 篇`,
			`- 本周表达（Express，项目/领域区更新）：${data.expressUpdated} 篇（仅事实）`,
			"",
			"**卡点与节奏（AI 预填）**",
			"",
			stalledLines,
			"",
			"## 二、回顾队列（AI 预填 · 人确认）",
			"",
			queueTable,
			"",
			"- 处置标记：keep 保留 ｜ elevate 已补链升华 ｜ cull 建议归档（待确认，不自动删）",
			cullSection,
			"## 三、自测（AI 出题，先自己答再点卡核对）",
			"",
			...data.questions.map((q, i) => `${i + 1}. [[${q.cardTitle}]] —— ${q.question}`),
			"",
			"## 四、做得好的 / 待改进",
			"",
			"- ✅ ",
			"- ⚠️ ",
			"",
			"## 五、下周决策（落到行动）",
			"",
			"- [ ] ",
			"",
		].join("\n");
		await this.io.write(path, content);
		return path;
	}
}
