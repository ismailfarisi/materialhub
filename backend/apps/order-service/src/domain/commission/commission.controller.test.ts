// commission.controller.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CommissionController } from "./commission.controller.ts";

/**
 * carrier_cost_total is the platform's own shipping cost basis. After this
 * branch it reads a real, non-zero figure (previously always 0), so leaking
 * it on a vendor-authenticated response would let any vendor read the
 * platform's exact per-shipment margin off shipping_contribution_total
 * (what they were charged) vs carrier_cost_total (what it cost the
 * platform) in the same payload. The product decision is: vendors never see
 * it, admins still do.
 */
describe("CommissionController — carrier_cost_total vendor-facing projection", () => {
  let payoutService: any;
  let commissionService: any;
  let controller: CommissionController;

  const FULL_TOTALS = {
    gross_amount: 10_500,
    vat_total: 500,
    commission_total: 1_000,
    adjustment_total: 0,
    carrier_cost_total: 2_600,
    shipping_contribution_total: 500,
    license_spend_total: 0,
    net_amount: 8_000,
    pending_count: 1,
    commission_ids: ["c1"],
    adjustment_ids: [],
    license_hold_ids: [],
  };

  const FULL_PAYOUT = {
    id: "po1",
    vendor_id: "v1",
    gross_amount: 10_500,
    commission_total: 1_000,
    carrier_cost_total: 2_600,
    shipping_contribution_total: 500,
    net_amount: 8_000,
    status: "paid",
  };

  beforeEach(() => {
    commissionService = {};
    payoutService = {
      estimateForVendor: mock(() => Promise.resolve({ ...FULL_TOTALS })),
      listForVendor: mock(() => Promise.resolve({ data: [{ ...FULL_PAYOUT }], total: 1 })),
    };
    controller = new CommissionController(commissionService, payoutService);
  });

  it("GET /vendors/me/payouts/estimate strips carrier_cost_total but keeps every other field", async () => {
    const result: any = await controller.estimatePayout("v1");

    expect(result).not.toHaveProperty("carrier_cost_total");
    // Nothing else about the shape moved — same set of keys minus the one.
    const { carrier_cost_total, ...expectedRest } = FULL_TOTALS;
    expect(result).toEqual(expectedRest);
  });

  it("GET /vendors/me/payouts strips carrier_cost_total from every payout in the list", async () => {
    const result: any = await controller.listVendorPayouts("v1", { page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty("carrier_cost_total");
    const { carrier_cost_total, ...expectedRest } = FULL_PAYOUT;
    expect(result.data[0]).toEqual(expectedRest);
  });

  it("does not mutate the object PayoutService returned", async () => {
    await controller.estimatePayout("v1");
    // computePayoutTotals' return type/shape is untouched at the service
    // layer — only the controller's HTTP-facing projection strips the field.
    const raw = await payoutService.estimateForVendor("v1");
    expect(raw).toHaveProperty("carrier_cost_total", 2_600);
  });
});

/**
 * Same PayoutService, admin-facing controller: carrier_cost_total must
 * survive untouched. AdminPayoutController never calls the vendor
 * projection helper, so this pins that the two controllers genuinely
 * diverge rather than both stripping (or both leaking) the field.
 */
describe("AdminPayoutController — carrier_cost_total is preserved", () => {
  it("estimate() returns carrier_cost_total for the admin dashboard", async () => {
    const { AdminPayoutController } = await import("./admin-payout.controller.ts");
    const payoutService: any = {
      estimateForVendor: mock(() =>
        Promise.resolve({ carrier_cost_total: 2_600, net_amount: 8_000 }),
      ),
      hasPrimaryBankAccount: mock(() => Promise.resolve(true)),
    };
    const controller = new AdminPayoutController(payoutService, {} as any, {} as any, {} as any);

    const result: any = await controller.estimate("v1");
    expect(result).toHaveProperty("carrier_cost_total", 2_600);
  });

  it("get() returns the full payout, carrier_cost_total included", async () => {
    const { AdminPayoutController } = await import("./admin-payout.controller.ts");
    const payoutService: any = {
      findByIdWithVendor: mock(() =>
        Promise.resolve({ id: "po1", carrier_cost_total: 2_600, net_amount: 8_000 }),
      ),
    };
    const controller = new AdminPayoutController(payoutService, {} as any, {} as any, {} as any);

    const result: any = await controller.get("po1");
    expect(result).toHaveProperty("carrier_cost_total", 2_600);
  });
});
