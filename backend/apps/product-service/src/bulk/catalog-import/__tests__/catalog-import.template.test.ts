import { describe, expect, test } from "bun:test";
import {
  buildCatalogImportTemplateForCategories,
  buildCatalogTemplateCategoriesFromRows,
} from "../catalog-import.template.ts";

describe("buildCatalogImportTemplateForCategories", () => {
  test("adds selected category attributes and an attribute guide sheet", () => {
    const template = buildCatalogImportTemplateForCategories([
      {
        categorySlug: "skincare",
        categoryName: "Skincare",
        attributes: [
          {
            slug: "skin-type",
            name: "Skin type",
            isRequired: true,
            isVariant: false,
            values: [
              { slug: "dry", value: "Dry" },
              { slug: "oily", value: "Oily" },
            ],
          },
          {
            slug: "size",
            name: "Size",
            isRequired: false,
            isVariant: true,
            values: [
              { slug: "30ml", value: "30ml" },
              { slug: "50ml", value: "50ml" },
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
    expect(products?.columns.some((column) => column.key === "attr.skin-type")).toBe(true);
    expect(variants?.columns.some((column) => column.key === "option.size")).toBe(true);
    expect(guide?.columns.map((column) => column.key)).toEqual([
      "category_slug",
      "category_name",
      "column_key",
      "required",
      "allowed_values",
      "example",
    ]);
    expect(guide?.exampleRows).toEqual([
      ["skincare", "Skincare", "attr.skin-type", "no", "dry|oily", "dry"],
      ["skincare", "Skincare", "option.size", "no", "30ml|50ml", "30ml"],
    ]);
    expect(products?.columns.find((column) => column.key === "attr.skin-type")?.required).toBe(
      false,
    );
    expect(template.readme.some((line) => line.includes("Selected categories: skincare"))).toBe(
      true,
    );
  });

  test("inherits attributes from ancestor categories for selected leaf categories", () => {
    const [category] = buildCatalogTemplateCategoriesFromRows({
      selectedCategories: [
        {
          id: "leaf",
          parentId: "domain",
          categorySlug: "face-serums",
          categoryName: "Face Serums",
        },
      ],
      allCategories: [
        {
          id: "domain",
          parentId: "root",
          categorySlug: "skincare",
          categoryName: "Skincare",
        },
        {
          id: "leaf",
          parentId: "domain",
          categorySlug: "face-serums",
          categoryName: "Face Serums",
        },
      ],
      categoryAttributes: [
        {
          categoryId: "domain",
          slug: "skin-type",
          name: "Skin type",
          isRequired: true,
          isVariant: false,
          values: [{ slug: "dry", value: "Dry" }],
        },
      ],
    });

    expect(category?.attributes.map((attribute) => attribute.slug)).toEqual(["skin-type"]);
  });
});
