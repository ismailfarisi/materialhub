import { config } from "@materialhub/config";
import type { AuditLog, PayoutRail, VendorBankAccount } from "@materialhub/database";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpError,
  NotFoundError,
} from "@materialhub/plugins";
import type { EncryptionService } from "@materialhub/utils";
import type { Repository } from "typeorm";
import { renderPayoutStatementPdf } from "./payout-statement-pdf.ts";
import {
  STATEMENT_LINE_CAP,
  buildPayoutStatementViewModel,
  payoutStatementFilename,
} from "./payout-statement-view-model.ts";
import type { PayoutService } from "./payout.service.ts";

/**
 * The service signals expected, client-facing conditions with plain Errors
 * carrying a `.code` — errorHandler only honours HttpError subclasses, so a
 * plain Error would otherwise collapse to a 500. Translate at this boundary
 * into the right 4xx, but ONLY for the known, expected signals below.
 *
 * Anything else (a genuine DB failure, a null-pointer bug, ...) is rethrown
 * UNCHANGED so errorHandler treats it as a 500 and logs it server-side,
 * rather than reporting it to the client as a 400 with its raw internal
 * message — that used to be exactly what the trailing catch-all did here.
 */
function translatePayoutError(err: any): HttpError {
  if (err instanceof HttpError) return err;
  if (err?.message === "Payout not found") return new NotFoundError(err.message);
  if (err?.code === "PAYOUT_NOT_DRAFT") return new ConflictError(err.message);
  if (err?.code === "PAYOUT_BELOW_MINIMUM") return new BadRequestError(err.message);
  if (err?.code === "PAYOUT_DUPLICATE") return new ConflictError(err.message);
  if (err?.code === "PAYOUT_RETRY_INVALID_STATUS") return new ConflictError(err.message);
  if (err?.code === "PAYOUT_RETRY_INVALID_RAIL") return new ConflictError(err.message);
  // R4-C1 / R4-C2: the void operation's "this payout is not voidable" and
  // both money paths' "a transfer for this payout already exists" are
  // ordinary 409 state conflicts, not faults.
  if (err?.code === "PAYOUT_NOT_VOIDABLE") return new ConflictError(err.message);
  if (err?.code === "PAYOUT_TRANSFER_ALREADY_SENT") return new ConflictError(err.message);
  if (err?.code === "PAYOUT_VOID_REASON_REQUIRED") return new BadRequestError(err.message);
  // markPaid/markFailed state guards (plain Errors, matched by message like
  // the "Payout not found" precedent above).
  if (
    err?.message === "Payout must be in 'processing' to mark as paid" ||
    err?.message === "Payout must be in 'processing' to mark as failed"
  ) {
    return new ConflictError(err.message);
  }
  if (err?.message === "notes are required when marking a payout as failed") {
    return new BadRequestError(err.message);
  }
  if (err?.message === "a bank reference is required when marking a manual payout as paid") {
    return new BadRequestError(err.message);
  }
  if (err?.message === "reason is required when rejecting a draft") {
    return new BadRequestError(err.message);
  }
  if (err?.code === "PAYOUT_ADJUSTMENT_NET_NOT_POSITIVE") return new BadRequestError(err.message);
  if (err?.message === "amount_fils must be a non-zero integer") {
    return new BadRequestError(err.message);
  }
  // FIX 2: the manual rail now runs assertClaimedSetReconciles in
  // approveDraft before the claim flips the row to processing. A drifted
  // claim set is an ordinary state conflict (the payout row itself is failed
  // and audited by the guard) — a 409, not a 500.
  if (err?.code === "PAYOUT_RECONCILIATION_FAILED") return new ConflictError(err.message);

  // Uncoded but expected validation failures from the draft path. These are
  // ordinary admin mistakes ("this vendor has no bank account yet"), not server
  // faults, and must not surface as a 500. Matched by message, following the
  // "Payout not found" precedent above.
  if (err?.message === "Vendor not found") return new NotFoundError(err.message);
  if (
    err?.message === "Vendor has no Stripe account; cannot generate payout" ||
    err?.message === "Vendor has no primary bank account; cannot generate payout" ||
    err?.message === "Vendor has no pending commissions"
  ) {
    return new BadRequestError(err.message);
  }
  if (err?.message === "Vendor has no Stripe account; cannot pay on the Stripe rail") {
    return new BadRequestError(err.message);
  }

  // Anything else is a genuine fault. Rethrow so errorHandler logs it and
  // returns a 500 WITHOUT leaking the internal message to the client.
  throw err;
}

export class AdminPayoutController {
  constructor(
    private payoutService: PayoutService,
    private auditLogRepo: Repository<AuditLog>,
    private vendorBankAccountRepo: Repository<VendorBankAccount>,
    private vendorEncryption: EncryptionService,
  ) {}

  list(filters: any) {
    return this.payoutService.listForAdmin(filters);
  }

  summary() {
    return this.payoutService.getAdminSummary();
  }

  /**
   * MINOR (round 4): `periodEnd` is passed through when the caller supplies
   * one. Omitted, `estimateForVendor` defaults to "2999-12-31" — every
   * matured commission, forever — while the draft the Generate dialog then
   * queues is period-scoped, so the preview could promise more (or, with a
   * later period, less) than the draft delivers, up to submitting and
   * getting a 400 for a vendor the dialog had just shown money for.
   *
   * `has_primary_bank_account` rides along for the same class of reason: it is
   * the one precondition createDraft refuses on that the dialog could not
   * otherwise see, so without it the operator's only feedback is a 400 with no
   * on-screen route to the fix.
   */
  async estimate(vendorId: string, periodEnd?: string) {
    const [totals, has_primary_bank_account] = await Promise.all([
      this.payoutService.estimateForVendor(vendorId, periodEnd),
      this.payoutService.hasPrimaryBankAccount(vendorId),
    ]);
    return { ...totals, has_primary_bank_account };
  }

  async get(id: string) {
    const payout = await this.payoutService.findByIdWithVendor(id);
    if (!payout) {
      const err: any = new Error("Payout not found");
      err.statusCode = 404;
      throw err;
    }
    return payout;
  }

  listCommissions(id: string, page: number, limit: number) {
    return this.payoutService.listCommissionsForPayout(id, page, limit);
  }

  async getTimeline(id: string) {
    return this.auditLogRepo.find({
      where: { entity_type: "vendor_payout", entity_id: id },
      order: { created_at: "ASC" },
    });
  }

  async generate(
    adminUserId: string,
    body: { vendorId: string; periodStart: string; periodEnd: string },
  ) {
    try {
      return await this.payoutService.enqueueGenerate({ ...body, adminUserId });
    } catch (err: any) {
      throw translatePayoutError(err);
    }
  }

  async retry(id: string, adminUserId: string) {
    try {
      return await this.payoutService.retry(id, adminUserId);
    } catch (err: any) {
      throw translatePayoutError(err);
    }
  }

  async changeStatus(
    id: string,
    adminUserId: string,
    body: { status: "paid" | "failed"; notes?: string; reference?: string },
  ) {
    // Was the one mutating endpoint with no translation at all, so every
    // expected refusal here (wrong status, missing notes, and now R4-C2's
    // "that transfer already went out") surfaced as a 500.
    try {
      if (body.status === "paid")
        return await this.payoutService.markPaid(id, adminUserId, body.notes, body.reference);
      return await this.payoutService.markFailed(id, adminUserId, body.notes);
    } catch (err: any) {
      throw translatePayoutError(err);
    }
  }

  async addNote(id: string, adminUserId: string, note: string) {
    return this.payoutService.appendNote(id, adminUserId, note);
  }

  async approve(id: string, adminUserId: string, rail: PayoutRail) {
    try {
      return await this.payoutService.approveDraft(id, adminUserId, rail);
    } catch (err: any) {
      throw translatePayoutError(err);
    }
  }

  async reject(id: string, adminUserId: string, reason: string) {
    try {
      await this.payoutService.rejectDraft(id, adminUserId, reason);
    } catch (err: any) {
      throw translatePayoutError(err);
    }
  }

  /**
   * R4-C1 — release a failed payout that never sent any money, so the
   * commissions/adjustments/license holds it is holding become payable
   * again. 404 unknown id, 409 PAYOUT_NOT_VOIDABLE for the wrong status or a
   * payout that does carry a gateway reference, 400 for a missing reason.
   */
  async void(id: string, adminUserId: string, reason: string) {
    try {
      await this.payoutService.voidFailedPayout(id, adminUserId, reason);
    } catch (err: any) {
      throw translatePayoutError(err);
    }
  }

  async addDraftAdjustment(
    id: string,
    adminUserId: string,
    body: { amountFils: number; reason: string },
  ) {
    try {
      return await this.payoutService.addDraftAdjustment({
        payoutId: id,
        amountFils: body.amountFils,
        reason: body.reason,
        adminUserId,
      });
    } catch (err: any) {
      throw translatePayoutError(err);
    }
  }

  /**
   * The only place in the codebase that returns an unmasked bank account.
   * Everything else — including vendor-service's own read path — masks
   * (vendor-bank-account.service.ts). The manual payout rail genuinely needs
   * the real IBAN, so this exists; it is restricted to super_admin and every
   * call writes an audit row, because a single leak here is a vendor's full
   * banking identity and "who saw this" must be answerable.
   */
  async revealBank(id: string, actor: { id: string; role: string }) {
    if (actor.role !== "super_admin") {
      throw new ForbiddenError("Only super admins may reveal vendor bank details");
    }
    const payout = await this.payoutService.findByIdWithVendor(id);
    if (!payout) throw new NotFoundError("Payout not found");

    // withDeleted: true — the payout snapshots the bank_account_id it was
    // drafted against, deliberately: if the vendor has since replaced their
    // bank account, the payout still owes money to the account it was drafted
    // against, not whatever is currently primary. TypeORM's default findOne
    // excludes soft-deleted rows (VendorBankAccount has a DeleteDateColumn;
    // vendor-service soft-removes accounts), which would otherwise 404 the
    // one endpoint that exists to let an admin pay this out, recoverable only
    // via direct DB access. `account_deleted` on the response tells the
    // operator the account is no longer current so they can decide whether to
    // still pay it.
    const bank = await this.vendorBankAccountRepo.findOne({
      where: { id: (payout as any).bank_account_id } as any,
      withDeleted: true,
    });
    if (!bank) throw new NotFoundError("Bank account not found");

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        action: "payout.bank_details_revealed",
        actor_id: actor.id,
        actor_role: actor.role,
        entity_type: "vendor_payout",
        entity_id: id,
        metadata: { bank_account_id: bank.id, vendor_id: (payout as any).vendor_id },
      } as any),
    );

    return {
      account_holder_name: bank.account_holder_name,
      bank_name: bank.bank_name,
      account_number: this.vendorEncryption.decrypt(bank.account_number_encrypted),
      iban: bank.iban_encrypted ? this.vendorEncryption.decrypt(bank.iban_encrypted) : null,
      swift_code: bank.swift_code,
      currency: bank.currency,
      account_deleted: bank.deleted_at != null,
    };
  }

  /**
   * Renders the vendor-facing payout statement PDF. Admin-only (the route
   * sits inside the `requireRole("admin","super_admin")` group) and download
   * only — nothing here emails it. The operator downloads the file and sends
   * it to the vendor themselves, which is deliberate: a statement is the
   * document a vendor reconciles their books against, and it should not leave
   * the platform without a human having looked at it.
   *
   * Bank details are MASKED, unlike `revealBank` above. That endpoint exists
   * because the operator making a manual transfer genuinely needs the IBAN;
   * this one produces a file that gets forwarded by email, so it carries only
   * enough to identify the account. Deliberately NOT gated on super_admin for
   * the same reason — there is nothing secret in it.
   */
  async statement(id: string) {
    const { payout, bank, commissions, commissionCount, adjustments } = await this.payoutService
      .getStatementData(id, STATEMENT_LINE_CAP)
      .catch((err: any) => {
        throw translatePayoutError(err);
      });

    const vm = buildPayoutStatementViewModel({
      payout: payout as any,
      vendor: (payout as any).vendor ?? null,
      bank: bank
        ? {
            bank_name: bank.bank_name,
            account_holder_name: bank.account_holder_name,
            account_number_masked: this.vendorEncryption.mask(
              this.vendorEncryption.decrypt(bank.account_number_encrypted),
            ),
            iban_masked: bank.iban_encrypted
              ? this.vendorEncryption.mask(this.vendorEncryption.decrypt(bank.iban_encrypted))
              : null,
            currency: bank.currency,
          }
        : null,
      commissions: commissions as any,
      commissionCount,
      adjustments: adjustments as any,
      platform: { legalName: config.invoice.legalName, trn: config.invoice.trn },
      generatedAt: new Date(),
    });

    return {
      filename: payoutStatementFilename(vm.reference),
      pdf: await renderPayoutStatementPdf(vm),
      vendorId: (payout as any).vendor_id as string,
      reference: vm.reference,
    };
  }
}
