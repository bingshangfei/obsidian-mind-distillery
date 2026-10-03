/**
 * Transport-agnostic HTTP contract for the LLM layer.
 * Production wires requestUrl (Obsidian, no CORS); tests wire fetch or mocks.
 */
export interface HttpRequest {
	url: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
	body: string;
	timeoutMs?: number;
}

export interface HttpResponse {
	status: number;
	text: string;
}

export type HttpFn = (req: HttpRequest) => Promise<HttpResponse>;
