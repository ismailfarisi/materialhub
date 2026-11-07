import { describe, expect, it, mock } from "bun:test";
import { OrderCreationService } from "./order-creation.service.ts";

/** A repeated checkout must reuse the identical unpaid order (E2E finding). */
const cartItems = [
  {
    product_id: "p1",
    variant_id: null,
    vendor_id: "v1",
    quantity: 2,
    unit_price: 500,
    line_total: 1000,
  },
];
function build(opts: { candidate?: boolean; lines?: any[]; grandTotal?: number }) {
  const existing = {
    id: "o-existing",
    order_number: "MH-2026-000007",
    grand_total: opts.grandTotal ?? 1500,
  };
  const saves: any[] = [];
  const manager: any = {
    query: mock((q: string) => {
      if (q.includes("pg_advisory_xact_lock")) return Promise.resolve([]);
      if (q.includes("FROM orders o"))
        return Promise.resolve(opts.candidate ? [{ id: existing.id }] : []);
      if (q.includes("FROM order_items")) return Promise.resolve(opts.lines ?? []);
      if (q.includes("order_number_seq")) return Promise.resolve([{ seq: 8 }]);
      return Promise.resolve([]);
    }),
    getRepository: () => ({
      findOne: mock(() => Promise.resolve(existing)),
      find: mock(() => Promise.resolve([{ id: "vo-existing" }])),
      save: mock((o: any) => {
        saves.push(o);
        return Promise.resolve(Array.isArray(o) ? o : { id: "new", ...o });
      }),
      create: (o: any) => o,
    }),
  };
  const orderRepo: any = {
    target: "Order",
    manager: { transaction: (cb: any) => cb(manager) },
    query: manager.query,
  };
  const service = new OrderCreationService(
    orderRepo,
    { target: "VendorOrder", save: mock((v: any) => Promise.resolve({ id: "vo", ...v })) } as any,
    { save: mock((i: any) => Promise.resolve(i)), create: (i: any) => i } as any,
    { save: mock((h: any) => Promise.resolve(h)), create: (h: any) => h } as any,
  );
  const input = {
    userId: "u1",
    cartItems,
    shippingAddress: {},
    taxTotal: 0,
    shippingTotal: 500,
    discountTotal: 0,
    channel: "web",
  } as any;
  return { service, input, saves, manager };
}

describe("createOrder idempotency", () => {
  it("returns the identical recent unpaid order instead of creating another", async () => {
    const { service, input, saves, manager } = build({
      candidate: true,
      lines: [{ product_id: "p1", variant_id: null, quantity: 2, unit_price: 500 }],
    });
    const res = await service.createOrder(input);
    expect((res.order as any).id).toBe("o-existing");
    expect(saves).toHaveLength(0);
    expect(manager.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
  });

  it("creates a new order when the cart differs", async () => {
    const { service, input } = build({
      candidate: true,
      lines: [{ product_id: "p1", variant_id: null, quantity: 3, unit_price: 500 }],
    });
    const res = await service.createOrder(input);
    expect((res.order as any).id).not.toBe("o-existing");
  });

  it("creates a new order when the total differs (e.g. shipping changed)", async () => {
    const { service, input } = build({
      candidate: true,
      lines: [{ product_id: "p1", variant_id: null, quantity: 2, unit_price: 500 }],
      grandTotal: 1999,
    });
    const res = await service.createOrder(input);
    expect((res.order as any).id).not.toBe("o-existing");
  });
});
