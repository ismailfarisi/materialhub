import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	type CategoryAttributeLink,
	type ProductAttributeDraft,
	ProductAttributesEditor,
	hydrateProductAttributes,
	missingRequiredAttributes,
	serializeProductAttributes,
	splitCategoryAttributes,
} from "./product-attributes-editor";

const link = (
	id: string,
	name: string,
	type: string,
	values: Array<{ id: string; display_value?: string; value?: string }> = [],
	is_required = false,
): CategoryAttributeLink => ({
	is_required,
	attribute: { id, name, type, values },
});

describe("serializeProductAttributes", () => {
	it("emits one entry for a single value_id", () => {
		const draft: ProductAttributeDraft = { a1: { value_id: "v1" } };
		expect(serializeProductAttributes(draft)).toEqual([
			{ attribute_id: "a1", value_id: "v1" },
		]);
	});

	it("expands value_ids into one entry per id (multi-select)", () => {
		const draft: ProductAttributeDraft = { a1: { value_ids: ["v1", "v2"] } };
		expect(serializeProductAttributes(draft)).toEqual([
			{ attribute_id: "a1", value_id: "v1" },
			{ attribute_id: "a1", value_id: "v2" },
		]);
	});

	it("trims and emits text_value", () => {
		const draft: ProductAttributeDraft = { a1: { text_value: "  hello  " } };
		expect(serializeProductAttributes(draft)).toEqual([
			{ attribute_id: "a1", text_value: "hello" },
		]);
	});

	it("skips empty entries", () => {
		const draft: ProductAttributeDraft = {
			a1: {},
			a2: { text_value: "   " },
			a3: { value_ids: [] },
		};
		expect(serializeProductAttributes(draft)).toEqual([]);
	});

	it("prefers value_ids over value_id when both present", () => {
		const draft: ProductAttributeDraft = {
			a1: { value_id: "x", value_ids: ["v1"] },
		};
		expect(serializeProductAttributes(draft)).toEqual([
			{ attribute_id: "a1", value_id: "v1" },
		]);
	});
});

describe("splitCategoryAttributes", () => {
	it("ignores category attribute links with missing attribute relations", () => {
		const links = [
			link("a1", "Finish", "select"),
			{
				is_required: true,
				attribute: { id: "a2", name: "Size", type: "select", is_variant: true },
			},
			{ is_required: true, attribute: null },
		] as unknown as CategoryAttributeLink[];

		expect(splitCategoryAttributes(links)).toEqual({
			descriptive: [links[0]],
			variantAxes: [links[1]],
		});
	});
});

describe("missingRequiredAttributes", () => {
	const cats = [
		link("a1", "Finish", "select", [], true),
		link("a2", "Benefits", "multi_select", [], true),
		link("a3", "Notes", "text", [], true),
		link("a4", "Coverage", "select", [], false),
	];

	it("lists required attributes with no value", () => {
		expect(missingRequiredAttributes({}, cats)).toEqual([
			"Finish",
			"Benefits",
			"Notes",
		]);
	});

	it("ignores satisfied and non-required attributes", () => {
		const draft: ProductAttributeDraft = {
			a1: { value_id: "v" },
			a2: { value_ids: ["v"] },
			a3: { text_value: "x" },
		};
		expect(missingRequiredAttributes(draft, cats)).toEqual([]);
	});

	it("treats whitespace text and empty value_ids as missing", () => {
		const draft: ProductAttributeDraft = {
			a2: { value_ids: [] },
			a3: { text_value: "  " },
		};
		expect(missingRequiredAttributes(draft, cats)).toEqual([
			"Finish",
			"Benefits",
			"Notes",
		]);
	});
});

describe("hydrateProductAttributes", () => {
	const cats = [
		link("a1", "Finish", "select"),
		link("a2", "Benefits", "multi_select"),
		link("a3", "Notes", "text"),
	];

	it("groups multi-select rows into value_ids and keeps single value_id", () => {
		const rows = [
			{
				attribute_id: "a1",
				attribute_value_id: "f1",
				text_value: null,
				variant_id: null,
			},
			{
				attribute_id: "a2",
				attribute_value_id: "b1",
				text_value: null,
				variant_id: null,
			},
			{
				attribute_id: "a2",
				attribute_value_id: "b2",
				text_value: null,
				variant_id: null,
			},
			{
				attribute_id: "a3",
				attribute_value_id: null,
				text_value: "woody",
				variant_id: null,
			},
		];
		expect(hydrateProductAttributes(rows, cats)).toEqual({
			a1: { value_id: "f1" },
			a2: { value_ids: ["b1", "b2"] },
			a3: { text_value: "woody" },
		});
	});

	it("skips variant-scoped rows", () => {
		const rows = [
			{
				attribute_id: "a1",
				attribute_value_id: "f1",
				text_value: null,
				variant_id: "var-1",
			},
		];
		expect(hydrateProductAttributes(rows, cats)).toEqual({});
	});

	it("falls back to value_ids when an unknown attribute has multiple rows", () => {
		const rows = [
			{
				attribute_id: "zz",
				attribute_value_id: "x1",
				text_value: null,
				variant_id: null,
			},
			{
				attribute_id: "zz",
				attribute_value_id: "x2",
				text_value: null,
				variant_id: null,
			},
		];
		expect(hydrateProductAttributes(rows, [])).toEqual({
			zz: { value_ids: ["x1", "x2"] },
		});
	});

	it("ignores category attribute links with missing attribute relations", () => {
		const rows = [
			{
				attribute_id: "a1",
				attribute_value_id: "f1",
				text_value: null,
				variant_id: null,
			},
		];
		const categoryAttributes = [
			link("a1", "Finish", "select"),
			{ is_required: true, attribute: null },
		] as unknown as CategoryAttributeLink[];

		expect(() => hydrateProductAttributes(rows, categoryAttributes)).not.toThrow();
		expect(hydrateProductAttributes(rows, categoryAttributes)).toEqual({
			a1: { value_id: "f1" },
		});
	});
});

describe("ProductAttributesEditor", () => {
	it("renders required marker, a multi-select checkbox group and a boolean switch", () => {
		const cats = [
			link(
				"a1",
				"Finish",
				"select",
				[{ id: "v1", display_value: "Matte" }],
				true,
			),
			link("a2", "Benefits", "multi_select", [
				{ id: "b1", display_value: "Hydrating" },
				{ id: "b2", display_value: "Brightening" },
			]),
			link("a3", "Alcohol Free", "boolean"),
		];
		render(
			<ProductAttributesEditor
				categoryAttributes={cats}
				value={{}}
				onChange={vi.fn()}
				editing
			/>,
		);
		expect(screen.getByText("Finish")).toBeInTheDocument();
		// required asterisk
		expect(screen.getByText("*")).toBeInTheDocument();
		// one checkbox per multi-select value
		expect(
			screen.getByRole("checkbox", { name: /Hydrating/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("checkbox", { name: /Brightening/i }),
		).toBeInTheDocument();
		// boolean switch
		expect(screen.getByRole("switch")).toBeInTheDocument();
	});

	it("shows resolved labels in read mode", () => {
		const cats = [
			link("a1", "Finish", "select", [{ id: "v1", display_value: "Matte" }]),
		];
		render(
			<ProductAttributesEditor
				categoryAttributes={cats}
				value={{ a1: { value_id: "v1" } }}
				onChange={vi.fn()}
				editing={false}
			/>,
		);
		expect(screen.getByText("Matte")).toBeInTheDocument();
	});
});
