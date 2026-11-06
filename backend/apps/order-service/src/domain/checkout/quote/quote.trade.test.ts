// quote.trade.test.ts — trade pricing in the checkout quote: sample-only
// suppliers ship at the sample rate, and rule violations block checkout.
import { describe, expect, it, mock } from "bun:test";
import { QuoteService } from "./quote.service.ts";

function svcWith(items: any[], ruleViolations: any[] = []) {
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const cartService = {
    getCart: mock(async () => ({
      cart: { id: "c1", subtotal, coupon_discount: 0 },
      items: [{ vendor_id: "v_a", items }],
      staleItems: [],
      ruleViolations,
    })),
    pricing: { sampleShippingFils: mock(async () => 1000), tiersForProducts: async () => [] },
  };
  const rate = {
    id: "r1",
    vendor_id: null,
    zone_id: null,
    method: "standard",
    base_cost: 2500,
    per_kg_cost: null,
    free_above: null,
    estimated_days_min: 1,
    estimated_days_max: 3,
  };
  const qb = { where: () => qb, andWhere: () => qb, getMany: async () => [rate] };
  const svc = new QuoteService(
    cartService as any,
    { getRate: async () => 5 } as any,
    { get: async () => 1 } as any,
    { find: async () => [] } as any,
    { createQueryBuilder: () => qb } as any,
    { findOne: async () => ({ id: "a1", user_id: "u1", area_id: null }) } as any,
    { findOne: async () => null } as any,
    "test-secret",
  );
  return { svc, cartService };
}

const sampleLine = {
  id: "i1",
  vendor_id: "v_a",
  product_id: "p1",
  variant_id: "s1",
  quantity: 1,
  unit_price: 500,
  variant: { id: "s1", is_sample: true },
};
const regularLine = {
  id: "i2",
  vendor_id: "v_a",
  product_id: "p2",
  variant_id: null,
  quantity: 50,
  unit_price: 600,
  variant: null,
};

describe("QuoteService trade pricing", () => {
  it("charges the sample rate when a supplier ships only samples", async () => {
    const { svc } = svcWith([sampleLine]);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.totals.shipping_fils).toBe(1000);
    expect(response.shipping?.groups[0]?.methods[0]?.price_fils).toBe(1000);
  });

  it("charges normal shipping when the supplier also ships regular lines", async () => {
    const { svc } = svcWith([sampleLine, regularLine]);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.totals.shipping_fils).toBe(2500);
  });

  it("does not read the sample setting for carts without samples", async () => {
    const { svc, cartService } = svcWith([regularLine]);
    await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(cartService.pricing.sampleShippingFils).not.toHaveBeenCalled();
  });

  it("blocks checkout when a line breaks its trade terms", async () => {
    const { svc } = svcWith(
      [regularLine],
      [{ item_id: "i2", code: "MIN_ORDER_QUANTITY", message: "x", suggested_quantity: 100 }],
    );
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.blocking_error).toMatchObject({
      code: "trade_quantity_rules",
      i18n_key: "checkout.error.trade_quantity_rules",
      affected_item_ids: ["i2"],
    });
  });
});
