import { describe, expect, test } from "vitest";
import { ORDER_STATUS_OPTIONS } from "./order-status";

// Mirrors backend/libs/database/src/enums/order.enums.ts (OrderStatus).
const ORDER_STATUS = new Set([
  "draft", "pending_payment", "payment_failed", "confirmed", "processing", "ready_to_ship",
  "shipped", "out_for_delivery", "delivered", "partially_shipped", "partially_delivered",
  "cancelled", "refund_requested", "refunded", "partially_refunded", "disputed",
]);

describe("order status filter", () => {
  test("every option is a real order status (no 'pending' or 'returned')", () => {
    for (const o of ORDER_STATUS_OPTIONS) expect(ORDER_STATUS.has(o.value)).toBe(true);
    expect(ORDER_STATUS_OPTIONS.find((o) => o.label === "Awaiting payment")?.value).toBe("pending_payment");
  });
});
