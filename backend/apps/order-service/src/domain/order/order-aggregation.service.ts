import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";

const SHIPPED_PLUS = new Set([
  OrderStatus.shipped,
  OrderStatus.out_for_delivery,
  OrderStatus.delivered,
]);

const PROCESSING_PLUS = new Set([
  OrderStatus.processing,
  OrderStatus.ready_to_ship,
  ...SHIPPED_PLUS,
]);

export class OrderAggregationService {
  computeParentStatus(vendorOrderStatuses: OrderStatus[]): OrderStatus {
    // Exclude cancelled vendor_orders
    const active = vendorOrderStatuses.filter((s) => s !== OrderStatus.cancelled);

    // All cancelled
    if (active.length === 0) return OrderStatus.cancelled;

    // All delivered
    if (active.every((s) => s === OrderStatus.delivered)) return OrderStatus.delivered;

    // Any delivered, rest shipped+
    if (active.some((s) => s === OrderStatus.delivered) && active.every((s) => SHIPPED_PLUS.has(s)))
      return OrderStatus.partially_delivered;

    // All shipped+
    if (active.every((s) => SHIPPED_PLUS.has(s))) return OrderStatus.shipped;

    // Any shipped+, rest processing+
    if (active.some((s) => SHIPPED_PLUS.has(s)) && active.every((s) => PROCESSING_PLUS.has(s)))
      return OrderStatus.partially_shipped;

    // Any processing or ready_to_ship
    if (active.some((s) => s === OrderStatus.processing || s === OrderStatus.ready_to_ship))
      return OrderStatus.processing;

    // All confirmed
    return OrderStatus.confirmed;
  }
}
