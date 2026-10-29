import { describe, expect, test } from "bun:test";
import { ProductExportPreset } from "../../../../../../libs/database/src/enums/bulk-export.enums.ts";
import {
  getProductExportFieldsByKey,
  getProductExportMetadata,
  resolveProductExportFields,
  validateProductExportRequest,
} from "../product-export.fields.ts";

describe("product export field metadata", () => {
  test("returns presets and field groups", () => {
    const meta = getProductExportMetadata("admin");
    expect(meta.presets.map((p) => p.key)).toContain(ProductExportPreset.CatalogOverview);
    expect(meta.fieldGroups.map((g) => g.key)).toContain("pricing");
    expect(meta.fieldGroups.map((g) => g.key)).toContain("inventory");
  });

  test("returns role-aware filter metadata", () => {
    expect(getProductExportMetadata("admin").filters.vendorId).toBe(true);
    expect(getProductExportMetadata("super_admin").filters.vendorId).toBe(true);
    expect(getProductExportMetadata("vendor").filters.vendorId).toBe(false);
    expect(getProductExportMetadata("customer").filters.vendorId).toBe(false);
    expect(getProductExportMetadata("vendor").filters.status).toBe(true);
    expect(getProductExportMetadata("vendor").filters.updatedTo).toBe(true);
  });

  test("every group default field exists in metadata fields", () => {
    const meta = getProductExportMetadata("admin");
    const fields = new Set(meta.fields.map((field) => field.key));

    for (const group of meta.fieldGroups) {
      for (const fieldKey of group.defaultFields) {
        expect(fields.has(fieldKey)).toBe(true);
      }
    }
  });

  test("every preset default group exists in metadata field groups", () => {
    const meta = getProductExportMetadata("admin");
    const fieldGroups = new Set(meta.fieldGroups.map((group) => group.key));

    for (const preset of meta.presets) {
      for (const groupKey of preset.defaultFieldGroups) {
        expect(fieldGroups.has(groupKey)).toBe(true);
      }
    }
  });

  test("catalog overview resolves product summary fields", () => {
    const result = resolveProductExportFields({
      preset: ProductExportPreset.CatalogOverview,
      fieldGroups: ["identity", "vendor", "pricing"],
      fields: [],
    });
    expect(result.fields).toContain("id");
    expect(result.fields).toContain("vendor_name");
    expect(result.fields).toContain("price");
    expect(result.sheets).toEqual(["products"]);
  });

  test("inventory group resolves inventory and variant summary fields", () => {
    const result = resolveProductExportFields({
      preset: ProductExportPreset.Inventory,
      fieldGroups: ["identity", "inventory", "variants"],
      fields: [],
    });
    expect(result.fields).toContain("quantity_available");
    expect(result.fields).toContain("variant_count");
    expect(result.sheets).toEqual(["products"]);
  });

  test("empty catalog overview field groups resolve preset inventory and media defaults", () => {
    const result = resolveProductExportFields({
      preset: ProductExportPreset.CatalogOverview,
      fieldGroups: [],
      fields: [],
    });

    expect(result.fieldGroups).toContain("inventory");
    expect(result.fieldGroups).toContain("media");
    expect(result.fields).toContain("quantity_available");
    expect(result.fields).toContain("image_count");
  });

  test("empty pricing field groups resolve preset classification and timestamp defaults", () => {
    const result = resolveProductExportFields({
      preset: ProductExportPreset.Pricing,
      fieldGroups: [],
      fields: [],
    });

    expect(result.fieldGroups).toContain("classification");
    expect(result.fieldGroups).toContain("timestamps");
    expect(result.fields).toContain("category_name");
    expect(result.fields).toContain("updated_at");
  });

  test("empty seo field groups resolve preset seo defaults without vendor fields", () => {
    const result = resolveProductExportFields({
      preset: ProductExportPreset.Seo,
      fieldGroups: [],
      fields: [],
    });

    expect(result.fieldGroups).toContain("seo");
    expect(result.fieldGroups).not.toContain("vendor");
    expect(result.fields).toContain("meta_title");
    expect(result.fields).not.toContain("vendor_name");
  });

  test("direct resolution omits unknown field groups", () => {
    const result = resolveProductExportFields({
      preset: ProductExportPreset.Custom,
      fieldGroups: ["identity", "unknown_group"],
      fields: [],
    });

    expect(result.fieldGroups).toEqual(["identity"]);
    expect(result.fields).toContain("id");
  });

  test("rejects unknown field groups", () => {
    const error = validateProductExportRequest({
      format: "xlsx",
      preset: ProductExportPreset.Custom,
      fieldGroups: ["identity", "unknown_group"],
      fields: [],
      filters: {},
    });
    expect(error?.code).toBe("INVALID_FIELD_GROUP");
  });

  test("rejects invalid format", () => {
    const error = validateProductExportRequest({
      format: "pdf" as never,
      preset: ProductExportPreset.Custom,
      fieldGroups: ["identity"],
      fields: [],
      filters: {},
    });
    expect(error?.code).toBe("INVALID_FORMAT");
  });

  test("rejects invalid field", () => {
    const error = validateProductExportRequest({
      format: "xlsx",
      preset: ProductExportPreset.Custom,
      fieldGroups: ["identity"],
      fields: ["unknown_field"],
      filters: {},
    });
    expect(error?.code).toBe("INVALID_FIELD");
  });

  test("summary fields stay on products sheet", () => {
    const summaryFields = [
      "quantity_on_hand",
      "quantity_reserved",
      "quantity_available",
      "stock_state",
      "primary_image_url",
      "image_count",
      "video_count",
      "missing_alt_count",
      "attribute_count",
      "variant_count",
    ];

    const fields = getProductExportFieldsByKey(summaryFields);
    expect(fields).toHaveLength(summaryFields.length);

    for (const field of fields) {
      expect(field.sheet).toBe("products");
    }
  });
});
