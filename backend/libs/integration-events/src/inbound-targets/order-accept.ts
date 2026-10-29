export const orderAcceptTarget = {
  $id: "order.accept",
  type: "object",
  required: ["vendor_order_id"],
  properties: {
    vendor_order_id: { type: "string", format: "uuid" },
    notes: { type: "string" },
  },
} as const;
