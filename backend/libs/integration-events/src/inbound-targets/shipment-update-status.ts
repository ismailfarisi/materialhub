export const shipmentUpdateStatusTarget = {
  $id: "shipment.update_status",
  type: "object",
  required: ["shipment_id", "status"],
  properties: {
    shipment_id: { type: "string", format: "uuid" },
    status: {
      type: "string",
      enum: ["picked_up", "in_transit", "out_for_delivery", "delivered", "failed_delivery"],
    },
    occurred_at: { type: "string", format: "date-time" },
    location: { type: "string" },
    description: { type: "string" },
  },
} as const;
