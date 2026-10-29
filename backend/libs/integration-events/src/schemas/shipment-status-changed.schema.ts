export const shipmentStatusChangedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "shipment.status_changed",
  version: 1,
  type: "object",
  properties: {
    shipment: { type: "object" },
    transition: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
    },
    vendor_order: { type: "object" },
  },
} as const;
