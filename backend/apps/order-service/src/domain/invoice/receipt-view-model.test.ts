import { describe, expect, test } from "bun:test";
import { buildReceiptViewModel } from "./receipt-view-model.ts";

const baseOrder = {
  order_number: "MH-10234",
  created_at: new Date("2026-07-27T10:00:00Z"),
  currency: "AED",
  subtotal: 18000,
  discount_total: 0,
  shipping_total: 1500,
  surcharge_total: 0,
  tax_total: 975,
  grand_total: 20475,
  refund_total: 0,
  coupon_code: null,
  shipping_address: {
    full_name: "Aisha Khan",
    address_line_1: "12 Marina Walk",
    city: "Dubai",
    country_code: "AE",
    phone: "+971500000000",
  },
  vendorOrders: [
    {
      vendor_order_number: "MH-10234-V1",
      vendor: { business_name: "Vendor A" },
      items: [
        {
          product_name: "Greyboard 2.0 mm",
          variant_name: "70×100 cm",
          quantity: 2,
          unit_price: 9000,
          line_total: 18000,
        },
      ],
    },
  ],
} as any;

describe("buildReceiptViewModel", () => {
  test("maps order_number, formatted date, and grand total", () => {
    const vm = buildReceiptViewModel(baseOrder);
    expect(vm.reference).toBe("MH-10234");
    expect(vm.dateLabel).toBe("27 Jul 2026");
    expect(vm.totals.grandTotal).toBe("AED 204.75");
  });

  test("groups items by vendor with formatted line money", () => {
    const vm = buildReceiptViewModel(baseOrder);
    expect(vm.vendorGroups).toHaveLength(1);
    expect(vm.vendorGroups[0]?.vendorName).toBe("Vendor A");
    expect(vm.vendorGroups[0]?.items[0]?.qtyUnitLabel).toBe("2 × AED 90.00");
    expect(vm.vendorGroups[0]?.items[0]?.lineTotal).toBe("AED 180.00");
  });

  test("omits discount and refund rows when zero, includes when present", () => {
    const noExtras = buildReceiptViewModel(baseOrder);
    expect(noExtras.totals.discount).toBeNull();
    expect(noExtras.totals.refund).toBeNull();

    const withExtras = buildReceiptViewModel({
      ...baseOrder,
      discount_total: 500,
      coupon_code: "SAVE5",
      refund_total: 1000,
    });
    expect(withExtras.totals.discount).toBe("-AED 5.00");
    expect(withExtras.totals.couponCode).toBe("SAVE5");
    expect(withExtras.totals.refund).toBe("-AED 10.00");
  });

  test("shows Free when shipping is zero", () => {
    const vm = buildReceiptViewModel({ ...baseOrder, shipping_total: 0 });
    expect(vm.totals.shipping).toBe("Free");
  });

  test("business orders carry the buyer legal name and TRN; vendors their TRN", () => {
    const vm = buildReceiptViewModel({
      ...baseOrder,
      billing_address: {
        type: "business",
        legal_name: "Gulf Rigid Box Workshop LLC",
        trn: "100234567800003",
      },
      vendorOrders: [
        {
          ...baseOrder.vendorOrders[0],
          vendor: { business_name: "Emirates Board & Paper Trading", trn: "100987654300003" },
        },
      ],
    });
    expect(vm.buyer).toEqual({ legalName: "Gulf Rigid Box Workshop LLC", trn: "100234567800003" });
    expect(vm.vendorGroups[0]?.vendorTrn).toBe("100987654300003");
  });

  test("retail orders have no buyer block; a valid legacy vat_number counts as TRN", () => {
    const vm = buildReceiptViewModel({
      ...baseOrder,
      vendorOrders: [
        {
          ...baseOrder.vendorOrders[0],
          vendor: { business_name: "A", vat_number: "100 9876 5430 0003" },
        },
      ],
    });
    expect(vm.buyer).toBeNull();
    expect(vm.vendorGroups[0]?.vendorTrn).toBe("100987654300003");
  });
});
