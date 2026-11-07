import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./safe-return-to";

describe("safeReturnTo", () => {
	it("keeps same-site paths with query and hash", () => {
		expect(safeReturnTo("/en/checkout?step=2#pay", "/en")).toBe("/en/checkout?step=2#pay");
	});
	it.each([
		"https://example.org/phish",
		"//example.org/phish",
		"/\\example.org",
		"javascript:alert(1)",
		"en/account",
		"/\u0000//example.org",
		"",
	])("rejects %s", (raw) => {
		expect(safeReturnTo(raw, "/en")).toBe("/en");
	});
	it("falls back when missing", () => {
		expect(safeReturnTo(null, "/en/account")).toBe("/en/account");
	});
});
