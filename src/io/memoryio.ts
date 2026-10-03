import type { VaultIO, VaultFileMeta } from "./vaultio";
import { basename, fileBasename } from "./vaultio";

/** In-memory VaultIO for unit/e2e tests. Never overwrites; move refuses collisions. */
export class InMemoryIO implements VaultIO {
	private readonly files = new Map<string, string>();

	constructor(initial: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(initial)) this.files.set(path, content);
	}

	async listFiles(folder: string): Promise<VaultFileMeta[]> {
		const prefix = folder.replace(/\/+$/, "") + "/";
		return [...this.files.keys()]
			.filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
			.map((p) => this.meta(p));
	}

	async listAllFiles(): Promise<VaultFileMeta[]> {
		return [...this.files.keys()].map((p) => this.meta(p));
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`not found: ${path}`);
		return content;
	}

	async write(path: string, content: string): Promise<void> {
		if (!this.files.has(path)) {
			// writing into a non-existent folder is allowed (mkdirp semantics)
			this.files.set(path, content);
			return;
		}
		this.files.set(path, content);
	}

	async mkdirp(): Promise<void> {}

	async move(fromPath: string, toFolder: string, newBasename?: string): Promise<string> {
		const content = this.files.get(fromPath);
		if (content === undefined) throw new Error(`not found: ${fromPath}`);
		const name = newBasename ?? basename(fromPath);
		const to = `${toFolder.replace(/\/+$/, "")}/${name}`;
		if (this.files.has(to)) throw new Error(`collision: ${to}`);
		this.files.delete(fromPath);
		this.files.set(to, content);
		return to;
	}

	async append(path: string, content: string): Promise<void> {
		this.files.set(path, (this.files.get(path) ?? "") + content);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async mtime(): Promise<number> {
		return 0;
	}

	dump(): Record<string, string> {
		return Object.fromEntries(this.files);
	}

	private meta(path: string): VaultFileMeta {
		return { path, name: basename(path), basename: fileBasename(path), mtime: 0 };
	}
}
