import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import type { VaultIO, VaultFileMeta } from "./vaultio";
import { basename, fileBasename, extension } from "./vaultio";

/**
 * Node filesystem VaultIO for CLI harnesses and key-gated real-vault tests.
 * Every operation is contained within the vault root; nothing deletes.
 */
export class NodeFSIO implements VaultIO {
	private readonly root: string;

	constructor(vaultRoot: string) {
		this.root = path.resolve(vaultRoot);
		if (!existsSync(this.root)) throw new Error(`vault root not found: ${this.root}`);
	}

	private resolve(relative: string): string {
		const abs = path.resolve(this.root, relative.replace(/\\/g, "/"));
		if (!abs.startsWith(this.root + path.sep) && abs !== this.root) {
			throw new Error(`path escapes vault root: ${relative}`);
		}
		return abs;
	}

	private toRel(abs: string): string {
		return path.relative(this.root, abs).replace(/\\/g, "/");
	}

	async listFiles(folder: string): Promise<VaultFileMeta[]> {
		const abs = this.resolve(folder);
		if (!existsSync(abs)) return [];
		const entries = await fs.readdir(abs, { withFileTypes: true });
		return entries
			.filter((e) => e.isFile())
			.map((e) => {
				const full = path.join(abs, e.name);
				return { path: this.toRel(full), name: e.name, basename: fileBasename(e.name), mtime: 0 };
			});
	}

	async listAllFiles(): Promise<VaultFileMeta[]> {
		const out: VaultFileMeta[] = [];
		const walk = async (dir: string): Promise<void> => {
			for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					// Skip hidden dirs (includes the Obsidian config folder) and deps.
					if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
					await walk(full);
				} else if (entry.name.endsWith(".md")) {
					out.push({ path: this.toRel(full), name: entry.name, basename: fileBasename(entry.name), mtime: 0 });
				}
			}
		};
		await walk(this.root);
		return out;
	}

	async read(relative: string): Promise<string> {
		return fs.readFile(this.resolve(relative), "utf8");
	}

	async write(relative: string, content: string): Promise<void> {
		const abs = this.resolve(relative);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, content, "utf8");
	}

	async mkdirp(folder: string): Promise<void> {
		await fs.mkdir(this.resolve(folder), { recursive: true });
	}

	async move(fromRelative: string, toFolder: string, newBasename?: string): Promise<string> {
		const from = this.resolve(fromRelative);
		const name = newBasename ?? basename(fromRelative);
		const to = this.resolve(`${toFolder}/${name}`);
		if (existsSync(to)) throw new Error(`collision: ${this.toRel(to)}`);
		await fs.mkdir(path.dirname(to), { recursive: true });
		await fs.rename(from, to);
		return this.toRel(to);
	}

	async append(relative: string, content: string): Promise<void> {
		const abs = this.resolve(relative);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.appendFile(abs, content, "utf8");
	}

	async exists(relative: string): Promise<boolean> {
		return existsSync(this.resolve(relative));
	}

	async mtime(relative: string): Promise<number> {
		return (await fs.stat(this.resolve(relative))).mtimeMs;
	}

	/** Real mtimes for listFiles callers that need them (stalled-task stats). */
	async withRealMtimes(files: VaultFileMeta[]): Promise<VaultFileMeta[]> {
		return Promise.all(
			files.map(async (f) => ({ ...f, mtime: (await fs.stat(this.resolve(f.path))).mtimeMs })),
		);
	}
}

export const fileExt = extension;
