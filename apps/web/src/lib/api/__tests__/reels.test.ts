import { describe, expect, it, vi } from "vitest";
import type { GetFeedParams } from "../reels";

describe("GetFeedParams", () => {
	it("accepts the category context with a categorySlug", () => {
		const params: GetFeedParams = {
			context: "category",
			categorySlug: "skincare",
			limit: 12,
		};
		expect(params.context).toBe("category");
	});

	it("accepts the category context with a categoryId", () => {
		const params: GetFeedParams = {
			context: "category",
			categoryId: "11111111-1111-1111-1111-111111111111",
			limit: 12,
		};
		expect(params.context).toBe("category");
	});
});
