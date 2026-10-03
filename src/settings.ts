import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { CHAT_PRESETS, TRANSCRIBE_PRESETS, getPreset } from "./llm/presets";
import type MindDistilleryPlugin from "./main";
import type { Language, Strings } from "./i18n";

export type ConfirmMode = "auto" | "semi" | "strict";

export interface MindDistillerySettings {
	settingsVersion: number;
	language: Language;
	providerId: string;
	baseUrl: string;
	model: string;
	/** SecretStorage id created via the secret picker; the key itself never lands here. */
	secretId: string;
	transcribeProviderId: string;
	transcribeBaseUrl: string;
	transcribeModel: string;
	transcribeSecretId: string;
	confirmMode: ConfirmMode;
	inboxFolder: string;
	cardsFolder: string;
	ledgerPath: string;
	usageTotal: { calls: number; promptTokens: number; completionTokens: number; totalTokens: number };
}

export const DEFAULT_SETTINGS: MindDistillerySettings = {
	settingsVersion: 1,
	language: "en",
	providerId: "deepseek",
	baseUrl: "https://api.deepseek.com",
	model: "deepseek-chat",
	secretId: "",
	transcribeProviderId: "openai",
	transcribeBaseUrl: "https://api.openai.com/v1",
	transcribeModel: "whisper-1",
	transcribeSecretId: "",
	confirmMode: "semi",
	inboxFolder: "00 Inbox",
	cardsFolder: "03 Resources/卡片",
	ledgerPath: "_system/distillery-log.md",
	usageTotal: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
};

interface RowSpec {
	name: string;
	desc?: string;
	configure: (setting: Setting) => void;
}

/** Declarative settings (Obsidian ≥ 1.13): heading rows + classic Setting rows in render callbacks. */
export class MindDistillerySettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MindDistilleryPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const t: Strings = this.plugin.t;

		const chatRows: RowSpec[] = [
			{
				name: t.settings.provider,
				desc: t.settings.providerDesc,
				configure: (s) => {
					s.addDropdown((d) => {
						for (const p of CHAT_PRESETS) d.addOption(p.id, p.label);
						d.setValue(this.plugin.settings.providerId).onChange((v) => {
							const preset = getPreset(CHAT_PRESETS, v);
							this.plugin.settings.providerId = v;
							this.plugin.settings.baseUrl = preset.baseUrl;
							this.plugin.settings.model = preset.defaultModel;
							void this.plugin.saveSettings();
						});
					});
				},
			},
			{
				name: t.settings.baseUrl,
				desc: t.settings.baseUrlDesc,
				configure: (s) => {
					s.addText((text) =>
						text.setValue(this.plugin.settings.baseUrl).onChange((v) => {
							this.plugin.settings.baseUrl = v.trim();
							void this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: t.settings.model,
				desc: t.settings.modelDesc,
				configure: (s) => {
					s.addText((text) =>
						text.setValue(this.plugin.settings.model).onChange((v) => {
							this.plugin.settings.model = v.trim();
							void this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: t.settings.apiKey,
				desc: t.settings.apiKeyDesc,
				configure: (s) => {
					s.addComponent((el) =>
						this.plugin.secrets.pick(el, "chat", (id) => {
							this.plugin.settings.secretId = id;
							void this.plugin.saveSettings();
						}),
					);
				},
			},
		];

		const transcribeRows: RowSpec[] = [
			{
				name: t.settings.baseUrl,
				desc: t.settings.transcribeDesc,
				configure: (s) => {
					s.addText((text) =>
						text
							.setPlaceholder(getPreset(TRANSCRIBE_PRESETS, this.plugin.settings.transcribeProviderId).baseUrl)
							.setValue(this.plugin.settings.transcribeBaseUrl)
							.onChange((v) => {
								this.plugin.settings.transcribeBaseUrl = v.trim();
								void this.plugin.saveSettings();
							}),
					);
				},
			},
			{
				name: t.settings.model,
				configure: (s) => {
					s.addText((text) =>
						text.setValue(this.plugin.settings.transcribeModel).onChange((v) => {
							this.plugin.settings.transcribeModel = v.trim();
							void this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: t.settings.apiKey,
				configure: (s) => {
					s.addComponent((el) =>
						this.plugin.secrets.pick(el, "transcribe", (id) => {
							this.plugin.settings.transcribeSecretId = id;
							void this.plugin.saveSettings();
						}),
					);
				},
			},
		];

		const vaultRows: RowSpec[] = [
			{
				name: "Inbox folder",
				configure: (s) => {
					s.addText((text) =>
						text.setValue(this.plugin.settings.inboxFolder).onChange((v) => {
							this.plugin.settings.inboxFolder = v.trim();
							void this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: "Cards folder",
				configure: (s) => {
					s.addText((text) =>
						text.setValue(this.plugin.settings.cardsFolder).onChange((v) => {
							this.plugin.settings.cardsFolder = v.trim();
							void this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: t.settings.confirmMode,
				desc: t.settings.confirmModeDesc,
				configure: (s) => {
					s.addDropdown((d) =>
						d
							.addOption("auto", t.settings.confirmAuto)
							.addOption("semi", t.settings.confirmSemi)
							.addOption("strict", t.settings.confirmStrict)
							.setValue(this.plugin.settings.confirmMode)
							.onChange((v) => {
								this.plugin.settings.confirmMode = v as ConfirmMode;
								void this.plugin.saveSettings();
							}),
					);
				},
			},
			{
				name: t.settings.language,
				desc: t.settings.languageDesc,
				configure: (s) => {
					s.addDropdown((d) =>
						d
							.addOption("en", "English")
							.addOption("zh", "中文")
							.setValue(this.plugin.settings.language)
							.onChange((v) => {
								this.plugin.settings.language = v as Language;
								void this.plugin.saveSettings();
							}),
					);
				},
			},
		];

		return [
			this.heading(t.pluginName),
			...chatRows.map((r) => this.row(r)),
			this.heading(t.settings.transcribe),
			...transcribeRows.map((r) => this.row(r)),
			this.heading("Vault"),
			...vaultRows.map((r) => this.row(r)),
		];
	}

	private heading(name: string): SettingDefinitionItem {
		return {
			name,
			render: (setting) => {
				setting.setHeading();
			},
		};
	}

	private row(spec: RowSpec): SettingDefinitionItem {
		return {
			name: spec.name,
			desc: spec.desc,
			render: (setting) => {
				spec.configure(setting);
			},
		};
	}
}
