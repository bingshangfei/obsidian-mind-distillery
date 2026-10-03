import { Plugin, TFile, normalizePath } from "obsidian";
import type { VaultIO, VaultFileMeta } from "./vaultio";

/**
 * Production VaultIO on Obsidian's Vault API.
 * Writes are atomic via Vault.process; moves go through rename (links by
 * filename keep resolving); nothing here ever deletes.
 */
export class ObsidianVaultIO implements VaultIO {
	constructor(private readonly plugin: Plugin) {}

	private file(path: string): TFile | null {
		return this.plugin.app.vault.getFileByPath(normalizePath(path));
	}

	async listFiles(folder: string): Promise<VaultFileMeta[]> {
		const af = this.plugin.app.vault.getFolderByPath(normalizePath(folder));
		if (!af) return [];
		return af.children
			.filter((f): f is TFile => f instanceof TFile)
			.map((f) => ({ path: f.path, name: f.name, basename: f.basename, mtime: f.stat.mtime }));
	}

	async listAllFiles(): Promise<VaultFileMeta[]> {
		return this.plugin.app.vault.getMarkdownFiles().map((f) => ({
			path: f.path,
			name: f.name,
			basename: f.basename,
			mtime: f.stat.mtime,
		}));
	}

	async read(path: string): Promise<string> {
		const f = this.file(path);
		if (!f) throw new Error(`not found: ${path}`);
		return this.plugin.app.vault.cachedRead(f);
	}

	async write(path: string, content: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.file(normalized);
		if (existing) {
			await this.plugin.app.vault.process(existing, () => content);
		} else {
			await this.plugin.app.vault.create(normalized, content);
		}
	}

	async mkdirp(folder: string): Promise<void> {
		const normalized = normalizePath(folder);
		if (!normalized || normalized === "/") return;
		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (this.plugin.app.vault.getAbstractFileByPath(current)) continue;
			try {
				await this.plugin.app.vault.createFolder(current);
			} catch {
				// already exists (race with the indexer) — harmless
			}
		}
	}

	async move(fromPath: string, toFolder: string, newBasename?: string): Promise<string> {
		const f = this.file(fromPath);
		if (!f) throw new Error(`not found: ${fromPath}`);
		const name = newBasename ?? f.name;
		const to = normalizePath(`${toFolder}/${name}`);
		if (this.file(to)) throw new Error(`collision: ${to}`);
		await this.mkdirp(toFolder);
		await this.plugin.app.fileManager.renameFile(f, to);
		return to;
	}

	async append(path: string, content: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.file(normalized);
		if (existing) {
			await this.plugin.app.vault.process(existing, (data) => data + content);
		} else {
			await this.plugin.app.vault.create(normalized, content);
		}
	}

	async exists(path: string): Promise<boolean> {
		return this.file(path) !== null;
	}

	async mtime(path: string): Promise<number> {
		return this.file(path)?.stat.mtime ?? 0;
	}
}
