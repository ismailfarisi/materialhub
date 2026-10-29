import {
  BulkExportFileFormat,
  ProductExportPreset,
} from "../../../../../libs/database/src/enums/bulk-export.enums.ts";
import type {
  ExportCallerRole,
  ProductExportCreateRequest,
  ProductExportField,
  ProductExportFieldGroup,
  ProductExportFilterMetadata,
  ProductExportPresetDescriptor,
  ProductExportValidationError,
  ResolvedProductExportFields,
} from "./product-export.types.ts";

type ProductExportSheet = ResolvedProductExportFields["sheets"][number];

interface ResolveProductExportFieldsArgs {
  preset: ProductExportPreset;
  fieldGroups: string[];
  fields?: string[];
}

export const PRODUCT_EXPORT_FIELD_GROUPS: ProductExportFieldGroup[] = [
  {
    key: "identity",
    label: "Identity",
    defaultFields: ["id", "external_id", "sku", "name", "slug"],
  },
  {
    key: "vendor",
    label: "Vendor",
    defaultFields: ["vendor_id", "vendor_name", "vendor_status"],
  },
  {
    key: "classification",
    label: "Classification",
    defaultFields: ["category_id", "category_name", "brand_id", "brand_name", "tags"],
  },
  {
    key: "pricing",
    label: "Pricing",
    defaultFields: ["price", "compare_at_price", "cost_price", "currency", "margin_estimate"],
  },
  {
    key: "inventory",
    label: "Inventory",
    defaultFields: [
      "track_inventory",
      "quantity_on_hand",
      "quantity_reserved",
      "quantity_available",
      "stock_state",
    ],
  },
  {
    key: "status",
    label: "Status",
    defaultFields: ["status", "is_featured", "has_variants", "published_at"],
  },
  {
    key: "seo",
    label: "SEO",
    defaultFields: ["meta_title", "meta_description", "meta_keywords"],
  },
  {
    key: "media",
    label: "Media",
    defaultFields: ["primary_image_url", "image_count", "video_count", "missing_alt_count"],
  },
  {
    key: "attributes",
    label: "Attributes",
    defaultFields: ["attribute_count"],
  },
  {
    key: "variants",
    label: "Variants",
    defaultFields: ["variant_count"],
  },
  {
    key: "timestamps",
    label: "Timestamps",
    defaultFields: ["created_at", "updated_at"],
  },
];

export const PRODUCT_EXPORT_PRESETS: ProductExportPresetDescriptor[] = [
  {
    key: ProductExportPreset.CatalogOverview,
    label: "Catalog overview",
    defaultFieldGroups: [
      "identity",
      "vendor",
      "classification",
      "pricing",
      "status",
      "inventory",
      "media",
    ],
  },
  {
    key: ProductExportPreset.Pricing,
    label: "Pricing",
    defaultFieldGroups: ["identity", "vendor", "classification", "pricing", "timestamps"],
  },
  {
    key: ProductExportPreset.Inventory,
    label: "Inventory",
    defaultFieldGroups: ["identity", "vendor", "classification", "inventory", "variants"],
  },
  {
    key: ProductExportPreset.MediaHealth,
    label: "Media health",
    defaultFieldGroups: ["identity", "vendor", "classification", "media", "status"],
  },
  {
    key: ProductExportPreset.Seo,
    label: "SEO",
    defaultFieldGroups: ["identity", "classification", "seo", "status"],
  },
  {
    key: ProductExportPreset.Custom,
    label: "Custom",
    defaultFieldGroups: [
      "identity",
      "vendor",
      "classification",
      "pricing",
      "status",
      "inventory",
      "media",
    ],
  },
];

export const PRODUCT_EXPORT_FIELDS: ProductExportField[] = [
  field("id", "Product ID", "identity", "products", "value"),
  field("external_id", "External ID", "identity", "products", "value"),
  field("sku", "SKU", "identity", "products", "value"),
  field("name", "Name", "identity", "products", "value"),
  field("slug", "Slug", "identity", "products", "value"),
  field("vendor_id", "Vendor ID", "vendor", "products", "value"),
  field("vendor_name", "Vendor name", "vendor", "products", "value"),
  field("vendor_status", "Vendor status", "vendor", "products", "value"),
  field("category_id", "Category ID", "classification", "products", "value"),
  field("category_name", "Category name", "classification", "products", "value"),
  field("brand_id", "Brand ID", "classification", "products", "value"),
  field("brand_name", "Brand name", "classification", "products", "value"),
  field("tags", "Tags", "classification", "products", "summary"),
  field("price", "Price", "pricing", "products", "value"),
  field("compare_at_price", "Compare at price", "pricing", "products", "value"),
  field("cost_price", "Cost price", "pricing", "products", "value"),
  field("currency", "Currency", "pricing", "products", "value"),
  field("margin_estimate", "Margin estimate", "pricing", "products", "value"),
  field("track_inventory", "Track inventory", "inventory", "products", "value"),
  field("quantity_on_hand", "Quantity on hand", "inventory", "products", "summary"),
  field("quantity_reserved", "Quantity reserved", "inventory", "products", "summary"),
  field("quantity_available", "Quantity available", "inventory", "products", "summary"),
  field("stock_state", "Stock state", "inventory", "products", "summary"),
  field("status", "Status", "status", "products", "value"),
  field("is_featured", "Featured", "status", "products", "value"),
  field("has_variants", "Has variants", "status", "products", "value"),
  field("published_at", "Published at", "status", "products", "value"),
  field("meta_title", "Meta title", "seo", "products", "value"),
  field("meta_description", "Meta description", "seo", "products", "value"),
  field("meta_keywords", "Meta keywords", "seo", "products", "summary"),
  field("primary_image_url", "Primary image URL", "media", "products", "summary"),
  field("image_count", "Image count", "media", "products", "summary"),
  field("video_count", "Video count", "media", "products", "summary"),
  field("missing_alt_count", "Missing alt count", "media", "products", "summary"),
  field("attribute_count", "Attribute count", "attributes", "products", "summary"),
  field("variant_count", "Variant count", "variants", "products", "summary"),
  field("created_at", "Created at", "timestamps", "products", "value"),
  field("updated_at", "Updated at", "timestamps", "products", "value"),
];

const FIELD_GROUP_KEYS = new Set(PRODUCT_EXPORT_FIELD_GROUPS.map((group) => group.key));
const FIELD_KEYS = new Set(PRODUCT_EXPORT_FIELDS.map((fieldDescriptor) => fieldDescriptor.key));
const PRESET_KEYS = new Set(PRODUCT_EXPORT_PRESETS.map((preset) => preset.key));
const FORMAT_KEYS = new Set<string>([
  BulkExportFileFormat.Csv,
  BulkExportFileFormat.Xlsx,
  "csv",
  "xlsx",
]);

function field(
  key: string,
  label: string,
  group: string,
  sheet: ProductExportSheet,
  csvMode: ProductExportField["csvMode"],
): ProductExportField {
  return { key, label, group, sheet, csvMode };
}

export function getProductExportMetadata(_role: ExportCallerRole): {
  presets: ProductExportPresetDescriptor[];
  fieldGroups: ProductExportFieldGroup[];
  fields: ProductExportField[];
  filters: ProductExportFilterMetadata;
} {
  return {
    presets: PRODUCT_EXPORT_PRESETS,
    fieldGroups: PRODUCT_EXPORT_FIELD_GROUPS,
    fields: PRODUCT_EXPORT_FIELDS,
    filters: getProductExportFilterMetadata(_role),
  };
}

function getProductExportFilterMetadata(role: ExportCallerRole): ProductExportFilterMetadata {
  const canFilterVendor = role === "admin" || role === "super_admin";

  return {
    vendorId: canFilterVendor,
    status: true,
    categoryId: true,
    brandId: true,
    stockState: true,
    publishState: true,
    search: true,
    createdFrom: true,
    createdTo: true,
    updatedFrom: true,
    updatedTo: true,
  };
}

export function validateProductExportRequest(
  request: ProductExportCreateRequest,
): ProductExportValidationError | null {
  if (!FORMAT_KEYS.has(request.format)) {
    return {
      code: "INVALID_FORMAT",
      message: `Unsupported product export format: ${request.format}`,
    };
  }

  if (!PRESET_KEYS.has(request.preset)) {
    return {
      code: "INVALID_PRESET",
      message: `Unsupported product export preset: ${request.preset}`,
    };
  }

  for (const groupKey of request.fieldGroups) {
    if (!FIELD_GROUP_KEYS.has(groupKey)) {
      return {
        code: "INVALID_FIELD_GROUP",
        message: `Unknown product export field group: ${groupKey}`,
      };
    }
  }

  for (const fieldKey of request.fields ?? []) {
    if (!FIELD_KEYS.has(fieldKey)) {
      return {
        code: "INVALID_FIELD",
        message: `Unknown product export field: ${fieldKey}`,
      };
    }
  }

  return null;
}

export function resolveProductExportFields(
  args: ResolveProductExportFieldsArgs,
): ResolvedProductExportFields {
  const requestedGroups =
    args.fieldGroups.length > 0
      ? args.fieldGroups.filter((groupKey) => FIELD_GROUP_KEYS.has(groupKey))
      : (PRODUCT_EXPORT_PRESETS.find((preset) => preset.key === args.preset)
          ?.defaultFieldGroups ?? ["identity"]);

  const fieldKeys = new Set<string>();
  for (const groupKey of requestedGroups) {
    const group = PRODUCT_EXPORT_FIELD_GROUPS.find((fieldGroup) => fieldGroup.key === groupKey);
    for (const fieldKey of group?.defaultFields ?? []) {
      fieldKeys.add(fieldKey);
    }
  }

  for (const fieldKey of args.fields ?? []) {
    fieldKeys.add(fieldKey);
  }

  const fields = PRODUCT_EXPORT_FIELDS.filter((fieldDescriptor) =>
    fieldKeys.has(fieldDescriptor.key),
  );
  const sheets = new Set<ProductExportSheet>();
  for (const fieldDescriptor of fields) {
    sheets.add(fieldDescriptor.sheet);
  }

  return {
    fieldGroups: requestedGroups,
    fields: fields.map((fieldDescriptor) => fieldDescriptor.key),
    sheets: Array.from(sheets),
  };
}

export function getProductExportFieldsByKey(keys: string[]): ProductExportField[] {
  const requestedKeys = new Set(keys);
  return PRODUCT_EXPORT_FIELDS.filter((fieldDescriptor) => requestedKeys.has(fieldDescriptor.key));
}
