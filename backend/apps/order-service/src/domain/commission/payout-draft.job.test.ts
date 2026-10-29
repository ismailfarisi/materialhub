import { describe, expect, it, mock } from "bun:test";
import { runPayoutDraftGeneration, schedulePayoutDraftGeneration } from "./payout-draft.job.ts";

describe("schedulePayoutDraftGeneration", () => {
  it("schedules draft generation daily at 02:30", async () => {
    const queue = {
      upsertJobScheduler: mock(async () => undefined),
    };

    await schedulePayoutDraftGeneration(queue as any);

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      "generate-payout-drafts",
      { pattern: "30 2 * * *" },
      { name: "generate-payout-drafts" },
    );
  });
});

describe("runPayoutDraftGeneration", () => {
  // R4-I4: the job now goes through PayoutService.executeCreateAndAudit
  // instead of createDraft directly, so every failed generation leaves a
  // `payout.draft_creation_failed` audit row instead of only a console.warn
  // on a box nobody reads. `writeAudit` is used for the schedule-level
  // refusals the job decides itself and which never reach the service.
  const writeAudit = mock(async () => undefined);

  it("drafts only for vendors whose period closed today, and never throws on one bad vendor", async () => {
    const executeCreateAndAudit = mock(async ({ vendorId }: any) => {
      if (vendorId === "v2") throw new Error("no primary bank account");
      return { id: `draft-${vendorId}` };
    });
    const vendorRepo = {
      find: async () => [
        { id: "v1", payout_schedule: "weekly" },
        { id: "v2", payout_schedule: "weekly" },
        { id: "v3", payout_schedule: "monthly" },
      ],
    } as any;

    const result = await runPayoutDraftGeneration({
      vendorRepo,
      payoutService: { executeCreateAndAudit, writeAudit } as any,
      now: () => new Date("2026-07-20T02:00:00Z"), // a Monday
    });

    expect(result.drafted).toBe(1); // v1 only; v2 failed, v3 not due
    expect(result.skipped).toBe(2);
    expect(executeCreateAndAudit).toHaveBeenCalledTimes(2);
    expect((executeCreateAndAudit as any).mock.calls[0][0]).toMatchObject({
      adminUserId: null,
      force: false,
    });
  });

  // Load-bearing for the idempotency claim, exercising the REAL mechanism:
  // there is no duplicate-period guard on this path (that lie lived in
  // payout-period.ts's docstring and here, and is now corrected in both).
  // What actually makes a same-day rerun a no-op is that the first run's
  // createDraft claimed every payable commission for the period, so the
  // second run's computePayoutTotals finds nothing left unclaimed and
  // createDraft returns null — a silent skip, not a thrown rejection. A
  // fake mock that throws PAYOUT_DUPLICATE on the second call (the old
  // version of this test) proves nothing about the real createDraft, which
  // never throws in this scenario.
  it("does not create a second draft when run twice on the same closing day, because the first run left nothing claimable", async () => {
    let calls = 0;
    const executeCreateAndAudit = mock(async () => {
      calls += 1;
      // Real createDraft's behaviour when computePayoutTotals finds
      // pending_count === 0 (see payout.service.ts): return null, don't throw.
      if (calls === 1) return { id: "draft-v1" };
      return null;
    });
    const vendorRepo = {
      find: async () => [{ id: "v1", payout_schedule: "weekly" }],
    } as any;
    const now = () => new Date("2026-07-20T02:00:00Z"); // a Monday

    const first = await runPayoutDraftGeneration({
      vendorRepo,
      payoutService: { executeCreateAndAudit, writeAudit } as any,
      now,
    });
    const second = await runPayoutDraftGeneration({
      vendorRepo,
      payoutService: { executeCreateAndAudit, writeAudit } as any,
      now,
    });

    expect(first.drafted).toBe(1);
    expect(second.drafted).toBe(0);
    expect(second.skipped).toBe(1);
    expect(executeCreateAndAudit).toHaveBeenCalledTimes(2);
  });

  // R4-I4: the job used to swallow every per-vendor failure into a
  // console.warn and call createDraft directly, so an asynchronous generation
  // failure left NO trace an operator could find: no payout row, and the
  // manual path's `payout.draft_creation_failed` audit row was written with
  // entity_id null while the only reader filters by entity id. "Vendor X
  // hasn't been paid for three cycles" was not diagnosable from the admin
  // panel at all.
  it("R4-I4: routes generation through executeCreateAndAudit so every failure is audited", async () => {
    const executeCreateAndAudit = mock(async () => {
      throw new Error("Vendor has no primary bank account; cannot generate payout");
    });
    const vendorRepo = {
      find: async () => [{ id: "v1", payout_schedule: "weekly" }],
    } as any;

    const result = await runPayoutDraftGeneration({
      vendorRepo,
      payoutService: { executeCreateAndAudit, writeAudit } as any,
      now: () => new Date("2026-07-20T02:00:00Z"), // a Monday
    });

    expect(executeCreateAndAudit).toHaveBeenCalledTimes(1);
    expect(result.drafted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("R4-I4/MINOR: audits a vendor whose payout_schedule no schedule math understands", async () => {
    const executeCreateAndAudit = mock(async () => ({ id: "d1" }) as any);
    const audits: any[] = [];
    const localWriteAudit = mock(async (entry: any) => {
      audits.push(entry);
    });
    const vendorRepo = {
      find: async () => [{ id: "v-broken", payout_schedule: "fortnightly-ish" }],
    } as any;

    const result = await runPayoutDraftGeneration({
      vendorRepo,
      payoutService: { executeCreateAndAudit, writeAudit: localWriteAudit } as any,
      now: () => new Date("2026-07-20T02:00:00Z"),
    });

    expect(executeCreateAndAudit).not.toHaveBeenCalled();
    expect(result.drafted).toBe(0);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("payout.draft_creation_failed");
    expect(audits[0].entity_type).toBe("vendor");
    expect(audits[0].entity_id).toBe("v-broken");
  });

  it("MINOR: a daily-schedule vendor is drafted every day instead of being skipped forever", async () => {
    const executeCreateAndAudit = mock(async () => ({ id: "draft-daily" }) as any);
    const vendorRepo = {
      find: async () => [{ id: "v-daily", payout_schedule: "daily" }],
    } as any;

    const result = await runPayoutDraftGeneration({
      vendorRepo,
      payoutService: { executeCreateAndAudit, writeAudit } as any,
      now: () => new Date("2026-07-22T02:00:00Z"), // a Wednesday: no other schedule closes
    });

    expect(result.drafted).toBe(1);
    expect((executeCreateAndAudit as any).mock.calls[0][0]).toMatchObject({
      periodStart: "2026-07-21",
      periodEnd: "2026-07-21",
    });
  });

  // The genuine race this codebase actually guards against (two concurrent
  // createDraft calls for the same vendor+period) is a database-level
  // concern — see PayoutService.createDraft's conditional claim and the
  // partial unique index on vendor_payouts — not something the job loop
  // itself can detect. This test only proves the job treats that failure
  // mode (a thrown PAYOUT_DUPLICATE, or a rolled-back concurrent-claim
  // error) as a benign per-vendor skip rather than aborting the whole run.
  it("treats a genuine concurrent-draft rejection from createDraft as a benign skip, not a run-stopping failure", async () => {
    const executeCreateAndAudit = mock(async () => {
      const err: any = new Error("A payout for this vendor and period already exists");
      err.code = "PAYOUT_DUPLICATE";
      throw err;
    });
    const vendorRepo = {
      find: async () => [{ id: "v1", payout_schedule: "weekly" }],
    } as any;

    const result = await runPayoutDraftGeneration({
      vendorRepo,
      payoutService: { executeCreateAndAudit, writeAudit } as any,
      now: () => new Date("2026-07-20T02:00:00Z"), // a Monday
    });

    expect(result.drafted).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
