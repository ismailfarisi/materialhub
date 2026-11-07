import { describe, expect, test } from "bun:test";
import { productStatusInfo, summarizeBulkResult } from "./product-status";

describe("productStatusInfo", () => {
	test("drafts and rejected products are submitted for review, not published", () => {
		expect(productStatusInfo("draft").action).toBe("submit");
		expect(productStatusInfo("rejected").action).toBe("submit");
	});

	test("only approved products can be published; published can be unpublished", () => {
		expect(productStatusInfo("approved").action).toBe("publish");
		expect(productStatusInfo("published").action).toBe("unpublish");
	});

	test("pending review, admin takedown and archived have no vendor action", () => {
		for (const s of ["pending_review", "unpublished", "archived", undefined]) {
			expect(productStatusInfo(s).action).toBeNull();
		}
	});
});

describe("summarizeBulkResult", () => {
	test("all succeeded", () => {
		expect(summarizeBulkResult("published", { affected: 3, failed: [] })).toBe("3 published.");
	});

	test("lists distinct failure reasons", () => {
		expect(
			summarizeBulkResult("published", {
				affected: 1,
				failed: [
					{ id: "a", code: "NOT_APPROVED", message: "Submit the product for review before publishing" },
					{ id: "b", code: "NOT_APPROVED", message: "Submit the product for review before publishing" },
				],
			}),
		).toBe("1 published, 2 not: Submit the product for review before publishing");
	});
});
