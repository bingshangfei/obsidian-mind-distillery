import { chatCompletion, ProviderError } from "./provider";
import type { ChatMessage, ChatRequest, ChatResult, ChatUsage } from "./provider";
import { extractJson } from "./json";
import type { HttpFn } from "./http";

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export interface JsonCallSpec {
	/** Call-site id, used for usage accounting. */
	id: string;
	system: string;
	user: string;
	/** Short human-readable shape description, appended so the model emits parseable JSON. */
	jsonShape: string;
	temperature?: number;
	maxTokens?: number;
}

export interface LlmServiceDeps {
	http: HttpFn;
	baseUrl: string;
	apiKey: () => string;
	model: string;
	timeoutMs?: number;
	onUsage?: (call: string, usage: ChatUsage) => void;
	/** Test seam: inject delays between retries. */
	sleep?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Structured-JSON front end over the OpenAI-compatible provider.
 * Guarantees: bounded retries (transport-level + JSON-repair level), usage accounting, typed errors.
 */
export class LlmService {
	constructor(private readonly deps: LlmServiceDeps) {}

	/** One raw chat completion — used by "test connection" and simple flows. */
	async chat(messages: ChatMessage[], maxTokens?: number): Promise<ChatResult> {
		return this.withRetry(`chat:${messages[0]?.content?.slice(0, 20) ?? "prompt"}`, (attempt) =>
			chatCompletion(this.deps.http, this.request(messages, maxTokens, attempt)),
		);
	}

	/** Chat constrained to JSON output, with extraction + one repair round-trip. */
	async json<T>(spec: JsonCallSpec): Promise<T> {
		const system = `${spec.system}\nRespond with ONLY a valid JSON value, no prose, no markdown fences. Shape: ${spec.jsonShape}`;
		const messages: ChatMessage[] = [
			{ role: "system", content: system },
			{ role: "user", content: spec.user },
		];

		let lastError: unknown;
		let previous = "";
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			if (previous) {
				messages.splice(2);
				messages.push({ role: "assistant", content: previous });
				messages.push({
					role: "user",
					content:
						"That was not parseable JSON. Reply again with ONLY the JSON value matching the required shape.",
				});
			}
			const result = await this.withRetry(spec.id, (a) =>
				chatCompletion(this.deps.http, this.request(messages, spec.maxTokens, a, spec.temperature)),
			);
			previous = result.content;
			try {
				return extractJson<T>(result.content);
			} catch (e) {
				lastError = e;
			}
		}
		throw new Error(
			`Model did not return valid JSON after ${MAX_ATTEMPTS} attempts: ${String(lastError).slice(0, 200)}`,
		);
	}

	private request(messages: ChatMessage[], maxTokens?: number, attempt = 1, temperature?: number): ChatRequest {
		return {
			baseUrl: this.deps.baseUrl,
			apiKey: this.deps.apiKey(),
			model: this.deps.model,
			messages,
			maxTokens,
			temperature,
			timeoutMs: this.deps.timeoutMs,
		};
	}

	private async withRetry<T>(id: string, fn: (attempt: number) => Promise<T>): Promise<T> {
		let lastError: unknown;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			try {
				const result = await fn(attempt);
				if (result && typeof result === "object" && "usage" in (result as unknown as object)) {
					this.deps.onUsage?.(id, (result as unknown as ChatResult).usage);
				}
				return result;
			} catch (e) {
				lastError = e;
				const retryable =
					e instanceof ProviderError ? e.retryable : (e as { status?: number })?.status ? RETRYABLE_STATUS.has((e as { status: number }).status) : false;
				if (!retryable || attempt === MAX_ATTEMPTS) break;
				const backoff = 1000 * 2 ** (attempt - 1);
				await (this.deps.sleep ?? sleep)(backoff);
			}
		}
		throw lastError;
	}
}
