export const inventoryAdjustTarget = {
  $id: "inventory.adjust",
  type: "object",
  required: ["product_id", "delta", "change_id"],
  properties: {
    product_id: { type: "string", format: "uuid" },
    variant_id: { type: "string", format: "uuid" },
    delta: { type: "integer" },
    change_id: { type: "string", maxLength: 128 },
    reason: { type: "string" },
  },
} as const;
