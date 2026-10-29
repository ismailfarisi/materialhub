import { describe, expect, it, mock } from "bun:test";
import { CommissionSnapshotService } from "./commission-snapshot.service.ts";

/**
 * R4-I6 — booking commissions are the THIRD path that produces a commission
 * amount, and the one the shared ceiling had never been applied to. They flow
 * through the same payout pipeline as order commissions (order-service's
 * createForBookingInTx inserts the row, the settlement job matures it,
 * computePayoutTotals pays it), so an uncapped fixed fee at or above the net
 * stored a NEGATIVE `vendor_earning` that subtracts from every other
 * commission in that vendor's payout.
 */
describe("CommissionSnapshotService — the shared commission ceiling", () => {
  function makeService(vendor: any, category: any = null, globalRate = "10") {
    const vendorRepo = { findOne: mock(() => Promise.resolve(vendor)) } as any;
    const categoryRepo = { findOne: mock(() => Promise.resolve(category)) } as any;
    const siteSettingRepo = {
      findOne: mock(() => Promise.resolve({ value: globalRate })),
    } as any;
    return new CommissionSnapshotService(vendorRepo, categoryRepo, siteSettingRepo);
  }

  it("caps a fixed fee at or above the net so the vendor earning can never go negative", async () => {
    // The reviewers' exact case: commission_type 'fixed', commission_value
    // 1200, booking net 1,000 fils. Uncapped this returned 1,000, which
    // order-service turned into tax 50 and vendor_earning -50.
    const service = makeService({
      id: "v1",
      commission_type: "fixed",
      commission_value: 1200,
    });

    const result = await service.resolve({
      vendorId: "v1",
      categoryId: null,
      netAmountFils: 1000,
    });

    expect(String(result.type)).toBe("fixed");
    expect(result.amountFils).toBe(952); // floor(1000 / 1.05)
    // What order-service will then store:
    const tax = Math.round(result.amountFils * 0.05);
    expect(1000 - result.amountFils - tax).toBeGreaterThanOrEqual(0);
  });

  it("leaves an ordinary percentage commission untouched", async () => {
    const service = makeService({
      id: "v1",
      commission_type: "percentage",
      commission_value: 12.5,
    });

    const result = await service.resolve({
      vendorId: "v1",
      categoryId: null,
      netAmountFils: 10_000,
    });

    expect(result.amountFils).toBe(1250);
  });

  it("leaves a fixed fee comfortably below the ceiling untouched", async () => {
    const service = makeService({
      id: "v1",
      commission_type: "fixed",
      commission_value: 300,
    });

    const result = await service.resolve({
      vendorId: "v1",
      categoryId: null,
      netAmountFils: 10_000,
    });

    expect(result.amountFils).toBe(300);
  });
});
