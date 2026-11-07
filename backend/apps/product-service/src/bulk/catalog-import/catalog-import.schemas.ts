import { Type } from "@sinclair/typebox";

/** Raw string-row schemas for schema-level checks. Business validation lives in validate.ts */
export const ProductRowSchema = Type.Object(
  {
    external_id: Type.Optional(Type.String({ maxLength: 128 })),
    sku: Type.Optional(Type.String({ maxLength: 64 })),
    name: Type.Optional(Type.String({ maxLength: 255 })),
    slug: Type.Optional(Type.String({ maxLength: 255 })),
    short_description: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    ingredients: Type.Optional(Type.String()),
    usage_instruction: Type.Optional(Type.String()),
    usage_instructions: Type.Optional(Type.String()),
    category_slug: Type.Optional(Type.String({ maxLength: 100 })),
    brand_slug: Type.Optional(Type.String({ maxLength: 100 })),
    status: Type.Optional(Type.String({ maxLength: 32 })),
    price: Type.Optional(Type.String()),
    compare_at_price: Type.Optional(Type.String()),
    cost_price: Type.Optional(Type.String()),
    currency: Type.Optional(Type.String({ maxLength: 3 })),
    has_variants: Type.Optional(Type.String()),
    track_inventory: Type.Optional(Type.String()),
    allow_backorder: Type.Optional(Type.String()),
    requires_shipping: Type.Optional(Type.String()),
    weight_grams: Type.Optional(Type.String()),
    barcode: Type.Optional(Type.String({ maxLength: 64 })),
    mpn: Type.Optional(Type.String({ maxLength: 64 })),
    tags: Type.Optional(Type.String()),
    meta_title: Type.Optional(Type.String({ maxLength: 255 })),
    meta_description: Type.Optional(Type.String()),
    meta_keywords: Type.Optional(Type.String({ maxLength: 255 })),
    image_urls: Type.Optional(Type.String()),
    initial_quantity: Type.Optional(Type.String()),
    group_name: Type.Optional(Type.String({ maxLength: 255 })),
    group_attribute: Type.Optional(Type.String({ maxLength: 100 })),
  },
  { additionalProperties: true }, // allow attr.* columns
);

export const VariantRowSchema = Type.Object(
  {
    product_external_id: Type.Optional(Type.String({ maxLength: 128 })),
    product_sku: Type.Optional(Type.String({ maxLength: 64 })),
    variant_external_id: Type.Optional(Type.String({ maxLength: 128 })),
    variant_sku: Type.Optional(Type.String({ maxLength: 64 })),
    name: Type.Optional(Type.String({ maxLength: 255 })),
    price: Type.Optional(Type.String()),
    compare_at_price: Type.Optional(Type.String()),
    cost_price: Type.Optional(Type.String()),
    weight_grams: Type.Optional(Type.String()),
    length_cm: Type.Optional(Type.String()),
    width_cm: Type.Optional(Type.String()),
    height_cm: Type.Optional(Type.String()),
    barcode: Type.Optional(Type.String({ maxLength: 64 })),
    is_active: Type.Optional(Type.String()),
    sort_order: Type.Optional(Type.String()),
    initial_quantity: Type.Optional(Type.String()),
    image_urls: Type.Optional(Type.String()),
  },
  { additionalProperties: true }, // allow option.* columns
);

/** Typed catalog row emitted after coerce. */
export interface CoercedProductRow {
  rowNumber: number;
  externalId: string | null;
  sku: string | null;
  name: string | null;
  slug: string | null;
  shortDescription: string | null;
  description: string | null;
  ingredients: string | null;
  usageInstructions: string | null;
  categorySlug: string | null;
  brandSlug: string | null;
  status: "draft" | "pending_review" | "archived" | null;
  price: number | null;
  compareAtPrice: number | null;
  costPrice: number | null;
  currency: string | null;
  hasVariants: boolean | null;
  trackInventory: boolean | null;
  allowBackorder: boolean | null;
  requiresShipping: boolean | null;
  weightGrams: number | null;
  barcode: string | null;
  mpn: string | null;
  tags: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  imageUrls: string[];
  initialQuantity: number | null;
  groupName: string | null;
  groupAttribute: string | null;
  attributes: Array<{ slug: string; value: string }>; // attr.*
}

export interface CoercedVariantRow {
  rowNumber: number;
  productExternalId: string | null;
  productSku: string | null;
  variantExternalId: string | null;
  variantSku: string | null;
  name: string | null;
  price: number | null;
  compareAtPrice: number | null;
  costPrice: number | null;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  barcode: string | null;
  isActive: boolean | null;
  sortOrder: number | null;
  initialQuantity: number | null;
  imageUrls: string[];
  optionValues: Array<{ slug: string; value: string }>; // option.*
}
