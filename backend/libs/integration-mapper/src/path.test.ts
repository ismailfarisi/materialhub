import { describe, expect, it } from "bun:test";
import { resolvePath } from "./path.ts";

describe("resolvePath", () => {
  const ctx = {
    vendor_order: { id: "vo_1", status: "shipped", items: [{ sku: "A" }, { sku: "B" }] },
    order: { user: { email: "a@b.c" } },
  };

  it("resolves a single segment", () => {
    expect(resolvePath(ctx, "vendor_order")).toEqual(ctx.vendor_order);
  });

  it("resolves a nested path", () => {
    expect(resolvePath(ctx, "order.user.email")).toBe("a@b.c");
  });

  it("returns null for a missing segment", () => {
    expect(resolvePath(ctx, "missing.path")).toBeNull();
    expect(resolvePath(ctx, "order.user.missing")).toBeNull();
  });

  it("supports array index syntax", () => {
    expect(resolvePath(ctx, "vendor_order.items.0.sku")).toBe("A");
    expect(resolvePath(ctx, "vendor_order.items.1.sku")).toBe("B");
  });

  it("returns null for out-of-range index", () => {
    expect(resolvePath(ctx, "vendor_order.items.99.sku")).toBeNull();
  });

  it("returns null for path through null", () => {
    expect(resolvePath({ a: null }, "a.b")).toBeNull();
  });
});
