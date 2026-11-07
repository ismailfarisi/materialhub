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

describe("buildReceiptViewModel — cancellations", () => {
  const twoVendor = {
    ...baseOrder,
    status: "delivered",
    payment_status: "captured",
    vendorOrders: [
      {
        vendor_order_number: "MH-10234-V1",
        status: "delivered",
        vendor: { business_name: "Vendor A" },
        items: [
          {
            id: "gb",
            product_name: "Greyboard 2 mm",
            variant_name: null,
            quantity: 1,
            unit_price: 4500,
            line_total: 4500,
          },
          {
            id: "kl",
            product_name: "Kraft liner 125 gsm",
            variant_name: null,
            quantity: 1,
            unit_price: 500,
            line_total: 500,
            status: "cancelled",
          },
        ],
      },
      {
        vendor_order_number: "MH-10234-V2",
        status: "cancelled",
        vendor: { business_name: "Vendor B" },
        items: [
          {
            id: "kr",
            product_name: "Brown kraft roll",
            variant_name: null,
            quantity: 1,
            unit_price: 3000,
            line_total: 3000,
          },
        ],
      },
    ],
  } as any;

  test("lists only supplied lines: no cancelled line, no rejected sub-order", () => {
    const vm = buildReceiptViewModel(twoVendor, { kl: { quantity: 1, amount: 500 } });
    expect(vm.statusLabel).toBeNull();
    expect(vm.vendorGroups.map((g) => g.vendorOrderNumber)).toEqual(["MH-10234-V1"]);
    expect(vm.vendorGroups[0]!.items.map((i) => i.name)).toEqual(["Greyboard 2 mm"]);
  });

  test("a partially cancelled line shows the supplied quantity and value", () => {
    const o = {
      ...twoVendor,
      vendorOrders: [
        {
          ...twoVendor.vendorOrders[0],
          items: [{ ...twoVendor.vendorOrders[0].items[0], quantity: 3, line_total: 13500 }],
        },
      ],
    };
    const vm = buildReceiptViewModel(o, { gb: { quantity: 1, amount: 4500 } });
    expect(vm.vendorGroups[0]!.items[0]!.qtyUnitLabel).toBe("2 × AED 45.00");
    expect(vm.vendorGroups[0]!.items[0]!.lineTotal).toBe("AED 90.00");
  });

  test("a cancelled COD order says Cancelled and shows nothing paid", () => {
    const vm = buildReceiptViewModel({
      ...baseOrder,
      status: "cancelled",
      payment_status: "cancelled",
      grand_total: 7000,
    });
    expect(vm.statusLabel).toBe("Cancelled");
    expect(vm.totals.grandTotal).toBe("AED 70.00");
    expect(vm.totals.paid).toBe("AED 0.00");
    // The ordered lines stay on the record.
    expect(vm.vendorGroups[0]!.items).toHaveLength(1);
  });

  test("a cancelled prepaid order nets the refund off what was paid", () => {
    const vm = buildReceiptViewModel({
      ...baseOrder,
      status: "cancelled",
      payment_status: "refunded",
      grand_total: 7000,
      refund_total: 7000,
    });
    expect(vm.totals.paid).toBe("AED 0.00");
    expect(vm.totals.refund).toBe("-AED 70.00");
  });

  test("paid is the total net of refunds for a captured order", () => {
    const vm = buildReceiptViewModel({ ...twoVendor, grand_total: 7000, refund_total: 500 });
    expect(vm.totals.paid).toBe("AED 65.00");
  });

  test("a COD order not yet delivered has paid nothing", () => {
    const vm = buildReceiptViewModel({
      ...twoVendor,
      status: "confirmed",
      payment_status: "pending",
    });
    expect(vm.totals.paid).toBe("AED 0.00");
  });
});
