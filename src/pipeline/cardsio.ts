import type { VaultIO } from "../io/vaultio";
import { fileBasename, extension } from "../io/vaultio";
import { splitFrontmatter, relatedCount } from "../rules/frontmatter";
import { coreLine } from "./distill";
import type { CardSnapshot } from "../rules/cards";

/** Read every card in the cards folder into a lightweight snapshot for rules + LLM context. */
export async function snapshotCards(io: VaultIO, cardsFolder: string): Promise<CardSnapshot[]> {
	const out: CardSnapshot[] = [];
	for (const f of await io.listFiles(cardsFolder)) {
		if (extension(f.path) !== "md") continue;
		const { fm, body } = splitFrontmatter(await io.read(f.path));
		out.push({
			path: f.path,
			title: fileBasename(f.path),
			core: coreLine(body) ?? "",
			related: relatedCount(fm),
			reviewed: typeof fm?.reviewed === "string" ? fm.reviewed : null,
			verdict: typeof fm?.review === "string" ? fm.review : null,
			status: typeof fm?.status === "string" ? fm.status : null,
		});
	}
	return out;
}
