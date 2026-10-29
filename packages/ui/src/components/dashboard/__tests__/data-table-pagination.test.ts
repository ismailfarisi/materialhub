import { describe, expect, it } from "vitest";
import { buildPageList } from "../data-table";

describe("buildPageList", () => {
	it("lists every page when the range is short", () => {
		expect(buildPageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(buildPageList(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it("keeps the head expanded near the start", () => {
		expect(buildPageList(2, 40)).toEqual([1, 2, 3, 4, "gap", 40]);
	});

	it("windows around the current page in the middle", () => {
		expect(buildPageList(20, 40)).toEqual([1, "gap", 19, 20, 21, "gap", 40]);
	});

	it("keeps the tail expanded near the end", () => {
		expect(buildPageList(39, 40)).toEqual([1, "gap", 37, 38, 39, 40]);
	});

	it("never emits a gap that hides a single page", () => {
		// Page 4 of 9 leaves only page 2 between the first page and the window,
		// so the number is rendered rather than a same-width ellipsis.
		expect(buildPageList(4, 9)).toEqual([1, 2, 3, 4, 5, "gap", 9]);
		expect(buildPageList(6, 9)).toEqual([1, "gap", 5, 6, 7, 8, 9]);
	});

	it("keeps both gaps when each hides more than one page", () => {
		expect(buildPageList(5, 9)).toEqual([1, "gap", 4, 5, 6, "gap", 9]);
		expect(buildPageList(3, 8)).toEqual([1, 2, 3, 4, "gap", 8]);
	});
});
