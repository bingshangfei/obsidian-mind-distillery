import { describe, expect, it } from "vitest";
import { LlmService } from "../src/llm/service";
import type { HttpFn } from "../src/llm/http";

/**
 * Real-endpoint integration test. Opt-in: set MIND_DISTILLERY_TEST_KEY (and
 * optionally MIND_DISTILLERY_TEST_BASE_URL / _MODEL) in the environment.
 * The key is read transiently and never written to any file or log by this test.
 */
const key = process.env.MIND_DISTILLERY_TEST_KEY ?? null;
const baseUrl = process.env.MIND_DISTILLERY_TEST_BASE_URL ?? "https://api.deepseek.com";
const model = process.env.MIND_DISTILLERY_TEST_MODEL ?? "deepseek-chat";

describe.skipIf(!key)("real LLM endpoint", () => {
	const fetchHttp: HttpFn = async (req) => {
		const res = await fetch(req.url, {
			method: req.method,
			headers: req.headers,
			body: req.body,
		});
		return { status: res.status, text: await res.text() };
	};

	it("completes a chat call and reports token usage", async () => {
		expect(key).toMatch(/^[\w-]{16,}$/);
		const usage: number[] = [];
		const service = new LlmService({
			http: fetchHttp,
			baseUrl,
			model,
			apiKey: () => key as string,
			timeoutMs: 30_000,
			onUsage: (_call, u) => usage.push(u.totalTokens),
		});

		const result = await service.chat([{ role: "user", content: "Reply with the single word: ok" }], 16);

		expect(result.content.toLowerCase()).toContain("ok");
		expect(result.usage.totalTokens).toBeGreaterThan(0);
		expect(usage).toEqual([result.usage.totalTokens]);
	});
});
