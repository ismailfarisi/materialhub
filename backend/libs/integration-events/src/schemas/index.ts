import { shipmentCreatedSchema } from "./shipment-created.schema.ts";
import { shipmentStatusChangedSchema } from "./shipment-status-changed.schema.ts";
import { vendorOrderCreatedSchema } from "./vendor-order-created.schema.ts";
import { vendorOrderStatusChangedSchema } from "./vendor-order-status-changed.schema.ts";

export const sourceSchemas = {
  "vendor_order.created": vendorOrderCreatedSchema,
  "vendor_order.status_changed": vendorOrderStatusChangedSchema,
  "shipment.created": shipmentCreatedSchema,
  "shipment.status_changed": shipmentStatusChangedSchema,
} as const;

export type SourceSchemaId = keyof typeof sourceSchemas;
