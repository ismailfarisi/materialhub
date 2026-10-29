import { describe, expect, it } from "vitest";
import { buildListingFaq } from "./listing-faq";

/** Echoes the key plus any interpolated values so assertions can read both. */
const t = (key: string, values?: Record<string, string | number>) =>
	values ? `${key}(${JSON.stringify(values)})` : key;

const base = {
	entityName: "Lipstick",
	total: 120,
	minPriceFils: 4500,
	formatPrice: (fils: number) => `AED ${fils / 100}`,
	brandLabels: ["Huda Beauty", "MAC", "Maybelline"],
	brandCount: 3,
	returnWindowDays: 14,
	t,
};

const keysOf = (entries: Array<{ question: string }>) =>
	entries.map((entry) => entry.question.split("(")[0]);

describe("buildListingFaq", () => {
	it("builds price, brand, VAT and returns entries when all data is present", () => {
		expect(keysOf(buildListingFaq(base))).toEqual([
			"seo.faqPriceQ",
			"seo.faqBrandsQ",
			"seo.faqVatQ",
			"seo.faqReturnsQ",
		]);
	});

	it("formats the price floor through the caller's formatter", () => {
		const [price] = buildListingFaq(base);

		expect(price.answer).toContain("AED 45");
		expect(price.answer).toContain('"count":120');
	});

	it("omits the price question when no price floor is known", () => {
		const entries = buildListingFaq({ ...base, minPriceFils: null });

		expect(keysOf(entries)).not.toContain("seo.faqPriceQ");
	});

	it("omits the price question for an empty category", () => {
		const entries = buildListingFaq({ ...base, total: 0 });

		expect(keysOf(entries)).not.toContain("seo.faqPriceQ");
	});

	it("omits the brand question when there are no brand facets", () => {
		const entries = buildListingFaq({
			...base,
			brandLabels: [],
			brandCount: 0,
		});

		expect(keysOf(entries)).not.toContain("seo.faqBrandsQ");
	});

	it("names at most five brands so the answer stays readable", () => {
		const [, brands] = buildListingFaq({
			...base,
			brandLabels: ["A", "B", "C", "D", "E", "F", "G"],
			brandCount: 7,
		});

		expect(brands.answer).toContain("A, B, C, D, E");
		expect(brands.answer).not.toContain("F");
		// The count still reflects every brand, not just the named ones.
		expect(brands.answer).toContain('"brandCount":7');
	});

	it("omits the returns question when no return window is configured", () => {
		expect(
			keysOf(buildListingFaq({ ...base, returnWindowDays: null })),
		).not.toContain("seo.faqReturnsQ");
		expect(
			keysOf(buildListingFaq({ ...base, returnWindowDays: 0 })),
		).not.toContain("seo.faqReturnsQ");
	});

	it("always states the VAT position, which does not depend on catalogue data", () => {
		const entries = buildListingFaq({
			...base,
			total: 0,
			minPriceFils: null,
			brandLabels: [],
			brandCount: 0,
			returnWindowDays: null,
		});

		expect(keysOf(entries)).toEqual(["seo.faqVatQ"]);
	});
});
