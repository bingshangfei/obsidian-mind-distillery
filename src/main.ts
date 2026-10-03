import { Notice, Plugin, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, MindDistillerySettingTab, type MindDistillerySettings } from "./settings";
import { stringsFor, type Strings } from "./i18n";
import { requestUrlHttp } from "./llm/obsidianHttp";
import { LlmService } from "./llm/service";
import { UsageLedger } from "./llm/usage";
import { SecretStore } from "./secrets";
import { ObsidianVaultIO } from "./io/obsidianio";
import { DistillPipeline } from "./pipeline/distill";
import { confirmModal } from "./ui/modal";
import type { ParaFolders } from "./rules/para";

export default class MindDistilleryPlugin extends Plugin {
	settings!: MindDistillerySettings;
	t!: Strings;
	secrets!: SecretStore;
	llm!: LlmService;
	usage!: UsageLedger;

	private statusBarItem?: HTMLElement;
	private distillRunning = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.t = stringsFor(this.settings.language);
		this.secrets = new SecretStore(this.app, this.app.secretStorage);
		this.usage = new UsageLedger();
		this.usage.restore(this.settings.usageTotal);
		this.rebuildLlm();

		this.statusBarItem = this.addStatusBarItem();
		this.renderStatusBar();

		this.addRibbonIcon("flask-conical", this.t.commands.testConnection, () => {
			void this.testConnection();
		});

		this.addCommand({
			id: "distill-inbox",
			name: this.t.commands.distillInbox,
			callback: () => void this.runDistill(),
		});

		this.addCommand({
			id: "test-connection",
			name: this.t.commands.testConnection,
			callback: () => void this.testConnection(),
		});

		this.addSettingTab(new MindDistillerySettingTab(this.app, this));
	}

	private rebuildLlm(): void {
		this.llm = new LlmService({
			http: requestUrlHttp,
			baseUrl: this.settings.baseUrl,
			model: this.settings.model,
			apiKey: () => this.secrets.resolve(this.settings.secretId) ?? "",
			timeoutMs: 60_000,
			onUsage: (call, usage) => {
				this.usage.add(call, usage);
				this.settings.usageTotal = this.usage.snapshot();
				void this.saveSettings();
				this.renderStatusBar();
			},
		});
	}

	private renderStatusBar(): void {
		if (!this.statusBarItem) return;
		const total = this.usage.total();
		this.statusBarItem.setText(total.calls > 0 ? this.t.statusBar.tokens(total.totalTokens) : "");
	}

	private async testConnection(): Promise<void> {
		const key = this.secrets.resolve(this.settings.secretId);
		if (!key) {
			new Notice(this.t.notice.noKey);
			return;
		}
		new Notice(this.t.notice.testing);
		try {
			const result = await this.llm.chat([{ role: "user", content: "Reply with the single word: ok" }], 16);
			new Notice(this.t.notice.testOk(result.model, result.usage.totalTokens));
		} catch (e) {
			new Notice(this.t.notice.testFail(e instanceof Error ? e.message : String(e)));
		}
	}

	/** Folder-safe path inside the vault. */
	path(...segments: string[]): string {
		return normalizePath(segments.join("/"));
	}

	private paraFolders(): ParaFolders {
		return {
			inbox: this.settings.inboxFolder,
			projects: "01 Projects",
			areas: "02 Areas",
			resources: "03 Resources",
			archives: "04 Archives",
		};
	}

	async runDistill(): Promise<void> {
		if (this.distillRunning) {
			new Notice(this.t.notice.alreadyRunning);
			return;
		}
		this.distillRunning = true;
		const progress = new Notice(this.t.notice.distillRunning, 0);
		try {
			const io = new ObsidianVaultIO(this);
			const pipeline = new DistillPipeline(io, this.llm, {
				inboxFolder: this.settings.inboxFolder,
				cardsFolder: this.settings.cardsFolder,
				folders: this.paraFolders(),
				confirmBatch: async (count) => {
					if (this.settings.confirmMode === "auto") return true;
					return confirmModal(
						this.app,
						this.t.notice.confirmBatchTitle,
						this.t.notice.confirmBatchBody(count),
					);
				},
			});
			const report = await pipeline.run();
			progress.hide();
			const done = report.files.filter((f) => f.status === "done").length;
			const failed = report.files.filter((f) => f.status === "failed").length;
			this.settings.lastDistillAt = new Date().toISOString();
			await this.saveSettings();
			new Notice(failed === 0 ? this.t.notice.distillDone(done) : this.t.notice.distillPartial(done, failed));
		} catch (e) {
			progress.hide();
			new Notice(this.t.notice.testFail(e instanceof Error ? e.message : String(e)));
		} finally {
			this.distillRunning = false;
		}
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<MindDistillerySettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
		if (!this.settings.usageTotal) this.settings.usageTotal = { ...DEFAULT_SETTINGS.usageTotal };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
