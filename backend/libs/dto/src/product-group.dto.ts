import { type Static, Type } from "@sinclair/typebox";

// NOTE: stock-setting per member is deferred to Plan 2 (needs inventory wiring + authoring UI).
// One member to create in a group. Shared product fields (category_id, brand_id,
// description, etc.) come from the group-level `shared` object; per-member fields
// override / specialize.
export const ProductGroupMemberInput = Type.Object({
  attribute_value_id: Type.String({ format: "uuid" }),
  name: Type.String({ minLength: 1, maxLength: 255 }),
  price: Type.Number({ minimum: 0 }),
  compare_at_price: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  cost_price: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  sku: Type.Optional(Type.String({ maxLength: 50 })),
  barcode: Type.Optional(Type.String({ maxLength: 50 })),
  is_primary: Type.Optional(Type.Boolean()),
});
export type ProductGroupMemberInput = Static<typeof ProductGroupMemberInput>;

// Shared product attributes applied to every generated member product.
export const ProductGroupShared = Type.Object({
  category_id: Type.String({ format: "uuid" }),
  brand_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  short_description: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
});
export type ProductGroupShared = Static<typeof ProductGroupShared>;

export const CreateProductGroupBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  grouping_attribute_id: Type.String({ format: "uuid" }),
  listing_mode: Type.Optional(Type.Union([Type.Literal("collapsed"), Type.Literal("individual")])),
  shared: ProductGroupShared,
  members: Type.Array(ProductGroupMemberInput, { minItems: 1, maxItems: 100 }),
});
export type CreateProductGroupBody = Static<typeof CreateProductGroupBody>;

export const UpdateProductGroupBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  listing_mode: Type.Optional(Type.Union([Type.Literal("collapsed"), Type.Literal("individual")])),
  primary_member_id: Type.Optional(Type.String({ format: "uuid" })),
});
export type UpdateProductGroupBody = Static<typeof UpdateProductGroupBody>;

export const AddProductGroupMemberBody = ProductGroupMemberInput;
export type AddProductGroupMemberBody = Static<typeof AddProductGroupMemberBody>;
