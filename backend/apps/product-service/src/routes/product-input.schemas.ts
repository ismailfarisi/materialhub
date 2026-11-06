import { t } from "elysia";

/**
 * Shared body fragments for the vendor product write routes.
 *
 * Elysia strips any body property absent from a route's schema, so every field
 * the dashboard sends must be declared here or it is silently dropped.
 */

export const ProductSeoInput = {
  meta_title: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  meta_description: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
  meta_keywords: t.Optional(t.Nullable(t.Union([t.String(), t.Array(t.String())]))),
};

/**
 * Vendors may shuttle a product between draft and review; reaching `published`
 * goes through PATCH /:id/publish, which is gated on `products.publish`.
 */
export const VendorStatusInput = t.Optional(
  t.Union([t.Literal("draft"), t.Literal("pending_review")]),
);

/**
 * Create-only. `has_variants` decides whether a product-level inventory row is
 * seeded at all, and `quantity_on_hand` is that row's opening stock. On edit,
 * stock moves through /inventory/restock and /inventory/adjust instead, and
 * `has_variants` is re-derived from the variants themselves.
 */
export const ProductCreateInventoryInput = {
  has_variants: t.Optional(t.Boolean()),
  quantity_on_hand: t.Optional(t.Number({ minimum: 0 })),
};

// ─── Trade pricing ────────────────────────────────────────────────────

const Unit = t.Union(
  ["sheet", "roll", "metre", "pack", "carton", "box", "piece", "kg"].map((u) => t.Literal(u)),
);

/** Unit, pack contents, minimum order and increment, accepted on variant writes. */
export const VariantTradeTermsInput = {
  unit_of_measure: t.Optional(t.Nullable(Unit)),
  units_per_pack: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  pack_contents_unit: t.Optional(t.Nullable(Unit)),
  min_order_quantity: t.Optional(t.Integer({ minimum: 1 })),
  order_increment: t.Optional(t.Integer({ minimum: 1 })),
};

/** PUT /:id/trade-pricing — one sellable's terms and (optionally) its whole tier table. */
export const TradePricingInput = t.Object({
  variant_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
  ...VariantTradeTermsInput,
  tiers: t.Optional(
    t.Array(
      t.Object({
        min_quantity: t.Integer({ minimum: 2 }),
        unit_price: t.Integer({ minimum: 0 }),
      }),
      { maxItems: 10 },
    ),
  ),
});

/** PUT /:id/sample — turn the product's sample on or off. */
export const SampleInput = t.Object({
  enabled: t.Boolean(),
  price: t.Optional(t.Integer({ minimum: 0 })),
  max_quantity: t.Optional(t.Nullable(t.Integer({ minimum: 1, maximum: 20 }))),
  sku: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  quantity_on_hand: t.Optional(t.Integer({ minimum: 0 })),
});
