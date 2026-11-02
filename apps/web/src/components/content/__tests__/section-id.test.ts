import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ getLocale: vi.fn(), getTranslations: vi.fn() }));

// eslint-disable-next-line import/first
import { contentsFrom, sectionId } from "@/components/layout/static-page-layout";

describe("sectionId", () => {
	it("drops clause numbers and punctuation", () => {
		expect(sectionId("3. Orders & pricing")).toBe("orders-pricing");
		expect(sectionId("What can’t be returned")).toBe("what-can-t-be-returned");
	});

	it("keeps Arabic letters", () => {
		expect(sectionId("الشحن والتوصيل")).toBe("الشحن-والتوصيل");
	});

	it("builds contents with matching ids", () => {
		expect(contentsFrom(["1. Who we are"])).toEqual([{ id: "who-we-are", label: "1. Who we are" }]);
	});
});
