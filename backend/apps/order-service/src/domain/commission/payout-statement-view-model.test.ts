import { describe, expect, test } from "bun:test";
import {
  STATEMENT_LINE_CAP,
  buildPayoutStatementViewModel,
  payoutStatementFilename,
} from "./payout-statement-view-model.ts";
import type { PayoutStatementSource } from "./payout-statement-view-model.ts";

// Figures lifted from a real staging draft (PAY-2026-000004) so the fixture is
// a shape the pipeline actually produces, not an invented one.
function source(over: Partial<PayoutStatementSource> = {}): PayoutStatementSource {
  return {
    payout: {
      payout_reference: "PAY-2026-000004",
      period_start: "2026-06-30",
      period_end: "2026-07-30",
      status: "pending",
      currency: "AED",
      gross_amount: 10000,
      commission_total: 96,
      adjustment_total: 0,
      shipping_contribution_total: 0,
      net_amount: 9424,
      gateway_reference: null,
      processed_at: null,
      created_at: new Date("2026-07-31T21:27:00Z"),
    },
    vendor: { business_name: "MaterialHub UAE", name: "MaterialHub UAE", vat_number: null },
    bank: {
      bank_name: "Emirates NBD",
      account_holder_name: "MaterialHub UAE Trading LLC",
      account_number_masked: "*********1234",
      iban_masked: "*******************3456",
      currency: "AED",
    },
    commissions: [
      {
        created_at: new Date("2026-07-12T08:00:00Z"),
        item_total: 5000,
        commission_amount: 48,
        tax_on_commission: 2,
        vendor_earning: 4712,
        order: { order_number: "NL-10234" },
        order_item: { product_name: "Rose Serum", variant_name: "30ml", quantity: 2 },
      },
      {
        created_at: new Date("2026-07-18T08:00:00Z"),
        item_total: 5000,
        commission_amount: 48,
        tax_on_commission: 2,
        vendor_earning: 4712,
        order: { order_number: "NL-10240" },
        order_item: { product_name: "Oud Mist", variant_name: null, quantity: 1 },
      },
    ],
    commissionCount: 2,
    adjustments: [],
    platform: { legalName: "MaterialHub FZ-LLC", trn: "100123456700003" },
    generatedAt: new Date("2026-08-01T06:00:00Z"),
    ...over,
  };
}

/** Parses "AED 94.24" back to 9424 fils so the ladder can be summed. */
function fils(amount: string): number {
  return Math.round(Number.parseFloat(amount.replace(/[^0-9.-]/g, "")) * 100);
}

describe("buildPayoutStatementViewModel", () => {
  test("the ladder's signed rows sum to the stated net", () => {
    const vm = buildPayoutStatementViewModel(
      source({
        payout: {
          ...source().payout,
          adjustment_total: -500,
          shipping_contribution_total: 1200,
          net_amount: 9424,
        },
      }),
    );
    // Everything except the derived "Your earnings" subtotal and the final
    // total is a movement; those two are checkpoints, not movements.
    const sum = vm.ladder
      .filter((r) => r.kind === "line")
      .reduce((s, r) => s + (r.isDeduction ? -fils(r.amount) : fils(r.amount)), 0);
    const total = vm.ladder.find((r) => r.kind === "total");
    expect(total).toBeDefined();
    expect(sum).toBe(fils(total!.amount));
  });

  test("Your earnings + shipping + adjustments reconcile to net", () => {
    const vm = buildPayoutStatementViewModel(source());
    const earnings = vm.ladder.find((r) => r.label === "Your earnings");
    expect(fils(earnings!.amount)).toBe(9424);
    expect(vm.netAmount).toBe("AED 94.24");
  });

  test("derives the unstored VAT + commission-tax wedge as the exact residual", () => {
    const vm = buildPayoutStatementViewModel(source());
    const wedge = vm.ladder.find((r) => r.label === "VAT + tax on commission");
    // gross 10000 - commission 96 - itemsNet 9424
    expect(fils(wedge!.amount)).toBe(480);
    expect(wedge!.isDeduction).toBe(true);
  });

  test("omits zero shipping and zero adjustment rows entirely", () => {
    const vm = buildPayoutStatementViewModel(source());
    expect(vm.ladder.some((r) => r.label === "Shipping contribution")).toBe(false);
    expect(vm.ladder.some((r) => r.label === "Adjustments")).toBe(false);
  });

  test("a negative adjustment total renders as a deduction, a positive one does not", () => {
    const neg = buildPayoutStatementViewModel(
      source({ payout: { ...source().payout, adjustment_total: -250 } }),
    );
    expect(neg.ladder.find((r) => r.label === "Adjustments")).toMatchObject({
      amount: "AED 2.50",
      isDeduction: true,
    });
    const pos = buildPayoutStatementViewModel(
      source({ payout: { ...source().payout, adjustment_total: 250 } }),
    );
    expect(pos.ladder.find((r) => r.label === "Adjustments")).toMatchObject({
      amount: "AED 2.50",
      isDeduction: false,
    });
  });

  test("fees column combines commission with the tax charged on it", () => {
    const vm = buildPayoutStatementViewModel(source());
    // 48 + 2
    expect(vm.lines[0]?.commission).toBe("AED 0.50");
  });

  test("describes items with variant and quantity, and falls back when there is no order item", () => {
    const vm = buildPayoutStatementViewModel(
      source({
        commissions: [
          {
            created_at: new Date("2026-07-12T08:00:00Z"),
            item_total: 100,
            commission_amount: 1,
            tax_on_commission: 0,
            vendor_earning: 90,
            order: { order_number: "NL-1" },
            order_item: { product_name: "Rose Serum", variant_name: "30ml", quantity: 3 },
          },
          {
            created_at: new Date("2026-07-13T08:00:00Z"),
            item_total: 100,
            commission_amount: 1,
            tax_on_commission: 0,
            vendor_earning: 90,
            order: null,
            order_item: null,
          },
        ],
        commissionCount: 2,
      }),
    );
    expect(vm.lines[0]?.description).toBe("Rose Serum — 30ml × 3");
    expect(vm.lines[1]?.description).toBe("Order item");
    expect(vm.lines[1]?.reference).toBe("—");
  });

  test("reports the true claimed count when the line list is capped", () => {
    const one = source().commissions[0]!;
    const vm = buildPayoutStatementViewModel(
      source({
        commissions: Array.from({ length: STATEMENT_LINE_CAP }, () => one),
        commissionCount: 4000,
      }),
    );
    expect(vm.lines).toHaveLength(STATEMENT_LINE_CAP);
    expect(vm.linesTruncated).toBe(true);
    expect(vm.totalLineCount).toBe(4000);
  });

  test("is not truncated when every claimed commission is listed", () => {
    const vm = buildPayoutStatementViewModel(source());
    expect(vm.linesTruncated).toBe(false);
    expect(vm.totalLineCount).toBe(2);
  });

  test("marks anything short of paid as provisional", () => {
    for (const status of ["pending", "processing", "failed"]) {
      const vm = buildPayoutStatementViewModel(source({ payout: { ...source().payout, status } }));
      expect(vm.isProvisional).toBe(true);
      expect(vm.paidLabel).toBeNull();
    }
  });

  test("a paid payout is not provisional and carries its settlement date", () => {
    const vm = buildPayoutStatementViewModel(
      source({
        payout: {
          ...source().payout,
          status: "paid",
          processed_at: new Date("2026-08-02T10:00:00Z"),
          gateway_reference: "TRF-99812",
        },
      }),
    );
    expect(vm.isProvisional).toBe(false);
    expect(vm.paidLabel).toBe("2 Aug 2026");
    expect(vm.paymentReference).toBe("TRF-99812");
    expect(vm.statusLabel).toBe("Paid");
  });

  test("formats the DATE-column period without timezone drift", () => {
    const vm = buildPayoutStatementViewModel(source());
    expect(vm.periodLabel).toBe("30 Jun 2026 – 30 Jul 2026");
  });

  test("passes masked bank values through untouched and tolerates a missing account", () => {
    const vm = buildPayoutStatementViewModel(source());
    expect(vm.bank?.accountNumberMasked).toBe("*********1234");
    expect(vm.bank?.ibanMasked).toBe("*******************3456");
    expect(buildPayoutStatementViewModel(source({ bank: null })).bank).toBeNull();
  });

  test("falls back to a usable vendor name when the relation is missing", () => {
    expect(buildPayoutStatementViewModel(source({ vendor: null })).vendorName).toBe("Vendor");
    expect(
      buildPayoutStatementViewModel(source({ vendor: { business_name: null, name: "B-Living" } }))
        .vendorName,
    ).toBe("B-Living");
  });

  test("renders adjustment rows with direction", () => {
    const vm = buildPayoutStatementViewModel(
      source({
        adjustments: [
          { created_at: new Date("2026-07-20T00:00:00Z"), amount_fils: -1500, reason: "Clawback" },
          { created_at: new Date("2026-07-21T00:00:00Z"), amount_fils: 800, reason: "Goodwill" },
        ],
      }),
    );
    expect(vm.adjustments[0]).toMatchObject({
      amount: "AED 15.00",
      isDeduction: true,
      reason: "Clawback",
    });
    expect(vm.adjustments[1]).toMatchObject({ amount: "AED 8.00", isDeduction: false });
  });
});

describe("payoutStatementFilename", () => {
  test("builds a predictable filename from the reference", () => {
    expect(payoutStatementFilename("PAY-2026-000004")).toBe("payout-statement-PAY-2026-000004.pdf");
  });

  test("strips anything that could break the Content-Disposition header", () => {
    expect(payoutStatementFilename('PAY/2026"; rm -rf')).toBe(
      "payout-statement-PAY-2026---rm--rf.pdf",
    );
  });
});
