import { describe, expect, it } from "vitest";
import { paraTarget, folderFor, type ParaClassification, type ParaFolders } from "../src/rules/para";
import { reviewQueue, healthStats, type CardSnapshot } from "../src/rules/cards";
import { slugify, nameCandidates, timestampSlug } from "../src/rules/naming";
import { splitFrontmatter, joinFrontmatter, mergeFrontmatter, relatedCount } from "../src/rules/frontmatter";

const folders: ParaFolders = {
	inbox: "00 Inbox",
	projects: "01 Projects",
	areas: "02 Areas",
	resources: "03 Resources",
	archives: "04 Archives",
};

const cls = (over: Partial<ParaClassification>): ParaClassification => ({
	type: "resource",
	area: "",
	hasDeadline: false,
	isAreaKnowledge: false,
	isReference: true,
	isDone: false,
	...over,
});

describe("PARA decision tree (protocol §3)", () => {
	it("done work lands in archives regardless of the rest", () => {
		expect(paraTarget(cls({ isDone: true, hasDeadline: true }), folders)).toBe("archives");
	});

	it("deadline beats area knowledge", () => {
		expect(paraTarget(cls({ hasDeadline: true, isAreaKnowledge: true }), folders)).toBe("projects");
	});

	it("area knowledge goes to its area folder", () => {
		expect(paraTarget(cls({ isAreaKnowledge: true, area: "工程经验" }), folders)).toBe("areas");
		expect(folderFor("areas", folders, "工程经验")).toBe("02 Areas/工程经验");
	});

	it("reference falls to resources", () => {
		expect(paraTarget(cls({}), folders)).toBe("resources");
	});

	it("undecidable stays in inbox", () => {
		expect(paraTarget(cls({ isReference: false }), folders)).toBe("inbox");
	});

	it("archives are year-stamped", () => {
		expect(folderFor("archives", folders, "")).toMatch(/^04 Archives\/\d{4}$/);
	});
});

const card = (over: Partial<CardSnapshot>): CardSnapshot => ({
	path: `03 Resources/卡片/${over.title ?? "X"}.md`,
	title: over.title ?? "X",
	core: "core",
	related: 3,
	reviewed: "2026-09-01",
	verdict: null,
	status: "draft",
	...over,
});

describe("review queue sampling (protocol §5)", () => {
	it("returns everything when the pool is small", () => {
		const cards = [card({ title: "A" }), card({ title: "B" })];
		expect(reviewQueue(cards, Date.now())).toHaveLength(2);
	});

	it("orphans jump ahead of well-linked cards", () => {
		const cards = [
			card({ title: "Healthy", related: 4, reviewed: "2020-01-01" }),
			card({ title: "Orphan", related: 1, reviewed: "2026-09-30" }),
		];
		const queue = reviewQueue(cards, Date.parse("2026-10-03T00:00:00"));
		expect(queue[0].title).toBe("Orphan");
	});

	it("caps the queue at eight", () => {
		const cards = Array.from({ length: 12 }, (_, i) => card({ title: `C${i}` }));
		expect(reviewQueue(cards, Date.now())).toHaveLength(8);
	});
});

describe("health stats", () => {
	it("flags orphans and forgotten cards, ignoring archived", () => {
		const cards = [
			card({ title: "Orphan", related: 1, reviewed: "2026-10-01" }),
			card({ title: "Forgotten", related: 5, reviewed: "2020-01-01" }),
			card({ title: "Archived", related: 0, status: "archived" }),
		];
		const stats = healthStats(cards, Date.parse("2026-10-03T00:00:00"));
		expect(stats.orphans.map((c) => c.title)).toEqual(["Orphan"]);
		expect(stats.forgotten.map((c) => c.title)).toEqual(["Forgotten"]);
		expect(stats.total).toBe(2);
	});
});

describe("naming", () => {
	it("strips path-hostile characters but keeps CJK", () => {
		expect(slugify("预检/后检: 双闸?")).toBe("预检 后检 双闸");
		expect(slugify("   ")).toBe("note");
	});

	it("generates collision candidates", () => {
		const list = nameCandidates("Note");
		expect(list[0]).toBe("Note.md");
		expect(list[1]).toBe("Note-2.md");
		expect(list).toHaveLength(20);
	});

	it("timestamps are sortable", () => {
		expect(timestampSlug(new Date("2026-10-03T01:02:03"))).toBe("2026-10-03-010203");
	});
});

describe("frontmatter", () => {
	it("round-trips fm + body", () => {
		const source = '---\ntype: card\nrelated:\n  - "[[A]]"\n---\n\n# Title\n';
		const { fm, body } = splitFrontmatter(source);
		expect(fm?.type).toBe("card");
		expect(relatedCount(fm)).toBe(1);
		const merged = mergeFrontmatter(fm, { reviewed: "2026-10-03" });
		const out = joinFrontmatter(merged, body);
		const reparsed = splitFrontmatter(out);
		expect(reparsed.fm?.reviewed).toBe("2026-10-03");
		expect(reparsed.body.trim()).toBe("# Title");
	});

	it("treats documents without frontmatter as fm-less", () => {
		const { fm, body } = splitFrontmatter("just text");
		expect(fm).toBeNull();
		expect(body).toBe("just text");
	});
});
