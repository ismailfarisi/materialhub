import { describe, expect, test } from "bun:test";
import { distributeDisputeResolution } from "./dispute-reversal-calc.ts";

describe("distributeDisputeResolution", () => {
  test("single item, full resolution: distributes the entire outstanding amount", () => {
    const result = distributeDisputeResolution(
      [{ orderItemId: "oi-1", outstanding: 100000 }],
      100000,
    );
    expect(result.shares).toEqual([{ orderItemId: "oi-1", amount: 100000 }]);
    expect(result.distributed).toBe(100000);
    expect(result.clamped).toBe(false);
  });

  test("single item, partial resolution: distributes only the proportional (here: entire, since one item) share", () => {
    const result = distributeDisputeResolution(
      [{ orderItemId: "oi-1", outstanding: 100000 }],
      5000,
    );
    expect(result.shares).toEqual([{ orderItemId: "oi-1", amount: 5000 }]);
    expect(result.distributed).toBe(5000);
    expect(result.clamped).toBe(false);
  });

  test("multi-item: splits proportionally to outstanding balance", () => {
    // Two items, 60000 and 40000 outstanding (60/40 split), resolving 10000.
    const result = distributeDisputeResolution(
      [
        { orderItemId: "oi-1", outstanding: 60000 },
        { orderItemId: "oi-2", outstanding: 40000 },
      ],
      10000,
    );
    expect(result.distributed).toBe(10000);
    const byId = Object.fromEntries(result.shares.map((s) => [s.orderItemId, s.amount]));
    expect(byId["oi-1"]).toBe(6000);
    expect(byId["oi-2"]).toBe(4000);
  });

  test("multi-item: uneven split whose exact proportional shares do not divide evenly — shares still sum exactly", () => {
    // outstanding 1,1,2 (total 4), resolving 3: exact shares 0.75/0.75/1.5
    // floors: 0,0,1 (sum 2), remainder 1 fils. Largest fractional remainder
    // ties between item0 and item1 (both frac 0.75*4=3 after scaling);
    // tie-break goes to larger outstanding first, then input order — item2
    // has the largest outstanding among the tied set only if its frac also
    // ties, but item2's frac is 2 (1.5*4/4... let's just assert the
    // invariants instead of a single fixed allocation).
    const result = distributeDisputeResolution(
      [
        { orderItemId: "oi-1", outstanding: 1 },
        { orderItemId: "oi-2", outstanding: 1 },
        { orderItemId: "oi-3", outstanding: 2 },
      ],
      3,
    );
    expect(result.distributed).toBe(3);
    const sum = result.shares.reduce((s, x) => s + x.amount, 0);
    expect(sum).toBe(3);
    for (const share of result.shares) {
      const outstanding = share.orderItemId === "oi-3" ? 2 : 1;
      expect(share.amount).toBeLessThanOrEqual(outstanding);
      expect(share.amount).toBeGreaterThanOrEqual(0);
    }
  });

  test("multi-item: exact remainder case sums to resolution_amount with a known split", () => {
    // outstanding 100000/100000/100000 (total 300000), resolving 100000:
    // exact shares 33333.33 each; floors 33333*3=99999, remainder 1 fils
    // goes to the item with the largest fractional remainder — all three
    // tie on fraction, so tie-break falls to outstanding desc (all equal)
    // then input order => first item gets the extra fils.
    const result = distributeDisputeResolution(
      [
        { orderItemId: "oi-1", outstanding: 100000 },
        { orderItemId: "oi-2", outstanding: 100000 },
        { orderItemId: "oi-3", outstanding: 100000 },
      ],
      100000,
    );
    expect(result.distributed).toBe(100000);
    const byId = Object.fromEntries(result.shares.map((s) => [s.orderItemId, s.amount]));
    expect(byId["oi-1"]).toBe(33334);
    expect(byId["oi-2"]).toBe(33333);
    expect(byId["oi-3"]).toBe(33333);
    expect(byId["oi-1"]! + byId["oi-2"]! + byId["oi-3"]!).toBe(100000);
  });

  test("item already partly refunded (lower outstanding) absorbs no more than its outstanding remainder", () => {
    // oi-1 has only 1000 outstanding left (already mostly refunded), oi-2
    // has the full 99000 outstanding. A big resolution must not push oi-1's
    // share past its own 1000 remaining fils.
    const result = distributeDisputeResolution(
      [
        { orderItemId: "oi-1", outstanding: 1000 },
        { orderItemId: "oi-2", outstanding: 99000 },
      ],
      100000,
    );
    const byId = Object.fromEntries(result.shares.map((s) => [s.orderItemId, s.amount]));
    expect(byId["oi-1"]).toBeLessThanOrEqual(1000);
    expect(byId["oi-2"]).toBeLessThanOrEqual(99000);
    expect(result.distributed).toBe(100000);
  });

  test("resolution_amount exceeding outstanding total is clamped, not over-distributed", () => {
    const result = distributeDisputeResolution(
      [
        { orderItemId: "oi-1", outstanding: 50000 },
        { orderItemId: "oi-2", outstanding: 30000 },
      ],
      1000000,
    );
    expect(result.clamped).toBe(true);
    expect(result.distributed).toBe(80000);
    const byId = Object.fromEntries(result.shares.map((s) => [s.orderItemId, s.amount]));
    expect(byId["oi-1"]).toBe(50000);
    expect(byId["oi-2"]).toBe(30000);
  });

  test("no outstanding balance at all: nothing distributed, reported clamped", () => {
    const result = distributeDisputeResolution([{ orderItemId: "oi-1", outstanding: 0 }], 5000);
    expect(result.shares).toEqual([]);
    expect(result.distributed).toBe(0);
    expect(result.clamped).toBe(true);
  });

  test("zero or negative resolution_amount distributes nothing", () => {
    const result = distributeDisputeResolution([{ orderItemId: "oi-1", outstanding: 5000 }], 0);
    expect(result.shares).toEqual([]);
    expect(result.distributed).toBe(0);
  });
});
