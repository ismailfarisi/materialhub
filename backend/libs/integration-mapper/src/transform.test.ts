import { describe, expect, it } from "bun:test";
import { transform } from "./transform.ts";
import type { MappingSpec } from "./types.ts";

describe("transform", () => {
  it("renames fields by path", () => {
    const spec: MappingSpec = {
      version: 1,
      fields: [{ target: "external_order_id", source: "vendor_order.vendor_order_number" }],
    };
    const result = transform(spec, { vendor_order: { vendor_order_number: "VO-1" } });
    expect(result).toEqual({ external_order_id: "VO-1" });
  });

  it("merges constants at top level", () => {
    const spec: MappingSpec = {
      version: 1,
      constants: { channel: "materialhub" },
      fields: [],
    };
    expect(transform(spec, {})).toEqual({ channel: "materialhub" });
  });

  it("applies value_map after source", () => {
    const spec: MappingSpec = {
      version: 1,
      fields: [
        {
          target: "status",
          source: "vendor_order.status",
          value_map: { shipped: "DLV", cancelled: "CXL" },
          default: "OTHER",
        },
      ],
    };
    expect(transform(spec, { vendor_order: { status: "shipped" } })).toEqual({ status: "DLV" });
    expect(transform(spec, { vendor_order: { status: "pending" } })).toEqual({ status: "OTHER" });
  });

  it("creates nested target structure", () => {
    const spec: MappingSpec = {
      version: 1,
      fields: [{ target: "customer.email", source: "order.user.email" }],
    };
    expect(transform(spec, { order: { user: { email: "a@b.c" } } })).toEqual({
      customer: { email: "a@b.c" },
    });
  });

  it("evaluates expressions over value", () => {
    const spec: MappingSpec = {
      version: 1,
      fields: [
        {
          target: "amount",
          source: "vendor_order.vendor_total",
          expression: "multiply(value, 0.01)",
        },
      ],
    };
    expect(transform(spec, { vendor_order: { vendor_total: 10000 } })).toEqual({ amount: 100 });
  });

  it("returns null for missing source paths without default", () => {
    const spec: MappingSpec = {
      version: 1,
      fields: [{ target: "x", source: "missing.path" }],
    };
    expect(transform(spec, {})).toEqual({ x: null });
  });
});
