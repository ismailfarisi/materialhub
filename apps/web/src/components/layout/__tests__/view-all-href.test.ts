import { describe, expect, it } from "vitest";
import { viewAllHref } from "../view-all-href";

describe("viewAllHref", () => {
	it("links a collection-backed rail at its collection page", () => {
		expect(viewAllHref({}, "summer-picks", "en")).toBe(
			"/en/collection/summer-picks",
		);
	});

	it("keeps the locale on the collection link", () => {
		expect(viewAllHref({}, "summer-picks", "ar")).toBe(
			"/ar/collection/summer-picks",
		);
	});

	it("prefers an explicit view_all_href over the collection", () => {
		expect(
			viewAllHref({ view_all_href: "/en/c/skincare" }, "summer-picks", "en"),
		).toBe("/en/c/skincare");
	});

	it("ignores a blank view_all_href", () => {
		expect(viewAllHref({ view_all_href: "   " }, "summer-picks", "en")).toBe(
			"/en/collection/summer-picks",
		);
	});

	it("falls back to search when the rail is not collection-backed", () => {
		expect(viewAllHref({}, undefined, "en")).toBe("/en/search");
	});

	it("escapes a slug so it cannot break out of the path", () => {
		expect(viewAllHref({}, "a/b", "en")).toBe("/en/collection/a%2Fb");
	});
});
