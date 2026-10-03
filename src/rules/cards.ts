
export interface CardSnapshot {
	path: string;
	title: string;
	/** One-line core claim, used as LLM context for merge decisions. */
	core: string;
	related: number;
	reviewed: string | null;
	/** frontmatter review verdict: keep/cull/elevate or null when never assessed */
	verdict: string | null;
	status: string | null;
}

export interface HealthStats {
	total: number;
	orphans: CardSnapshot[];
	forgotten: CardSnapshot[];
}

const FORGOTTEN_DAYS = 30;
const DAY_MS = 86_400_000;

export function healthStats(cards: CardSnapshot[], now = Date.now()): HealthStats {
	const active = cards.filter((c) => c.status !== "archived");
	const orphans = active.filter((c) => c.related < 2).slice().sort((a, b) => a.related - b.related);
	const cutoff = now - FORGOTTEN_DAYS * DAY_MS;
	const forgotten = active
		.filter((c) => !c.reviewed || Date.parse(c.reviewed + "T00:00:00") < cutoff)
		.slice()
		.sort((a, b) => (a.reviewed ?? "").localeCompare(b.reviewed ?? ""));
	return { total: active.length, orphans, forgotten };
}

/**
 * Review queue sampling (protocol §5): 5-8 cards, oldest `reviewed` first,
 * orphans (related < 2) jump the queue. Fewer cards than the floor → all of them.
 */
export function reviewQueue(cards: CardSnapshot[], now = Date.now()): CardSnapshot[] {
	const active = cards.filter((c) => c.status !== "archived");
	if (active.length <= 8) return rank(active, now);
	return rank(active, now).slice(0, 8);
}

function rank(cards: CardSnapshot[], now: number): CardSnapshot[] {
	const cutoff = now - FORGOTTEN_DAYS * DAY_MS;
	return cards
		.map((c) => ({
			c,
			score:
				(c.related < 2 ? -1000 : 0) +
				(!c.reviewed ? -500 : Date.parse(c.reviewed + "T00:00:00") < cutoff ? -250 : 0),
		}))
		.sort((a, b) => {
			if (a.score !== b.score) return a.score - b.score;
			return (a.c.reviewed ?? "").localeCompare(b.c.reviewed ?? "");
		})
		.map((x) => x.c);
}

export const QUEUE_MIN = 5;
export const QUEUE_MAX = 8;
