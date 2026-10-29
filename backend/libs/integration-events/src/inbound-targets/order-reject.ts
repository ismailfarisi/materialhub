export const orderRejectTarget = {
  $id: "order.reject",
  type: "object",
  required: ["vendor_order_id", "reason"],
  properties: {
    vendor_order_id: { type: "string", format: "uuid" },
    reason: { type: "string", minLength: 1 },
  },
} as const;
