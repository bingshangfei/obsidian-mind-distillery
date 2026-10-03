/** Frontmatter representation: flat keys, string arrays for tags/related. */
export type Frontmatter = Record<string, unknown>;

export interface VaultFileMeta {
	path: string;
	name: string;
	basename: string;
	mtime: number;
}

/** Transport-agnostic vault IO. Production uses Obsidian Vault; tests use memory. */
export interface VaultIO {
	listFiles(folder: string): Promise<VaultFileMeta[]>;
	listAllFiles(): Promise<VaultFileMeta[]>;
	read(path: string): Promise<string>;
	write(path: string, content: string): Promise<void>;
	/** Create folder if missing (recursive). */
	mkdirp(folder: string): Promise<void>;
	/** Move a file to a new folder, same basename unless newBasename given; overwrites are never allowed. */
	move(fromPath: string, toFolder: string, newBasename?: string): Promise<string>;
	append(path: string, content: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	mtime(path: string): Promise<number>;
}

/** Obsidian-normalized vault path: backslashes → slashes, no doubled/edge slashes. */
export const vaultPath = (...segments: string[]): string =>
	segments
		.filter((s) => s.length > 0)
		.join("/")
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/|\/$/g, "");

export const basename = (path: string): string => path.split("/").pop() ?? path;
export const fileBasename = (path: string): string => basename(path).replace(/\.[^.]+$/, "");
export const extension = (path: string): string => {
	const name = basename(path);
	const dot = name.lastIndexOf(".");
	return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
};
