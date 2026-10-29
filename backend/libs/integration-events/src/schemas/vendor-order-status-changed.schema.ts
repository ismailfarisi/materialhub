export const vendorOrderStatusChangedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "vendor_order.status_changed",
  version: 1,
  type: "object",
  properties: {
    vendor_order: { type: "object" },
    order: { type: "object" },
    transition: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        changed_at: { type: "string", format: "date-time" },
        reason: { type: "string" },
      },
    },
  },
} as const;
