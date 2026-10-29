export const shipmentCreateTarget = {
  $id: "shipment.create",
  type: "object",
  required: ["vendor_order_id", "tracking_number", "carrier", "items"],
  properties: {
    vendor_order_id: { type: "string", format: "uuid" },
    tracking_number: { type: "string" },
    carrier: { type: "string" },
    carrier_service: { type: "string" },
    tracking_url: { type: "string" },
    estimated_delivery_at: { type: "string", format: "date-time" },
    weight_grams: { type: "integer" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["order_item_id", "quantity"],
        properties: {
          order_item_id: { type: "string", format: "uuid" },
          quantity: { type: "integer", minimum: 1 },
        },
      },
    },
  },
} as const;
