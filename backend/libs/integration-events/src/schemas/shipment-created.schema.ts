export const shipmentCreatedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "shipment.created",
  version: 1,
  type: "object",
  properties: {
    shipment: {
      type: "object",
      properties: {
        id: { type: "string" },
        tracking_number: { type: "string" },
        tracking_url: { type: "string" },
        carrier: { type: "string" },
        estimated_delivery_at: { type: "string", format: "date-time" },
        items: { type: "array" },
      },
    },
    vendor_order: { type: "object" },
    order: { type: "object" },
  },
} as const;
