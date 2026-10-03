import { App, Modal } from "obsidian";

/**
 * Generic confirm dialog used by semi/strict approval gates (protocol §6.7).
 * Resolves once the user decides or the modal is dismissed; never throws.
 */
export function confirmModal(app: App, title: string, body: string): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (approved: boolean) => {
			if (settled) return;
			settled = true;
			resolve(approved);
		};

		const modal = new Modal(app);
		modal.titleEl.setText(title);
		modal.contentEl.createEl("p", { text: body });
		const buttons = modal.contentEl.createDiv({ cls: "modal-button-container" });
		buttons
			.createEl("button", { text: "Cancel", cls: "mod-warning" })
			.addEventListener("click", () => {
				settle(false);
				modal.close();
			});
		buttons
			.createEl("button", { text: "Confirm", cls: "mod-cta" })
			.addEventListener("click", () => {
				settle(true);
				modal.close();
			});
		modal.onClose = () => settle(false);
		modal.open();
	});
}
