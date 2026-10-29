import { describe, expect, test } from "bun:test";
import { renderReceiptPdf } from "./receipt-pdf.ts";
import type { ReceiptViewModel } from "./receipt-view-model.ts";

const vm: ReceiptViewModel = {
  reference: "NL-10234",
  dateLabel: "27 Jul 2026",
  address: { name: "Aisha Khan", lines: ["12 Marina Walk", "Dubai, AE"], phone: "+971500000000" },
  vendorGroups: [
    {
      vendorName: "Vendor A",
      vendorOrderNumber: "NL-10234-V1",
      items: [
        {
          name: "Rose Serum",
          variant: "30ml",
          qtyUnitLabel: "2 × AED 90.00",
          lineTotal: "AED 180.00",
        },
      ],
    },
  ],
  totals: {
    subtotal: "AED 180.00",
    discount: null,
    couponCode: null,
    shipping: "AED 15.00",
    surcharge: null,
    vat: "AED 9.75",
    grandTotal: "AED 204.75",
    refund: null,
  },
};

describe("renderReceiptPdf", () => {
  test("returns a non-empty PDF buffer", async () => {
    const buf = await renderReceiptPdf(vm);
    expect(buf.length).toBeGreaterThan(500);
    // PDF magic header
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("renders a valid PDF with discount, surcharge and refund rows", async () => {
    const withMoney: ReceiptViewModel = {
      ...vm,
      totals: {
        subtotal: "AED 180.00",
        discount: "-AED 5.00",
        couponCode: "SAVE5",
        shipping: "AED 15.00",
        surcharge: "AED 3.00",
        vat: "AED 9.75",
        grandTotal: "AED 202.75",
        refund: "-AED 10.00",
      },
    };
    const buf = await renderReceiptPdf(withMoney);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
