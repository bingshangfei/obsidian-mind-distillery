import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeFSIO } from "../src/io/nodefsio";
import { snapshotCards } from "../src/pipeline/cardsio";
import { healthStats, reviewQueue } from "../src/rules/cards";
import { DistillPipeline } from "../src/pipeline/distill";
import { LlmService } from "../src/llm/service";
import type { HttpFn } from "../src/llm/http";

/**
 * Real-vault acceptance (plan M1).
 *
 * Part 1 (always, read-only): the rules layer runs against the REAL vault —
 * card snapshots, health stats, queue sampling. No writes ever.
 *
 * Part 2 (opt-in, requires MIND_DISTILLERY_TEST_KEY): a REAL distillation run
 * against the real vault via NodeFSIO + the real LLM endpoint. Verifies the
 * safety invariants live: existing cards untouched structurally, no deletion,
 * inbox emptied. The key is read transiently from the environment and never
 * written anywhere.
 */

const VAULT = process.env.MIND_DISTILLERY_VAULT ?? "C:/Users/zhang/Documents/Obsidian Vault";
const KEY = process.env.MIND_DISTILLERY_TEST_KEY ?? null;
const vaultExists = existsSync(path.join(VAULT, "_system"));

const fetchHttp: HttpFn = async (req) => {
	const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
	return { status: res.status, text: await res.text() };
};

describe.skipIf(!vaultExists)("real vault — read-only rules verification", () => {
	it("snapshots the real card library and computes health/queue", async () => {
		const io = new NodeFSIO(VAULT);
		const cards = await snapshotCards(io, "03 Resources/卡片");
		expect(cards.length).toBeGreaterThanOrEqual(7); // 8 cards distilled so far
		for (const card of cards) {
			expect(card.title.length).toBeGreaterThan(0);
			expect(card.related).toBeGreaterThanOrEqual(0);
		}
		const stats = healthStats(cards);
		expect(stats.total).toBe(cards.filter((c) => c.status !== "archived").length);
		const queue = reviewQueue(cards);
		expect(queue.length).toBeGreaterThanOrEqual(Math.min(5, stats.total));
		// queue ordering: orphan/reviewed-null cards rank before healthy recent ones
		if (queue.length >= 2) {
			const first = queue[0];
			const last = queue[queue.length - 1];
			expect(first.related <= last.related || (first.reviewed ?? "") <= (last.reviewed ?? "")).toBe(true);
		}
	});
});

describe.skipIf(!vaultExists || !KEY)("real vault — REAL distillation run (opt-in)", () => {
	it("runs the pipeline live: inbox processed, card count never decreases, log appended", async () => {
		const key = KEY as string;
		expect(key).toMatch(/^[\w-]{16,}$/);
		const io = new NodeFSIO(VAULT);

		const before = await snapshotCards(io, "03 Resources/卡片");
		const beforeTitles = new Set(before.map((c) => c.title));
		const beforeInbox = await io.listFiles("00 Inbox");

		const service = new LlmService({
			http: fetchHttp,
			baseUrl: process.env.MIND_DISTILLERY_TEST_BASE_URL ?? "https://api.deepseek.com",
			model: process.env.MIND_DISTILLERY_TEST_MODEL ?? "deepseek-chat",
			apiKey: () => key,
			timeoutMs: 120_000,
		});
		const pipeline = new DistillPipeline(io, service, {
			inboxFolder: "00 Inbox",
			cardsFolder: "03 Resources/卡片",
			folders: {
				inbox: "00 Inbox",
				projects: "01 Projects",
				areas: "02 Areas",
				resources: "03 Resources",
				archives: "04 Archives",
			},
			confirmBatch: async () => true, // headless acceptance run; semi-auto rules apply in-app
		});

		const report = await pipeline.run();

		// Safety invariant: no card was removed or renamed away.
		const after = await snapshotCards(io, "03 Resources/卡片");
		const afterTitles = new Set(after.map((c) => c.title));
		for (const title of beforeTitles) expect(afterTitles.has(title)).toBe(true);
		expect(after.length).toBeGreaterThanOrEqual(before.length);

		// Inbox is drained (empty before → empty after; non-empty → every file reported done).
		const afterInbox = await io.listFiles("00 Inbox");
		if (beforeInbox.length === 0) {
			expect(report.files.length).toBe(0);
			expect(afterInbox.length).toBe(0);
		} else {
			expect(report.files.length).toBe(beforeInbox.length);
			for (const f of report.files) expect(f.status).toBe("done");
			expect(afterInbox.filter((f) => f.name.endsWith(".md")).length).toBe(0);
		}
		// Log ledger: appended only when files were actually processed.
		if (report.files.length > 0) {
			expect(await io.exists("_system/distillery-log.md")).toBe(true);
		}
	}, 300_000);

	it("real model, real cards: merge-bait note distills without damaging the card library", async () => {
		const key = KEY as string;
		const os = await import("node:os");
		const { mkdtempSync, cpSync, rmSync, existsSync, readFileSync } = await import("node:fs");
		const tmp = mkdtempSync(path.join(os.tmpdir(), "mind-distillery-accept-"));
		try {
			// Sandbox = faithful copy of the real card library + protocol folders.
			cpSync(path.join(VAULT, "03 Resources"), path.join(tmp, "03 Resources"), { recursive: true });
			cpSync(path.join(VAULT, "_system"), path.join(tmp, "_system"), { recursive: true });

			const io = new NodeFSIO(tmp);
			const before = await snapshotCards(io, "03 Resources/卡片");
			const beforeTitles = new Set(before.map((c) => c.title));
			expect(beforeTitles.has("质量门禁左移")).toBe(true);

			// Merge-bait: original text about the SAME concept as an existing card.
			const bait = [
				"验收标准检查点的新思考：门禁左移之后，预检应该对照需求验收标准逐条自查，",
				"后检对照门禁清单复核证据，两道闸分别把住「做对的事」和「把事做对」，",
				"这样返工成本被压到最低，质量责任不再全部压在最后的评审上。",
			].join("");
			await io.write("00 Inbox/验收检查点新思考.md", bait);

			const service = new LlmService({
				http: fetchHttp,
				baseUrl: process.env.MIND_DISTILLERY_TEST_BASE_URL ?? "https://api.deepseek.com",
				model: process.env.MIND_DISTILLERY_TEST_MODEL ?? "deepseek-chat",
				apiKey: () => key,
				timeoutMs: 120_000,
			});
			const pipeline = new DistillPipeline(io, service, {
				inboxFolder: "00 Inbox",
				cardsFolder: "03 Resources/卡片",
				folders: {
					inbox: "00 Inbox",
					projects: "01 Projects",
					areas: "02 Areas",
					resources: "03 Resources",
					archives: "04 Archives",
				},
				confirmBatch: async () => true,
			});

			const report = await pipeline.run();

			// Run completed cleanly.
			expect(report.files).toHaveLength(1);
			expect(report.files[0].status).toBe("done");

			// Invariant: no card disappeared; card count grew by at most 1.
			const after = await snapshotCards(io, "03 Resources/卡片");
			const afterTitles = new Set(after.map((c) => c.title));
			for (const t of beforeTitles) expect(afterTitles.has(t)).toBe(true);
			expect(after.length).toBeLessThanOrEqual(before.length + 1);

			// Either merged into the existing card or a proper new card was born.
			const merged = report.files[0].mergedInto !== null;
			if (merged) {
				const target = await io.read("03 Resources/卡片/质量门禁左移.md");
				expect(target).toContain("### 增补");
				expect(target).toContain('  - "[[验收检查点新思考]]"');
				expect(target).toContain(`reviewed: ${new Date().toISOString().slice(0, 10)}`);
			} else {
				const newTitle = report.files[0].cardTitle as string;
				const card = await io.read(`03 Resources/卡片/${newTitle}.md`);
				expect(card).toContain("> [!quote] 溯源");
				expect(card).toContain("## 自测");
				expect(card).toContain('  - "[[验收检查点新思考]]"');
			}

			// Source note: routed by PARA, summary block present, links back.
			const notePath = report.files[0].movedTo as string;
			const note = await io.read(notePath);
			expect(note).toContain("## 蒸馏摘要");
			expect(note).not.toContain("00 Inbox");
			// Ledger appended.
			expect(existsSync(path.join(tmp, "_system", "distillery-log.md"))).toBe(true);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	}, 300_000);
});
