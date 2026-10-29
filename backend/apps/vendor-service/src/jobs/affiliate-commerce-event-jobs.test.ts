import { describe, expect, it, mock } from "bun:test";
import { AffiliateCommerceEventJobs } from "./affiliate-commerce-event-jobs.ts";

function makeJobs() {
  const commissionService = {
    snapshotForOrder: mock(async () => []),
    setEligibility: mock(async () => {}),
    voidPendingForOrder: mock(async () => {}),
  } as any;
  return {
    jobs: new AffiliateCommerceEventJobs("redis://x", commissionService),
    commissionService,
  };
}

describe("AffiliateCommerceEventJobs.handle", () => {
  it("no-ops when orderId is missing", async () => {
    const { jobs, commissionService } = makeJobs();
    await jobs.handle({ name: "snapshotAffiliateCommissions", data: {} as any });
    expect(commissionService.snapshotForOrder).not.toHaveBeenCalled();
  });
  it("dispatches snapshot", async () => {
    const { jobs, commissionService } = makeJobs();
    await jobs.handle({ name: "snapshotAffiliateCommissions", data: { orderId: "o1" } });
    expect(commissionService.snapshotForOrder).toHaveBeenCalledWith("o1");
  });
  it("dispatches void on refund", async () => {
    const { jobs, commissionService } = makeJobs();
    await jobs.handle({ name: "voidAffiliateCommissions", data: { orderId: "o3" } });
    expect(commissionService.voidPendingForOrder).toHaveBeenCalledWith("o3", "order_refunded");
  });
  it("ignores unknown job names", async () => {
    const { jobs, commissionService } = makeJobs();
    await jobs.handle({ name: "nope" as any, data: { orderId: "o1" } });
    expect(commissionService.snapshotForOrder).not.toHaveBeenCalled();
  });
});
