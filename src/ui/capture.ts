import { App, Modal, Notice, TFile } from "obsidian";
import { captureText, captureUrl } from "../pipeline/capture";
import { ObsidianVaultIO } from "../io/obsidianio";
import type MindDistilleryPlugin from "../main";

/** Ribbon/command capture: free text + optional URL clip, straight into the inbox. */
export class CaptureModal extends Modal {
	private url = "";
	private text = "";

	constructor(
		app: App,
		private readonly plugin: MindDistilleryPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		const t = this.plugin.t;
		this.titleEl.setText(t.commands.capture);

		new SettingShim(this.contentEl, "URL（可选，粘贴后点 Fetch 提取正文）", (v) => (this.url = v.trim()), (btn) => {
			btn.setButtonText("Fetch");
			btn.onClick(() => {
				if (!this.url) {
					new Notice(t.notice.captureEmpty);
					return;
				}
				void this.submitUrl();
			});
		});

		const area = this.contentEl.createEl("textarea", { cls: "md-capture-textarea" });
		area.placeholder = "随手记点什么…";
		area.addEventListener("input", () => (this.text = area.value));

		const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons
			.createEl("button", { text: "Capture", cls: "mod-cta" })
			.addEventListener("click", () => void this.submitText());
	}

	private async submitText(): Promise<void> {
		if (!this.text.trim()) {
			new Notice(this.plugin.t.notice.captureEmpty);
			return;
		}
		const io = new ObsidianVaultIO(this.plugin);
		const result = await captureText(io, this.plugin.settings.inboxFolder, this.text, "随手记");
		new Notice(this.plugin.t.notice.captured(result.path));
		this.close();
	}

	private async submitUrl(): Promise<void> {
		const io = new ObsidianVaultIO(this.plugin);
		try {
			const result = await captureUrl(io, this.plugin.settings.inboxFolder, this.url, async (u) => {
				const res = await requestJson(u);
				return res.text;
			});
			new Notice(this.plugin.t.notice.captured(result.path));
			this.close();
		} catch (e) {
			new Notice(this.plugin.t.notice.testFail(e instanceof Error ? e.message : String(e)));
		}
	}
}

async function requestJson(url: string): Promise<{ text: string }> {
	const { requestUrl } = await import("obsidian");
	const res = requestUrl({ url, method: "GET", throw: false });
	const response = await res;
	if (response.status >= 400) throw new Error(`Fetch failed (${response.status})`);
	return { text: response.text };
}

/** Minimal setting-ish row to avoid importing Setting inside a modal for one input. */
class SettingShim {
	constructor(
		container: HTMLElement,
		name: string,
		onChange: (value: string) => void,
		extra?: (btn: { setButtonText: (t: string) => unknown; onClick: (cb: () => void) => unknown }) => void,
	) {
		const row = container.createDiv({ cls: "md-capture-row" });
		row.createEl("label", { text: name });
		const input = row.createEl("input", { cls: "md-capture-input" });
		input.type = "text";
		input.addEventListener("input", () => onChange(input.value));
		if (extra) {
			const button = row.createEl("button");
			extra({
				setButtonText: (t) => (button.textContent = t),
				onClick: (cb) => button.addEventListener("click", cb),
			});
		}
	}
}

/** Fuzzy-pick a media file already inside the vault, then transcribe it into the inbox. */
export async function transcribeFlow(
	plugin: MindDistilleryPlugin,
	file: TFile,
): Promise<void> {
	const key = plugin.secrets.resolve(plugin.settings.transcribeSecretId) ?? plugin.secrets.resolve(plugin.settings.secretId);
	if (!key) {
		new Notice(plugin.t.notice.noKey);
		return;
	}
	const bytes = await this_arrayBuffer(plugin, file);
	if (isTooLarge(bytes)) {
		new Notice(plugin.t.notice.transcribeTooLarge);
		return;
	}
	const notice = new Notice(plugin.t.notice.reviewRunning, 0);
	try {
		const { transcribe, saveTranscript } = await import("../pipeline/transcribe");
		const text = await transcribe(
			{
				baseUrl: plugin.settings.transcribeBaseUrl,
				apiKey: key,
				model: plugin.settings.transcribeModel,
				filename: file.name,
				mime: mimeFor(file.extension),
				bytes,
			},
			binaryHttp,
		);
		const io = new ObsidianVaultIO(plugin);
		const path = await saveTranscript(io, plugin.settings.inboxFolder, file.name, text);
		notice.hide();
		new Notice(plugin.t.notice.transcribed(path));
	} catch (e) {
		notice.hide();
		new Notice(plugin.t.notice.transcribeFailed(e instanceof Error ? e.message : String(e)));
	}
}

const isTooLarge = (bytes: ArrayBuffer): boolean => bytes.byteLength > 24 * 1024 * 1024;

async function this_arrayBuffer(plugin: MindDistilleryPlugin, file: TFile): Promise<ArrayBuffer> {
	return plugin.app.vault.readBinary(file);
}

const mimeFor = (ext: string): string =>
	({
		mp3: "audio/mpeg",
		m4a: "audio/mp4",
		wav: "audio/wav",
		webm: "audio/webm",
		ogg: "audio/ogg",
		flac: "audio/flac",
		mp4: "video/mp4",
	})[ext] ?? "application/octet-stream";

const binaryHttp = async (req: { url: string; headers: Record<string, string>; body: ArrayBuffer; timeoutMs?: number }) => {
	const { requestUrl } = await import("obsidian");
	const res = await requestUrl({
		url: req.url,
		method: "POST",
		headers: req.headers,
		body: req.body,
		throw: false,
	});
	return { status: res.status, text: res.text };
};
