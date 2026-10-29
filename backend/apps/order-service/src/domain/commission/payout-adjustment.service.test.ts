// payout-adjustment.service.test.ts
import { describe, expect, it, mock } from "bun:test";
import { PayoutAdjustmentService } from "./payout-adjustment.service.ts";

function make() {
  const saved: any[] = [];
  const findArgs: any[] = [];
  const adjustmentRepo: any = {
    create: mock((data: any) => data),
    save: mock((data: any) => {
      const row = { id: `adj-${saved.length + 1}`, created_at: new Date(), ...data };
      saved.push(row);
      return Promise.resolve(row);
    }),
    findAndCount: mock((args: any) => {
      findArgs.push(args);
      return Promise.resolve([[], 0]);
    }),
    find: mock((args: any) => {
      findArgs.push(args);
      return Promise.resolve([]);
    }),
  };
  const svc = new PayoutAdjustmentService(adjustmentRepo);
  return { svc, adjustmentRepo, saved, findArgs };
}

describe("PayoutAdjustmentService", () => {
  it("creates a manual adjustment attributed to the admin", async () => {
    const { svc, saved } = make();
    await svc.create({
      vendorId: "v1",
      amountFils: -5_000,
      reason: "goodwill",
      adminUserId: "admin-1",
    });
    expect(saved[0]).toMatchObject({
      vendor_id: "v1",
      amount_fils: -5_000,
      reason: "goodwill",
      source_type: "manual",
      created_by: "admin-1",
    });
  });

  it("rejects a zero amount", async () => {
    const { svc } = make();
    await expect(
      svc.create({ vendorId: "v1", amountFils: 0, reason: "x", adminUserId: "a1" }),
    ).rejects.toThrow(/non-zero/i);
  });

  it("lists only unsettled adjustments when asked", async () => {
    const { svc, findArgs } = make();
    await svc.listForVendor("v1", { page: 1, limit: 20, unsettledOnly: true });
    expect(findArgs[0].where.settled_payout_id).toBeDefined(); // IsNull()
  });
});
