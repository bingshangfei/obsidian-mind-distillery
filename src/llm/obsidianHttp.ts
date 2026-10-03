import { requestUrl, type RequestUrlParam } from "obsidian";
import type { HttpFn, HttpRequest } from "./http";

/**
 * Production HTTP layer: Obsidian requestUrl (no CORS, desktop + mobile).
 * `throw: false` lets the provider layer decide what is retryable.
 */
export const requestUrlHttp: HttpFn = async (req: HttpRequest) => {
	const param: RequestUrlParam = {
		url: req.url,
		method: req.method,
		headers: req.headers,
		body: req.body,
		contentType: req.headers["Content-Type"],
		throw: false,
	};
	const call = requestUrl(param);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = req.timeoutMs
		? new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`Request timed out after ${req.timeoutMs}ms`)), req.timeoutMs);
			})
		: undefined;
	try {
		const response = timeout ? await Promise.race([call, timeout]) : await call;
		return { status: response.status, text: response.text };
	} finally {
		if (timer) clearTimeout(timer);
	}
};
