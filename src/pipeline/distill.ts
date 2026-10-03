import type { VaultIO, VaultFileMeta } from "../io/vaultio";
import { basename, fileBasename, extension, vaultPath } from "../io/vaultio";
import { splitFrontmatter, joinFrontmatter, mergeFrontmatter, asLinkList, wikiList, relatedCount } from "../rules/frontmatter";
import { paraTarget, folderFor, type ParaFolders, type ParaClassification } from "../rules/para";
import { slugify, timestampSlug, nameCandidates, today } from "../rules/naming";
import type { CardSnapshot } from "../rules/cards";
import type { LlmService } from "../llm/service";
import type { ClassifyResult, SummarizeResult, CardProposal } from "../llm/calls";
import { classifyCall, summarizeCall, cardCall } from "../llm/calls";
import { cardMarkdown, renderCard, summaryBlock } from "./cardrender";
import type { RenderedCard } from "./cardrender";

export interface DistillOptions {
	inboxFolder: string;
	cardsFolder: string;
	folders: ParaFolders;
	/** Batch confirm hook: semi/strict modes confirm once when many files are queued. */
	confirmBatch?: (count: number) => Promise<boolean>;
	/** Archive-level confirm hook (unused during distill; archives never produced here). */
	confirmAction?: (title: string, detail: string) => Promise<boolean>;
}

export type DistillStatus = "done" | "failed" | "skipped";

export interface DistillFileReport {
	path: string;
	status: DistillStatus;
	tier: "deep" | "shallow" | null;
	reason: string;
	movedTo: string | null;
	cardTitle: string | null;
	mergedInto: string | null;
}

export interface DistillReport {
	startedAt: string;
	files: DistillFileReport[];
	logPath: string | null;
}

const MD_EXTS = new Set(["md"]);
const SKIP_EXTS = new Set(["base", "excalidraw", "png", "jpg", "jpeg", "gif", "pdf"]);

export class DistillPipeline {
	constructor(
		private readonly io: VaultIO,
		private readonly llm: LlmService,
		private readonly opts: DistillOptions,
		private readonly log: (msg: string) => void = () => {},
	) {}

	async run(): Promise<DistillReport> {
		const startedAt = timestampSlug();
		const files = await this.listInbox();
		if (files.length > 5 && this.opts.confirmBatch) {
			const ok = await this.opts.confirmBatch(files.length);
			if (!ok) {
				return { startedAt, files: [], logPath: null };
			}
		}

		const cards = await this.snapshotCards();
		const reports: DistillFileReport[] = [];
		const liveCards = [...cards];

		for (const file of files) {
			const report = await this.processFile(file, liveCards);
			reports.push(report);
		}

		const logPath = await this.writeLog(startedAt, reports);
		return { startedAt, files: reports, logPath };
	}

	private async listInbox(): Promise<VaultFileMeta[]> {
		const all = await this.io.listFiles(this.opts.inboxFolder);
		return all.filter((f) => {
			const ext = extension(f.path);
			if (MD_EXTS.has(ext)) return true;
			return !SKIP_EXTS.has(ext) && ext.length > 0 && ext !== "";
		});
	}

	private async snapshotCards(): Promise<CardSnapshot[]> {
		const out: CardSnapshot[] = [];
		for (const f of await this.io.listFiles(this.opts.cardsFolder)) {
			if (extension(f.path) !== "md") continue;
			const { fm, body } = splitFrontmatter(await this.io.read(f.path));
			out.push({
				path: f.path,
				title: fileBasename(f.path),
				core: coreLine(body) ?? "",
				related: relatedCount(fm),
				reviewed: typeof fm?.reviewed === "string" ? fm.reviewed : null,
				verdict: typeof fm?.review === "string" ? fm.review : null,
				status: typeof fm?.status === "string" ? fm.status : null,
			});
		}
		return out;
	}

	private async processFile(file: VaultFileMeta, cards: CardSnapshot[]): Promise<DistillFileReport> {
		const report: DistillFileReport = {
			path: file.path,
			status: "failed",
			tier: null,
			reason: "",
			movedTo: null,
			cardTitle: null,
			mergedInto: null,
		};
		try {
			const source = await this.io.read(file.path);
			const { fm, body } = splitFrontmatter(source);
			const sourceText = (body || source).trim();

			const cls = await this.llm.json<ClassifyResult>(classifyCall(sourceText));
			// Protocol: 存疑从浅 — a missing/unknown tier degrades to shallow, never deep.
			const tier: "deep" | "shallow" = cls?.tier === "deep" ? "deep" : "shallow";
			report.tier = tier;
			report.reason = cls?.reason ?? "";

			const nextFm = mergeFrontmatter(fm, {
				type: fm?.type ?? (cls?.type === "area" || cls?.type === "project" || cls?.type === "clip" ? cls.type : "resource"),
				created: fm?.created ?? today(),
				status: fm?.status ?? "done",
				tags: asLinkList(fm?.tags).length ? fm?.tags : ["素材"],
				related: asLinkList(fm?.related),
			});

			if (tier === "shallow") {
				const s = await this.llm.json<SummarizeResult>(summarizeCall(sourceText, "brief"));
				const summary = summaryBlock(s.summary ?? "", (s.keyPoints ?? []).slice(0, 2), null, s.sourceType ?? "personal", "capture");
				const withSummary = body.includes("## 蒸馏摘要")
					? body
					: `${body.replace(/\s*$/, "\n")}${summary}`;
				await this.io.write(file.path, joinFrontmatter(nextFm, withSummary));
				const moved = await this.moveToPara(file.path, cls, nextFm);
				report.status = "done";
				report.movedTo = moved;
				return report;
			}

			// Deep path: standardized summary + card proposal (merge-first)
			const s = await this.llm.json<SummarizeResult>(summarizeCall(sourceText, "standard"));
			const proposal = await this.llm.json<CardProposal>(cardCall(sourceText, cards));
			if (!proposal || (proposal.action !== "merge" && proposal.action !== "create") || !proposal.card?.title) {
				throw new Error("card proposal malformed — file left in inbox for a re-run");
			}
			const sourceRef = `[[${fileBasename(file.path)}]]`;

			const summary = summaryBlock(s.summary ?? "", s.keyPoints ?? [], s.quote ?? null, s.sourceType ?? "personal", sourceRef);
			const withSummary = body.includes("## 蒸馏摘要")
				? body
				: `${body.replace(/\s*$/, "\n")}${summary}`;

			let cardLinks: string[] = [];
			if (proposal.action === "merge" && proposal.mergeTarget) {
				const target = cards.find((c) => c.title === proposal.mergeTarget);
				if (!target) throw new Error(`merge target not found: ${proposal.mergeTarget}`);
				await this.applyMerge(target, proposal, fileBasename(file.path));
				report.mergedInto = target.title;
				cardLinks = [target.title];
			} else {
				const created = await this.createCard(proposal, fileBasename(file.path));
				report.cardTitle = created;
				cardLinks = [created];
			}

			const finalFm = mergeFrontmatter(nextFm, {
				related: wikiList([...asLinkList(nextFm.related), ...cardLinks]),
			});
			const moved = await this.moveToPara(file.path, cls, finalFm);
			await this.io.write(moved, joinFrontmatter(finalFm, withSummary));

			report.status = "done";
			report.movedTo = moved;
			return report;
		} catch (e) {
			const stackFrame = e instanceof Error ? (e.stack ?? "").split("\n").slice(1, 3).join(" | ").trim() : "";
			report.reason = e instanceof Error ? e.message : String(e);
			if (stackFrame) report.reason += ` @ ${stackFrame}`;
			return report;
		}
	}

	/** Merge = append delta to the existing card, cross-link, refresh reviewed. */
	private async applyMerge(target: CardSnapshot, proposal: CardProposal, sourceTitle: string): Promise<void> {
		const source = await this.io.read(target.path);
		const { fm, body } = splitFrontmatter(source);
		const c = proposal.card;

		const addition = [`### 增补（来自 [[${sourceTitle}]]）`, "", ...c.expand.map((line) => `- ${line.replace(/^\s*[-*•]\s*/, "")}`), ""].join("\n");
		const iteration = `- ${today()} 增补（来源：[[${sourceTitle}]]）`;

		let nextBody: string;
		if (body.includes("## 迭代记录")) {
			// One pass: insert the delta before the iteration log, then a line inside it.
			nextBody = body
				.replace("## 迭代记录", `${addition}\n## 迭代记录`)
				.replace(/(## 迭代记录\s*\n)/, `$1${iteration}\n`);
		} else {
			nextBody = `${body.replace(/\s*$/, "\n")}\n${addition}\n## 迭代记录\n\n${iteration}\n`;
		}

		const nextFm = mergeFrontmatter(fm, {
			related: wikiList([...asLinkList(fm?.related), sourceTitle]),
			reviewed: today(),
		});
		await this.io.write(target.path, joinFrontmatter(nextFm, nextBody));
	}

	private async createCard(proposal: CardProposal, sourceTitle: string): Promise<string> {
		const rendered = renderCard(proposal, {
			provenanceLink: `[[${sourceTitle}]]`,
			related: [sourceTitle],
		}) as RenderedCard & { related: string[]; depth: string; date: string };

		const base = slugify(rendered.title);
		let path: string | null = null;
		for (const candidate of nameCandidates(base)) {
			const candidatePath = vaultPath(this.opts.cardsFolder, candidate);
			if (!(await this.io.exists(candidatePath))) {
				path = candidatePath;
				break;
			}
		}
		if (!path) throw new Error(`card name exhausted: ${base}`);
		await this.io.mkdirp(this.opts.cardsFolder);
		await this.io.write(path, cardMarkdown(rendered));

		// Cross-link the source card inventory only (source note is linked in card.related already)
		const snapshot: CardSnapshot = {
			path,
			title: fileBasename(path),
			core: rendered.core,
			related: 1,
			reviewed: today(),
			verdict: null,
			status: "draft",
		};
		void snapshot;
		return fileBasename(path);
	}

	private async moveToPara(path: string, cls: ClassifyResult, _fm: unknown): Promise<string> {
		const classification: ParaClassification = {
			type: cls.type,
			area: cls.area,
			hasDeadline: !!cls.hasDeadline,
			isAreaKnowledge: !!cls.isAreaKnowledge,
			isReference: !!cls.isReference,
			isDone: false,
		};
		const target = paraTarget(classification, this.opts.folders);
		const folder = folderFor(target, this.opts.folders, cls.area ?? "");
		return this.io.move(path, folder);
	}

	private async writeLog(startedAt: string, reports: DistillFileReport[]): Promise<string | null> {
		if (reports.length === 0) return null;
		const path = vaultPath("_system", "distillery-log.md");
		const lines = [
			"",
			`## 蒸馏执行：${startedAt}（Mind Distillery）`,
			"",
			"| 文件 | 档位 | 结果 | 去向 | 卡片 |",
			"| --- | --- | --- | --- | --- |",
			...reports.map(
				(r) =>
					`| ${basename(r.path)} | ${r.tier ?? "—"} | ${r.status}${r.reason ? `（${r.reason.slice(0, 80)}）` : ""} | ${r.movedTo ?? "—"} | ${r.cardTitle ? `[[${r.cardTitle}]]` : r.mergedInto ?? "—"} |`,
			),
			"",
		];
		await this.io.append(path, lines.join("\n"));
		return path;
	}
}

/** First line under the「一句话核心」callout, if any. */
export function coreLine(body: string): string | null {
	const match = body.match(/> \[!tip\] 一句话核心\s*\n> (.+)/);
	return match ? match[1].trim() : null;
}

export const dedupeLinks = (links: string[]): string[] => [
	...new Set(links.map((l) => l.replace(/^\[\[|\]\]$/g, "").trim()).filter((l) => l.length > 0)),
];
