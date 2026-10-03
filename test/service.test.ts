import { describe, expect, it, vi } from "vitest";
import { LlmService } from "../src/llm/service";
import type { HttpFn, HttpRequest, HttpResponse } from "../src/llm/http";

const okResponse = (content: string): HttpResponse => ({
	status: 200,
	text: JSON.stringify({
		model: "test-model",
		choices: [{ message: { content } }],
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
	}),
});

const noSleep = async () => {};

describe("LlmService.json", () => {
	it("repairs unparseable output with a follow-up round-trip", async () => {
		const calls: HttpRequest[] = [];
		const http: HttpFn = async (req) => {
			calls.push(req);
			if (calls.length === 1) return okResponse("oops not json");
			return okResponse('{"fine":true}');
		};
		const usage: number[] = [];
		const service = new LlmService({
			http,
			baseUrl: "https://unit.test",
			model: "test-model",
			apiKey: () => "k",
			sleep: noSleep,
			onUsage: (_call, u) => usage.push(u.totalTokens),
		});

		const out = await service.json<{ fine: boolean }>({
			id: "unit",
			system: "sys",
			user: "usr",
			jsonShape: '{"fine": boolean}',
		});

		expect(out).toEqual({ fine: true });
		expect(calls).toHaveLength(2);
		const second = JSON.parse(calls[1].body) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(second.messages.at(-2)?.role).toBe("assistant");
		expect(second.messages.at(-1)?.content).toMatch(/not parseable JSON/i);
		expect(usage).toEqual([15, 15]);
	});

	it("retries transport errors with backoff and gives up after three attempts", async () => {
		let attempts = 0;
		const http: HttpFn = async () => {
			attempts++;
			return { status: 500, text: "boom" };
		};
		const sleeps: number[] = [];
		const service = new LlmService({
			http,
			baseUrl: "https://unit.test",
			model: "m",
			apiKey: () => "k",
			sleep: (ms) => {
				sleeps.push(ms);
				return Promise.resolve();
			},
		});

		await expect(
			service.chat([{ role: "user", content: "hi" }]),
		).rejects.toThrow(/500/);
		expect(attempts).toBe(3);
		expect(sleeps).toEqual([1000, 2000]);
	});

	it("does not retry non-retryable auth failures", async () => {
		const http: HttpFn = vi.fn(async (): Promise<HttpResponse> => ({ status: 401, text: "unauthorized" }));
		const service = new LlmService({
			http,
			baseUrl: "https://unit.test",
			model: "m",
			apiKey: () => "bad",
			sleep: noSleep,
		});

		await expect(service.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/Authentication failed/);
		expect(http).toHaveBeenCalledTimes(1);
	});
});
