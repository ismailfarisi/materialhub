import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Product editorial — "From the brand" PDP block
// Stored on products.editorial (jsonb). Validated only on the write side
// (vendor dashboard); the read API returns the JSONB as-is. Frontend tolerates
// missing/extra keys.
//
// Field names are deliberately category-agnostic: the same shape serves a
// perfumer's letter on a fragrance, a formulator's note on skincare, or a
// colourist's brief on makeup.
// ---------------------------------------------------------------------------

export const ProductEditorial = Type.Object({
  short_film: Type.Optional(
    Type.Object({
      url: Type.String(),
      thumbnail_url: Type.Optional(Type.String()),
      duration_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
      title: Type.Optional(Type.String()),
      eyebrow: Type.Optional(Type.String()),
    }),
  ),
  maker_letter: Type.Optional(
    Type.Object({
      quote: Type.String(),
      body: Type.Optional(Type.String()),
      author_name: Type.String(),
      // free-form, e.g. "Perfumer · Grasse", "Formulator · Seoul", "Colourist · Milan"
      author_role: Type.String(),
      author_avatar_url: Type.Optional(Type.String()),
    }),
  ),
  lookbook: Type.Optional(
    Type.Array(
      Type.Object({
        image_url: Type.String(),
        alt: Type.Optional(Type.String()),
        tall: Type.Optional(Type.Boolean()),
      }),
    ),
  ),
  ingredient_origins: Type.Optional(
    Type.Array(
      Type.Object({
        // free-form, category-aware: "Top note", "Active", "Pigment", "Carrier oil"
        role: Type.Optional(Type.String()),
        name: Type.String(),
        place: Type.String(),
        body: Type.String(),
        annual_harvest: Type.Optional(Type.String()),
      }),
    ),
  ),
  campaign: Type.Optional(
    Type.Object({
      name: Type.String(),
      lookbook_total: Type.Optional(Type.Integer({ minimum: 0 })),
    }),
  ),
});
export type ProductEditorial = Static<typeof ProductEditorial>;

export const CreateProductBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  category_id: Type.String({ format: "uuid" }),
  brand_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  short_description: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  rich_description: Type.Optional(Type.String()),
  ingredients: Type.Optional(Type.String()),
  usage_instructions: Type.Optional(Type.String()),
  price: Type.Number({ minimum: 0 }),
  compare_at_price: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  cost_price: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  currency: Type.Optional(Type.String({ default: "AED", maxLength: 3 })),
  sku: Type.Optional(Type.String({ maxLength: 50 })),
  barcode: Type.Optional(Type.String({ maxLength: 50 })),
  weight_grams: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
  dimensions_cm: Type.Optional(
    Type.Union([
      Type.Object({
        length: Type.Number({ minimum: 0 }),
        width: Type.Number({ minimum: 0 }),
        height: Type.Number({ minimum: 0 }),
      }),
      Type.Null(),
    ]),
  ),
  country_of_origin: Type.Optional(Type.String({ maxLength: 2 })),
  is_digital: Type.Optional(Type.Boolean({ default: false })),
  is_customizable: Type.Optional(Type.Boolean({ default: false })),
  requires_shipping: Type.Optional(Type.Boolean({ default: true })),
  track_inventory: Type.Optional(Type.Boolean({ default: true })),
  allow_backorder: Type.Optional(Type.Boolean({ default: false })),
  tags: Type.Optional(Type.Array(Type.String())),
  meta_title: Type.Optional(Type.String({ maxLength: 255 })),
  meta_description: Type.Optional(Type.String({ maxLength: 500 })),
  editorial: Type.Optional(Type.Union([ProductEditorial, Type.Null()])),
});
export type CreateProductBody = Static<typeof CreateProductBody>;

export const UpdateProductBody = Type.Partial(CreateProductBody);
export type UpdateProductBody = Static<typeof UpdateProductBody>;

export const ProductListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  category_id: Type.Optional(Type.String({ format: "uuid" })),
  brand_id: Type.Optional(Type.String({ format: "uuid" })),
  vendor_id: Type.Optional(Type.String({ format: "uuid" })),
  status: Type.Optional(Type.String()),
  min_price: Type.Optional(Type.Number({ minimum: 0 })),
  max_price: Type.Optional(Type.Number({ minimum: 0 })),
  sort_by: Type.Optional(Type.String({ default: "created_at" })),
  sort_order: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
  search: Type.Optional(Type.String()),
});
export type ProductListQuery = Static<typeof ProductListQuery>;
