// commission-reversal.service.test.ts
import { describe, expect, it, mock } from "bun:test";
import { CommissionReversalService } from "./commission-reversal.service.ts";
import { decideUnreleasableClaim } from "./unreleasable-claim.ts";

/* ------------------------------------------------------------------ */
/*  Mocked EntityManager harness                                      */
/* ------------------------------------------------------------------ */
// `mgr` is shared across `it` blocks the same way the brief's test cases
// reference it directly (no local declaration inside each `it`): `make()`
// rebuilds it as a side effect before each call to `svc.reverseForItems`.
let mgr: any;

function make(opts: {
  orderItem: any;
  commission: any;
  /** C1: controls what the mocked PayoutService reports for a draft-claim release. */
  invalidateResult?: { invalidated: boolean; payoutStatus: string };
}) {
  // Seed `saved.commission` from the input so the "paid" case — where the
  // commission is deliberately never re-saved — still reflects the
  // untouched original row rather than `null`.
  const saved: { commission: any; adjustments: any[] } = {
    commission: opts.commission ? { ...opts.commission } : null,
    adjustments: [],
  };

  const commissionRepo = {
    findOne: mock(() => Promise.resolve(opts.commission ? { ...opts.commission } : null)),
    save: mock((c: any) => {
      saved.commission = c;
      return Promise.resolve(c);
    }),
  };

  const orderItemRepo = {
    findOne: mock(() => Promise.resolve(opts.orderItem ? { ...opts.orderItem } : null)),
  };

  const adjustmentRepo = {
    create: mock((data: any) => ({ ...data })),
    save: mock((a: any) => {
      saved.adjustments.push(a);
      return Promise.resolve(a);
    }),
  };

  mgr = {
    getRepository: mock((entity: any) => {
      const name = typeof entity === "string" ? entity : entity?.name;
      if (name === "OrderItem") return orderItemRepo;
      if (name === "VendorPayoutAdjustment") return adjustmentRepo;
      return commissionRepo;
    }),
  };

  const invalidateDraftForReversal = mock(() =>
    Promise.resolve(opts.invalidateResult ?? { invalidated: true, payoutStatus: "pending" }),
  );
  const writeAudit = mock((_input?: any) => Promise.resolve());

  // R3-C2/C4/I4: the shared unreleasable-claim sink. The decision itself
  // (money left the platform? amount? zero-skip?) is NOT re-implemented here —
  // it is imported from the same pure module PayoutService.recordUnreleasableClaim
  // uses, so this stand-in can never drift from production behaviour. Only the
  // two writes are faked.
  const recordUnreleasableClaim = mock((_mgr: any, input: any) => {
    const decision = decideUnreleasableClaim({
      payoutStatus: input.payoutStatus,
      clawbackAmount: input.clawbackAmount,
    });
    if (decision.writeAdjustment) {
      saved.adjustments.push({
        vendor_id: input.vendorId,
        amount_fils: -decision.amount,
        reason: input.reason,
        source_type: input.sourceType,
        source_id: input.sourceId,
      });
    }
    return writeAudit({
      action: "commission_reversal.unreleasable_claim",
      actor_id: null,
      actor_role: "system",
      entity_id: input.commissionId,
      metadata: {
        payout_id: input.payoutId,
        payout_status: input.payoutStatus,
        source_type: input.sourceType,
        source_id: input.sourceId,
        clawback_amount: decision.amount,
        clawback_written: decision.writeAdjustment,
        money_left_the_platform: decision.moneyLeftThePlatform,
      },
    }).then(() => ({
      clawedBack: decision.writeAdjustment,
      amount: decision.amount,
      moneyLeftThePlatform: decision.moneyLeftThePlatform,
    }));
  });

  const draftInvalidator = { invalidateDraftForReversal, writeAudit, recordUnreleasableClaim };

  const svc = new CommissionReversalService(draftInvalidator as any);
  return { svc, saved, invalidateDraftForReversal, writeAudit, recordUnreleasableClaim };
}

describe("CommissionReversalService", () => {
  it("recomputes a held commission on the surviving quantity", async () => {
    const { svc, saved } = make({
      orderItem: {
        id: "oi1",
        quantity: 3,
        refunded_quantity: 1,
        line_total: 31_500,
        refunded_amount: 10_500,
      },
      commission: { id: "c1", status: "held", commission_type: "percentage", commission_rate: 10 },
    });

    const r = await svc.reverseForItems(mgr, {
      items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_500 }],
      sourceType: "return",
      sourceId: "ret1",
      reason: "customer return",
    });

    expect(r.recomputed).toBe(1);
    expect(saved.commission.item_total).toBe(21_000);
    expect(saved.commission.status).toBe("held");
    expect(saved.adjustments).toHaveLength(0);
  });

  it("cancels the commission when the whole line is refunded", async () => {
    const { svc, saved } = make({
      orderItem: {
        id: "oi1",
        quantity: 2,
        refunded_quantity: 2,
        line_total: 21_000,
        refunded_amount: 21_000,
      },
      commission: {
        id: "c1",
        status: "pending",
        commission_type: "percentage",
        commission_rate: 10,
      },
    });

    const r = await svc.reverseForItems(mgr, {
      items: [{ orderItemId: "oi1", refundedQuantity: 2, refundedAmount: 21_000 }],
      sourceType: "return",
      sourceId: "ret1",
      reason: "customer return",
    });

    expect(r.cancelled).toBe(1);
    expect(saved.commission.status).toBe("cancelled");
  });

  it("is a no-op for an order item with no commission row", async () => {
    const { svc } = make({ orderItem: { id: "oi1", quantity: 1 }, commission: null });
    const r = await svc.reverseForItems(mgr, {
      items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_500 }],
      sourceType: "dispute",
      sourceId: "d1",
      reason: "chargeback",
    });
    expect(r).toEqual({ recomputed: 0, cancelled: 0, clawedBack: 0 });
  });

  /* ================================================================ */
  /*  C2 — proportional clawback on an already-paid commission        */
  /* ================================================================ */
  describe("C2 — paid commission clawback is proportional", () => {
    it("writes a negative adjustment instead of mutating an already-paid commission", async () => {
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 1,
          line_total: 10_500,
          refunded_amount: 10_500,
        },
        commission: {
          id: "c1",
          status: "paid",
          vendor_id: "v1",
          vendor_earning: 8_950,
          commission_type: "percentage",
          commission_rate: 10,
        },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_500 }],
        sourceType: "return",
        sourceId: "ret1",
        reason: "customer return",
      });

      expect(r.clawedBack).toBe(1);
      expect(saved.commission.status).toBe("paid"); // untouched — immutable once paid
      expect(saved.adjustments[0]).toMatchObject({
        vendor_id: "v1",
        amount_fils: -8_950,
        source_type: "return",
        source_id: "ret1",
      });
    });

    it("claws back only the proportional share for a partial refund, not the full earning", async () => {
      // 3-unit line, line_total 30_000, commission_rate 10%, full-line
      // vendor_earning 25_571 (round(30000/1.05)=28571; commission
      // round(28571*.1)=2857; tax round(2857*.05)=143; 28571-2857-143=25571).
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 3,
          refunded_quantity: 1,
          line_total: 30_000,
          refunded_amount: 10_000, // 1 of 3 units cancelled
        },
        commission: {
          id: "c1",
          status: "paid",
          vendor_id: "v1",
          vendor_earning: 25_571,
          commission_type: "percentage",
          commission_rate: 10,
        },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_000 }],
        sourceType: "item_cancellation",
        sourceId: "canc1",
        reason: "out of stock",
      });

      // surviving line_total 20_000: netExVat=round(20000/1.05)=19048,
      // commission=round(19048*.1)=1905, tax=round(1905*.05)=95,
      // surviving vendor_earning=19048-1905-95=17048.
      // clawback = 25571 - 17048 = 8523 — an exact integer, and nowhere
      // near the full 25_571 the pre-fix code would have written.
      expect(r.clawedBack).toBe(1);
      expect(saved.adjustments[0]).toMatchObject({
        vendor_id: "v1",
        amount_fils: -8_523,
      });
    });

    it("a full refund on a paid commission still claws back the entire earning", async () => {
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 3,
          refunded_quantity: 3,
          line_total: 30_000,
          refunded_amount: 30_000, // all 3 units cancelled
        },
        commission: {
          id: "c1",
          status: "paid",
          vendor_id: "v1",
          vendor_earning: 25_571,
          commission_type: "percentage",
          commission_rate: 10,
        },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 3, refundedAmount: 30_000 }],
        sourceType: "item_cancellation",
        sourceId: "canc1",
        reason: "out of stock",
      });

      expect(r.clawedBack).toBe(1);
      expect(saved.adjustments[0]).toMatchObject({
        vendor_id: "v1",
        amount_fils: -25_571,
      });
    });
  });

  /* ================================================================ */
  /*  C1 — releasing a claimed commission invalidates the draft        */
  /* ================================================================ */
  describe("C1 — draft-claim release", () => {
    it("releases a draft-claimed commission and invalidates the pending draft that claimed it", async () => {
      const { svc, saved, invalidateDraftForReversal } = make({
        orderItem: {
          id: "oi1",
          quantity: 2,
          refunded_quantity: 1,
          line_total: 21_000,
          refunded_amount: 10_500,
        },
        commission: {
          id: "c1",
          status: "pending",
          payout_id: "draft-1",
          commission_type: "percentage",
          commission_rate: 10,
        },
        invalidateResult: { invalidated: true, payoutStatus: "pending" },
      });

      await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_500 }],
        sourceType: "return",
        sourceId: "ret1",
        reason: "customer return",
      });

      expect(invalidateDraftForReversal).toHaveBeenCalledWith(
        mgr,
        "draft-1",
        expect.stringContaining("ret1"),
      );
      // The commission is released back to the pool AND recomputed — the
      // draft that claimed it was invalidated, so the next scheduled draft
      // rebuilds from current (corrected) figures.
      expect(saved.commission.payout_id).toBeNull();
      expect(saved.commission.item_total).toBe(10_500);
    });

    it("does NOT release a commission claimed by a processing payout — leaves it claimed but writes a compensating adjustment and audit row", async () => {
      // IMPORTANT B: an unreleasable claim used to be a silent discard (bare
      // console.error, no ledger trace). It must now behave like the
      // already-paid branch: a negative adjustment for the delta this event
      // introduces, plus an audit row — the commission itself stays
      // claimed (still 'pending', payout_id untouched) for manual
      // resolution once the payout settles.
      const { svc, saved, invalidateDraftForReversal, writeAudit } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 1,
          line_total: 10_500,
          refunded_amount: 10_500,
        },
        commission: {
          id: "c1",
          status: "pending",
          vendor_id: "v1",
          payout_id: "payout-1",
          vendor_earning: 8_950,
          commission_type: "percentage",
          commission_rate: 10,
        },
        invalidateResult: { invalidated: false, payoutStatus: "processing" },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_500 }],
        sourceType: "return",
        sourceId: "ret1",
        reason: "customer return",
      });

      expect(invalidateDraftForReversal).toHaveBeenCalledWith(mgr, "payout-1", expect.any(String));
      // Nothing was mutated or persisted on the commission row itself: still
      // claimed, still un-recomputed. commissionRepo.save was never called
      // for it.
      expect(saved.commission.payout_id).toBe("payout-1");
      expect(saved.commission.item_total).toBeUndefined();
      expect(r.recomputed).toBe(0);
      expect(r.cancelled).toBe(0);
      expect(r.clawedBack).toBe(1);
      // Full refund of a qty-1-of-2 line's first (and only, so far) unit —
      // same math as the C2 "writes a negative adjustment" paid-branch test.
      expect(saved.adjustments[0]).toMatchObject({
        vendor_id: "v1",
        amount_fils: -8_950,
        source_type: "return",
        source_id: "ret1",
      });
      expect(writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "commission_reversal.unreleasable_claim",
          entity_id: "c1",
          metadata: expect.objectContaining({
            payout_id: "payout-1",
            payout_status: "processing",
            clawback_amount: 8_950,
          }),
        }),
      );
    });

    it("R3-I4: a claim held by a FAILED payout is never clawed back — no money ever left", async () => {
      // CHANGED DELIBERATELY. This test previously asserted a -8_950
      // adjustment for a `failed` payout ("same compensating trail"), which
      // encoded round-3 IMPORTANT 4: `failed` means stripe.transfers.create
      // THREW and nothing was sent. Charging the vendor there takes the same
      // 8_950 off them twice — once by never paying the failed payout, once
      // by the adjustment. The reversal is not discarded either: the
      // commission is recomputed/cancelled in place while keeping
      // `payout_id`, so the drift is exactly what the payout's own
      // pre-transfer reconciliation now refuses to transfer against.
      const { svc, saved, writeAudit } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 1,
          line_total: 10_500,
          refunded_amount: 10_500,
        },
        commission: {
          id: "c1",
          status: "pending",
          vendor_id: "v1",
          payout_id: "payout-2",
          vendor_earning: 8_950,
          commission_type: "percentage",
          commission_rate: 10,
        },
        invalidateResult: { invalidated: false, payoutStatus: "failed" },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_500 }],
        sourceType: "dispute",
        sourceId: "d1",
        reason: "chargeback",
      });

      expect(saved.adjustments).toHaveLength(0);
      expect(r.clawedBack).toBe(0);
      // Still claimed (the payout may yet be resolved by a human) but the
      // figures are now current, so `total_pending_fils` stops overstating.
      expect(saved.commission.payout_id).toBe("payout-2");
      expect(saved.commission.status).toBe("cancelled");
      expect(r.cancelled).toBe(1);
      expect(writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "commission_reversal.unreleasable_claim",
          metadata: expect.objectContaining({
            payout_status: "failed",
            clawback_written: false,
            money_left_the_platform: false,
          }),
        }),
      );
    });

    it("R3-C5: a claim on a SOFT-DELETED draft (status reads 'pending') writes no negative clawback", async () => {
      // The compounding case: an untransacted invalidation soft-deleted the
      // draft but never released its commissions. Re-running the reversal
      // loses the CAS (deleted_at IS NOT NULL) while the withDeleted status
      // read still says 'pending' — no money was ever sent for that draft, so
      // a clawback here would be pure invention.
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 1,
          line_total: 10_500,
          refunded_amount: 10_500,
        },
        commission: {
          id: "c1",
          status: "pending",
          vendor_id: "v1",
          payout_id: "payout-3",
          vendor_earning: 8_950,
          commission_type: "percentage",
          commission_rate: 10,
        },
        invalidateResult: { invalidated: false, payoutStatus: "pending" },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_500 }],
        sourceType: "return",
        sourceId: "ret9",
        reason: "customer return",
      });

      expect(saved.adjustments).toHaveLength(0);
      expect(r.clawedBack).toBe(0);
    });
  });

  /* ================================================================ */
  /*  R3-C4 — a zero-fils clawback must never be saved                 */
  /* ================================================================ */
  describe("R4-I6 — a legacy NEGATIVE vendor_earning is a zero baseline, not an absolute one", () => {
    // Rows written before the shared commission ceiling existed can carry a
    // negative `vendor_earning` (an uncapped fixed fee at or above the net
    // stored `-round(0.05 * commission)`), and there is no backfill for
    // them. `Math.abs` turned a stored -50 into a +50 clawback: charging the
    // vendor for money the ledger itself says they were never paid.
    it("a fully-refunded PAID commission whose stored earning is -50 claws back nothing", async () => {
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 1,
          line_total: 1_050,
          refunded_amount: 1_050,
        },
        commission: {
          id: "c-legacy",
          status: "paid",
          vendor_id: "v1",
          vendor_earning: -50,
          commission_type: "fixed",
          commission_rate: 1_200,
        },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 1_050 }],
        sourceType: "return",
        sourceId: "r-legacy",
        reason: "returned",
      });

      expect(saved.adjustments).toHaveLength(0);
      expect(r.clawedBack).toBe(0);
    });
  });

  describe("R3-C4 — zero-delta clawbacks are skipped, not saved", () => {
    // `vendor_payout_adjustments` carries CHECK (amount_fils <> 0). A 23514
    // here lands AFTER the customer's Stripe/BNPL refund has already gone
    // out, and (being deterministic) fails identically on every retry.

    it("a return line with refund_amount 0 against a PAID commission writes no adjustment", async () => {
      // return.service.ts persists `ri.refund_amount || 0` — the column is
      // nullable, so a 0/NULL refund line is ordinary input.
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 1,
          line_total: 10_500,
          refunded_amount: 0,
        },
        commission: {
          id: "c1",
          status: "paid",
          vendor_id: "v1",
          vendor_earning: 8_950,
          commission_type: "percentage",
          commission_rate: 10,
        },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 0 }],
        sourceType: "return",
        sourceId: "ret1",
        reason: "customer return",
      });

      expect(saved.adjustments).toHaveLength(0);
      expect(r.clawedBack).toBe(0);
    });

    it("a 1-fil dispute share whose rounded earning is unchanged writes no adjustment", async () => {
      // The finding's exact numbers: line 1_003 at 10% — earning(1003) = 778
      // and earning(1002) = 778, so a 1-fil dispute share is a zero delta.
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 0,
          line_total: 1_003,
          refunded_amount: 1,
        },
        commission: {
          id: "c1",
          status: "paid",
          vendor_id: "v1",
          vendor_earning: 778,
          commission_type: "percentage",
          commission_rate: 10,
        },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 0, refundedAmount: 1 }],
        sourceType: "dispute",
        sourceId: "d1",
        reason: "chargeback",
      });

      expect(saved.adjustments).toHaveLength(0);
      expect(r.clawedBack).toBe(0);
    });

    it("a zero-delta clawback against a PROCESSING payout writes no adjustment either", async () => {
      // The structurally identical sibling of the paid branch above — the
      // unreleasable-claim branch. Same zero, same CHECK, same 500.
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 1,
          refunded_quantity: 0,
          line_total: 1_003,
          refunded_amount: 1,
        },
        commission: {
          id: "c1",
          status: "pending",
          vendor_id: "v1",
          payout_id: "payout-1",
          vendor_earning: 778,
          commission_type: "percentage",
          commission_rate: 10,
        },
        invalidateResult: { invalidated: false, payoutStatus: "processing" },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 0, refundedAmount: 1 }],
        sourceType: "dispute",
        sourceId: "d1",
        reason: "chargeback",
      });

      expect(saved.adjustments).toHaveLength(0);
      expect(r.clawedBack).toBe(0);
    });

    it("a fixed-rate line whose second unit yields a zero delta writes no adjustment", async () => {
      // Fixed rate 5_000 on a 2-unit 10_500 line: after MINOR 1's cap the
      // first unit claws 4_749 and the second 1 — but on a line where the
      // fixed commission has already absorbed the whole net, the delta is 0.
      const { svc, saved } = make({
        orderItem: {
          id: "oi1",
          quantity: 2,
          refunded_quantity: 2,
          line_total: 2_100,
          refunded_amount: 2_100,
        },
        commission: {
          id: "c1",
          status: "paid",
          vendor_id: "v1",
          vendor_earning: 0,
          commission_type: "fixed",
          commission_rate: 5_000,
        },
      });

      const r = await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 1_050 }],
        sourceType: "item_cancellation",
        sourceId: "canc1",
        reason: "out of stock",
      });

      expect(saved.adjustments).toHaveLength(0);
      expect(r.clawedBack).toBe(0);
    });
  });

  /* ================================================================ */
  /*  R3-MINOR-1 — fixed-rate clawbacks telescope exactly              */
  /* ================================================================ */
  describe("R3-MINOR-1 — fixed-rate telescoping", () => {
    it("two successive unit returns on a fixed-rate paid commission claw back exactly the original earning, not more", async () => {
      // Fixed rate 5_000 on a 2-unit 10_500 line. Original earning 4_750
      // (net 10_000 - commission 5_000 - tax 250). Before the cap fix,
      // event 1 clawed 5_000 and event 2 clawed 0 (a negative delta clamped
      // to 0) — 5_000 total, a 250-fil OVER-CLAW.
      const orderItem: any = {
        id: "oi1",
        quantity: 2,
        refunded_quantity: 1,
        line_total: 10_500,
        refunded_amount: 5_250,
      };
      const commission = {
        id: "c1",
        status: "paid",
        vendor_id: "v1",
        vendor_earning: 4_750,
        commission_type: "fixed",
        commission_rate: 5_000,
      };
      const { svc, saved } = make({ orderItem, commission });

      await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 5_250 }],
        sourceType: "return",
        sourceId: "ret1",
        reason: "unit 1",
      });

      orderItem.refunded_quantity = 2;
      orderItem.refunded_amount = 10_500;
      await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 5_250 }],
        sourceType: "return",
        sourceId: "ret2",
        reason: "unit 2",
      });

      const total = saved.adjustments.reduce((sum: number, a: any) => sum + a.amount_fils, 0);
      expect(total).toBe(-4_750);
    });
  });

  /* ================================================================ */
  /*  IMPORTANT A — cumulative clawback on successive partial reversals */
  /* ================================================================ */
  describe("IMPORTANT A — delta clawback across successive partial reversals", () => {
    it("two successive partial reversals on a paid commission net to the correct cumulative clawback, not double", async () => {
      // Same 3-unit, 30_000 line, 10% fixture as the C2 proportional-clawback
      // test, but returned one unit at a time across two separate events.
      const orderItem: any = {
        id: "oi1",
        quantity: 3,
        refunded_quantity: 1,
        line_total: 30_000,
        refunded_amount: 10_000, // event 1: 1 of 3 units
      };
      const commission = {
        id: "c1",
        status: "paid",
        vendor_id: "v1",
        vendor_earning: 25_571,
        commission_type: "percentage",
        commission_rate: 10,
      };
      const { svc, saved } = make({ orderItem, commission });

      // Event 1 — first unit returned. Surviving 20_000: earning 17_048
      // (round(20000/1.05)=19048, commission round(19048*.1)=1905, tax
      // round(1905*.05)=95, 19048-1905-95=17048). Clawback = 25571-17048=8523.
      await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_000 }],
        sourceType: "return",
        sourceId: "ret1",
        reason: "unit 1",
      });
      expect(saved.adjustments[0]).toMatchObject({ amount_fils: -8_523 });

      // Event 2 — second unit returned. `refunded_amount` is now the
      // CUMULATIVE total (10_000 + 10_000), as callers persist it before
      // calling reverseForItems; `refundedAmount` on the item stays this
      // event's own (non-cumulative) contribution.
      orderItem.refunded_quantity = 2;
      orderItem.refunded_amount = 20_000;
      await svc.reverseForItems(mgr, {
        items: [{ orderItemId: "oi1", refundedQuantity: 1, refundedAmount: 10_000 }],
        sourceType: "return",
        sourceId: "ret2",
        reason: "unit 2",
      });

      // Surviving 10_000: earning 8_524 (round(10000/1.05)=9524,
      // commission round(9524*.1)=952, tax round(952*.05)=48,
      // 9524-952-48=8524). Clawback for event 2 = 17048-8524=8524 — NOT
      // 25571-8524=17047 (the pre-fix double-count).
      expect(saved.adjustments[1]).toMatchObject({ amount_fils: -8_524 });

      const total = saved.adjustments.reduce((sum: number, a: any) => sum + a.amount_fils, 0);
      // Cumulative total: original 25_571 minus what's left surviving
      // (8_524) = 17_047 — exactly the two events summed, not
      // double-counted (which would have been -25_570).
      expect(total).toBe(-17_047);
    });
  });
});
