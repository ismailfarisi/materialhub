export const productUpdateAttributeTarget = {
  $id: "product.update_attribute",
  type: "object",
  required: ["product_id", "attributes"],
  properties: {
    product_id: { type: "string", format: "uuid" },
    attributes: {
      type: "object",
      additionalProperties: { type: ["string", "number", "boolean"] },
    },
  },
} as const;
