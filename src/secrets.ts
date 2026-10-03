import { App, SecretComponent, SecretStorage } from "obsidian";

/**
 * API-key custody on top of Obsidian's SecretStorage (app ≥ 1.11.4).
 * Keys live in per-vault secret storage; settings files only ever hold the secret id.
 */
export class SecretStore {
	constructor(
		private readonly app: App,
		private readonly storage: SecretStorage,
	) {}

	/** Mount the secret picker component; reports the chosen/created secret id. */
	pick(
		containerEl: HTMLElement,
		_kind: string,
		onPick: (secretId: string) => unknown,
	): SecretComponent {
		const component = new SecretComponent(this.app, containerEl);
		component.onChange((id) => {
			void onPick(id);
		});
		return component;
	}

	resolve(secretId: string): string | null {
		if (!secretId) return null;
		const stored = this.storage.getSecret(secretId);
		if (stored) return stored;
		// Tolerate a raw key pasted by an older flow: never log or persist it further.
		if (/^[A-Za-z0-9_-]{24,}$/.test(secretId)) return secretId;
		return null;
	}
}
