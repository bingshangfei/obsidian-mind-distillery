import { describe, expect, it, vi } from "vitest";
import { InMemoryIO } from "../src/io/memoryio";
import { DistillPipeline } from "../src/pipeline/distill";
import { LlmService } from "../src/llm/service";
import type { HttpFn, HttpRequest } from "../src/llm/http";
import type { ClassifyResult, SummarizeResult, CardProposal } from "../src/llm/calls";

const FOLDERS = {
	inbox: "00 Inbox",
	projects: "01 Projects",
	areas: "02 Areas",
	resources: "03 Resources",
	archives: "04 Archives",
};

/** Scripted mock: dispatches on the classify/summarize/card call id embedded in the system prompt. */
function mockHttp(script: {
	classify: ClassifyResult | ClassifyResult[];
	summarize: Partial<SummarizeResult>;
	card?: CardProposal;
}): { http: HttpFn; requests: HttpRequest[] } {
		const requests: HttpRequest[] = [];
		const classifyList = Array.isArray(script.classify) ? script.classify : [script.classify];
		let classifyIdx = 0;
		const http: HttpFn = async (req) => {
			requests.push(req);
			const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: string }> };
			const all = body.messages.map((m) => m.content).join("\n");
			let payload: unknown;
			if (all.includes("Classify this note")) {
				payload = classifyList[Math.min(classifyIdx++, classifyList.length - 1)];
			} else if (all.includes("Zettelkasten card")) {
				if (!script.card) throw new Error("unexpected card call");
				payload = script.card;
			} else if (all.includes("Distill this note") || all.includes("1-3 sentence digest")) {
				payload = {
					summary: "这篇讲了一件事。",
					keyPoints: ["**关键句一**", "**关键句二**"],
					quote: null,
					sourceType: "personal",
					...script.summarize,
				};
			} else {
				throw new Error(`unexpected call: ${all.slice(0, 60)}`);
			}
		const content = JSON.stringify(payload);
		return {
			status: 200,
			text: JSON.stringify({
				model: "mock",
				choices: [{ message: { content } }],
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
			}),
		};
	};
	return { http, requests };
}

const makeService = (http: HttpFn): LlmService =>
	new LlmService({ http, baseUrl: "mock://", model: "mock", apiKey: () => "k", sleep: async () => {} });

const baseOpts = (over: Partial<ConstructorParameters<typeof DistillPipeline>[2]> = {}) => ({
	inboxFolder: "00 Inbox",
	cardsFolder: "03 Resources/卡片",
	folders: FOLDERS,
	...over,
});

describe("DistillPipeline e2e (mock LLM over in-memory vault)", () => {
	it("shallow note: frontmatter + brief summary, no card", async () => {
		const io = new InMemoryIO({
			"00 Inbox/碎念.md": "随手记的一条资讯，没有沉淀价值。",
		});
		const { http } = mockHttp({
			classify: { tier: "shallow", type: "resource", area: "", hasDeadline: false, isAreaKnowledge: false, isReference: true, isDone: false, reason: "news" },
			summarize: { summary: "一条资讯。", keyPoints: ["**无**"] },
		});
		const pipeline = new DistillPipeline(io, makeService(http), baseOpts());

		const report = await pipeline.run();

		expect(report.files).toHaveLength(1);
		expect(report.files[0].status).toBe("done");
		expect(report.files[0].tier).toBe("shallow");
		expect(report.files[0].cardTitle).toBeNull();
		const moved = report.files[0].movedTo as string;
		const content = await io.read(moved);
		expect(content).toContain("type: resource");
		expect(content).toContain("## 蒸馏摘要");
		expect(content).not.toContain("# ["); // no card created
	});

	it("deep note: creates card with provenance/self-test, cross-links, moves note, logs report", async () => {
		const io = new InMemoryIO({
			"00 Inbox/预检后检.md": "门禁左移的新想法：预检-后检双闸。",
		});
		const { http } = mockHttp({
			classify: { tier: "deep", type: "area", area: "工程经验", hasDeadline: false, isAreaKnowledge: true, isReference: false, isDone: false, reason: "method" },
			summarize: { summary: "提出双闸模式。", keyPoints: ["**预检**", "**后检**"], quote: "预检在前，后检在后", sourceType: "personal" },
			card: {
				action: "create",
				mergeTarget: null,
				card: {
					title: "预检-后检双闸",
					core: "把检查点放进开发流程的两端。",
					expand: ["预检对验收标准", "后检对门禁清单"],
					understanding: ["回路越短越便宜"],
					selfTest: "为什么预检比后检便宜？",
					provenanceSource: "个人原创",
					tags: ["工程"],
					depth: "overview",
					variant: "engineering",
				},
			},
		});
		const pipeline = new DistillPipeline(io, makeService(http), baseOpts());

		const report = await pipeline.run();

		expect(report.files[0].status).toBe("done");
		expect(report.files[0].cardTitle).toBe("预检-后检双闸");
		expect(report.files[0].movedTo).toBe("02 Areas/工程经验/预检后检.md");

		const cardPath = "03 Resources/卡片/预检-后检双闸.md";
		const card = await io.read(cardPath);
		expect(card).toContain("type: card");
		expect(card).toContain("> [!quote] 溯源");
		expect(card).toContain('  - "[[预检后检]]"');
		expect(card).toContain("## 自测");
		expect(card).toContain("depth: 概览");
		expect(card).toContain("tags:\n  - 工程");

		const note = await io.read("02 Areas/工程经验/预检后检.md");
		expect(note).toContain('  - "[[预检-后检双闸]]"');
		expect(note).toContain("## 蒸馏摘要");
		expect(note).toContain("「预检在前，后检在后」");

		const log = await io.read("_system/distillery-log.md");
		expect(log).toContain("## 蒸馏执行：");
		expect(log).toContain("[[预检-后检双闸]]");
	});

	it("merge path: delta lands in the existing card, related refreshed, no duplicate card", async () => {
		const existingCard = [
			"---",
			"type: card",
			"status: draft",
			"created: 2026-08-31",
			"reviewed: 2026-08-31",
			"related:",
			'  - "[[旧剪藏]]"',
			"---",
			"",
			"# 质量门禁左移",
			"",
			"> [!tip] 一句话核心",
			"> 把验证前置。",
			"",
			"## 展开",
			"",
			"- 证据流水线",
			"",
			"## 迭代记录",
			"",
			"- 2026-08-31 创建",
		].join("\n");
		const io = new InMemoryIO({
			"00 Inbox/双闸灵感.md": "预检-后检双闸灵感。",
			"03 Resources/卡片/质量门禁左移.md": existingCard,
		});
		const { http } = mockHttp({
			classify: { tier: "deep", type: "resource", area: "", hasDeadline: false, isAreaKnowledge: false, isReference: true, isDone: false, reason: "delta" },
			summarize: {},
			card: {
				action: "merge",
				mergeTarget: "质量门禁左移",
				card: {
					title: "质量门禁左移",
					core: "把验证前置。",
					expand: ["预检-后检双闸"],
					understanding: [],
					selfTest: "预检查什么？",
					provenanceSource: "个人原创",
					tags: ["工程"],
					depth: "overview",
					variant: "engineering",
				},
			},
		});
		const pipeline = new DistillPipeline(io, makeService(http), baseOpts());

		const report = await pipeline.run();

		expect(report.files[0].mergedInto).toBe("质量门禁左移");
		expect(report.files[0].cardTitle).toBeNull();
		const files = Object.keys(io.dump()).filter((p) => p.includes("卡片/"));
		expect(files).toHaveLength(1); // no duplicate card

		const merged = await io.read("03 Resources/卡片/质量门禁左移.md");
		expect(merged).toContain("### 增补（来自 [[双闸灵感]]）");
		expect(merged).toContain("- 预检-后检双闸");
		expect(merged).toContain('  - "[[双闸灵感]]"');
		expect(merged).toContain("reviewed: 2026-");
		expect(merged).not.toContain("2026-08-31 创建\n\n## 迭代记录"); // no doubled log header
	});

	it("batch confirm hook can veto a large run", async () => {
		const initial: Record<string, string> = {};
		for (let i = 0; i < 7; i++) initial[`00 Inbox/n${i}.md`] = `note ${i}`;
		const io = new InMemoryIO(initial);
		const confirmBatch = vi.fn(async () => false);
		const pipeline = new DistillPipeline(io, makeService(vi.fn()), baseOpts({ confirmBatch }));

		const report = await pipeline.run();

		expect(confirmBatch).toHaveBeenCalledWith(7);
		expect(report.files).toHaveLength(0);
		expect(Object.keys(io.dump()).filter((p) => p.startsWith("00 Inbox/"))).toHaveLength(7);
	});

	it("failed LLM call marks the file failed without aborting the run", async () => {
		const io = new InMemoryIO({
			"00 Inbox/bad.md": "x",
			"00 Inbox/good.md": "y",
		});
		const { http } = mockHttp({
			classify: [
				{ tier: "deep", type: "resource", area: "", hasDeadline: false, isAreaKnowledge: false, isReference: true, isDone: false, reason: "ok" },
			],
			summarize: {},
			card: {
				action: "create",
				mergeTarget: null,
				card: { title: "T", core: "c", expand: ["e"], understanding: ["u"], selfTest: "s?", provenanceSource: "个人原创", tags: ["认知"], depth: "overview", variant: "cognition" },
			},
		});
		// Make the FIRST classify call fail with a non-retryable error, others pass.
		let first = true;
		const wrapped: HttpFn = async (req) => {
			if (first) {
				first = false;
				return { status: 401, text: "unauthorized" };
			}
			return http(req);
		};
		const service = new LlmService({ http: wrapped, baseUrl: "mock://", model: "m", apiKey: () => "k", sleep: async () => {} });
		const pipeline = new DistillPipeline(io, service, baseOpts());

		const report = await pipeline.run();

		const bad = report.files.find((f) => f.path.endsWith("bad.md"));
		const good = report.files.find((f) => f.path.endsWith("good.md"));
		expect(bad?.status).toBe("failed");
		expect(bad?.reason).toMatch(/Authentication|401/i);
		expect(good?.status).toBe("done");
	});
});
