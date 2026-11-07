import { describe, expect, mock, test } from "bun:test";
import { cancelledByItem, loadCancelledByItem, suppliedPart } from "./cancelled-quantities.ts";

describe("cancelledByItem", () => {
  test("sums quantities and amounts per order item across cancellations", () => {
    const map = cancelledByItem([
      { items: [{ order_item_id: "a", vendor_order_id: "v", quantity: 1, refund_amount: 500 }] },
      {
        items: JSON.stringify([
          { order_item_id: "a", vendor_order_id: "v", quantity: 2, refund_amount: 1000 },
          { order_item_id: "b", vendor_order_id: "v", quantity: 1, refund_amount: 4500 },
        ]),
      },
      { items: null },
    ]);
    expect(map).toEqual({ a: { quantity: 3, amount: 1500 }, b: { quantity: 1, amount: 4500 } });
  });
});

describe("loadCancelledByItem", () => {
  test("reads only completed, live cancellations of the order", async () => {
    const query = mock(async () => [
      { items: [{ order_item_id: "a", quantity: 1, refund_amount: 500 }] },
    ]);
    const map = await loadCancelledByItem({ query }, "order-1");
    expect(map).toEqual({ a: { quantity: 1, amount: 500 } });
    const [sql, params] = (query.mock.calls[0] as unknown as [string, unknown[]]) ?? [];
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("deleted_at IS NULL");
    expect(params).toEqual(["order-1"]);
  });

  test("no manager (unit fixtures): nothing cancelled", async () => {
    expect(await loadCancelledByItem(undefined, "order-1")).toEqual({});
  });
});

describe("suppliedPart", () => {
  const line = { id: "a", quantity: 3, line_total: 13500 };
  test("uncancelled line is supplied in full", () => {
    expect(suppliedPart(line, {})).toEqual({ quantity: 3, gross: 13500, cancelledQuantity: 0 });
  });
  test("deducts the cancelled units and their exact cancelled value", () => {
    expect(suppliedPart(line, { a: { quantity: 1, amount: 4500 } })).toEqual({
      quantity: 2,
      gross: 9000,
      cancelledQuantity: 1,
    });
  });
  test("fully cancelled: nothing supplied", () => {
    expect(suppliedPart(line, { a: { quantity: 3, amount: 13500 } }).quantity).toBe(0);
    expect(suppliedPart({ ...line, status: "cancelled" }, {}).quantity).toBe(0);
  });
});
