export enum IntegrationEventType {
  vendor_order_created = "vendor_order.created",
  vendor_order_status_changed = "vendor_order.status_changed",
  shipment_created = "shipment.created",
  shipment_status_changed = "shipment.status_changed",
  order_accept = "order.accept",
  order_reject = "order.reject",
  shipment_create = "shipment.create",
  shipment_update_status = "shipment.update_status",
  inventory_adjust = "inventory.adjust",
  product_update_price = "product.update_price",
  product_update_attribute = "product.update_attribute",
}

export enum IntegrationDirection {
  outbound = "outbound",
  inbound = "inbound",
}

export enum IntegrationDeliveryStatus {
  pending = "pending",
  delivered = "delivered",
  failed = "failed",
  dlq = "dlq",
  skipped = "skipped",
}

export enum IntegrationAuthority {
  authoritative = "authoritative",
  advisory = "advisory",
}
