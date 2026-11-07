import { describe, expect, test } from "bun:test";
import { loginUrl, safeReturnTo } from "./return-to";

const p = (q: string) => new URLSearchParams(q);

describe("safeReturnTo", () => {
	test("reads returnTo, then the legacy next param", () => {
		expect(safeReturnTo(p("returnTo=/invite/abc"))).toBe("/invite/abc");
		expect(safeReturnTo(p("next=/invite/abc"))).toBe("/invite/abc");
	});

	test("rejects off-site targets", () => {
		expect(safeReturnTo(p("returnTo=https://evil.example"))).toBe("/");
		expect(safeReturnTo(p("returnTo=//evil.example"))).toBe("/");
		expect(safeReturnTo(p("returnTo=/\\evil.example"))).toBe("/");
		expect(safeReturnTo(p(""))).toBe("/");
	});
});

describe("loginUrl", () => {
	test("encodes the return path", () => {
		expect(loginUrl("/invite/abc")).toBe("/login?returnTo=%2Finvite%2Fabc");
		expect(loginUrl("/", "not-vendor")).toBe("/login?returnTo=%2F&reason=not-vendor");
	});
});
