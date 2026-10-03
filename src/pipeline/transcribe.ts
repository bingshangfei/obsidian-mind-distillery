import type { VaultIO } from "../io/vaultio";
import { vaultPath } from "../io/vaultio";
import { timestampSlug, slugify } from "../rules/naming";

const MAX_BYTES = 24 * 1024 * 1024; // OpenAI-compatible /audio/transcriptions limit

export interface TranscribeRequest {
	baseUrl: string;
	apiKey: string;
	model: string;
	filename: string;
	mime: string;
	bytes: ArrayBuffer;
	timeoutMs?: number;
}

export interface HttpBinaryRequest {
	url: string;
	headers: Record<string, string>;
	body: ArrayBuffer;
	timeoutMs?: number;
}

export type BinaryHttpFn = (req: HttpBinaryRequest) => Promise<{ status: number; text: string }>;

/** Build a multipart/form-data body for /audio/transcriptions (pure, testable). */
export function buildMultipart(
	field: string,
	filename: string,
	mime: string,
	bytes: ArrayBuffer,
	boundary: string,
	model: string,
): ArrayBuffer {
	const head = `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`;
	const fileHead =
		`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`;
	const tail = `\r\n--${boundary}--\r\n`;
	const headBytes = new TextEncoder().encode(head + fileHead);
	const tailBytes = new TextEncoder().encode(tail);
	const out = new Uint8Array(headBytes.length + bytes.byteLength + tailBytes.length);
	out.set(headBytes, 0);
	out.set(new Uint8Array(bytes), headBytes.length);
	out.set(tailBytes, headBytes.length + bytes.byteLength);
	return out.buffer;
}

/** Transcribe an audio buffer and return plain text (OpenAI-compatible endpoint). */
export async function transcribe(req: TranscribeRequest, http: BinaryHttpFn): Promise<string> {
	const boundary = `mind-distillery-${Math.random().toString(36).slice(2)}`;
	const body = buildMultipart("file", req.filename, req.mime, req.bytes, boundary, req.model);
	const response = await http({
		url: `${req.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`,
		headers: {
			Authorization: `Bearer ${req.apiKey}`,
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
		},
		body,
		timeoutMs: req.timeoutMs ?? 300_000,
	});
	if (response.status === 401) throw new Error("Authentication failed — check the transcription API key");
	if (response.status >= 400) throw new Error(`Transcription endpoint returned ${response.status}: ${response.text.slice(0, 200)}`);
	const payload = JSON.parse(response.text) as { text?: string };
	return payload.text ?? "";
}

/** Size guard shared by the command flow. */
export const isTooLarge = (bytes: ArrayBuffer): boolean => bytes.byteLength > MAX_BYTES;

/** Persist a transcript into the inbox as a capture note, ready for distillation. */
export async function saveTranscript(
	io: VaultIO,
	inboxFolder: string,
	filename: string,
	text: string,
): Promise<string> {
	const base = slugify(filename.replace(/\.[^.]+$/, ""), "转写");
	const path = vaultPath(inboxFolder, `捕获-${timestampSlug()}-转写-${base}.md`);
	const content = [
		"---",
		`created: ${new Date().toISOString().slice(0, 10)}`,
		`source: transcribe（${filename}）`,
		"---",
		"",
		`# 转写：${base}`,
		"",
		text.trim(),
		"",
	].join("\n");
	await io.write(path, content);
	return path;
}
