export const productUpdatePriceTarget = {
  $id: "product.update_price",
  type: "object",
  required: ["product_id", "price_fils"],
  properties: {
    product_id: { type: "string", format: "uuid" },
    variant_id: { type: "string", format: "uuid" },
    price_fils: { type: "integer", minimum: 0 },
    sale_price_fils: { type: "integer", minimum: 0 },
    currency: { type: "string", minLength: 3, maxLength: 3 },
  },
} as const;
