import { describe, expect, it } from "vitest";
import { extractJson } from "../src/llm/json";

describe("extractJson", () => {
	it("parses raw JSON", () => {
		expect(extractJson('{"a":1}')).toEqual({ a: 1 });
	});

	it("parses JSON inside markdown fences", () => {
		expect(extractJson('```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
	});

	it("parses JSON embedded in prose", () => {
		expect(extractJson('Here you go:\n{"ok":true,"n":3} hope that helps')).toEqual({ ok: true, n: 3 });
	});

	it("throws when nothing parseable exists", () => {
		expect(() => extractJson("no json at all")).toThrow(/No valid JSON/);
	});
});
