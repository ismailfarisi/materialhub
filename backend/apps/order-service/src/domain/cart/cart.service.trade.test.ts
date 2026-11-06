// cart.service.trade.test.ts — trade pricing through the cart: rules on add
// and update, tier pricing, and the per-line view GET /cart returns.
import { describe, expect, it, mock } from "bun:test";
import { HttpError } from "@materialhub/plugins";
import { CartService } from "./cart.service.ts";
import type { CartPricingSource } from "./pricing/cart-pricing.service.ts";

const product = {
  id: "p1",
  vendor_id: "v1",
  status: "published",
  price: 600,
  unit_of_measure: "sheet",
  min_order_quantity: 50,
  order_increment: 25,
};
const sample = {
  id: "s1",
  product_id: "p1",
  price: 500,
  is_active: true,
  is_sample: true,
  sample_max_quantity: 2,
  min_order_quantity: 1,
  order_increment: 1,
};
const tiers = [
  { product_id: "p1", variant_id: null, min_quantity: 100, unit_price: 540 },
  { product_id: "p1", variant_id: null, min_quantity: 500, unit_price: 480 },
];

function build(overrides: { items?: any[]; existing?: any } = {}) {
  const saved: any[] = [];
  const cartItemRepo = {
    findOne: mock(async () => overrides.existing ?? null),
    save: mock(async (i: any) => {
      saved.push({ ...i });
      return { id: "item-1", ...i };
    }),
    softRemove: mock(async () => {}),
    find: mock(async () => overrides.items ?? []),
    create: mock((i: any) => i),
  };
  const inventoryFindOne = mock(async (_args: any) => ({
    quantity_on_hand: 10000,
    quantity_reserved: 0,
  }));
  const pricing: CartPricingSource = {
    tiersForProducts: mock(async () => tiers),
    sampleShippingFils: async () => 1000,
  };
  const service = new CartService(
    {
      findOne: mock(async () => ({ id: "cart-1" })),
      save: mock(async (c: any) => c),
    } as any,
    cartItemRepo as any,
    { findOne: inventoryFindOne } as any,
    { findOne: mock(async () => product) } as any,
    { findOne: mock(async () => sample) } as any,
    {
      setItem: mock(async () => {}),
      removeItem: mock(async () => {}),
      clear: mock(async () => {}),
    } as any,
    pricing,
  );
  return { service, saved, inventoryFindOne, cartItemRepo };
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof HttpError ? e.code : String(e);
  }
}

describe("CartService trade pricing", () => {
  it("rejects a quantity below the minimum order", async () => {
    const { service } = build();
    expect(
      await codeOf(service.addItem("u1", null, { productId: "p1", variantId: null, quantity: 10 })),
    ).toBe("MIN_ORDER_QUANTITY");
  });

  it("rejects a quantity off the order increment", async () => {
    const { service } = build();
    expect(
      await codeOf(service.addItem("u1", null, { productId: "p1", variantId: null, quantity: 60 })),
    ).toBe("ORDER_INCREMENT");
  });

  it("prices a valid line at its tier", async () => {
    const { service, saved } = build();
    await service.addItem("u1", null, { productId: "p1", variantId: null, quantity: 100 });
    expect(saved[0]).toMatchObject({ quantity: 100, unit_price: 540, line_total: 54000 });
  });

  it("caps a sample and prices it at the sample variant's price", async () => {
    const { service, saved } = build();
    expect(
      await codeOf(service.addItem("u1", null, { productId: "p1", variantId: "s1", quantity: 3 })),
    ).toBe("SAMPLE_QUANTITY_CAP");
    await service.addItem("u1", null, { productId: "p1", variantId: "s1", quantity: 2 });
    expect(saved[0]).toMatchObject({ unit_price: 500, line_total: 1000, variant_id: "s1" });
  });

  it("pins variant_id to NULL for a line without a variant", async () => {
    const { service, inventoryFindOne } = build();
    await service.addItem("u1", null, { productId: "p1", variantId: null, quantity: 50 });
    const where = (inventoryFindOne.mock.calls[0]?.[0] as any).where;
    expect(where.variant_id).toBeDefined();
    expect(where.variant_id).not.toBeNull(); // an IsNull() operator, not a dropped condition
  });

  it("re-prices on quantity update and enforces the rules", async () => {
    const existing = {
      id: "item-1",
      product_id: "p1",
      variant_id: null,
      vendor_id: "v1",
      quantity: 50,
      unit_price: 600,
      line_total: 30000,
      product,
      variant: null,
    };
    const { service, saved } = build({ existing });
    await service.updateItemQuantity("u1", null, "p1", 500);
    expect(saved[0]).toMatchObject({ quantity: 500, unit_price: 480, line_total: 240000 });
    expect(await codeOf(service.updateItemQuantity("u1", null, "p1", 30))).toBe(
      "MIN_ORDER_QUANTITY",
    );
  });

  it("returns a trade view per line and flags rule violations", async () => {
    const items = [
      {
        id: "item-1",
        product_id: "p1",
        variant_id: null,
        vendor_id: "v1",
        quantity: 100,
        unit_price: 540,
        product,
        variant: null,
      },
      {
        id: "item-2",
        product_id: "p1",
        variant_id: "s1",
        vendor_id: "v1",
        quantity: 3,
        unit_price: 500,
        product,
        variant: sample,
      },
    ];
    const { service } = build({ items });
    const res = await service.getCart("u1", null);
    const lines = res.items[0].items;
    expect(lines[0].trade).toMatchObject({
      unit: "sheet",
      min_order_quantity: 50,
      price_source: "tier",
      live_unit_price: 540,
      savings_fils: 6000,
      next_tier: { min_quantity: 500, unit_price: 480, units_to_go: 400 },
    });
    expect(lines[1].trade).toMatchObject({ is_sample: true, max_quantity: 2 });
    expect(res.staleItems).toEqual([]);
    expect(res.ruleViolations).toEqual([
      expect.objectContaining({
        item_id: "item-2",
        code: "SAMPLE_QUANTITY_CAP",
        suggested_quantity: 2,
      }),
    ]);
  });

  it("flags a line stale when the vendor's tiers moved", async () => {
    const items = [
      {
        id: "item-1",
        product_id: "p1",
        variant_id: null,
        vendor_id: "v1",
        quantity: 100,
        unit_price: 600,
        product,
        variant: null,
      },
    ];
    const { service } = build({ items });
    expect((await service.getCart("u1", null)).staleItems).toEqual(["item-1"]);
  });
});
