import { describe, expect, it } from "bun:test";
import { computeCartHash } from "./cart-hash.ts";

describe("computeCartHash", () => {
  it("is deterministic regardless of input order", () => {
    const a = computeCartHash([
      { product_id: "p2", variant_id: null, quantity: 1, unit_price: 200 },
      { product_id: "p1", variant_id: "v1", quantity: 2, unit_price: 100 },
    ]);
    const b = computeCartHash([
      { product_id: "p1", variant_id: "v1", quantity: 2, unit_price: 100 },
      { product_id: "p2", variant_id: null, quantity: 1, unit_price: 200 },
    ]);
    expect(a).toBe(b);
  });

  it("changes when any field changes", () => {
    const item = {
      product_id: "p1",
      variant_id: null as string | null,
      quantity: 1,
      unit_price: 100,
    };
    const h0 = computeCartHash([item]);
    expect(computeCartHash([{ ...item, quantity: 2 }])).not.toBe(h0);
    expect(computeCartHash([{ ...item, unit_price: 101 }])).not.toBe(h0);
    expect(computeCartHash([{ ...item, product_id: "p2" }])).not.toBe(h0);
    expect(computeCartHash([{ ...item, variant_id: "v1" }])).not.toBe(h0);
  });

  it("returns a 64-char hex string", () => {
    const h = computeCartHash([
      { product_id: "p1", variant_id: null, quantity: 1, unit_price: 100 },
    ]);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
