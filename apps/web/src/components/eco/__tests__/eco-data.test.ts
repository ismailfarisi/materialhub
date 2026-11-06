import { describe, expect, it } from "vitest";
import {
	bagThicknessMicrons,
	ecoRows,
	ecoValueKey,
	isPlasticBanReady,
	plasticBanFacetCount,
	withoutEcoAttributes,
} from "../eco-data";

const av = (slug: string, value: { slug?: string; value?: string } | null, text?: string, extra = {}) => ({
	attribute: { slug, name: slug },
	attributeValue: value,
	text_value: text ?? null,
	...extra,
});

const product = {
	attributeValues: [
		av("gsm", null, "90"),
		av("recyclable", { slug: "yes", value: "Yes" }),
		av("material-composition", { slug: "recycled-paper-fibre", value: "Recycled paper fibre" }),
		av("material-composition", { slug: "kraft-paper", value: "Kraft paper" }),
		av("bag-thickness-microns", null, "40"),
		av("plastic-free", { slug: "no", value: "No" }, undefined, { variant_id: "v1" }),
	],
};

describe("eco-data", () => {
	it("collects product-level compliance rows in display order", () => {
		const rows = ecoRows(product);
		expect(rows.map((r) => r.key)).toEqual(["material-composition", "recyclable", "bag-thickness-microns"]);
		expect(rows[0]?.values.map((v) => v.slug)).toEqual(["recycled-paper-fibre", "kraft-paper"]);
	});

	it("removes compliance attributes from the generic spec table input", () => {
		const out = withoutEcoAttributes(product);
		expect(out.attributeValues.map((a) => a.attribute.slug)).toEqual(["gsm"]);
		expect(withoutEcoAttributes({ name: "x" })).toEqual({ name: "x" });
	});

	it("reads bag thickness", () => {
		expect(bagThicknessMicrons(product)).toBe(40);
		expect(bagThicknessMicrons({ attributeValues: [] })).toBeNull();
	});

	it("treats only approved declarations as plastic-ban ready", () => {
		expect(isPlasticBanReady({ plastic_ban_ready: true })).toBe(true);
		expect(isPlasticBanReady({ plastic_ban_ready: false })).toBe(false);
		expect(isPlasticBanReady({ ecoDeclaration: { status: "approved" } })).toBe(true);
		expect(isPlasticBanReady({ ecoDeclaration: { status: "pending" } })).toBe(false);
		expect(isPlasticBanReady(null)).toBe(false);
	});

	it("reads the facet count", () => {
		expect(plasticBanFacetCount({ plastic_ban_ready: [{ value: "false", count: 3 }, { value: "true", count: 4 }] })).toBe(4);
		expect(plasticBanFacetCount({})).toBe(0);
		expect(plasticBanFacetCount(undefined)).toBe(0);
	});

	it("only offers translation keys for known value slugs", () => {
		expect(ecoValueKey("recyclable", "yes")).toBe("values.recyclable.yes");
		expect(ecoValueKey("recyclable", "maybe")).toBeNull();
		expect(ecoValueKey("recyclable", null)).toBeNull();
	});
});
