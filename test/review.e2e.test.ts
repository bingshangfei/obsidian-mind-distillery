import { describe, expect, it } from "vitest";
import { InMemoryIO } from "../src/io/memoryio";
import { WeeklyReviewPipeline } from "../src/pipeline/review";
import { LlmService } from "../src/llm/service";
import type { HttpFn } from "../src/llm/http";
import type { ReviewVerdict, QuizResult } from "../src/llm/calls";

const NOW = new Date("2026-10-04T09:00:00");

function mockHttp(script: { verdicts: ReviewVerdict[]; quiz: QuizResult }): { http: HttpFn; calls: string[] } {
	const calls: string[] = [];
	let idx = 0;
	const http: HttpFn = async (req) => {
		const body = JSON.parse(req.body) as { messages: Array<{ content: string }> };
		const all = body.messages.map((m) => m.content).join("\n");
		let payload: unknown;
		if (all.includes("Assess this knowledge card")) {
			calls.push(`review:${all.match(/Card \[\[(.+?)\]\]/)?.[1] ?? "?"}`);
			payload = script.verdicts[Math.min(idx++, script.verdicts.length - 1)];
		} else if (all.includes("self-test questions")) {
			calls.push("quiz");
			payload = script.quiz;
		} else {
			throw new Error(`unexpected call: ${all.slice(0, 50)}`);
		}
		return {
			status: 200,
			text: JSON.stringify({
				model: "mock",
				choices: [{ message: { content: JSON.stringify(payload) } }],
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
			}),
		};
	};
	return { http, calls };
}

const service = (http: HttpFn): LlmService =>
	new LlmService({ http, baseUrl: "mock://", model: "m", apiKey: () => "k", sleep: async () => {} });

const reviewOpts = {
	cardsFolder: "03 Resources/卡片",
	journalFolder: "journal",
	projectsFolder: "01 Projects",
	areasFolder: "02 Areas",
	excludeFolders: ["_system"],
};

const makeVault = (): InMemoryIO =>
	new InMemoryIO({
		"03 Resources/卡片/甲卡.md": [
			"---",
			"type: card",
			"status: draft",
			"created: 2026-09-01",
			"reviewed: 2026-08-01",
			"related:",
			'  - "[[乙卡]]"',
			"---",
			"",
			"# 甲卡",
			"",
			"> [!tip] 一句话核心",
			"> 甲卡的核心理念。",
		].join("\n"),
		"03 Resources/卡片/乙卡.md": [
			"---",
			"type: card",
			"status: draft",
			"created: 2026-09-01",
			"reviewed: 2026-10-01",
			"related:",
			'  - "[[甲卡]]"',
			'  - "[[丙卡]]"',
			"---",
			"",
			"# 乙卡",
			"",
			"> [!tip] 一句话核心",
			"> 乙卡核心。",
		].join("\n"),
		"03 Resources/卡片/丙卡.md": [
			"---",
			"type: card",
			"status: draft",
			"created: 2026-08-01",
			"reviewed: null",
			"related: []",
			"---",
			"",
			"# 丙卡",
			"",
			"> [!tip] 一句话核心",
			"> 丙卡核心。",
		].join("\n"),
		"01 Projects/项目A.md": "## 计划\n\n- [ ] 待办一\n- [ ] 待办二\n",
		"_system/distillery-log.md": "# 日志\n",
	});

describe("WeeklyReviewPipeline e2e (mock LLM)", () => {
	it("applies keep/elevate verdicts, marks cull without archiving, writes the review file", async () => {
		const io = makeVault();
		// 丙卡: orphan + oldest → first in queue → elevate to 乙卡; 甲卡: keep; 乙卡: cull (unlikely but tests marking)
		const { http, calls } = mockHttp({
			verdicts: [
				{ verdict: "elevate", reason: "links to 乙卡", linkTo: ["乙卡"] },
				{ verdict: "keep", reason: "still active", linkTo: [] },
				{ verdict: "cull", reason: "stale duplicate", linkTo: [] },
			],
			quiz: { questions: [{ question: "甲卡核心理念是什么？", cardTitle: "甲卡" }] },
		});
		const pipeline = new WeeklyReviewPipeline(io, service(http), reviewOpts);

		const stats = await pipeline.run(NOW);

		// stalled tasks from 项目A (mtime 0 → way over 14 days)
		expect(stats.stalled.length).toBeGreaterThanOrEqual(1);
		expect(stats.stalled[0].tasks).toBe(2);
		// queue: all 3 cards (≤8) — 丙卡 orphan first
		expect(calls.filter((c) => c.startsWith("review:"))[0]).toContain("丙卡");
		// elevate validated: 丙卡 related gains 乙卡
		const bing = await io.read("03 Resources/卡片/丙卡.md");
		expect(bing).toContain('  - "[[乙卡]]"');
		expect(bing).toContain("review: elevate");
		expect(bing).toMatch(/reviewed: .?2026-10-04/);
		// cull: marked only, NOT archived, no status change
		const cullCard = await io.read("03 Resources/卡片/乙卡.md");
		expect(cullCard).toContain("review: cull");
		expect(cullCard).toContain("status: draft");
		expect(Object.keys(io.dump()).some((p) => p.startsWith("04 Archives/"))).toBe(false);
		// review file written with quiz + queue + stalled facts
		const reviewPath = stats.quizPath as string;
		expect(reviewPath).toBe("journal/2026/复盘-2026-10-04.md");
		const review = await io.read(reviewPath);
		expect(review).toContain("## 二、回顾队列");
		expect(review).toContain("[[丙卡]] | elevate");
		expect(review).toContain("cull 待人确认");
		expect(review).toContain("[[甲卡]] —— 甲卡核心理念是什么？");
		expect(review).toContain("## 四、做得好的 / 待改进");
		expect(review).toContain("## 五、下周决策");
	});

	it("same-day second run appends a 追加执行 section instead of overwriting", async () => {
		const io = makeVault();
		const { http } = mockHttp({
			verdicts: [{ verdict: "keep", reason: "ok", linkTo: [] }],
			quiz: { questions: [{ question: "q?", cardTitle: "甲卡" }] },
		});
		const pipeline = new WeeklyReviewPipeline(io, service(http), reviewOpts);

		await pipeline.run(NOW);
		await pipeline.run(new Date("2026-10-04T15:30:00"));

		const review = await io.read("journal/2026/复盘-2026-10-04.md");
		expect(review).toContain("# 复盘：2026-10-04");
		expect(review).toContain("## 追加执行 15:30");
	});

	it("elevate ignores link targets that do not exist", async () => {
		const io = makeVault();
		const { http } = mockHttp({
			verdicts: [
				{ verdict: "elevate", reason: "hallucinated target", linkTo: ["不存在的卡"] },
				{ verdict: "keep", reason: "", linkTo: [] },
				{ verdict: "keep", reason: "", linkTo: [] },
			],
			quiz: { questions: [] },
		});
		const pipeline = new WeeklyReviewPipeline(io, service(http), reviewOpts);

		await pipeline.run(NOW);

		const bing = await io.read("03 Resources/卡片/丙卡.md");
		expect(bing).not.toContain("[[不存在的卡]]");
		expect(bing).toContain("review: elevate"); // still assessed + reviewed refreshed
	});
});
