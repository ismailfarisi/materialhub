import { describe, expect, it } from "bun:test";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { OrderAggregationService } from "./order-aggregation.service.ts";

describe("OrderAggregationService", () => {
  const service = new OrderAggregationService();

  it("returns delivered when all vendor_orders are delivered", () => {
    expect(service.computeParentStatus([OrderStatus.delivered, OrderStatus.delivered])).toBe(
      OrderStatus.delivered,
    );
  });

  it("returns partially_delivered when some delivered, rest shipped+", () => {
    expect(service.computeParentStatus([OrderStatus.delivered, OrderStatus.shipped])).toBe(
      OrderStatus.partially_delivered,
    );
  });

  it("returns partially_delivered when some delivered, rest out_for_delivery", () => {
    expect(service.computeParentStatus([OrderStatus.delivered, OrderStatus.out_for_delivery])).toBe(
      OrderStatus.partially_delivered,
    );
  });

  it("returns shipped when all are shipped or beyond (not delivered)", () => {
    expect(service.computeParentStatus([OrderStatus.shipped, OrderStatus.out_for_delivery])).toBe(
      OrderStatus.shipped,
    );
  });

  it("returns partially_shipped when some shipped, rest processing+", () => {
    expect(service.computeParentStatus([OrderStatus.shipped, OrderStatus.processing])).toBe(
      OrderStatus.partially_shipped,
    );
  });

  it("returns partially_shipped when some shipped, rest ready_to_ship", () => {
    expect(service.computeParentStatus([OrderStatus.shipped, OrderStatus.ready_to_ship])).toBe(
      OrderStatus.partially_shipped,
    );
  });

  it("returns processing when any processing or ready_to_ship", () => {
    expect(service.computeParentStatus([OrderStatus.processing, OrderStatus.confirmed])).toBe(
      OrderStatus.processing,
    );
  });

  it("returns processing for ready_to_ship mixed with confirmed", () => {
    expect(service.computeParentStatus([OrderStatus.ready_to_ship, OrderStatus.confirmed])).toBe(
      OrderStatus.processing,
    );
  });

  it("returns cancelled when all vendor_orders are cancelled", () => {
    expect(service.computeParentStatus([OrderStatus.cancelled, OrderStatus.cancelled])).toBe(
      OrderStatus.cancelled,
    );
  });

  it("returns confirmed when all vendor_orders are confirmed", () => {
    expect(service.computeParentStatus([OrderStatus.confirmed, OrderStatus.confirmed])).toBe(
      OrderStatus.confirmed,
    );
  });

  it("excludes cancelled from aggregation (1 cancelled + 1 delivered = delivered)", () => {
    expect(service.computeParentStatus([OrderStatus.delivered, OrderStatus.cancelled])).toBe(
      OrderStatus.delivered,
    );
  });

  it("excludes cancelled from aggregation (1 cancelled + 1 processing = processing)", () => {
    expect(service.computeParentStatus([OrderStatus.processing, OrderStatus.cancelled])).toBe(
      OrderStatus.processing,
    );
  });

  it("handles single vendor_order", () => {
    expect(service.computeParentStatus([OrderStatus.shipped])).toBe(OrderStatus.shipped);
  });
});
