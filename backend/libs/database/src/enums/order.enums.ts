export enum OrderStatus {
  draft = "draft",
  pending_payment = "pending_payment",
  payment_failed = "payment_failed",
  confirmed = "confirmed",
  processing = "processing",
  ready_to_ship = "ready_to_ship",
  shipped = "shipped",
  out_for_delivery = "out_for_delivery",
  delivered = "delivered",
  partially_shipped = "partially_shipped",
  partially_delivered = "partially_delivered",
  cancelled = "cancelled",
  refund_requested = "refund_requested",
  refunded = "refunded",
  partially_refunded = "partially_refunded",
  disputed = "disputed",
}

export enum ShipmentStatus {
  pending = "pending",
  picked_up = "picked_up",
  in_transit = "in_transit",
  out_for_delivery = "out_for_delivery",
  delivered = "delivered",
  cancelled = "cancelled",
  failed_delivery = "failed_delivery",
  returned = "returned",
}

export enum ReturnStatus {
  requested = "requested",
  approved = "approved",
  rejected = "rejected",
  shipped_back = "shipped_back",
  received = "received",
  refunded = "refunded",
  closed = "closed",
}

export enum ReturnReason {
  defective = "defective",
  wrong_item = "wrong_item",
  not_as_described = "not_as_described",
  changed_mind = "changed_mind",
  arrived_late = "arrived_late",
  other = "other",
}

export enum DisputeStatus {
  opened = "opened",
  under_review = "under_review",
  escalated = "escalated",
  resolved_buyer = "resolved_buyer",
  resolved_seller = "resolved_seller",
  closed = "closed",
}
