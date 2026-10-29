// gift-box-expansion.test.ts
import { describe, expect, it } from "bun:test";
import { expandGiftBoxes } from "./checkout.service.ts";

describe("expandGiftBoxes", () => {
  it("expands a box (qty=1) into component lines + packaging + discount + one gift order", () => {
    const giftBoxes = [
      {
        id: "cgb-1",
        gift_box_id: "gb-1",
        quantity: 1,
        // unit_price = itemsSubtotal − discount + packaging
        //            = (2000 + 5000) − 700 + 1500 = 7800
        unit_price: 7800,
        packaging_price: 1500,
        discount_total: 700,
        box_name_snapshot: "Spa Day",
        style_snapshot: { color: "rose" },
        occasion_snapshot: { name: "Birthday" },
        gift_message: "Happy Birthday!",
        recipient_name: "Sara",
        components: [
          {
            product_id: "p1",
            variant_id: "v1",
            vendor_id: "vendor-A",
            unit_price: 2000,
            quantity: 1,
          },
          {
            product_id: "p2",
            variant_id: null,
            vendor_id: "vendor-B",
            unit_price: 5000,
            quantity: 1,
          },
        ],
      },
    ];

    const { components, packagingTotal, discountTotal, giftOrders } = expandGiftBoxes(giftBoxes);

    expect(components).toHaveLength(2);
    expect(components[0]).toMatchObject({
      product_id: "p1",
      variant_id: "v1",
      vendor_id: "vendor-A",
      quantity: 1,
      unit_price: 2000,
      line_total: 2000,
      original_unit_price: 2000,
      flash_deal_id: null,
      __giftBoxRef: "cgb-1",
    });
    expect(components[1]!.line_total).toBe(5000);

    expect(packagingTotal).toBe(1500);
    expect(discountTotal).toBe(700);

    expect(giftOrders).toHaveLength(1);
    expect(giftOrders[0]).toMatchObject({
      ref: "cgb-1",
      gift_box_id: "gb-1",
      box_name_snapshot: "Spa Day",
      style_snapshot: { color: "rose" },
      occasion_snapshot: { name: "Birthday" },
      packaging_price: 1500,
      gift_message: "Happy Birthday!",
      recipient_name: "Sara",
    });

    // Arithmetic identity: Σ(components.line_total) + packaging − discount
    //                      === box.unit_price * box.quantity
    const componentsSum = components.reduce((s, c) => s + c.line_total, 0);
    expect(componentsSum + packagingTotal - discountTotal).toBe(7800 * 1);
  });

  it("multiplies components / packaging / discount by box.quantity", () => {
    const giftBoxes = [
      {
        id: "cgb-2",
        gift_box_id: "gb-1",
        quantity: 2,
        unit_price: 7800,
        packaging_price: 1500,
        discount_total: 700,
        box_name_snapshot: "Spa Day",
        style_snapshot: null,
        occasion_snapshot: null,
        gift_message: null,
        recipient_name: null,
        components: [
          {
            product_id: "p1",
            variant_id: "v1",
            vendor_id: "vendor-A",
            unit_price: 2000,
            quantity: 1,
          },
          {
            product_id: "p2",
            variant_id: null,
            vendor_id: "vendor-B",
            unit_price: 5000,
            quantity: 1,
          },
        ],
      },
    ];

    const { components, packagingTotal, discountTotal, giftOrders } = expandGiftBoxes(giftBoxes);

    expect(components).toHaveLength(2);
    // quantity and line_total scaled by box.quantity (2)
    expect(components[0]!.quantity).toBe(2);
    expect(components[0]!.line_total).toBe(4000);
    expect(components[1]!.quantity).toBe(2);
    expect(components[1]!.line_total).toBe(10000);

    expect(packagingTotal).toBe(3000); // 1500 * 2
    expect(discountTotal).toBe(1400); // 700 * 2
    expect(giftOrders[0]!.packaging_price).toBe(3000);

    const componentsSum = components.reduce((s, c) => s + c.line_total, 0);
    expect(componentsSum + packagingTotal - discountTotal).toBe(7800 * 2);
  });

  it("respects per-component quantity > 1", () => {
    const { components } = expandGiftBoxes([
      {
        id: "cgb-3",
        gift_box_id: "gb-2",
        quantity: 2,
        unit_price: 0,
        packaging_price: 0,
        discount_total: 0,
        box_name_snapshot: "Trio",
        components: [
          {
            product_id: "p1",
            variant_id: null,
            vendor_id: "vendor-A",
            unit_price: 1000,
            quantity: 3,
          },
        ],
      },
    ]);
    // qty = component.quantity (3) * box.quantity (2) = 6
    expect(components[0]!.quantity).toBe(6);
    expect(components[0]!.line_total).toBe(6000);
  });

  it("returns empty results for no gift boxes", () => {
    const r = expandGiftBoxes([]);
    expect(r.components).toEqual([]);
    expect(r.packagingTotal).toBe(0);
    expect(r.discountTotal).toBe(0);
    expect(r.giftOrders).toEqual([]);
  });
});
