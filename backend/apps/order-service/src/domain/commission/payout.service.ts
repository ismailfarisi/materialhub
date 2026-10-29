import { randomUUID } from "node:crypto";
import {
  AuditLog,
  Commission,
  PayoutRail,
  type PayoutStatus,
  type Vendor,
  type VendorBankAccount,
  type VendorOrder,
  VendorPayout,
  VendorPayoutAdjustment,
} from "@materialhub/database";
import type Stripe from "stripe";
// payout.service.ts
import {
  type EntityManager,
  type FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  type Repository,
} from "typeorm";
import { getPayoutQueue } from "./payout.job.ts";
import { decideUnreleasableClaim } from "./unreleasable-claim.ts";

/**
 * R5-C1 — did this Stripe error tell us the transfer definitely did NOT happen,
 * or does it leave the outcome unknown?
 *
 * Both transfer paths used to `catch (err)` and mark the payout `failed` for
 * ANY throw. That is only correct when Stripe rejected the request. If the
 * request was accepted and the RESPONSE was lost — socket reset, 504, worker
 * killed mid-flight — the transfer exists at Stripe while the row says
 * `failed` with `gateway_reference` NULL, which is precisely the shape every
 * "no transfer exists" guard in this file trusts (`retry()`, `markFailed`,
 * both claim UPDATEs). One admin Retry click then mints a fresh idempotency
 * key (deliberately, so a genuine retry isn't served Stripe's cached failure)
 * and sends `net_amount` a second time. Reconciliation passes — the commission
 * set never changed — and there is no transfer webhook anywhere in this repo
 * to notice afterwards.
 *
 * So: definitive rejections (invalid request, insufficient funds, auth, rate
 * limit — Stripe never created anything) still fail the row and stay
 * retryable. Everything else is treated as UNKNOWN and handled by
 * `handleIndeterminateTransfer`, which leaves the row `processing` for a human
 * rather than laundering it into a retryable `failed`.
 *
 * Deliberately fail-closed: anything unrecognised counts as indeterminate. A
 * false "unknown" costs one manual reconciliation; a false "definitely failed"
 * costs a duplicate transfer that nothing will catch.
 */
const DEFINITIVE_STRIPE_ERROR_TYPES = new Set([
  // Stripe rejected the call outright — no transfer was created.
  "StripeInvalidRequestError",
  "StripeAuthenticationError",
  "StripePermissionError",
  "StripeCardError",
  "StripeRateLimitError",
  "StripeIdempotencyError",
  "invalid_request_error",
  "authentication_error",
  "permission_error",
  "card_error",
  "rate_limit_error",
  "idempotency_error",
]);

export function isIndeterminateStripeError(err: any): boolean {
  // A 5xx from Stripe, or a transport-level failure, means "we don't know".
  const status = err?.statusCode ?? err?.status;
  if (typeof status === "number" && status >= 500) return true;

  const type = err?.type ?? err?.rawType ?? err?.name;
  if (typeof type === "string" && DEFINITIVE_STRIPE_ERROR_TYPES.has(type)) {
    // ...unless the SDK also reports a 5xx, handled above.
    return false;
  }
  return true;
}

export interface PayoutTotals {
  gross_amount: number; // VAT-inclusive
  vat_total: number;
  commission_total: number;
  adjustment_total: number; // signed; includes clawbacks and license spend
  carrier_cost_total: number;
  shipping_contribution_total: number;
  license_spend_total: number;
  net_amount: number; // what will actually be transferred
  pending_count: number;
  commission_ids: string[];
  adjustment_ids: string[];
  license_hold_ids: string[];
}

export class PayoutService {
  constructor(
    private payoutRepo: Repository<VendorPayout>,
    private commissionRepo: Repository<Commission>,
    private stripe: Stripe,
    private vendorOrderRepo: Repository<VendorOrder>,
    private auditLogRepo: Repository<AuditLog>,
    private vendorRepo: Repository<Vendor>,
    private vendorBankAccountRepo: Repository<VendorBankAccount>,
    private adjustmentRepo: Repository<VendorPayoutAdjustment>,
  ) {}

  // DB-based payout reference: PAY-YYYY-NNNNNN backed by the payout_reference_seq
  // sequence. Replaces the old Date.now() % 1000000 generator, which collided
  // roughly every 16.7 minutes.
  async generatePayoutReference(): Promise<string> {
    const [{ nextval }] = await this.payoutRepo.manager.query(
      `SELECT nextval('payout_reference_seq') AS nextval`,
    );
    const year = new Date().getFullYear();
    return `PAY-${year}-${String(nextval).padStart(6, "0")}`;
  }

  /**
   * The single definition of "what does this vendor get paid".
   *
   * Called by the estimate endpoint, the draft generator, and nothing else —
   * the transfer path uses the draft's stored figures, so what an admin
   * approves is exactly what is sent.
   */
  async computePayoutTotals(vendorId: string, periodEnd: string): Promise<PayoutTotals> {
    const commissions = await this.commissionRepo.find({
      where: {
        vendor_id: vendorId,
        status: "pending" as any,
        payout_id: IsNull(),
        settle_after: LessThanOrEqual(new Date(`${periodEnd}T23:59:59.999Z`)),
      } as any,
    });

    const gross_amount = commissions.reduce((s, c: any) => s + (c.item_total || 0), 0);
    const netExVat = commissions.reduce(
      (s, c: any) => s + Math.round((c.item_total || 0) / 1.05),
      0,
    );
    const vat_total = gross_amount - netExVat;
    const commission_total = commissions.reduce((s, c: any) => s + (c.commission_amount || 0), 0);
    const items_net = commissions.reduce((s, c: any) => s + (c.vendor_earning || 0), 0);

    const vendorOrderIds = [...new Set(commissions.map((c: any) => c.vendor_order_id as string))];
    const vendorOrders = vendorOrderIds.length
      ? await this.vendorOrderRepo.find({ where: { id: In(vendorOrderIds) } })
      : [];
    // Informational only — reported on the payout, never deducted from
    // net_amount. Sourced from `shipments`, not `vendor_orders.carrier_cost`:
    // that column carries whatever the carrier adapter reported, and the
    // PostaPlus adapter hardcodes 0 (postaplus.adapter.ts), so it was always
    // zero in production. `shipments.carrier_cost_fils` carries the configured
    // reference rate frozen when each shipment shipped.
    //
    // Per shipment, not per vendor order: a vendor order that ships in two
    // parcels genuinely costs twice, and split shipments are a supported flow
    // (db-design/12-shipment-architecture.md).
    //
    // `deleted_at IS NULL` is explicit because raw SQL bypasses TypeORM's
    // soft-delete filter.
    const carrierRows: Array<{ sum: string }> = vendorOrderIds.length
      ? await this.commissionRepo.manager.query(
          `SELECT COALESCE(SUM(carrier_cost_fils), 0)::bigint AS sum
             FROM shipments
            WHERE vendor_order_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
          [vendorOrderIds],
        )
      : [];
    const carrier_cost_total = Number(carrierRows?.[0]?.sum ?? 0);
    const shipping_contribution_total = vendorOrders.reduce(
      (s, vo) => s + (vo.shipping_contribution || 0),
      0,
    );

    const licenseHolds: { id: string; amount_fils: string }[] =
      await this.commissionRepo.manager.query(
        `SELECT id, amount_fils FROM reel_license_escrow_holds
          WHERE vendor_id = $1 AND funding_source = 'payout_balance'
            AND status = 'captured' AND settled_payout_id IS NULL AND deleted_at IS NULL`,
        [vendorId],
      );
    const license_spend_total = licenseHolds.reduce((s, h) => s + Number(h.amount_fils), 0);

    const adjustments = await this.adjustmentRepo.find({
      where: { vendor_id: vendorId, settled_payout_id: IsNull() } as any,
    });
    const adjustment_sum = adjustments.reduce((s, a: any) => s + (a.amount_fils || 0), 0);

    const net_amount =
      items_net - shipping_contribution_total - license_spend_total + adjustment_sum;

    return {
      gross_amount,
      vat_total,
      commission_total,
      adjustment_total: adjustment_sum - license_spend_total,
      carrier_cost_total,
      shipping_contribution_total,
      license_spend_total,
      net_amount,
      pending_count: commissions.length,
      commission_ids: commissions.map((c: any) => c.id),
      adjustment_ids: adjustments.map((a: any) => a.id),
      license_hold_ids: licenseHolds.map((h) => h.id),
    };
  }

  /**
   * Creates a reviewable draft payout. Moves no money — there is no Stripe
   * call anywhere on this path. The draft claims its commissions, adjustments
   * and license holds so a later run cannot double-count them; approval
   * (see approveDraft) is the only thing that transfers.
   *
   * Idempotency note: on an ordinary same-day rerun (the daily job's normal
   * case), this method is idempotent because the first run already claimed
   * every payable commission — computePayoutTotals then finds
   * `pending_count === 0` below and returns null. That is NOT the duplicate
   * check; see payout-period.ts's docstring for the full picture. The
   * duplicate-period check just below, and the conditional claim further
   * down, exist for the genuine concurrent case: two overlapping createDraft
   * calls for the same vendor+period (a scheduler bug, or a retry racing a
   * still-in-flight first attempt).
   */
  async createDraft(input: {
    vendorId: string;
    periodStart: string;
    periodEnd: string;
    adminUserId: string | null;
    force?: boolean;
  }): Promise<VendorPayout | null> {
    const vendor = await this.vendorRepo.findOne({ where: { id: input.vendorId } });
    if (!vendor) throw new Error("Vendor not found");
    const bank = await this.vendorBankAccountRepo.findOne({
      where: { vendor_id: input.vendorId, is_primary: true } as any,
    });
    if (!bank) {
      throw new Error("Vendor has no primary bank account; cannot generate payout");
    }

    // Duplicate-period guard. `payoutRepo.findOne` (TypeORM soft-delete)
    // already excludes deleted_at IS NOT NULL rows, matching the scope of the
    // partial unique index `uq_vendor_payouts_vendor_period_active` — this is
    // the clean application-level signal; the index is the actual backstop
    // against a race between this check and the insert below.
    const existingPayout = await this.payoutRepo.findOne({
      where: {
        vendor_id: input.vendorId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
      } as any,
    });
    if (existingPayout) {
      const err: any = new Error(
        `A payout for this vendor and period already exists (status=${existingPayout.status})`,
      );
      err.code = "PAYOUT_DUPLICATE";
      throw err;
    }

    const totals = await this.computePayoutTotals(input.vendorId, input.periodEnd);
    // R4-I3: "nothing to pay" is a zero NET, not zero commissions. The
    // adjustment ledger is this branch's designated compensation lever
    // (recordSuccessfulTransfer literally tells the operator to correct
    // things through it), but requiring at least one payable commission made
    // a positive adjustment unreachable for the vendor who most needs one —
    // a closed shop with no new sales owed a credit sat unsettled forever.
    // With no commissions the draft is built purely from the unsettled
    // adjustments (and any license spend), and the net check just below is
    // what actually decides whether it is worth transferring.
    if (totals.pending_count === 0 && totals.adjustment_ids.length === 0) return null;
    // A non-positive net would be rejected by Stripe anyway. Leave everything
    // unclaimed so it nets against a future period once the vendor accrues more.
    if (totals.net_amount <= 0) return null;

    const minimum = Number((vendor as any).minimum_payout ?? 0);
    if (!input.force && totals.net_amount < minimum) {
      const err: any = new Error(
        `Net ${totals.net_amount} is below the vendor's minimum payout of ${minimum}`,
      );
      err.code = "PAYOUT_BELOW_MINIMUM";
      throw err;
    }

    const reference = await this.generatePayoutReference();

    return this.payoutRepo.manager.transaction(async (txMgr) => {
      const draft = await txMgr.getRepository(this.payoutRepo.target).save({
        vendor_id: input.vendorId,
        bank_account_id: bank.id,
        payout_reference: reference,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        gross_amount: totals.gross_amount,
        commission_total: totals.commission_total,
        adjustment_total: totals.adjustment_total,
        carrier_cost_total: totals.carrier_cost_total,
        shipping_contribution_total: totals.shipping_contribution_total,
        net_amount: totals.net_amount,
        currency: "AED",
        status: "pending",
        gateway_reference: null,
      } as any);

      // Claim: stamp payout_id, leave status alone. The payable predicate is
      // `status='pending' AND payout_id IS NULL`, so this removes them from
      // the pool without asserting they have been paid.
      //
      // The `AND payout_id IS NULL` on the claim itself (not just in
      // computePayoutTotals' read) is the actual guard against two concurrent
      // createDraft calls both reading the same unclaimed commissions: only
      // one claim can win each row. If this one wins fewer rows than it read,
      // another draft already claimed the rest concurrently — throwing here
      // rolls back the whole transaction (draft row included), rather than
      // leaving a draft that under-claims what it says it covers.
      //
      // Raw query, not repo.update(), so the affected rows can be verified:
      // TypeORM's pg driver returns `[rows, rowCount]` for an UPDATE...RETURNING
      // (see reference_typeorm_update_returning_tuple) — destructured below,
      // same as the conditional claims in executeApprovedTransfer /
      // executeRetryAndAudit.
      // R3-I2: `AND status = 'pending'` mirrors computePayoutTotals' own read
      // predicate. Without it, a commission that `cancelOrder` voided in the
      // tens of milliseconds between the read and this claim is still claimed
      // — and its earning is already baked into the draft's stored
      // `net_amount`. cancelOrder's stale-claim scan has by then already run
      // and found nothing (payout_id was still NULL), and reconciliation
      // compares against the draft's own stored columns, so neither catches
      // it. With the predicate, the row simply isn't claimed and the
      // `claimedRows.length !== commission_ids.length` check below aborts the
      // whole draft.
      if (totals.commission_ids.length) {
        const [claimedCommissionRows] = (await txMgr.query(
          "UPDATE commissions SET payout_id = $1 WHERE id = ANY($2::uuid[]) AND payout_id IS NULL AND status = 'pending' RETURNING id",
          [draft.id, totals.commission_ids],
        )) as [Array<{ id: string }>, number];
        if (claimedCommissionRows.length !== totals.commission_ids.length) {
          throw new Error(
            `Commission claim raced: expected to claim ${totals.commission_ids.length} commissions for vendor ${input.vendorId} but claimed ${claimedCommissionRows.length} — another draft claimed the rest concurrently`,
          );
        }
      }
      if (totals.adjustment_ids.length) {
        const [claimedAdjustmentRows] = (await txMgr.query(
          "UPDATE vendor_payout_adjustments SET settled_payout_id = $1 WHERE id = ANY($2::uuid[]) AND settled_payout_id IS NULL RETURNING id",
          [draft.id, totals.adjustment_ids],
        )) as [Array<{ id: string }>, number];
        if (claimedAdjustmentRows.length !== totals.adjustment_ids.length) {
          throw new Error(
            `Adjustment claim raced: expected to claim ${totals.adjustment_ids.length} adjustments for vendor ${input.vendorId} but claimed ${claimedAdjustmentRows.length} — another draft claimed the rest concurrently`,
          );
        }
      }
      // Same conditional-claim-plus-affected-row-check pattern as the
      // commission/adjustment claims above (I5): license holds are not
      // period-scoped, so without `AND settled_payout_id IS NULL` — and
      // without verifying the claim actually won every row — two concurrent
      // createDraft calls for the same vendor with different periods (a
      // manual /generate racing the nightly job) can both read the same
      // unsettled holds and both "successfully" claim them, deducting the
      // same escrowed license spend twice.
      if (totals.license_hold_ids.length) {
        // MINOR (round 4): the claim predicate mirrors computePayoutTotals'
        // read predicate in full (`status='captured' AND funding_source=
        // 'payout_balance' AND deleted_at IS NULL`), not just
        // `settled_payout_id IS NULL`. No exploit was found for the narrower
        // version — `captured` is terminal until settlement — but a claim
        // that can match rows its own read would have excluded is a
        // difference waiting to matter, and the affected-row check below
        // turns any such divergence into a rolled-back draft instead of a
        // silently mis-scoped deduction.
        const [claimedHoldRows] = (await txMgr.query(
          `UPDATE reel_license_escrow_holds SET settled_payout_id = $1
            WHERE id = ANY($2::uuid[]) AND settled_payout_id IS NULL
              AND status = 'captured' AND funding_source = 'payout_balance'
              AND deleted_at IS NULL
            RETURNING id`,
          [draft.id, totals.license_hold_ids],
        )) as [Array<{ id: string }>, number];
        if (claimedHoldRows.length !== totals.license_hold_ids.length) {
          throw new Error(
            `License hold claim raced: expected to claim ${totals.license_hold_ids.length} license holds for vendor ${input.vendorId} but claimed ${claimedHoldRows.length} — another draft claimed the rest concurrently`,
          );
        }
      }

      await this.writeAudit({
        action: "payout.draft_created",
        actor_id: input.adminUserId,
        actor_role: input.adminUserId ? "admin" : "system",
        entity_id: draft.id,
        metadata: {
          vendor_id: input.vendorId,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          net_amount: totals.net_amount,
          commission_count: totals.commission_ids.length,
          adjustment_count: totals.adjustment_ids.length,
          forced: input.force === true,
        },
        // MINOR (round 4): through the DRAFT's transaction, so a rolled-back
        // createDraft cannot leave a `payout.draft_created` row pointing at a
        // payout that never existed.
        manager: txMgr,
      });

      return draft;
    });
  }

  /**
   * Pays a pending draft on the rail the admin chose.
   *
   * The rail is a per-payment decision, deliberately not a vendor property:
   * the same vendor can be paid by Stripe one cycle and by bank transfer the
   * next, and the operator making the payment is the one who knows which.
   *
   * `stripe_connect` is unchanged from before rails existed — it enqueues the
   * transfer job, and every double-send guard in executeApprovedTransfer
   * still applies. `manual_bank_transfer` moves NO money: it records the
   * intent, leaves the claims held, and waits for the operator to come back
   * with a bank reference via markPaid.
   *
   * Both branches stamp the rail through a conditional
   * `UPDATE ... WHERE status = 'pending'`. On `manual_bank_transfer` this
   * claim IS the mutual-exclusion guard — it also moves the row to
   * `processing`, so a second concurrent call sees PAYOUT_NOT_DRAFT. On
   * `stripe_connect` the claim leaves `status = 'pending'` (there is nothing
   * else to move it to yet), so it is a no-op two concurrent Stripe approvals
   * can both pass; the real mutual exclusion for that rail is downstream, in
   * executeApprovedTransfer's own conditional claim to `processing` — see its
   * R5-I1/R4-C2 comment below. Do not read this claim as "no double transfer
   * job is ever enqueued": it is not, and the guard that matters lives there.
   */
  async approveDraft(
    payoutId: string,
    adminUserId: string,
    rail: PayoutRail,
  ): Promise<{ jobId: string | null; rail: PayoutRail }> {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== ("pending" as any)) {
      const err: any = new Error("Only pending drafts can be paid");
      err.code = "PAYOUT_NOT_DRAFT";
      throw err;
    }

    // The Stripe account requirement lives HERE, not on the draft path: a
    // draft is rail-agnostic and cannot know whether Stripe will be needed.
    // Checking it at generation time is what stopped a bank-transfer vendor
    // from ever having a payout drafted at all.
    if (rail === PayoutRail.stripe_connect) {
      const vendor = await this.vendorRepo.findOne({ where: { id: payout.vendor_id } });
      if (!vendor?.stripe_account_id) {
        throw new Error("Vendor has no Stripe account; cannot pay on the Stripe rail");
      }
    }

    // FIX 2 (final review): `assertClaimedSetReconciles` used to run on
    // exactly two paths — `executeApprovedTransfer` and
    // `executeRetryAndAudit` — both Stripe-only, leaving the manual lifecycle
    // (`approveDraft -> processing -> markPaid`) with NO reconciliation at
    // all. It matters MORE here, not less: `claimDraftForInvalidation`'s
    // predicate (`status IN ('pending','failed') AND gateway_reference IS
    // NULL`) means a `processing` payout can't be invalidated by a commission
    // reversal, so on Stripe that drift window is the seconds between this
    // claim and the transfer call (closed by the same guard downstream). On
    // the manual rail the window is however long the operator takes to reach
    // their banking portal — hours to days — with nothing checking anything
    // in between. This is the moment the system tells a human to go move
    // money, so it is the manual-rail analogue of "immediately before every
    // transfer". Deliberately NOT added to the stripe_connect branch: that
    // one is already covered downstream by executeApprovedTransfer.
    if (rail === PayoutRail.manual_bank_transfer) {
      // Stamped on the in-memory entity BEFORE the guard, not after the claim
      // below, because the guard's failure path does `save(payout)` on this
      // very entity — so this is the write that lands the rail alongside
      // `status = 'failed'` in the same statement. Without it the row failed
      // with `payout_rail` NULL, which `availablePayoutActions` reads as
      // Stripe: it offers Retry, and the Stripe retry path overwrites
      // `payout.notes` with "Vendor has no Stripe account", destroying the
      // reconciliation diagnostic the guard had just written there. No money
      // can move either way — the guard precedes every money path — so this
      // is purely about the failed row staying diagnosable and routing the
      // operator to Void rather than a Retry the server always refuses.
      payout.payout_rail = rail;
      await this.assertClaimedSetReconciles(payout);
    }

    const nextStatus = rail === PayoutRail.manual_bank_transfer ? "processing" : "pending";
    // R5-I1 (same invariant as executeApprovedTransfer/executeRetryAndAudit
    // below): `AND deleted_at IS NULL` because this is raw SQL and
    // claimDraftForInvalidation (reject/reversal) soft-deletes a draft while
    // LEAVING status = 'pending' — without this clause a draft invalidated
    // between the findOne above and this UPDATE is still claimable here.
    // `AND gateway_reference IS NULL` mirrors the same defence-in-depth as
    // the other two claims, so all three money-adjacent claims share one
    // invariant instead of drifting apart.
    const [claimedRows] = (await this.payoutRepo.manager.query(
      `UPDATE vendor_payouts SET payout_rail = $2, status = $3, updated_at = now()
        WHERE id = $1 AND status = 'pending' AND deleted_at IS NULL AND gateway_reference IS NULL
        RETURNING id`,
      [payoutId, rail, nextStatus],
    )) as [Array<{ id: string }>, number];
    if (claimedRows.length === 0) {
      const err: any = new Error(
        "Only pending drafts can be paid (the payout was claimed concurrently)",
      );
      err.code = "PAYOUT_NOT_DRAFT";
      throw err;
    }

    let jobId: string | null = null;
    if (rail === PayoutRail.stripe_connect) {
      const queue = getPayoutQueue();
      const job = await queue.add("transfer", { type: "transfer", payoutId, adminUserId });
      jobId = String(job.id);
    }

    await this.writeAudit({
      action:
        rail === PayoutRail.manual_bank_transfer
          ? "payout.paid_manually_initiated"
          : "payout.approved",
      actor_id: adminUserId,
      actor_role: "admin",
      entity_id: payoutId,
      metadata: { job_id: jobId, net_amount: payout.net_amount, payout_rail: rail },
    });
    return { jobId, rail };
  }

  /**
   * Sends the money for an approved draft.
   *
   * Transfers the draft's STORED net_amount and marks the commissions it
   * already claimed. Nothing is recomputed here, so what the admin approved
   * is exactly what is sent — no drift from orders landing in between.
   *
   * Double-send protection is two-layered:
   *  1. A conditional `UPDATE ... WHERE status = 'pending'` claims the payout
   *     BEFORE Stripe is ever called. This runs outside any transaction, so
   *     it commits immediately and independently of whatever happens next —
   *     a BullMQ retry of this same job (attempts: 3 in payout.job.ts) or a
   *     second concurrent approver will see 0 rows claimed and no-op instead
   *     of transferring again, even if the earlier attempt's post-transfer
   *     DB write never landed.
   *  2. A Stripe idempotency key derived from the payout id, so even a
   *     genuine double-send collapses to one transfer on Stripe's side.
   *     Defence in depth — the claim above should already prevent it.
   */
  async executeApprovedTransfer(payoutId: string): Promise<VendorPayout> {
    const payout = await this.payoutRepo.findOne({
      where: { id: payoutId },
      relations: ["vendor"],
    });
    if (!payout) throw new Error("Payout not found");

    // TypeORM 0.3.28's query() returns [rows, rowCount] for UPDATE/DELETE
    // with RETURNING. Destructure the rows array.
    // R4-C2: `AND gateway_reference IS NULL` mirrors the retry path's claim.
    // A pending payout should never carry one (it is written only by
    // recordSuccessfulTransfer, in the same transaction that moves the row to
    // `processing`), so this is defence in depth rather than a reachable
    // case — but it is the same one-line invariant on both money paths,
    // which is what stops the two from drifting apart again.
    const [claimedRows] = (await this.payoutRepo.manager.query(
      // R5-I1: `AND deleted_at IS NULL`. `claimDraftForInvalidation` (reject /
      // reversal) invalidates a draft by setting `deleted_at` while LEAVING
      // `status = 'pending'`, and this is raw SQL, so without the clause a
      // draft invalidated between the findOne above and this UPDATE is still
      // claimable. `assertClaimedSetReconciles` is not a backstop for that:
      // its identity reduces to `items_net`, so for a draft built purely from
      // adjustments (createDraft admits those) both sides are 0, it passes,
      // and a rejected draft's money goes out — while its released
      // adjustments are re-claimed and paid again by the next draft.
      `UPDATE vendor_payouts SET status = 'processing'
        WHERE id = $1 AND status = 'pending' AND gateway_reference IS NULL
          AND deleted_at IS NULL RETURNING id`,
      [payoutId],
    )) as [Array<{ id: string }>, number];
    if (claimedRows.length === 0) {
      // Already claimed by another attempt (retry or a racing approver) —
      // a no-op, not an error. Re-fetch so the caller sees current state.
      const current = await this.payoutRepo.findOne({
        where: { id: payoutId },
        relations: ["vendor"],
      });
      return current ?? payout;
    }

    // C1 backstop: the claim above is a raw UPDATE, so it does NOT respect
    // TypeORM's soft-delete scoping — a draft that CommissionReversalService
    // invalidated (soft-deleted via invalidateDraftForReversal, below) a
    // moment ago can still be "successfully" claimed here if the deletion
    // landed after this method's initial findOne but before the claim UPDATE
    // ran. That deletion also released this draft's claimed commissions, so
    // by the time we'd reach Stripe the stored net_amount no longer reflects
    // what those commissions actually total — sending it would be exactly
    // the C1 overpayment. Recompute the claimed set's current earning
    // subtotal and compare against a value derived from the draft's own
    // stored columns, rather than re-deriving the whole computePayoutTotals
    // pipeline (which would need shipping_contribution_total and
    // license_spend_total pulled fresh too, and risks a false alarm from
    // divergence in code neither this bug nor its fix touches).
    //
    // computePayoutTotals defines:
    //   net_amount     = items_net - shipping_contribution_total - license_spend_total + adjustment_sum
    //   adjustment_total (stored) = adjustment_sum - license_spend_total
    // Substituting eliminates license_spend_total entirely:
    //   items_net = net_amount + shipping_contribution_total - adjustment_total
    // — an identity over columns already persisted on the draft, so this
    // reconciles exactly (not approximately) for any legitimately-built
    // draft, licensed spend or not, and only trips when the claimed
    // commission set has actually drifted since creation.
    const { pendingCount } = await this.assertClaimedSetReconciles(payout);

    const destination = (payout as any).vendor?.stripe_account_id;
    if (!destination) {
      // Claimed but unsendable — fail it rather than stranding it in
      // "processing" forever.
      payout.status = "failed" as any;
      payout.notes = "Vendor has no Stripe account";
      await this.payoutRepo.save(payout);
      throw new Error("Vendor has no Stripe account");
    }

    let transfer: Stripe.Transfer;
    try {
      // Outside the transaction — never hold one open across a network call.
      transfer = await this.stripe.transfers.create(
        {
          amount: payout.net_amount,
          currency: payout.currency.toLowerCase(),
          destination,
          metadata: { vendor_id: payout.vendor_id, payout_id: payout.id },
        },
        { idempotencyKey: `payout-transfer-${payout.id}` },
      );
    } catch (err: any) {
      // R5-C1: only a DEFINITIVE rejection may mark this row `failed` (which
      // is what makes it retryable). An ambiguous failure leaves it
      // `processing` for a human — see handleIndeterminateTransfer.
      if (isIndeterminateStripeError(err)) {
        await this.handleIndeterminateTransfer(payout, err, false);
        throw err;
      }
      // The claim above already moved this row to "processing" — flip it to
      // "failed" so it isn't stranded, and so the existing retry path
      // (executeRetryAndAudit, gated on status='failed') can pick it up.
      payout.status = "failed" as any;
      payout.notes = err?.message ?? String(err);
      await this.payoutRepo.save(payout);
      await this.writeAudit({
        action: "payout.stripe_transfer_failed",
        actor_id: null,
        actor_role: "system",
        entity_id: payout.id,
        metadata: { error: err?.message ?? String(err) },
      });
      throw err;
    }

    return this.recordSuccessfulTransfer(payout, transfer.id, pendingCount);
  }

  /**
   * R3-C2/R3-I1 — the pre-transfer reconciliation, shared by BOTH money-moving
   * paths (`executeApprovedTransfer` and `executeRetryAndAudit`; the retry path
   * had no reconciliation at all, which is precisely how a cancelled-then-
   * retried payout could pay a refunded sale).
   *
   * Two numbers come back from one pass over the claimed set:
   *
   *  - `claimedEarningSum` — the earning currently backing this payout. The
   *    query EXCLUDES `cancelled` commissions (R3-C2): cancelling a commission
   *    changes only its `status`; it touches neither `vendor_earning` nor
   *    `payout_id`, so an unfiltered SUM is byte-identical before and after a
   *    cancellation and this "backstop" could never fire for the case it was
   *    written to catch. `paid` rows are deliberately still counted — a retry
   *    of a payout whose earlier attempt already marked its commissions paid
   *    is legitimate and must not be blocked.
   *  - `pendingCount` — how many claimed commissions are still `pending`, i.e.
   *    exactly how many rows `recordSuccessfulTransfer`'s bulk update is
   *    expected to flip to `paid` (R3-I1).
   *
   * On mismatch the payout is failed, audited and the error thrown BEFORE
   * Stripe is called — no money moves on a drifted claim set.
   */
  /**
   * R5-C1 — "we don't know whether the money left."
   *
   * Called instead of the `failed` write when the Stripe call threw something
   * that doesn't prove the transfer was rejected. The row stays `processing`
   * with NO `gateway_reference`, which is deliberately the one state from
   * which nothing here moves money on its own: `retry()` refuses (it requires
   * `failed`), both claim UPDATEs refuse (they require `pending`/`failed`),
   * and the daily draft job cannot touch a non-deleted payout's claims. It
   * needs a human, which is the correct outcome for an unknown transfer.
   *
   * `markFailed` can still walk this row to `failed` — intentionally, since
   * that IS the operator's escape once they've checked the Stripe dashboard —
   * and the retry that follows is made safe by `findExistingTransferForPayout`
   * rather than by trapping the operator here. Belt and braces: the note is
   * written so the dashboard says "unknown", not "failed".
   */
  private async handleIndeterminateTransfer(
    payout: VendorPayout,
    err: any,
    isRetry: boolean,
  ): Promise<void> {
    const message = err?.message ?? String(err);
    payout.notes = `Stripe transfer outcome UNKNOWN (${message}). The request may have been accepted — do not retry until the Stripe dashboard has been checked for a transfer carrying metadata.payout_id = ${payout.id}. Left in 'processing' deliberately; a retry after this error is what sends the money twice.`;
    // Set explicitly, NOT left alone. The claim UPDATE moved the DB row to
    // 'processing' via raw SQL, but this in-memory entity still carries the
    // status the findOne read BEFORE the claim ('pending' on the approval
    // path, 'failed' on the retry path). Saving it unset would write that
    // stale value back over the claim — handing the row straight back to the
    // approver or the retry queue, i.e. the exact double-send this method
    // exists to prevent.
    payout.status = "processing" as any;
    await this.payoutRepo.save(payout);
    await this.writeAudit({
      action: "payout.stripe_transfer_indeterminate",
      actor_id: null,
      actor_role: "system",
      entity_id: payout.id,
      metadata: {
        error: message,
        error_type: err?.type ?? err?.rawType ?? err?.name ?? null,
        status_code: err?.statusCode ?? err?.status ?? null,
        ...(isRetry ? { retry: true } : {}),
      },
    });
  }

  /**
   * R5-C1 — does Stripe already hold a transfer for this payout?
   *
   * Transfers we create carry `metadata.payout_id`, so this is an exact match
   * rather than an amount heuristic. Scoped to the vendor's connected account
   * and to transfers created at/after the payout row itself (minus a day of
   * clock slack), so the page size is a real bound and not a sampling
   * accident.
   *
   * If the lookup itself fails, or the injected Stripe client has no `list`
   * (older SDK, or a test double), we return null — i.e. behaviour falls back
   * to exactly what it was before this guard existed. It is defence in depth
   * layered on top of the `gateway_reference` / status guards, not a
   * replacement for them, so degrading to the previous behaviour is the
   * correct failure mode; it is audited so the degradation is visible.
   */
  private async findExistingTransferForPayout(
    payout: VendorPayout,
    destination: string,
  ): Promise<{ id: string } | null> {
    const list = (this.stripe as any)?.transfers?.list;
    if (typeof list !== "function") return null;
    try {
      const createdAt = (payout as any).created_at
        ? new Date((payout as any).created_at).getTime()
        : Date.now() - 30 * 86_400_000;
      const page = await this.stripe.transfers.list({
        destination,
        limit: 100,
        created: { gte: Math.floor(createdAt / 1000) - 86_400 },
      });
      const match = (page?.data ?? []).find(
        (t: any) => t?.metadata?.payout_id === payout.id && !t?.reversed,
      );
      return match ? { id: match.id } : null;
    } catch (err: any) {
      await this.writeAudit({
        action: "payout.stripe_transfer_lookup_failed",
        actor_id: null,
        actor_role: "system",
        entity_id: payout.id,
        metadata: { error: err?.message ?? String(err) },
      });
      return null;
    }
  }

  private async assertClaimedSetReconciles(
    payout: VendorPayout,
  ): Promise<{ claimedEarningSum: number; pendingCount: number }> {
    const rows = await this.payoutRepo.manager.query(
      `SELECT COALESCE(SUM(vendor_earning) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS sum,
              (COUNT(*) FILTER (WHERE status = 'pending'))::int AS pending_count
         FROM commissions WHERE payout_id = $1`,
      [payout.id],
    );
    const claimedEarningSum = Number(rows?.[0]?.sum ?? 0);
    const pendingCount = Number(rows?.[0]?.pending_count ?? 0);
    const expectedEarningSum =
      payout.net_amount + payout.shipping_contribution_total - payout.adjustment_total;
    if (claimedEarningSum !== expectedEarningSum) {
      payout.status = "failed" as any;
      payout.notes = `Reconciliation failed before transfer: commissions currently claiming this payout total ${claimedEarningSum} fils but the draft was built expecting ${expectedEarningSum} (net_amount ${payout.net_amount} + shipping_contribution_total ${payout.shipping_contribution_total} - adjustment_total ${payout.adjustment_total}). A claimed commission was likely released or cancelled after this draft was created. Refusing to transfer a stale amount.`;
      await this.payoutRepo.save(payout);
      await this.writeAudit({
        action: "payout.reconciliation_failed",
        actor_id: null,
        actor_role: "system",
        entity_id: payout.id,
        metadata: { claimedEarningSum, expectedEarningSum },
      });
      // FIX 2: coded so a caller that now reaches this synchronously (e.g.
      // approveDraft's manual-rail branch) can translate it into a sensible
      // 4xx instead of an unhandled plain Error collapsing to a 500. The two
      // job-worker callers (executeApprovedTransfer/executeRetryAndAudit)
      // don't route through an HTTP translator, so the code is inert there.
      const err: any = new Error(payout.notes);
      err.code = "PAYOUT_RECONCILIATION_FAILED";
      throw err;
    }
    return { claimedEarningSum, pendingCount };
  }

  /**
   * Shared post-transfer bookkeeping for both money-moving paths
   * (executeApprovedTransfer and executeRetryAndAudit): flips the payout to
   * `processing` with the Stripe transfer's id, and marks every commission
   * this payout already claimed (`payout_id = :id`) `paid` — in the SAME
   * transaction, so a crash between the two writes can never happen.
   *
   * Factored out (review fix, I1) because the two paths had drifted: the
   * retry path used to skip the commission-paid write entirely, so a
   * successful retry left its claimed commissions `pending` with
   * `payout_id` set and `paid_at` null forever. Any later return/dispute/
   * cancellation that nulls `payout_id` on those "still pending" rows then
   * republishes them into the payable pool — double-paying money that was
   * already sent. Sharing one implementation means the two callers cannot
   * silently diverge on this again.
   *
   * One bulk commission update, not a row-by-row loop: a per-row loop
   * outside a transaction could strand rows `pending` after a successful
   * transfer, which the next payout would then pay again — the exact bug
   * this method exists to prevent.
   */
  private async recordSuccessfulTransfer(
    payout: VendorPayout,
    transferId: string,
    expectedCommissionCount?: number,
  ): Promise<VendorPayout> {
    const { saved, affected } = await this.payoutRepo.manager.transaction(async (txMgr) => {
      payout.status = "processing" as any;
      payout.gateway_reference = transferId;
      const saved = await txMgr.getRepository(this.payoutRepo.target).save(payout);
      // C1: scoped to status='pending' as well as payout_id — a commission
      // that left 'pending' after being claimed (most importantly, one an
      // order cancellation voided to 'cancelled' without this payout ever
      // learning about it) must never be flipped to 'paid' just because it
      // still carries this payout's id. Without this guard, cancelOrder's
      // void (which clears status but historically left payout_id alone)
      // gets silently undone the moment this payout is approved: the row
      // flips back to 'paid' and the vendor is sent money for a refunded
      // sale. Restricting the update's WHERE to the state it actually
      // expects means a row that has moved on for any reason is left
      // exactly as it is, not resurrected.
      const result = await txMgr
        .getRepository(Commission)
        .update(
          { payout_id: payout.id, status: "pending" } as any,
          { status: "paid", paid_at: new Date() } as any,
        );
      return { saved, affected: Number(result?.affected ?? 0) };
    });

    // R3-I1: every other compare-and-set on this path checks its affected-row
    // count; this one did not — and since the update is scoped to
    // `status='pending'`, a count BELOW what the pre-transfer reconciliation
    // saw is exactly the "we just transferred money covering commissions that
    // have since been cancelled or released" alarm. The transfer has already
    // happened, so this must NOT throw and must NOT discard
    // `gateway_reference`: record it, alarm, and leave the payout
    // reconcilable by a human.
    if (expectedCommissionCount != null && affected !== expectedCommissionCount) {
      await this.writeAudit({
        action: "payout.commission_mark_paid_mismatch",
        actor_id: null,
        actor_role: "system",
        entity_id: payout.id,
        metadata: {
          gateway_reference: transferId,
          expected_commission_count: expectedCommissionCount,
          marked_paid_count: affected,
          net_amount: payout.net_amount,
        },
      });
      console.error(
        `[PayoutService] payout ${payout.id} transferred ${payout.net_amount} fils (transfer ${transferId}) but marked only ${affected} of an expected ${expectedCommissionCount} claimed commissions paid — a claimed commission was cancelled or released between reconciliation and this write. The money has already left; investigate and correct via the adjustment ledger.`,
      );
    }
    return saved;
  }

  /**
   * The three release writes shared by every invalidation path —
   * commissions, adjustments, license holds. Deliberately does NOT touch the
   * `vendor_payouts` row itself: that row is claimed (and soft-deleted) by
   * `claimDraftForInvalidation`'s compare-and-set, and only the caller that
   * WON that CAS — `rejectDraft`, `voidFailedPayout` or
   * `invalidateDraftForReversal` — may call this. Runs entirely on the
   * manager it is handed, so it joins the caller's transaction.
   */
  private async releaseClaims(txMgr: EntityManager, payoutId: string): Promise<void> {
    await txMgr
      .getRepository(Commission)
      .update({ payout_id: payoutId } as any, { payout_id: null } as any);
    await txMgr
      .getRepository(VendorPayoutAdjustment)
      .update({ settled_payout_id: payoutId } as any, { settled_payout_id: null } as any);
    await txMgr.query(
      "UPDATE reel_license_escrow_holds SET settled_payout_id = NULL WHERE settled_payout_id = $1",
      [payoutId],
    );
  }

  /**
   * The compare-and-set that decides who owns invalidating a payout:
   * soft-deletes `vendor_payouts` only while releasing its claims is
   * provably safe, and reports whether this caller won.
   *
   * Shared by `rejectDraft` (admin), `voidFailedPayout` (admin) and
   * `invalidateDraftForReversal` (reversal) — R3-C3. Round 2 hardened only
   * the last and left `rejectDraft` a read-then-write, so an admin Reject
   * could commit its release DURING the approval path's ~500 ms Stripe call
   * and hand every commission back to the payable pool for the next nightly
   * draft to pay a second time. Taking the `vendor_payouts` row lock FIRST,
   * before any `commissions` write, also normalises the lock order across
   * every path (vendor_payouts -> commissions -> adjustments -> holds),
   * which is what removes the deadlock window between reject and reversal
   * (R3-I3).
   *
   * R4-C1 — the predicate is `status IN ('pending','failed') AND
   * gateway_reference IS NULL`, not `status = 'pending'`. `payout_id` is
   * nulled in exactly one place (`releaseClaims`), reachable only from this
   * CAS, so while it required `pending` a `failed` payout had no release
   * path at all: its commissions, adjustments and license holds were claimed
   * forever, and any reversal touching one of them recomputed the commission
   * in place (R3-I4) so every later retry then failed reconciliation
   * identically, forever. The safety condition is not the status but whether
   * a transfer exists: `gateway_reference IS NULL` means Stripe was never
   * successfully called for this payout, so nothing has left the platform
   * and releasing is safe. `processing`/`paid` are excluded outright, and a
   * `failed` row that somehow carries a `gateway_reference` (money sent,
   * bookkeeping unfinished) is excluded by the same clause.
   */
  private async claimDraftForInvalidation(
    manager: EntityManager,
    payoutId: string,
    reason: string,
  ): Promise<boolean> {
    const [claimedRows] = (await manager.query(
      `UPDATE vendor_payouts
          SET deleted_at = now(), notes = $2
        WHERE id = $1
          AND status IN ('pending', 'failed')
          AND gateway_reference IS NULL
          AND deleted_at IS NULL
        RETURNING id`,
      [payoutId, reason],
    )) as [Array<{ id: string }>, number];
    return claimedRows.length > 0;
  }

  /**
   * R4-C1 — the admin "void / release a failed payout" action.
   *
   * A payout that failed before its transfer went out holds real money
   * hostage: its commissions, adjustments and license holds stay claimed, so
   * no future draft can pay them. This releases them and soft-deletes the
   * payout, and is permitted ONLY when `status = 'failed'` AND
   * `gateway_reference IS NULL` — i.e. no Stripe transfer exists for this
   * payout, so releasing provably cannot pay the same money twice. Money
   * that HAS been sent stays unreleasable: for those the correct action is
   * Mark Paid plus a compensating adjustment, not a void.
   *
   * Same shape as every other path here: the status read below is only a
   * fast, friendly rejection; the actual guard is the conditional UPDATE in
   * `claimDraftForInvalidation`, whose affected-row count decides ownership,
   * and the release runs in the same transaction behind the same lock order
   * (vendor_payouts -> commissions -> adjustments -> holds).
   */
  async voidFailedPayout(payoutId: string, adminUserId: string, reason: string): Promise<void> {
    if (!reason?.trim()) {
      const err: any = new Error("reason is required when voiding a payout");
      err.code = "PAYOUT_VOID_REASON_REQUIRED";
      throw err;
    }
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== ("failed" as any) || payout.gateway_reference != null) {
      const err: any = new Error(
        payout.gateway_reference != null
          ? "This payout's transfer has already gone out (gateway reference present) — it cannot be voided"
          : `Only failed payouts with no transfer can be voided (status=${payout.status})`,
      );
      err.code = "PAYOUT_NOT_VOIDABLE";
      throw err;
    }

    await this.payoutRepo.manager.transaction(async (txMgr) => {
      const won = await this.claimDraftForInvalidation(
        txMgr,
        payoutId,
        `Voided by admin: ${reason}`,
      );
      if (!won) {
        // Lost the race — a retry claimed it back to `processing`, or
        // another admin voided it first. Release NOTHING: a transfer may be
        // in flight for these commissions right now.
        const err: any = new Error(
          "Only failed payouts with no transfer can be voided (the payout was claimed concurrently)",
        );
        err.code = "PAYOUT_NOT_VOIDABLE";
        throw err;
      }
      await this.releaseClaims(txMgr, payoutId);
      await this.writeAudit({
        action: "payout.voided",
        actor_id: adminUserId,
        actor_role: "admin",
        entity_id: payoutId,
        metadata: {
          reason,
          vendor_id: payout.vendor_id,
          net_amount: payout.net_amount,
          released_from_status: "failed",
        },
        manager: txMgr,
      });
    });
  }

  /** Releases a draft's claims and soft-deletes it. */
  async rejectDraft(payoutId: string, adminUserId: string, reason: string): Promise<void> {
    if (!reason?.trim()) throw new Error("reason is required when rejecting a draft");
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    // Fast, friendly rejection for the obvious case. NOT the guard — the
    // conditional UPDATE inside the transaction below is (R3-C3).
    if (payout.status !== ("pending" as any)) {
      const err: any = new Error("Only pending drafts can be rejected");
      err.code = "PAYOUT_NOT_DRAFT";
      throw err;
    }

    await this.payoutRepo.manager.transaction(async (txMgr) => {
      const won = await this.claimDraftForInvalidation(txMgr, payoutId, reason);
      if (!won) {
        // Lost the race — the approval path (or another rejecter) claimed
        // this row after the read above. Release NOTHING: those commissions
        // may be backing a Stripe transfer that is in flight right now.
        const err: any = new Error(
          "Only pending drafts can be rejected (the draft was claimed concurrently)",
        );
        err.code = "PAYOUT_NOT_DRAFT";
        throw err;
      }
      await this.releaseClaims(txMgr, payoutId);
    });

    await this.writeAudit({
      action: "payout.draft_rejected",
      actor_id: adminUserId,
      actor_role: "admin",
      entity_id: payoutId,
      metadata: { reason },
    });
  }

  /**
   * C1 — called by CommissionReversalService (and OrderStatusService.
   * cancelOrder) when a commission it is about to release/recompute is still
   * claimed by a payout. Shares `claimDraftForInvalidation` +
   * `releaseClaims` with `rejectDraft` and `voidFailedPayout` rather than
   * running a second release path, but — unlike those two — runs entirely
   * against whatever `manager` the caller hands in and never opens its own
   * transaction. `reverseForItems` is sometimes called from inside an
   * already-open transaction (order-item-cancellation.service.ts); opening a
   * second, independent transaction here could deadlock against rows the
   * caller's transaction already holds locks on. Running on the caller's own
   * manager means this call is safe whether that manager is transactional or
   * not.
   *
   * What is invalidated is decided by `claimDraftForInvalidation`'s CAS
   * (R4-C1): `status IN ('pending','failed') AND gateway_reference IS NULL`
   * — no Stripe transfer exists for such a payout, so releasing its claims
   * cannot pay the same money twice. `processing` and `paid` are refused,
   * as is anything already soft-deleted or already carrying a
   * `gateway_reference`.
   *
   * When the CAS is lost, NOTHING is released and `{ invalidated: false }`
   * comes back with the payout's current status; the caller routes that
   * through `recordUnreleasableClaim`, which decides from the status whether
   * money actually left (and therefore whether a clawback is owed) and
   * always writes an audit row. A `paid` payout's commission normally never
   * reaches here — CommissionReversalService's own `commission.status ===
   * 'paid'` branch handles it before `payout_id` is inspected — but it CAN
   * when the commission was left `pending` by a mark-paid mismatch, which is
   * precisely the case R3-I1's alarm exists for, so the sink handles it too.
   */
  async invalidateDraftForReversal(
    manager: EntityManager,
    payoutId: string,
    reason: string,
  ): Promise<{ invalidated: boolean; payoutStatus: string }> {
    // C2: compare-and-set, not read-then-write. The previous implementation did a
    // plain `findOne`, checked `status !== 'pending'` in application code,
    // then wrote — with no `FOR UPDATE` and no `AND status = 'pending'` on
    // the write itself. That left a window: this read observes 'pending',
    // the approval path's own conditional claim (`executeApprovedTransfer`)
    // then wins the race and moves the row to 'processing' before this
    // call's write lands, the Stripe transfer goes out, and THEN this call
    // soft-deletes the "still pending" draft and releases its commissions —
    // sending the money and returning every claimed commission to the
    // payable pool in the same instant. Every other claim on this branch is
    // a conditional `UPDATE ... WHERE <state> ... RETURNING id` with an
    // affected-row check; this now matches that idiom, and — because it
    // takes the `vendor_payouts` row lock FIRST — also matches
    // `recordSuccessfulTransfer`'s lock order (vendor_payouts before
    // commissions), which resolves the inversion that could otherwise
    // deadlock the two paths against each other.
    const won = await this.claimDraftForInvalidation(manager, payoutId, reason);

    if (!won) {
      // Lost the CAS (or the row doesn't exist) — release nothing. Look up
      // the current status (bypassing the soft-delete scope) purely so the
      // caller can log something useful; this read has no bearing on
      // correctness since nothing is written from it.
      const payoutRepoInTx = manager.getRepository(VendorPayout);
      const current = await payoutRepoInTx.findOne({
        where: { id: payoutId } as any,
        withDeleted: true,
      });
      return { invalidated: false, payoutStatus: (current as any)?.status ?? "not_found" };
    }

    // Won the CAS — this call, and only this call, owns releasing the
    // claims it just soft-deleted the draft out from under.
    await this.releaseClaims(manager, payoutId);

    await this.writeAudit({
      action: "payout.draft_rejected",
      actor_id: null,
      actor_role: "system",
      entity_id: payoutId,
      metadata: { reason, superseded_by_reversal: true },
      manager,
    });

    return { invalidated: true, payoutStatus: "released" };
  }

  /**
   * The single sink for "a reversal hit a commission whose claiming payout
   * could NOT be invalidated" — R3-C2/R3-C4/R3-I4.
   *
   * Every caller that discovers an unreleasable claim (CommissionReversalService
   * for returns/disputes/item-cancellations, OrderStatusService.cancelOrder for
   * whole-order cancellations) funnels through here, so the three rules below
   * cannot drift apart per call site again — which is exactly how `cancelOrder`
   * ended up with a bare `console.error` in a money path while the reversal
   * service wrote a compensating adjustment:
   *
   *  1. A clawback is written ONLY when the payout actually sent money
   *     (`processing`/`paid`). For `failed` — the common case, where
   *     `stripe.transfers.create` threw and nothing left the platform —
   *     charging the vendor would take the same money off them twice: once by
   *     never paying the failed payout, once by the adjustment (R3-I4).
   *     Anything else (`pending` on a soft-deleted row, `not_found`) is
   *     likewise money-not-sent.
   *  2. A ZERO clawback is never saved: `vendor_payout_adjustments` carries
   *     `CHECK (amount_fils <> 0)`, and a zero delta is reachable in ordinary
   *     operation (a 0/NULL `refund_amount` return line, a 1-fil dispute
   *     share, a fixed-rate second unit). Saving it raises 23514 AFTER the
   *     customer refund has already gone out (R3-C4).
   *  3. The audit row is written either way, so the event is always queryable.
   */
  async recordUnreleasableClaim(
    manager: EntityManager,
    input: {
      commissionId: string | null;
      vendorId: string;
      payoutId: string;
      payoutStatus: string;
      clawbackAmount: number;
      sourceType: string;
      sourceId: string;
      reason: string;
    },
  ): Promise<{ clawedBack: boolean; amount: number; moneyLeftThePlatform: boolean }> {
    const { moneyLeftThePlatform, amount, writeAdjustment } = decideUnreleasableClaim({
      payoutStatus: input.payoutStatus,
      clawbackAmount: input.clawbackAmount,
    });

    if (writeAdjustment) {
      const adjustmentRepo = manager.getRepository(VendorPayoutAdjustment);
      await adjustmentRepo.save(
        adjustmentRepo.create({
          vendor_id: input.vendorId,
          amount_fils: -amount,
          reason: input.reason,
          source_type: input.sourceType,
          source_id: input.sourceId,
        } as any),
      );
    }

    await this.writeAudit({
      action: "commission_reversal.unreleasable_claim",
      actor_id: null,
      actor_role: "system",
      entity_id: input.commissionId,
      metadata: {
        payout_id: input.payoutId,
        payout_status: input.payoutStatus,
        source_type: input.sourceType,
        source_id: input.sourceId,
        clawback_amount: amount,
        clawback_written: writeAdjustment,
        money_left_the_platform: moneyLeftThePlatform,
      },
      manager,
    });

    return { clawedBack: writeAdjustment, amount, moneyLeftThePlatform };
  }

  async listForVendor(
    vendorId: string,
    query: { page?: number; limit?: number; status?: PayoutStatus },
  ): Promise<{ data: VendorPayout[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    // Falsy check, not `!= null`: `?status=` reaches here as "" and matching
    // on that returns zero rows, which the page renders as "no payouts yet".
    // An absent or empty status means "all statuses", same as listForAdmin.
    const where: FindOptionsWhere<VendorPayout> = { vendor_id: vendorId };
    if (query.status) where.status = query.status;
    const [data, total] = await this.payoutRepo.findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async listForAdmin(filters: {
    vendorId?: string;
    status?: string;
    periodFrom?: string;
    periodTo?: string;
    reference?: string;
    minNet?: number;
    maxNet?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<VendorPayout & { vendor_name: string }>;
    total: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const qb = this.payoutRepo
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.vendor", "vendor")
      .orderBy("p.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.vendorId) qb.andWhere("p.vendor_id = :vendorId", { vendorId: filters.vendorId });
    if (filters.status) qb.andWhere("p.status = :status", { status: filters.status });
    if (filters.periodFrom) qb.andWhere("p.period_end >= :pFrom", { pFrom: filters.periodFrom });
    if (filters.periodTo) qb.andWhere("p.period_start <= :pTo", { pTo: filters.periodTo });
    if (filters.reference)
      qb.andWhere("p.payout_reference ILIKE :ref", { ref: `%${filters.reference}%` });
    if (filters.minNet != null) qb.andWhere("p.net_amount >= :minNet", { minNet: filters.minNet });
    if (filters.maxNet != null) qb.andWhere("p.net_amount <= :maxNet", { maxNet: filters.maxNet });

    const [rows, total] = await qb.getManyAndCount();
    const items = rows.map((p) => ({
      ...p,
      vendor_name: (p as any).vendor?.business_name ?? (p as any).vendor?.name ?? "—",
    }));
    return { items, total };
  }

  async getAdminSummary(): Promise<{
    total_pending_fils: number;
    paid_this_month_fils: number;
    processing_count: number;
    failed_count: number;
  }> {
    // MINOR (round 4): `payout_id IS NULL` matches the payable predicate
    // every other path uses. Without it this tile counted earnings already
    // locked into an open draft, which the same dashboard also shows as that
    // draft's `net_amount` — the same money, twice, on one screen.
    const pendingQb = this.commissionRepo
      .createQueryBuilder("c")
      .select("COALESCE(SUM(c.vendor_earning), 0)", "total")
      .where("c.status = :status", { status: "pending" })
      .andWhere("c.payout_id IS NULL");
    const pendingRow = await pendingQb.getRawOne();
    const total_pending_fils = Number(pendingRow?.total || 0);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const paidQb = this.payoutRepo
      .createQueryBuilder("p")
      .select("COALESCE(SUM(p.net_amount), 0)", "total")
      .where("p.status = :status", { status: "paid" })
      .andWhere("p.processed_at >= :start", { start: monthStart.toISOString() });

    const paidRow = await paidQb.getRawOne();
    const paid_this_month_fils = Number(paidRow?.total || 0);

    const processing_count = await this.payoutRepo.count({
      where: { status: "processing" as any },
    });
    const failed_count = await this.payoutRepo.count({ where: { status: "failed" as any } });

    return {
      total_pending_fils,
      paid_this_month_fils,
      processing_count,
      failed_count,
    };
  }

  /**
   * MINOR (round 4): `withDeleted` — a rejected or reversal-invalidated
   * draft is SOFT-deleted, and the reason it was killed lives on that row's
   * `notes` and in its audit timeline. Without this the detail endpoint
   * 404s and the timeline behind it becomes unreachable, so the operator
   * cannot see why a payout they were expecting never happened. The admin
   * LIST is deliberately left scoped to live rows: a soft-deleted draft
   * keeps `status='pending'`, so listing it would show a dead draft as
   * approvable money.
   */
  async findByIdWithVendor(id: string): Promise<VendorPayout | null> {
    return this.payoutRepo.findOne({
      where: { id },
      relations: ["vendor", "bankAccount"],
      withDeleted: true,
    });
  }

  async listCommissionsForPayout(
    payoutId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Commission[]; total: number }> {
    const [items, total] = await this.commissionRepo.findAndCount({
      where: { payout_id: payoutId } as any,
      order: { created_at: "ASC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  /**
   * Everything the vendor statement PDF needs, in one place.
   *
   * Distinct from `listCommissionsForPayout` in two ways that matter: it loads
   * the `order` / `order_item` relations (the statement names the item the
   * vendor earned on, where the admin table is happy with a truncated id), and
   * it is unpaginated but hard-capped, because a statement is one document.
   *
   * The bank account is fetched `withDeleted` for the same reason
   * AdminPayoutController.revealBank does: the payout snapshots the account it
   * was drafted against, and a vendor who has since replaced their bank
   * details must not turn this payout's own statement into a 404. Only masked
   * values leave this method — the statement is a document that gets forwarded
   * by email, so plaintext bank details have no business in it. `revealBank`
   * stays the single audited place where a full IBAN can be seen.
   */
  async getStatementData(payoutId: string, lineCap: number) {
    const payout = await this.payoutRepo.findOne({
      where: { id: payoutId },
      relations: ["vendor"],
      withDeleted: true,
    });
    if (!payout) throw new Error("Payout not found");

    const bank = await this.vendorBankAccountRepo.findOne({
      where: { id: (payout as any).bank_account_id } as any,
      withDeleted: true,
    });

    // findAndCount, not find: `total` must be the real number of claimed
    // commissions so the PDF can say "showing the first N of TOTAL" honestly.
    // Reading it off the capped array would make an over-cap statement claim
    // it was showing everything.
    const [commissions, commissionCount] = await this.commissionRepo.findAndCount({
      where: { payout_id: payoutId } as any,
      relations: ["order", "order_item"],
      order: { created_at: "ASC" },
      take: lineCap,
    });

    const adjustments = await this.adjustmentRepo.find({
      where: { settled_payout_id: payoutId } as any,
      order: { created_at: "ASC" },
    });

    return { payout, bank, commissions, commissionCount, adjustments };
  }

  async estimateForVendor(vendorId: string, periodEnd?: string): Promise<PayoutTotals> {
    return this.computePayoutTotals(vendorId, periodEnd ?? "2999-12-31");
  }

  /**
   * Does this vendor satisfy the one precondition `createDraft` enforces
   * before it will build a draft at all?
   *
   * Exists so the Generate dialog can say so BEFORE the operator fills in a
   * period and submits. Without it the only way to learn that a vendor has no
   * bank account on file is a 400 after the fact — a dialog that shows a
   * healthy "AED 94.24 payable" and then refuses, with nothing on screen
   * connecting the refusal to the vendor's Bank Accounts tab.
   *
   * Reads exactly what createDraft reads (`is_primary: true`, soft-deleted
   * rows excluded by TypeORM), so the two can never disagree.
   */
  async hasPrimaryBankAccount(vendorId: string): Promise<boolean> {
    const bank = await this.vendorBankAccountRepo.findOne({
      where: { vendor_id: vendorId, is_primary: true } as any,
    });
    return bank != null;
  }

  /**
   * Write a structured audit row (used outside Elysia auditPlugin). Public
   * so it can be reused by callers structurally satisfying the narrow
   * `DraftInvalidator` interface (e.g. CommissionReversalService, which
   * writes a compensating audit row when a claim it cannot release is
   * frozen behind an in-flight/failed payout).
   *
   * MINOR (round 4): when the caller is inside a transaction it passes its
   * own `manager`, and the row is written through THAT manager so it commits
   * — or rolls back — with the change it describes. Writing through the
   * service's own repository regardless (the old behaviour) left a
   * `payout.draft_created` row pointing at a draft whose transaction had
   * since rolled back, i.e. at a payout that never existed. Callers with no
   * transaction of their own simply omit it.
   *
   * `entity_type` defaults to "vendor_payout" — the entity the payout
   * timeline reads. Events that have no payout row to point at (a draft that
   * failed before one was inserted) pass "vendor" + the vendor id instead, so
   * they are still findable via /admin/audit-log rather than being orphaned
   * on a NULL entity_id.
   */
  async writeAudit(input: {
    action: string;
    actor_id: string | null;
    actor_role: string;
    entity_id: string | null;
    entity_type?: string;
    changes?: Record<string, { old: unknown; new: unknown }> | null;
    metadata?: Record<string, unknown> | null;
    manager?: EntityManager;
  }): Promise<void> {
    const repo = input.manager ? input.manager.getRepository(AuditLog) : this.auditLogRepo;
    await repo.save(
      repo.create({
        action: input.action,
        actor_id: input.actor_id,
        actor_role: input.actor_role,
        entity_type: input.entity_type ?? "vendor_payout",
        entity_id: input.entity_id ?? undefined,
        changes: input.changes ?? null,
        metadata: input.metadata ?? null,
      } as any),
    );
  }

  /**
   * R4-I1 — marking the payout paid must also mark the commissions it
   * claimed paid, in the same transaction.
   *
   * The normal path already does this inside `recordSuccessfulTransfer`, so
   * this update usually affects 0 rows. It is not dead code: whenever the
   * worker died between the Stripe call and its bookkeeping, or the operator
   * settled the vendor out of band and clicks Mark Paid on a payout that
   * never got a `recordSuccessfulTransfer`, the claimed commissions are left
   * `pending` with `payout_id` set and `paid_at` NULL. Those rows are then
   * excluded from `computePayoutTotals` (payout_id IS NOT NULL) forever
   * while still being counted forever by `getAdminSummary.total_pending_fils`
   * — money that is paid, looks unpaid, and no operator action corrects.
   *
   * Scoped to `status='pending'` for exactly the reason
   * `recordSuccessfulTransfer` is: a claimed commission that has since been
   * cancelled must not be resurrected to `paid`. The affected-row count is
   * recorded on the audit row rather than thrown on — the payout genuinely
   * is paid; a mismatch is information for a human, not a reason to refuse.
   */
  async markPaid(
    payoutId: string,
    adminUserId: string,
    notes?: string,
    reference?: string,
  ): Promise<VendorPayout> {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== ("processing" as any)) {
      throw new Error("Payout must be in 'processing' to mark as paid");
    }
    // On the manual rail nothing has written a gateway_reference — no Stripe
    // call happened — so the operator's bank reference is the ONLY evidence
    // the money left. It is also what makes this row non-retryable and
    // non-voidable afterwards, which is exactly right once funds have gone.
    if (payout.payout_rail === PayoutRail.manual_bank_transfer) {
      if (!reference || !reference.trim()) {
        throw new Error("a bank reference is required when marking a manual payout as paid");
      }
      payout.gateway_reference = reference.trim();
    }
    const oldStatus = payout.status;
    payout.status = "paid" as any;
    payout.processed_at = new Date() as any;
    if (notes) payout.notes = notes;
    const { updated, markedPaidCount } = await this.payoutRepo.manager.transaction(
      async (txMgr) => {
        const updated = await txMgr.getRepository(this.payoutRepo.target).save(payout);
        const result = await txMgr
          .getRepository(Commission)
          .update(
            { payout_id: payoutId, status: "pending" } as any,
            { status: "paid", paid_at: new Date() } as any,
          );
        return { updated, markedPaidCount: Number(result?.affected ?? 0) };
      },
    );
    await this.writeAudit({
      action: "payout.status_changed",
      actor_id: adminUserId,
      actor_role: "admin",
      entity_id: payoutId,
      changes: { status: { old: oldStatus, new: "paid" } },
      metadata: {
        marked_paid_count: markedPaidCount,
        ...(notes ? { note: notes } : {}),
        ...(reference ? { bank_reference: reference.trim() } : {}),
      },
    });
    return updated as VendorPayout;
  }

  /**
   * R4-C2 — "Mark Failed" is for a payout whose transfer never went out.
   *
   * `recordSuccessfulTransfer` leaves a payout `processing` WITH a
   * `gateway_reference`; nothing promotes it to `paid` automatically, so the
   * detail page offers Mark Paid and Mark Failed side by side for exactly
   * that row. Marking it failed used to be allowed, and `retry()` only ever
   * checked `status === 'failed'` — so two clicks sent `net_amount` to the
   * vendor a SECOND time, with a fresh per-operator idempotency key
   * (R3-C1) that Stripe will not dedupe, and a reconciliation that passes
   * because it deliberately counts `paid` commissions. There is no transfer
   * webhook anywhere in the repo to catch it afterwards.
   *
   * A `gateway_reference` is written only by `recordSuccessfulTransfer`, in
   * the same transaction as the successful transfer, so its presence means
   * the money demonstrably left. Refuse: the correct action for that row is
   * Mark Paid (plus an adjustment if the amount was wrong). The mirrored
   * guard lives on `retry()` and on both transfer paths' claim UPDATEs, so
   * no single one of them is load-bearing on its own.
   */
  async markFailed(payoutId: string, adminUserId: string, notes?: string): Promise<VendorPayout> {
    if (!notes || !notes.trim()) {
      throw new Error("notes are required when marking a payout as failed");
    }
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== ("processing" as any)) {
      throw new Error("Payout must be in 'processing' to mark as failed");
    }
    if (payout.gateway_reference != null) {
      const err: any = new Error(
        `Payout ${payout.payout_reference} already has a Stripe transfer (${payout.gateway_reference}); its money has left the platform. Mark it paid and correct any difference via the adjustment ledger — marking it failed would make it retryable and send the transfer a second time.`,
      );
      err.code = "PAYOUT_TRANSFER_ALREADY_SENT";
      throw err;
    }
    const oldStatus = payout.status;
    payout.status = "failed" as any;
    payout.notes = notes;
    const updated = await this.payoutRepo.save(payout);
    await this.writeAudit({
      action: "payout.status_changed",
      actor_id: adminUserId,
      actor_role: "admin",
      entity_id: payoutId,
      changes: { status: { old: oldStatus, new: "failed" } },
      metadata: { note: notes },
    });
    return updated;
  }

  async appendNote(payoutId: string, adminUserId: string, note: string): Promise<VendorPayout> {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    payout.notes = note;
    const updated = await this.payoutRepo.save(payout);
    await this.writeAudit({
      action: "payout.note_added",
      actor_id: adminUserId,
      actor_role: "admin",
      entity_id: payoutId,
      metadata: { note, vendor_id: payout.vendor_id },
    });
    return updated;
  }

  /**
   * Corrects a draft's amount before it is paid.
   *
   * The existing adjustment ledger is vendor-scoped and only ever lands in
   * the NEXT draft (see payout-adjustment.service.ts). That is the right
   * behaviour for an ordinary correction, but it left an operator looking at
   * a draft they knew was wrong with no way to fix it short of rejecting and
   * regenerating.
   *
   * The write moves `net_amount` and `adjustment_total` by the SAME delta.
   * That is not cosmetic: `assertClaimedSetReconciles` verifies
   *
   *   claimed_commission_earnings == net_amount + shipping_contribution_total - adjustment_total
   *
   * immediately before every transfer. Moving both sides by X leaves the
   * identity intact, so an adjusted draft still reconciles and the guard
   * needs no special case. Moving only `net_amount` would fail every adjusted
   * draft at the last moment before its transfer.
   *
   * FIX 1 (final review) — what is deliberately still open here:
   *
   * (a) This is a read-then-write (`findOne`, check `status === 'pending'` in
   *     application code, then write), NOT a compare-and-set like every
   *     money-claiming path elsewhere in this file. A human was asked twice,
   *     with full knowledge of the two races below, and explicitly ruled to
   *     KEEP this shape rather than add a `WHERE status = 'pending'` /
   *     `FOR UPDATE` / re-validating re-read. Do not "fix" that here.
   *
   * (b) Two races remain, accepted as-is:
   *       - An adjust racing an approve: the operator can be looking at (and
   *         submit) a stale amount if `approveDraft` claims the draft to
   *         `processing` between this method's `findOne` and its write.
   *       - Two concurrent adjustments: each reads the same `net_amount` /
   *         `adjustment_total` and computes its own delta from it, so two
   *         adjustments racing each other can desynchronise the ledger rows
   *         (`vendor_payout_adjustments`, which are correct — each insert is
   *         independent) from the payout's stored `adjustment_total` (which
   *         is a read-modify-write and can lose an update).
   *
   * (c) The write below targets ONLY `net_amount` and `adjustment_total`
   *     via `repo.update()`, not `repo.save(payout)` on the whole entity.
   *     `payout` was loaded before this transaction opened; TypeORM's
   *     `save()` re-diffs against the CURRENT database row (with
   *     `withDeleted: true`) across every column in `metadata.columns`, not
   *     just the ones this method changed. A `save(payout)` here would carry
   *     this in-memory snapshot's `status` / `payout_rail` / `gateway_reference`
   *     / `deleted_at` back over whatever another transaction wrote to those
   *     columns in the meantime — e.g. resurrecting a payout that
   *     `claimDraftForInvalidation` (reject/reversal) soft-deleted out from
   *     under this one, with its commissions already released back into the
   *     payable pool. Column-targeting the UPDATE removes that collateral
   *     damage; it does NOT close either race in (b).
   */
  async addDraftAdjustment(input: {
    payoutId: string;
    amountFils: number;
    reason: string;
    adminUserId: string;
  }): Promise<VendorPayout> {
    if (!Number.isInteger(input.amountFils) || input.amountFils === 0) {
      throw new Error("amount_fils must be a non-zero integer");
    }
    const payout = await this.payoutRepo.findOne({ where: { id: input.payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== ("pending" as any)) {
      const err: any = new Error("Only pending drafts can be adjusted");
      err.code = "PAYOUT_NOT_DRAFT";
      throw err;
    }

    const nextNet = payout.net_amount + input.amountFils;
    if (nextNet <= 0) {
      const err: any = new Error(
        `This adjustment would leave a net of ${nextNet} fils. A payout must be positive — reject the draft instead, and the balance will net against the vendor's next period.`,
      );
      err.code = "PAYOUT_ADJUSTMENT_NET_NOT_POSITIVE";
      throw err;
    }

    const nextAdjustmentTotal = payout.adjustment_total + input.amountFils;

    return this.payoutRepo.manager.transaction(async (txMgr) => {
      // settled_payout_id is set at creation, unlike the vendor-scoped path
      // where it is stamped later by whichever draft claims the row. This
      // adjustment belongs to THIS draft and must never be swept into another.
      await txMgr.getRepository(VendorPayoutAdjustment).save(
        txMgr.getRepository(VendorPayoutAdjustment).create({
          vendor_id: payout.vendor_id,
          amount_fils: input.amountFils,
          reason: input.reason,
          source_type: "manual",
          source_id: null,
          created_by: input.adminUserId,
          settled_payout_id: input.payoutId,
        } as any),
      );

      // FIX 1: column-targeted write — see the docstring above. Only these
      // two columns are what this operation means to change; anything else
      // goes through `repo.save(payout)`'s full-entity diff and can revert a
      // concurrent status/payout_rail/gateway_reference/deleted_at change.
      await txMgr
        .getRepository(VendorPayout)
        .update(
          { id: input.payoutId },
          { net_amount: nextNet, adjustment_total: nextAdjustmentTotal },
        );

      await this.writeAudit({
        action: "payout.draft_adjusted",
        actor_id: input.adminUserId,
        actor_role: "admin",
        entity_id: input.payoutId,
        changes: {
          net_amount: { old: payout.net_amount, new: nextNet },
        },
        metadata: {
          amount_fils: input.amountFils,
          reason: input.reason,
          vendor_id: payout.vendor_id,
        },
        manager: txMgr,
      });

      return {
        ...payout,
        net_amount: nextNet,
        adjustment_total: nextAdjustmentTotal,
      } as VendorPayout;
    });
  }

  /**
   * Worker entry point for the "create" job. Produces a reviewable draft —
   * see createDraft — and never touches Stripe. bankAccountId/stripeAccountId
   * are accepted for backwards-compat with older enqueued job payloads but are
   * unused: createDraft looks the vendor's bank account and Stripe account up
   * itself so the draft always reflects current data.
   */
  async executeCreateAndAudit(data: {
    vendorId: string;
    periodStart: string;
    periodEnd: string;
    adminUserId: string | null;
    force?: boolean;
  }): Promise<VendorPayout | null> {
    try {
      return await this.createDraft({
        vendorId: data.vendorId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        adminUserId: data.adminUserId,
        force: data.force,
      });
    } catch (err: any) {
      // R4-I4: a failed generation has no payout row to hang off, so this
      // used to be written with `entity_id: null` — invisible to the only
      // reader there is (the payout timeline filters on a payout id) and
      // unattributable to anything at all. Anchor it on the VENDOR instead:
      // /admin/audit-log filters by entity_type + action, so
      // "why has this vendor not been paid for three cycles" is now a query
      // rather than a guess. The nightly job routes through this method for
      // the same reason (payout-draft.job.ts) — it used to swallow every
      // failure into console.warn.
      await this.writeAudit({
        action: "payout.draft_creation_failed",
        actor_id: null,
        actor_role: "system",
        entity_type: "vendor",
        entity_id: data.vendorId,
        metadata: {
          vendor_id: data.vendorId,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          error: err?.message ?? String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Retries the Stripe transfer for a payout that previously landed in
   * "failed" — the "retry" BullMQ job path (attempts: 3 in payout.job.ts).
   *
   * Same double-send protection as executeApprovedTransfer (see its
   * docstring for the full rationale):
   *  1. A conditional `UPDATE ... WHERE status = 'failed'` claims the payout
   *     BEFORE Stripe is ever called, outside any transaction, so it commits
   *     independently of whatever happens next. A BullMQ retry of this same
   *     job or a racing second retry sees 0 rows claimed and no-ops instead
   *     of transferring again, even if this attempt's post-transfer write
   *     never lands.
   *  2. A Stripe idempotency key — but NOT the same one executeApprovedTransfer
   *     uses. Unlike the approval path, this one is expected to legitimately
   *     run more than once over a payout's life (retry, fails again, retry
   *     again once whatever was wrong is fixed). Reusing `payout-transfer-*`
   *     — or any other key fixed per payout — would make Stripe replay a
   *     PRIOR attempt's cached result (including a cached failure) instead of
   *     making a fresh attempt, silently returning stale data forever.
   *
   *     R3-C1: the key must therefore change once per OPERATOR retry and not
   *     once per BullMQ attempt. It used to be anchored on the payout row's
   *     own mutable `updated_at` (with a `Date.now()` fallback), read inside
   *     the worker — but the catch block below writes `status='failed'` +
   *     notes on a Stripe failure, which bumps `updated_at`. So a transfer
   *     that actually SUCCEEDED at Stripe but whose response was lost
   *     (socket reset / 504) threw, rewrote the row, and BullMQ's attempt 2
   *     then computed a DIFFERENT key — sending `net_amount` a second time,
   *     fully automatically. The anchor is now `retryToken`: a value stamped
   *     into the job payload by `retry()` when the ADMIN initiates the retry
   *     (see below), so every internal BullMQ attempt of one job shares a
   *     key while a genuinely new admin retry gets a fresh one. Callers
   *     without a token (a legacy payload still on the queue) fall back to
   *     the BullMQ job id — also stable across attempts — and finally to
   *     `gateway_reference`/the payout id, which are at worst constant. NO
   *     fallback may be derived from mutable row state or the clock.
   */
  async executeRetryAndAudit(payoutId: string, retryToken?: string): Promise<VendorPayout> {
    const payout = await this.payoutRepo.findOne({
      where: { id: payoutId },
      relations: ["vendor"],
    });
    if (!payout) throw new Error("Payout not found");

    const retryAnchor = retryToken ?? payout.gateway_reference ?? payout.id;
    const idempotencyKey = `payout-retry-${payout.id}-${retryAnchor}`;

    // R4-C2: `AND gateway_reference IS NULL` — the worker-side mirror of
    // retry()'s operator-side refusal. A failed payout carrying a transfer
    // id has already sent its money; claiming it here would transfer
    // `net_amount` a second time. Enforced in the claim itself so a job
    // already sitting on the queue (enqueued before that guard existed, or
    // by any future caller) cannot bypass it either.
    const [claimedRows] = (await this.payoutRepo.manager.query(
      // R5-I1: `AND deleted_at IS NULL` — the retry path's mirror of the same
      // hole. A failed draft that was voided/invalidated (soft-deleted, status
      // untouched) must not be claimable by a queued retry job.
      `UPDATE vendor_payouts SET status = 'processing'
        WHERE id = $1 AND status = 'failed' AND gateway_reference IS NULL
          AND deleted_at IS NULL RETURNING id`,
      [payoutId],
    )) as [Array<{ id: string }>, number];
    if (claimedRows.length === 0) {
      // Already claimed by another attempt (retry or a racing admin action) —
      // a no-op, not an error. Re-fetch so the caller sees current state.
      const current = await this.payoutRepo.findOne({
        where: { id: payoutId },
        relations: ["vendor"],
      });
      return current ?? payout;
    }

    if (!(payout as any).vendor?.stripe_account_id) {
      // Claimed but unsendable — fail it rather than stranding it in
      // "processing" forever.
      payout.status = "failed" as any;
      payout.notes = "Vendor has no Stripe account";
      await this.payoutRepo.save(payout);
      throw new Error("Vendor has no Stripe account");
    }

    // R3-C2: the retry path had NO reconciliation at all — which is exactly
    // how a payout whose commissions were cancelled (order refunded) while it
    // sat in `failed` could be retried by an admin and transfer the stored
    // `net_amount` for a sale that no longer exists. Same backstop, same
    // helper, same lock order as the approval path.
    const { pendingCount } = await this.assertClaimedSetReconciles(payout);

    // R5-C1 — the load-bearing duplicate-transfer guard.
    //
    // Every OTHER protection on this path is a statement about our own row:
    // `gateway_reference IS NULL`, `status = 'failed'`, the claim CAS. All of
    // them are wrong in exactly one scenario — Stripe accepted the transfer
    // and we never learned it — and that scenario is not rare (any socket
    // reset or 504 on the approval path produces it). The idempotency key
    // cannot help either: it deliberately CHANGES per operator retry, which is
    // the whole point of R3-C1.
    //
    // So before sending, ask the only system that actually knows. A transfer
    // we created carries `metadata.payout_id`, so a matching one means the
    // money already left and this retry must adopt it rather than send again.
    const existing = await this.findExistingTransferForPayout(
      payout,
      (payout as any).vendor.stripe_account_id,
    );
    if (existing) {
      await this.writeAudit({
        action: "payout.stripe_transfer_adopted",
        actor_id: null,
        actor_role: "system",
        entity_id: payout.id,
        metadata: {
          gateway_reference: existing.id,
          reason:
            "A Stripe transfer for this payout already existed; adopted it instead of sending a second one.",
        },
      });
      return this.recordSuccessfulTransfer(payout, existing.id, pendingCount);
    }

    let transfer: Stripe.Transfer;
    try {
      // Outside the transaction — never hold one open across a network call.
      transfer = await this.stripe.transfers.create(
        {
          amount: payout.net_amount,
          currency: payout.currency.toLowerCase(),
          destination: (payout as any).vendor.stripe_account_id,
          metadata: { vendor_id: payout.vendor_id, payout_id: payout.id, retry: "true" },
        },
        { idempotencyKey },
      );
    } catch (err: any) {
      // R5-C1, same rule as the approval path: an ambiguous failure must not
      // become a retryable `failed`.
      if (isIndeterminateStripeError(err)) {
        await this.handleIndeterminateTransfer(payout, err, true);
        throw err;
      }
      // The claim above already moved this row to "processing" — flip it
      // back to "failed" so it isn't stranded and stays retryable.
      payout.status = "failed" as any;
      payout.notes = err?.message ?? String(err);
      await this.payoutRepo.save(payout);
      await this.writeAudit({
        action: "payout.stripe_transfer_failed",
        actor_id: null,
        actor_role: "system",
        entity_id: payout.id,
        metadata: { error: err?.message ?? String(err), retry: true },
      });
      throw err;
    }

    const updated = await this.recordSuccessfulTransfer(payout, transfer.id, pendingCount);
    await this.writeAudit({
      action: "payout.stripe_transfer_succeeded",
      actor_id: null,
      actor_role: "system",
      entity_id: payout.id,
      metadata: { gateway_reference: transfer.id, retry: true },
    });
    return updated;
  }

  async retry(payoutId: string, adminUserId: string): Promise<{ jobId: string }> {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== ("failed" as any)) {
      const err: any = new Error("Only failed payouts can be retried");
      err.code = "PAYOUT_RETRY_INVALID_STATUS";
      throw err;
    }
    // The manual rail never called Stripe, so there is nothing to retry. The
    // correct lever for a bounced bank transfer is Void, which releases the
    // claims so the money lands in the next draft.
    if (payout.payout_rail === PayoutRail.manual_bank_transfer) {
      const err: any = new Error(
        `Payout ${payout.payout_reference} was paid by manual bank transfer; there is no transfer to retry. Void it to release its claims back into the payable pool.`,
      );
      err.code = "PAYOUT_RETRY_INVALID_RAIL";
      throw err;
    }
    // R4-C2, mirrored from markFailed: a `gateway_reference` means a Stripe
    // transfer for this payout already succeeded, so retrying would send the
    // money twice. Reachable for any row that reached `failed` while holding
    // one — legacy rows marked failed before markFailed refused it, and a
    // future path that fails a payout without clearing the reference.
    if (payout.gateway_reference != null) {
      const err: any = new Error(
        `Payout ${payout.payout_reference} already has a Stripe transfer (${payout.gateway_reference}); retrying would send the money a second time. Resolve it via the adjustment ledger instead.`,
      );
      err.code = "PAYOUT_TRANSFER_ALREADY_SENT";
      throw err;
    }
    // R3-C1: the Stripe idempotency anchor is minted HERE — once per operator
    // retry — and carried in the job payload, so every BullMQ attempt of this
    // one job reuses it (no second transfer when an attempt throws after
    // Stripe already accepted the first) while a later, deliberate admin retry
    // gets a genuinely fresh key.
    const retryToken = randomUUID();
    const queue = getPayoutQueue();
    const job = await queue.add("retry", { type: "retry", payoutId, adminUserId, retryToken });
    await this.writeAudit({
      action: "payout.retried",
      actor_id: adminUserId,
      actor_role: "admin",
      entity_id: payoutId,
      metadata: { job_id: job.id ?? null, retry_token: retryToken },
    });
    return { jobId: String(job.id) };
  }

  async enqueueGenerate(input: {
    vendorId: string;
    periodStart: string;
    periodEnd: string;
    adminUserId: string;
    force?: boolean;
  }): Promise<{
    jobId: string;
    estimate: Awaited<ReturnType<PayoutService["estimateForVendor"]>>;
  }> {
    const vendor = await this.vendorRepo.findOne({ where: { id: input.vendorId } });
    if (!vendor) throw new Error("Vendor not found");

    // is_primary is the confirmed column name on VendorBankAccount entity
    const bank = await this.vendorBankAccountRepo.findOne({
      where: { vendor_id: input.vendorId, is_primary: true } as any,
    });
    if (!bank) {
      throw new Error("Vendor has no primary bank account; cannot generate payout");
    }

    // I4: pass the requested periodEnd through — estimateForVendor defaults
    // to "2999-12-31" (every matured commission, forever) when omitted, but
    // the draft this call queues is built with input.periodEnd. Without this,
    // the admin's preview includes commissions the draft itself won't, which
    // is exactly the estimate-vs-actual divergence this branch exists to
    // remove.
    const estimate = await this.estimateForVendor(input.vendorId, input.periodEnd);
    // R4-I3, mirroring createDraft's own gate: a vendor with no matured
    // commissions but an unsettled positive adjustment DOES have something
    // payable. Rejecting on `pending_count === 0` alone made the operator's
    // only compensation lever unusable from the one screen that queues a
    // payout.
    if (estimate.pending_count === 0 && estimate.adjustment_ids.length === 0) {
      throw new Error("Vendor has no pending commissions");
    }

    const existing = await this.payoutRepo.findOne({
      where: {
        vendor_id: input.vendorId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
      } as any,
    });
    if (
      existing &&
      (existing.status === ("pending" as any) || existing.status === ("processing" as any))
    ) {
      const err: any = new Error(
        `A payout for this vendor and period already exists (status=${existing.status})`,
      );
      err.code = "PAYOUT_DUPLICATE";
      throw err;
    }

    const queue = getPayoutQueue();
    const job = await queue.add("create", {
      type: "create",
      vendorId: input.vendorId,
      bankAccountId: bank.id,
      stripeAccountId: vendor.stripe_account_id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      adminUserId: input.adminUserId,
      force: input.force,
    });

    await this.writeAudit({
      action: "payout.queued",
      actor_id: input.adminUserId,
      actor_role: "admin",
      entity_id: null,
      metadata: {
        vendor_id: input.vendorId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        job_id: job.id ?? null,
      },
    });

    return { jobId: String(job.id), estimate };
  }
}
