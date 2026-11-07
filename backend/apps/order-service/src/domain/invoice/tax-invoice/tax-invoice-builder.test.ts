import { describe, expect, test } from "bun:test";
import {
  allocateProportionally,
  buildInvoiceDrafts,
  computeInvoiceTotals,
  dubaiDate,
  formatInvoiceNumber,
  makeLine,
  netOfVat,
  sellerCodeFor,
  unitPriceExclFils,
} from "./tax-invoice-builder.ts";

const buyer = {
  legal_name: "Gulf Rigid Box Workshop LLC",
  trn: "100234567800003",
  peppol_id: "0235:1002345678",
  address: {
    line1: "Warehouse 14, Al Qusais Industrial 2",
    city: "Dubai",
    emirate: "Dubai",
    country_code: "AE",
  },
};
const platform = {
  legal_name: "MaterialHub",
  trn: "100555666700003",
  peppol_id: "0235:1005556667",
  address: { line1: null, city: "Dubai", country_code: "AE" },
};
const sellerA = {
  legal_name: "Emirates Board & Paper Trading LLC",
  trn: "100987654300003",
  peppol_id: "0235:1009876543",
  address: { line1: "Ras Al Khor Industrial 1", city: "Dubai", country_code: "AE" },
};
const sellerB = {
  legal_name: "Sharjah Leather Supplies FZE",
  trn: null,
  peppol_id: null,
  address: { line1: "SAIF Zone", city: "Sharjah", country_code: "AE" },
};

const order = {
  id: "o-1",
  user_id: "u-1",
  business_account_id: "b-1",
  subtotal: 0, // filled below
  discount_total: 2500,
  shipping_total: 3150,
  surcharge_total: 0,
  grand_total: 0,
  coupon_code: "TRADE25",
  currency: "AED",
  payment_terms: "net_30",
  payment_due_at: "2026-12-06T10:00:00Z",
  vendorOrders: [
    {
      id: "vo-a",
      vendor_id: "3f2a9c1b-0000-4000-8000-000000000001",
      vendor_order_number: "MH-1001-V1",
      items: [
        {
          id: "i1",
          product_name: "Greyboard 2.0 mm",
          variant_name: "70×100 cm",
          product_sku: "GB-20-70100",
          quantity: 100,
          line_total: 48000,
        },
        {
          id: "i2",
          product_name: "Kraft paper 120 GSM",
          variant_name: "Roll, 1 m × 100 m",
          product_sku: "KP-120-R",
          quantity: 3,
          line_total: 55650,
        },
      ],
    },
    {
      id: "vo-b",
      vendor_id: "9c1b3f2a-0000-4000-8000-000000000002",
      vendor_order_number: "MH-1001-V2",
      items: [
        {
          id: "i3",
          product_name: "PU leather, black",
          variant_name: "1.4 m roll, per metre",
          product_sku: "PU-BLK-14",
          quantity: 12,
          line_total: 30600,
        },
      ],
    },
  ],
};
order.subtotal = 48000 + 55650 + 30600;
order.grand_total = order.subtotal - order.discount_total + order.shipping_total;

function drafts() {
  return buildInvoiceDrafts({
    order,
    sellers: {
      [order.vendorOrders[0]!.vendor_id]: sellerA,
      [order.vendorOrders[1]!.vendor_id]: sellerB,
    },
    platform,
    buyer,
    paymentMethod: "net_terms",
    issuedAt: new Date("2026-11-06T21:30:00Z"),
  });
}

describe("VAT maths", () => {
  test("net of 5% VAT rounds to the nearest fil", () => {
    expect(netOfVat(10500)).toBe(10000);
    expect(netOfVat(48000)).toBe(45714);
    expect(netOfVat(1)).toBe(1);
  });

  test("proportional allocation always sums to the total", () => {
    expect(allocateProportionally(2500, [103650, 30600])).toEqual([1930, 570]);
    expect(allocateProportionally(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocateProportionally(0, [5, 5])).toEqual([0, 0]);
    const parts = allocateProportionally(9999, [3, 7, 11, 13]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(9999);
  });

  test("invoice totals follow EN 16931 arithmetic", () => {
    const lines = [
      makeLine({
        line_no: 1,
        source_id: "x",
        description: "Greyboard",
        sku: null,
        quantity: 100,
        gross_fils: 48000,
      }),
    ];
    const t = computeInvoiceTotals(lines, []);
    expect(t.line_extension_fils).toBe(45714);
    expect(t.tax_exclusive_fils).toBe(45714);
    expect(t.vat_total_fils).toBe(Math.round(45714 * 0.05)); // 2286
    expect(t.tax_inclusive_fils).toBe(45714 + 2286);
    expect(t.payable_fils).toBe(48000);
    expect(t.rounding_fils).toBe(0);
    expect(t.vat_breakdown).toEqual([
      { category: "S", rate: 5, taxable_fils: 45714, vat_fils: 2286 },
    ]);
  });

  test("an allowance lowers the taxable amount and payable by its gross", () => {
    const lines = [
      makeLine({
        line_no: 1,
        source_id: "x",
        description: "Kraft",
        sku: null,
        quantity: 1,
        gross_fils: 21000,
      }),
    ];
    const t = computeInvoiceTotals(lines, [
      {
        is_charge: false,
        reason: "Discount",
        amount_fils: netOfVat(1050),
        gross_fils: 1050,
        vat_category: "S",
        vat_rate: 5,
      },
    ]);
    expect(t.tax_exclusive_fils).toBe(20000 - 1000);
    expect(t.vat_total_fils).toBe(950);
    expect(t.payable_fils).toBe(19950);
    expect(t.tax_inclusive_fils + t.rounding_fils).toBe(t.payable_fils);
  });
});

describe("order → tax invoices", () => {
  test("one invoice per vendor sub-order plus a platform invoice for delivery", () => {
    const d = drafts();
    expect(d.map((x) => x.kind)).toEqual(["vendor", "vendor", "platform"]);
    expect(d[0]!.vendor_order_id).toBe("vo-a");
    expect(d[2]!.lines[0]!.description).toBe("Delivery");
  });

  test("invoices add up to the order grand total", () => {
    const sum = drafts().reduce((s, x) => s + x.totals.payable_fils, 0);
    expect(sum).toBe(order.grand_total);
  });

  test("every invoice is internally consistent", () => {
    for (const x of drafts()) {
      const t = x.totals;
      expect(t.line_extension_fils).toBe(x.lines.reduce((s, l) => s + l.line_net_fils, 0));
      expect(t.tax_exclusive_fils).toBe(
        t.line_extension_fils - t.allowance_total_fils + t.charge_total_fils,
      );
      expect(t.tax_inclusive_fils).toBe(t.tax_exclusive_fils + t.vat_total_fils);
      expect(t.tax_inclusive_fils + t.rounding_fils).toBe(t.payable_fils);
      expect(Math.abs(t.rounding_fils)).toBeLessThanOrEqual(x.lines.length + 1);
    }
  });

  test("the coupon discount is shared by goods value", () => {
    const [a, b] = drafts();
    expect(a!.allowances_charges[0]!.reason).toBe("Discount (TRADE25)");
    expect(a!.totals.payable_fils).toBe(103650 - 1930);
    expect(b!.totals.payable_fils).toBe(30600 - 570);
  });

  test("seller and buyer TRNs, dates and terms are on the record", () => {
    const [a, b, p] = drafts();
    expect(a!.seller.trn).toBe("100987654300003");
    expect(a!.buyer.trn).toBe("100234567800003");
    expect(p!.seller.legal_name).toBe("MaterialHub");
    // 21:30 UTC is already 7 November in Dubai.
    expect(a!.issue_date).toBe("2026-11-07");
    expect(a!.due_date).toBe("2026-12-06");
    expect(a!.payment_terms).toBe("net_30");
    expect(a!.einvoice_status).toBe("ready");
    // A seller without a TRN can't issue a Peppol tax invoice.
    expect(b!.einvoice_status).toBe("not_applicable");
  });

  test("retail buyers (no TRN) are not sent to Peppol", () => {
    const d = buildInvoiceDrafts({
      order: { ...order, business_account_id: null, payment_terms: null, payment_due_at: null },
      sellers: {},
      platform,
      buyer: { ...buyer, trn: null, peppol_id: null },
      paymentMethod: "stripe",
      issuedAt: new Date("2026-11-06T10:00:00Z"),
    });
    expect(d.every((x) => x.einvoice_status === "not_applicable")).toBe(true);
    expect(d[0]!.payment_terms).toBe("immediate");
    expect(d[0]!.due_date).toBeNull();
  });

  test("no platform invoice when there is no shipping or surcharge", () => {
    const d = buildInvoiceDrafts({
      order: { ...order, shipping_total: 0 },
      sellers: {},
      platform,
      buyer,
      paymentMethod: "net_terms",
      issuedAt: new Date(),
    });
    expect(d.some((x) => x.kind === "platform")).toBe(false);
  });
});

describe("only what was supplied is invoiced", () => {
  // MH-…-04: greyboard pack 4,500 + kraft liner sheet 500, the liner
  // cancelled by admin before shipping (COD, invoiced at delivery).
  const codOrder = {
    ...order,
    discount_total: 0,
    shipping_total: 1500,
    surcharge_total: 1000,
    coupon_code: null,
    vendorOrders: [
      {
        id: "vo-1",
        vendor_id: "3f2a9c1b-0000-4000-8000-000000000001",
        vendor_order_number: "MH-2026-000004-V1",
        status: "delivered",
        items: [
          {
            id: "gb",
            product_name: "Greyboard 2 mm",
            variant_name: "70 × 100 cm, pack of 10",
            product_sku: "GB-2-P10",
            quantity: 1,
            line_total: 4500,
          },
          {
            id: "kl",
            product_name: "Kraft liner 125 gsm",
            variant_name: "100 × 70 cm sheet",
            product_sku: "KL-125",
            quantity: 1,
            line_total: 500,
            status: "cancelled",
          },
        ],
      },
    ],
  };
  const build = (o: any, cancelled?: any) =>
    buildInvoiceDrafts({
      order: o,
      sellers: {},
      platform,
      buyer,
      paymentMethod: "cash_on_delivery",
      issuedAt: new Date("2026-11-07T10:00:00Z"),
      cancelled,
    });

  test("a cancelled line is left off the vendor invoice", () => {
    const [v] = build(codOrder, { kl: { quantity: 1, amount: 500 } });
    expect(v!.lines.map((l) => l.source_id)).toEqual(["gb"]);
    expect(v!.totals.payable_fils).toBe(4500);
  });

  test("a partially cancelled line is invoiced for the units supplied", () => {
    const o = {
      ...codOrder,
      vendorOrders: [
        {
          ...codOrder.vendorOrders[0]!,
          items: [{ ...codOrder.vendorOrders[0]!.items[0]!, quantity: 3, line_total: 13500 }],
        },
      ],
    };
    const [v] = build(o, { gb: { quantity: 1, amount: 4500 } });
    expect(v!.lines[0]!.quantity).toBe(2);
    expect(v!.lines[0]!.line_gross_fils).toBe(9000);
    expect(v!.totals.payable_fils).toBe(9000);
  });

  test("a rejected (cancelled) vendor sub-order gets no invoice", () => {
    const o = {
      ...codOrder,
      vendorOrders: [
        { ...codOrder.vendorOrders[0]!, id: "vo-rej", status: "cancelled" },
        {
          id: "vo-2",
          vendor_id: "9c1b3f2a-0000-4000-8000-000000000002",
          vendor_order_number: "MH-2026-000006-V2",
          status: "delivered",
          items: [
            {
              id: "kr",
              product_name: "Brown kraft roll 80 gsm",
              variant_name: null,
              product_sku: null,
              quantity: 1,
              line_total: 3000,
            },
          ],
        },
      ],
    };
    const d = build(o);
    expect(d.filter((x) => x.kind === "vendor").map((x) => x.vendor_order_id)).toEqual(["vo-2"]);
  });

  test("returns do not shrink the invoice (refunded_quantity is not a cancellation)", () => {
    const o = {
      ...codOrder,
      vendorOrders: [
        {
          ...codOrder.vendorOrders[0]!,
          items: [{ ...codOrder.vendorOrders[0]!.items[0]!, refunded_quantity: 1 }],
        },
      ],
    };
    const [v] = build(o, {});
    expect(v!.totals.payable_fils).toBe(4500);
  });

  test("the discount is shared over the supplied goods only", () => {
    const o = { ...order, vendorOrders: [order.vendorOrders[0]!, order.vendorOrders[1]!] };
    const d = build(o, { i3: { quantity: 12, amount: 30600 } });
    const vendors = d.filter((x) => x.kind === "vendor");
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.totals.payable_fils).toBe(103650 - 2500);
  });
});

describe("unit price precision", () => {
  test("never a raw float: 4 decimals of a fil, and price × quantity reproduces the line net", () => {
    const line = makeLine({
      line_no: 1,
      source_id: "kp",
      description: "Kraft paper 120 GSM",
      sku: null,
      quantity: 3,
      gross_fils: 13500,
    });
    expect(line.line_net_fils).toBe(12857);
    expect(line.unit_price_excl_fils).toBe(4285.6667);
    expect(Math.round(line.unit_price_excl_fils * line.quantity)).toBe(line.line_net_fils);
    expect(Number.isInteger(line.line_net_fils)).toBe(true);
  });

  test("whole-fil prices stay integers", () => {
    expect(unitPriceExclFils(10000, 4)).toBe(2500);
    expect(unitPriceExclFils(45714, 1)).toBe(45714);
  });

  test("price × quantity is exact for every line of the fixture order", () => {
    for (const x of drafts()) {
      for (const l of x.lines) {
        expect(Math.round(l.unit_price_excl_fils * l.quantity)).toBe(l.line_net_fils);
        expect(String(l.unit_price_excl_fils).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("numbering", () => {
  test("invoice numbers are per seller and year, zero padded", () => {
    expect(
      formatInvoiceNumber(sellerCodeFor("3f2a9c1b-0000-4000-8000-000000000001"), 2026, 42),
    ).toBe("INV-3F2A9C1B-2026-000042");
    expect(formatInvoiceNumber(sellerCodeFor(null), 2027, 1)).toBe("INV-MH-2027-000001");
  });

  test("Dubai calendar date", () => {
    expect(dubaiDate(new Date("2026-12-31T19:59:00Z"))).toBe("2026-12-31");
    expect(dubaiDate(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });
});
