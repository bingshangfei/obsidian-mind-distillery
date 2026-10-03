import { describe, expect, it } from "vitest";
import { captureText, captureUrl, extractArticle, safeHost, decodeEntities } from "../src/pipeline/capture";
import { buildMultipart, isTooLarge, saveTranscript } from "../src/pipeline/transcribe";
import { InMemoryIO } from "../src/io/memoryio";

describe("captureText", () => {
	it("writes a timestamped inbox note with minimal frontmatter, never colliding", async () => {
		const io = new InMemoryIO();
		const first = await captureText(io, "00 Inbox", "第一段想法", "灵感");
		const second = await captureText(io, "00 Inbox", "第二段想法", "灵感");
		expect(first.path).toMatch(/^00 Inbox\/捕获-\d{4}-\d{2}-\d{2}-\d{6}-灵感\.md$/);
		expect(second.path).not.toBe(first.path);
		const content = await io.read(first.path);
		expect(content).toContain("source: capture");
		expect(content).toContain("第一段想法");
	});
});

describe("captureUrl", () => {
	it("extracts readable paragraphs and records the source", async () => {
		const io = new InMemoryIO();
		const html = [
			"<html><head><title>质量门禁的演进</title></head><body>",
			"<nav>导航菜单链接一堆</nav>",
			"<p>传统门禁卡在 PR 评审阶段，反馈回路又长又贵。</p>",
			"<p>Agent 时代的门禁要求证据流水线：每个结论都要能回看日志与截图。</p>",
			"<script>tracker();</script>",
			"</body></html>",
		].join("\n");
		const result = await captureUrl(io, "00 Inbox", "https://example.com/qg", async () => html);
		const content = await io.read(result.path);
		expect(content).toContain("source: https://example.com/qg");
		expect(content).toContain("type: clip");
		expect(content).toContain("证据流水线");
		expect(content).not.toContain("tracker");
		expect(content).not.toContain("导航菜单");
	});
});

describe("extractArticle", () => {
	it("decodes entities and drops short fragments", () => {
		const article = extractArticle("<p>&amp; 符号测试：这个段落足够长，会被保留下来作为正文的一部分。</p>");
		expect(article.text).toContain("& 符号测试：这个段落足够长");
		expect(article.text.split("\n\n").some((p) => p.includes("足够长"))).toBe(true);
	});

	it("decodes numeric entities", () => {
		expect(decodeEntities("&#20013;")).toBe("中");
	});

	it("falls back to hostname on bad urls", () => {
		expect(safeHost("https://sspai.com/post/1")).toBe("sspai.com");
		expect(safeHost("not a url")).toBe("url");
	});
});

describe("transcription helpers", () => {
	it("builds a multipart body with model field, file part and terminator", () => {
		const bytes = new TextEncoder().encode("AUDIO");
		const body = new Uint8Array(buildMultipart("file", "a.wav", "audio/wav", bytes.buffer, "B123", "whisper-1"));
		const text = new TextDecoder().decode(body);
		expect(text).toContain('--B123\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n');
		expect(text).toContain('Content-Disposition: form-data; name="file"; filename="a.wav"');
		expect(text).toContain("Content-Type: audio/wav");
		expect(text).toContain("AUDIO");
		expect(text.endsWith("--B123--\r\n")).toBe(true);
	});

	it("flags files over 24 MB", () => {
		expect(isTooLarge(new ArrayBuffer(25 * 1024 * 1024))).toBe(true);
		expect(isTooLarge(new ArrayBuffer(1024))).toBe(false);
	});

	it("saves transcript into the inbox as a capture note", async () => {
		const io = new InMemoryIO();
		const path = await saveTranscript(io, "00 Inbox", "会议录音.m4a", "会议内容：发布时间表已确定。");
		expect(path).toContain("转写-会议录音.md");
		expect(await io.read(path)).toContain("会议内容：发布时间表已确定。");
	});
});
