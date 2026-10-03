import type { HttpFn, HttpRequest, HttpResponse } from "./http";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface ChatResult {
	content: string;
	usage: ChatUsage;
	model: string;
}

export interface ChatRequest {
	baseUrl: string;
	apiKey: string;
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
	timeoutMs?: number;
}

export class ProviderError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly retryable: boolean,
	) {
		super(message);
		this.name = "ProviderError";
	}
}

const joinUrl = (base: string, path: string): string =>
	base.replace(/\/+$/, "") + path;

const isRetryable = (status: number): boolean =>
	status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

/** Minimal OpenAI-compatible chat-completions client over the injected HTTP layer. */
export async function chatCompletion(http: HttpFn, req: ChatRequest): Promise<ChatResult> {
	const url = joinUrl(req.baseUrl, "/chat/completions");
	const body: Record<string, unknown> = {
		model: req.model,
		messages: req.messages,
		temperature: req.temperature ?? 0.2,
	};
	if (req.maxTokens) body.max_tokens = req.maxTokens;

	const response = await postJson(http, url, req.apiKey, body, req.timeoutMs);
	const payload = safeJson<ChatApiResponse>(response.text);
	const choice = payload?.choices?.[0];
	const content = choice?.message?.content;
	if (typeof content !== "string") {
		throw new ProviderError(`Malformed response from ${url}: ${response.text.slice(0, 300)}`, response.status, false);
	}
	const usage = payload?.usage ?? {};
	return {
		content,
		model: payload?.model ?? req.model,
		usage: {
			promptTokens: Number(usage.prompt_tokens ?? 0),
			completionTokens: Number(usage.completion_tokens ?? 0),
			totalTokens: Number(usage.total_tokens ?? 0),
		},
	};
}

export async function postJson(
	http: HttpFn,
	url: string,
	apiKey: string,
	body: unknown,
	timeoutMs?: number,
): Promise<HttpResponse> {
	const request: HttpRequest = {
		url,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
		timeoutMs,
	};
	const response = await http(request);
	if (response.status === 401) throw new ProviderError("Authentication failed — check the API key", 401, false);
	if (isRetryable(response.status)) {
		throw new ProviderError(`Upstream returned ${response.status}`, response.status, true);
	}
	if (response.status >= 400) {
		throw new ProviderError(`Request failed (${response.status}): ${response.text.slice(0, 300)}`, response.status, false);
	}
	return response;
}

interface ChatApiResponse {
	model?: string;
	choices?: Array<{ message?: { content?: string } }>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

export const safeJson = <T = unknown>(text: string): T | undefined => {
	try {
		return JSON.parse(text) as T;
	} catch {
		return undefined;
	}
};
