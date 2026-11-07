// order-creation.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { OrderCreationService } from "./order-creation.service.ts";

describe("OrderCreationService", () => {
  const mockOrderRepo = {
    save: mock((o: any) => Promise.resolve({ id: "o1", ...o })),
    query: mock(() => Promise.resolve([{ seq: 1 }])),
    target: "Order",
    manager: {
      transaction: mock(async (cb: any) => {
        const fakeManager = {
          getRepository: () => ({
            save: mock((o: any) =>
              Promise.resolve(
                Array.isArray(o) ? o : { id: `id-${Math.random().toString(36).slice(2, 6)}`, ...o },
              ),
            ),
            create: mock((o: any) => o),
            // Default-warehouse lookup for vendor-order origin stamping.
            findOne: mock(() => Promise.resolve({ id: "wh-default" })),
          }),
          query: mock(() => Promise.resolve([{ seq: 1 }])),
        };
        return cb(fakeManager);
      }),
    },
  };
  const mockVendorOrderRepo = {
    save: mock((vo: any) => Promise.resolve({ id: "vo1", ...vo })),
    target: "VendorOrder",
  };
  const mockOrderItemRepo = {
    save: mock((items: any[]) => Promise.resolve(items)),
    target: "OrderItem",
  };
  const mockStatusHistoryRepo = {
    save: mock((h: any) => Promise.resolve(h)),
    target: "OrderStatusHistory",
  };

  let service: OrderCreationService;

  beforeEach(() => {
    Object.values(mockOrderRepo).forEach(
      (m: any) => typeof m?.mockClear === "function" && m.mockClear(),
    );
    Object.values(mockVendorOrderRepo).forEach(
      (m: any) => typeof m?.mockClear === "function" && m.mockClear(),
    );
    Object.values(mockOrderItemRepo).forEach(
      (m: any) => typeof m?.mockClear === "function" && m.mockClear(),
    );
    Object.values(mockStatusHistoryRepo).forEach(
      (m: any) => typeof m?.mockClear === "function" && m.mockClear(),
    );
    service = new OrderCreationService(
      mockOrderRepo as any,
      mockVendorOrderRepo as any,
      mockOrderItemRepo as any,
      mockStatusHistoryRepo as any,
    );
  });

  it("generates order number in MH-YYYY-NNNNNN format from order_number_seq", async () => {
    const original = (mockOrderRepo as any).query;
    const query = mock(() => Promise.resolve([{ seq: 42 }]));
    (mockOrderRepo as any).query = query;
    try {
      const num = await (service as any).generateOrderNumber();
      expect(num).toBe(`MH-${new Date().getFullYear()}-000042`);
      expect((query.mock.calls[0] as unknown as string[])[0]).toContain("order_number_seq");
    } finally {
      (mockOrderRepo as any).query = original;
    }
  });

  it("fails loudly instead of falling back to a clock-derived number", async () => {
    const original = (mockOrderRepo as any).query;
    (mockOrderRepo as any).query = mock(() => Promise.resolve([{ seq: null }]));
    try {
      await expect((service as any).generateOrderNumber()).rejects.toThrow();
    } finally {
      (mockOrderRepo as any).query = original;
    }
  });

  it("splits cart items by vendor into vendor_orders", async () => {
    const cartItems = [
      {
        product_id: "p1",
        variant_id: "v1",
        vendor_id: "vendor-A",
        quantity: 2,
        unit_price: 1000,
        line_total: 2000,
        product: { name: "Prod1", images: [] },
      },
      {
        product_id: "p2",
        variant_id: null,
        vendor_id: "vendor-A",
        quantity: 1,
        unit_price: 3000,
        line_total: 3000,
        product: { name: "Prod2", images: [] },
      },
      {
        product_id: "p3",
        variant_id: "v3",
        vendor_id: "vendor-B",
        quantity: 1,
        unit_price: 5000,
        line_total: 5000,
        product: { name: "Prod3", images: [] },
      },
    ];

    const _result = await service.createOrder({
      userId: "user-1",
      cartItems: cartItems as any,
      shippingAddress: { city: "Dubai" },
      taxTotal: 500,
      shippingTotal: 1000,
      discountTotal: 0,
      couponId: null,
      couponCode: null,
      couponDiscount: 0,
      channel: "web",
    });

    // Should create 1 order + 2 vendor orders (vendor-A, vendor-B)
    expect(mockOrderRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(_result.order).toBeDefined();
    expect(_result.vendorOrders).toBeDefined();
    // Each vendor sub-order is stamped with the vendor's default warehouse.
    expect(_result.vendorOrders.length).toBeGreaterThan(0);
    for (const vo of _result.vendorOrders) {
      expect((vo as any).warehouse_id).toBe("wh-default");
    }
  });

  it("snapshots shipping_contribution per vendor sub-order from the tiers", async () => {
    const tierRepo = {
      find: mock(async () => [
        { vendor_id: null, min_order_value: 0, vendor_contribution: 300, is_active: true },
        { vendor_id: null, min_order_value: 2100, vendor_contribution: 500, is_active: true },
        { vendor_id: null, min_order_value: 5100, vendor_contribution: 800, is_active: true },
        { vendor_id: null, min_order_value: 12100, vendor_contribution: 1000, is_active: true },
      ]),
    };
    const svc = new OrderCreationService(
      mockOrderRepo as any,
      mockVendorOrderRepo as any,
      mockOrderItemRepo as any,
      mockStatusHistoryRepo as any,
      undefined, // inventoryRepo
      undefined, // reservationRepo
      undefined, // movementRepo
      undefined, // integrationEventsQueue
      undefined, // siteSettingRepo
      undefined, // commissionService
      tierRepo as any, // shippingContributionTierRepo
    );

    const result = await svc.createOrder({
      userId: "user-1",
      cartItems: [
        // vendor-A subtotal 9000 -> band 5100 -> 800
        {
          product_id: "p1",
          variant_id: null,
          vendor_id: "vendor-A",
          quantity: 1,
          unit_price: 9000,
          line_total: 9000,
          product: { name: "A", images: [] },
        },
        // vendor-B subtotal 1500 -> band 0 -> 300
        {
          product_id: "p2",
          variant_id: null,
          vendor_id: "vendor-B",
          quantity: 1,
          unit_price: 1500,
          line_total: 1500,
          product: { name: "B", images: [] },
        },
      ] as any,
      shippingAddress: { city: "Dubai" },
      taxTotal: 0,
      shippingTotal: 1000,
      discountTotal: 0,
      couponId: null,
      couponCode: null,
      couponDiscount: 0,
      channel: "web",
    });

    // Inside createOrder the vendor_order is saved via the transaction's fake
    // manager (which echoes `{ id, ...vo }`), and the saved row is pushed into
    // result.vendorOrders — so the snapshot surfaces there, not on a save spy.
    expect(tierRepo.find).toHaveBeenCalledTimes(1);
    const a = result.vendorOrders.find((v: any) => v.vendor_id === "vendor-A") as any;
    const b = result.vendorOrders.find((v: any) => v.vendor_id === "vendor-B") as any;
    expect(a.shipping_contribution).toBe(800);
    expect(b.shipping_contribution).toBe(300);
  });

  it("adds surchargeTotal to grand_total and persists surcharge_total", async () => {
    const result = await service.createOrder({
      userId: "u1",
      cartItems: [
        {
          product_id: "p1",
          variant_id: null,
          vendor_id: "v1",
          quantity: 1,
          unit_price: 10000,
          line_total: 10000,
          product: { name: "TestProd", images: [] },
        },
      ],
      shippingAddress: { city: "Dubai" },
      taxTotal: 476,
      shippingTotal: 1500,
      discountTotal: 0,
      couponId: null,
      couponCode: null,
      couponDiscount: 0,
      surchargeTotal: 1000,
      channel: "web",
    });

    // 10000 - 0 + 1500 + 1000 = 12500
    expect(result.order.grand_total).toBe(12500);
    // surcharge_total must be persisted on the saved order row
    expect((result.order as any).surcharge_total).toBe(1000);
  });

  it("snapshots external_id: variant wins, product fallback, null when neither", async () => {
    const capturedItems: any[] = [];
    const capturingOrderRepo = {
      save: mock((o: any) => Promise.resolve({ id: "o1", ...o })),
      query: mock(() => Promise.resolve([{ seq: 1 }])),
      target: "Order",
      manager: {
        transaction: mock(async (cb: any) => {
          const fakeManager = {
            getRepository: (target: any) => {
              const repo: any = {
                save: mock((o: any) =>
                  Promise.resolve(
                    Array.isArray(o)
                      ? o.map((r: any, i: number) => ({ id: `oi-${i}`, ...r }))
                      : { id: "id-x", ...o },
                  ),
                ),
                create: mock((o: any) => o),
                findOne: mock(() => Promise.resolve({ id: "wh-default" })),
              };
              if (target === "OrderItem") {
                repo.save = mock((o: any) => {
                  const arr = Array.isArray(o) ? o : [o];
                  capturedItems.push(...arr);
                  return Promise.resolve(arr.map((r: any, i: number) => ({ id: `oi-${i}`, ...r })));
                });
              }
              return repo;
            },
            query: mock(() => Promise.resolve([{ seq: 1 }])),
          };
          return cb(fakeManager);
        }),
      },
    };
    const svc = new OrderCreationService(
      capturingOrderRepo as any,
      mockVendorOrderRepo as any,
      mockOrderItemRepo as any,
      mockStatusHistoryRepo as any,
    );

    await svc.createOrder({
      userId: "user-1",
      cartItems: [
        {
          product_id: "p1",
          variant_id: "v1",
          vendor_id: "vendor-A",
          quantity: 1,
          unit_price: 1000,
          line_total: 1000,
          product: { name: "A", images: [], external_id: "PROD-A" },
          variant: { name: "V", external_id: "VAR-A" },
        },
        {
          product_id: "p2",
          variant_id: null,
          vendor_id: "vendor-A",
          quantity: 1,
          unit_price: 500,
          line_total: 500,
          product: { name: "B", images: [], external_id: "PROD-B" },
        },
        {
          product_id: "p3",
          variant_id: null,
          vendor_id: "vendor-A",
          quantity: 1,
          unit_price: 300,
          line_total: 300,
          product: { name: "C", images: [] },
        },
      ] as any,
      shippingAddress: { city: "Dubai" },
      taxTotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      couponId: null,
      couponCode: null,
      couponDiscount: 0,
      channel: "web",
    });

    expect(capturedItems.map((i) => i.external_id)).toEqual(["VAR-A", "PROD-B", null]);
  });
});
