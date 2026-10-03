import { ItemView, WorkspaceLeaf } from "obsidian";
import { healthStats, reviewQueue, type CardSnapshot } from "../rules/cards";
import { snapshotCards } from "../pipeline/cardsio";
import { splitFrontmatter, joinFrontmatter, mergeFrontmatter, wikiList, asLinkList } from "../rules/frontmatter";
import { today } from "../rules/naming";
import { vaultPath } from "../io/vaultio";
import { ObsidianVaultIO } from "../io/obsidianio";
import type MindDistilleryPlugin from "../main";
import type { Strings } from "../i18n";

export const REVIEW_HUB_VIEW = "mind-distillery-hub";

export class ReviewHubView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: MindDistilleryPlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	getViewType(): string {
		return REVIEW_HUB_VIEW;
	}

	getDisplayText(): string {
		return this.plugin.t.commands.openReviewHub;
	}

	getIcon(): string {
		return "gauge";
	}

	async onOpen(): Promise<void> {
		await this.renderAll();
	}

	onClose(): Promise<void> {
		return Promise.resolve();
	}

	private io(): ObsidianVaultIO {
		return new ObsidianVaultIO(this.plugin);
	}

	private async renderAll(): Promise<void> {
		const t: Strings = this.plugin.t;
		const root = this.contentEl;
		root.empty();

		const cards = await snapshotCards(this.io(), this.plugin.settings.cardsFolder);
		const stats = healthStats(cards);
		const queue = reviewQueue(cards);

		const head = root.createDiv();
		head.createEl("h4", { text: `${t.pluginName} · ${stats.total} cards` });

		const actions = root.createDiv({ cls: "md-hub-actions" });
		actions
			.createEl("button", { text: t.commands.distillInbox })
			.addEventListener("click", () => void this.plugin.runDistill().then(() => this.renderAll()));
		actions
			.createEl("button", { text: t.commands.weeklyReview })
			.addEventListener("click", () => void this.plugin.runWeeklyReview().then(() => this.renderAll()));

		// 体检
		root.createEl("h5", { text: "🩺 库体检" });
		const health = root.createDiv({ cls: "md-hub-section" });
		health.createEl("div", {
			text: `孤儿卡（related<2）：${stats.orphans.length} ｜ 遗忘卡（>30 天未回顾）：${stats.forgotten.length}`,
			cls: "md-hub-muted",
		});
		for (const card of [...stats.orphans, ...stats.forgotten].slice(0, 8)) {
			health.appendChild(this.cardLink(card));
		}

		// 回顾队列
		root.createEl("h5", { text: "🔁 回顾队列（本周抽样）" });
		const queueEl = root.createDiv({ cls: "md-hub-section" });
		for (const card of queue) {
			const row = queueEl.createDiv({ cls: "md-hub-row" });
			row.appendChild(this.cardLink(card));
			row.createSpan({
				text: `related:${card.related}${card.reviewed ? ` · ${card.reviewed}` : " · 未回顾"}${card.verdict ? ` · ${card.verdict}` : ""}`,
				cls: "md-hub-muted",
			});
		}

		// cull 处置（归档永远需要人工点击）
		const culls = cards.filter((c) => c.verdict === "cull" && c.status !== "archived");
		if (culls.length > 0) {
			root.createEl("h5", { text: "⚠️ cull 待确认（归档需人工点头）" });
			const cullEl = root.createDiv({ cls: "md-hub-section" });
			for (const card of culls) {
				const row = cullEl.createDiv({ cls: "md-hub-row" });
				row.appendChild(this.cardLink(card));
				const btn = row.createEl("button", { text: "归档" });
				btn.addEventListener("click", () => {
					void this.archiveCard(card).then(() => this.renderAll());
				});
			}
		}

		// 随机漫步
		root.createEl("h5", { text: "🎲 随机漫步" });
		const walk = root.createDiv({ cls: "md-hub-section" });
		const picks = [...cards].sort(() => Math.random() - 0.5).slice(0, 3);
		if (picks.length === 0) walk.createDiv({ text: "（库内暂无卡片）", cls: "md-hub-muted" });
		for (const card of picks) walk.appendChild(this.cardLink(card));

		walk.createEl("button", { text: "换一批" }).addEventListener("click", () => {
			void this.renderAll();
		});
	}

	private cardLink(card: CardSnapshot): HTMLDivElement {
		const div = this.contentEl.createDiv();
		const link = div.createEl("a", { text: card.title });
		link.addEventListener("click", (e) => {
			e.preventDefault();
			const file = this.app.vault.getFileByPath(card.path);
			if (file) void this.app.workspace.getLeaf("tab").openFile(file);
		});
		return div;
	}

	/** Archive = move to 04 Archives/<year> + status: archived. Human clicked; never automatic. */
	private async archiveCard(card: CardSnapshot): Promise<void> {
		const year = new Date().getFullYear();
		const io = this.io();
		const source = await io.read(card.path);
		const { fm, body } = splitFrontmatter(source);
		const nextFm = mergeFrontmatter(fm, {
			status: "archived",
			reviewed: today(),
			related: wikiList(asLinkList(fm?.related)),
		});
		await io.write(card.path, joinFrontmatter(nextFm, body));
		await io.move(card.path, vaultPath("04 Archives", String(year)));
	}
}
