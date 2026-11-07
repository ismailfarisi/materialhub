import { describe, expect, test } from "bun:test";
import {
  buildCatalogImportTemplateForCategories,
  buildCatalogTemplateCategoriesFromRows,
} from "../catalog-import.template.ts";

describe("buildCatalogImportTemplateForCategories", () => {
  test("adds selected category attributes and an attribute guide sheet", () => {
    const template = buildCatalogImportTemplateForCategories([
      {
        categorySlug: "kraft-papers",
        categoryName: "Kraft Papers",
        attributes: [
          {
            slug: "finish",
            name: "Finish",
            isRequired: true,
            isVariant: false,
            values: [
              { slug: "smooth", value: "Smooth" },
              { slug: "ribbed", value: "Ribbed" },
            ],
          },
          {
            slug: "sheet-size",
            name: "Sheet size",
            isRequired: false,
            isVariant: true,
            values: [
              { slug: "a1", value: "A1" },
              { slug: "a2", value: "A2" },
            ],
          },
        ],
      },
    ]);

    const products = template.sheets.find((sheet) => sheet.name === "Products");
    const variants = template.sheets.find((sheet) => sheet.name === "Variants");
    const guide = template.sheets.find((sheet) => sheet.name === "Attribute Guide");
    const productColumnKeys = products?.columns.map((column) => column.key) ?? [];

    expect(productColumnKeys).toContain("ingredients");
    expect(productColumnKeys).toContain("usage_instruction");
    expect(products?.columns.some((column) => column.key === "attr.finish")).toBe(true);
    expect(variants?.columns.some((column) => column.key === "option.sheet-size")).toBe(true);
    expect(guide?.columns.map((column) => column.key)).toEqual([
      "category_slug",
      "category_name",
      "column_key",
      "required",
      "allowed_values",
      "example",
    ]);
    expect(guide?.exampleRows).toEqual([
      ["kraft-papers", "Kraft Papers", "attr.finish", "no", "smooth|ribbed", "smooth"],
      ["kraft-papers", "Kraft Papers", "option.sheet-size", "no", "a1|a2", "a1"],
    ]);
    expect(products?.columns.find((column) => column.key === "attr.finish")?.required).toBe(false);
    expect(template.readme.some((line) => line.includes("Selected categories: kraft-papers"))).toBe(
      true,
    );
  });

  test("inherits attributes from ancestor categories for selected leaf categories", () => {
    const [category] = buildCatalogTemplateCategoriesFromRows({
      selectedCategories: [
        {
          id: "leaf",
          parentId: "domain",
          categorySlug: "brown-kraft-rolls",
          categoryName: "Brown Kraft Rolls",
        },
      ],
      allCategories: [
        {
          id: "domain",
          parentId: "root",
          categorySlug: "kraft-papers",
          categoryName: "Kraft Papers",
        },
        {
          id: "leaf",
          parentId: "domain",
          categorySlug: "brown-kraft-rolls",
          categoryName: "Brown Kraft Rolls",
        },
      ],
      categoryAttributes: [
        {
          categoryId: "domain",
          slug: "finish",
          name: "Finish",
          isRequired: true,
          isVariant: false,
          values: [{ slug: "smooth", value: "Smooth" }],
        },
      ],
    });

    expect(category?.attributes.map((attribute) => attribute.slug)).toEqual(["finish"]);
  });
});
