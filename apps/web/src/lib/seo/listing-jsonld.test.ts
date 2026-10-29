import { describe, expect, it } from "vitest";
import { buildCollectionJsonLd, buildFaqJsonLd } from "./listing-jsonld";

const products = [
	{
		slug: "matte-lipstick-ruby",
		name: "Matte Lipstick — Ruby",
		price_min: 4500,
		images: [{ url: "https://cdn.example.com/ruby.jpg" }],
	},
	{ slug: "gloss-nude", name: "Gloss Nude", price_min: 9900, images: [] },
];

describe("buildCollectionJsonLd", () => {
	it("wraps an ItemList of absolute product URLs in a CollectionPage", () => {
		const jsonLd = buildCollectionJsonLd({
			locale: "en",
			path: "/c/lipstick",
			name: "Lipstick",
			description: "Shop lipstick",
			products,
		});

		expect(jsonLd["@type"]).toBe("CollectionPage");
		expect(jsonLd.url).toBe("https://www.materialhubuae.com/en/c/lipstick");
		expect(jsonLd.description).toBe("Shop lipstick");
		expect(jsonLd.mainEntity.itemListElement[0]).toEqual({
			"@type": "ListItem",
			position: 1,
			url: "https://www.materialhubuae.com/en/product/matte-lipstick-ruby",
			item: {
				"@type": "Product",
				name: "Matte Lipstick — Ruby",
				url: "https://www.materialhubuae.com/en/product/matte-lipstick-ruby",
				image: "https://cdn.example.com/ruby.jpg",
				offers: {
					"@type": "Offer",
					price: "45.00",
					priceCurrency: "AED",
				},
			},
		});
	});

	it("carries the locale into every URL it emits", () => {
		const jsonLd = buildCollectionJsonLd({
			locale: "ar",
			path: "/c/lipstick",
			name: "أحمر الشفاه",
			products,
		});

		expect(jsonLd.url).toBe("https://www.materialhubuae.com/ar/c/lipstick");
		expect(jsonLd.mainEntity.itemListElement[0].url).toContain("/ar/product/");
	});

	it("omits description when the category has none", () => {
		const jsonLd = buildCollectionJsonLd({
			locale: "en",
			path: "/c/lipstick",
			name: "Lipstick",
			description: null,
			products,
		});

		expect(jsonLd).not.toHaveProperty("description");
	});

	it("skips rows missing a slug or name rather than emitting a broken item", () => {
		const jsonLd = buildCollectionJsonLd({
			locale: "en",
			path: "/c/lipstick",
			name: "Lipstick",
			products: [
				...products,
				{ slug: null, name: "No slug", price_min: 100 },
				{ slug: "no-name", name: null, price_min: 100 },
			],
		});

		expect(jsonLd.mainEntity.itemListElement).toHaveLength(2);
	});

	it("counts only the items it actually enumerates", () => {
		const jsonLd = buildCollectionJsonLd({
			locale: "en",
			path: "/c/lipstick",
			name: "Lipstick",
			products,
		});

		expect(jsonLd.mainEntity.numberOfItems).toBe(2);
	});

	it("omits offers for a row with no price", () => {
		const jsonLd = buildCollectionJsonLd({
			locale: "en",
			path: "/c/lipstick",
			name: "Lipstick",
			products: [{ slug: "unpriced", name: "Unpriced", price_min: null }],
		});

		expect(jsonLd.mainEntity.itemListElement[0].item).not.toHaveProperty(
			"offers",
		);
	});
});

describe("buildFaqJsonLd", () => {
	it("maps entries to Question/Answer pairs", () => {
		const jsonLd = buildFaqJsonLd([
			{ question: "How much?", answer: "From AED 45." },
		]);

		expect(jsonLd).toEqual({
			"@context": "https://schema.org",
			"@type": "FAQPage",
			mainEntity: [
				{
					"@type": "Question",
					name: "How much?",
					acceptedAnswer: { "@type": "Answer", text: "From AED 45." },
				},
			],
		});
	});

	it("returns null for an empty list so the caller can skip the script tag", () => {
		expect(buildFaqJsonLd([])).toBeNull();
	});
});
