import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PayoutRail } from "@materialhub/database";
import { AdminPayoutController } from "./admin-payout.controller.ts";

describe("AdminPayoutController", () => {
  let payoutService: any;
  let controller: AdminPayoutController;
  let auditRows: any[];
  let vendorBankAccountRepo: any;
  let vendorEncryption: any;

  beforeEach(() => {
    payoutService = {
      listForAdmin: mock(() => Promise.resolve({ items: [], total: 0 })),
      getAdminSummary: mock(() => Promise.resolve({})),
      // Default: only "po1" resolves (used by the revealBank tests below);
      // any other id (e.g. "nope") stays 404, preserving the existing
      // "get returns 404 shape when missing" test.
      findByIdWithVendor: mock((id: string) =>
        Promise.resolve(
          id === "po1" ? { id, bank_account_id: "bank1", vendor_id: "vendor1" } : null,
        ),
      ),
      listCommissionsForPayout: mock(() => Promise.resolve({ items: [], total: 0 })),
      estimateForVendor: mock(() => Promise.resolve({ pending_count: 0 })),
      hasPrimaryBankAccount: mock(() => Promise.resolve(true)),
      enqueueGenerate: mock(() => Promise.resolve({ jobId: "j1", estimate: {} })),
      retry: mock(() => Promise.resolve({ jobId: "j2" })),
      markPaid: mock((id: string) => Promise.resolve({ id, status: "paid" })),
      markFailed: mock((id: string) => Promise.resolve({ id, status: "failed" })),
      appendNote: mock((id: string) => Promise.resolve({ id, notes: "x" })),
      approveDraft: mock(() => Promise.resolve({ jobId: "j3" })),
      rejectDraft: mock(() => Promise.resolve(undefined)),
      voidFailedPayout: mock(() => Promise.resolve(undefined)),
    };
    auditRows = [];
    const auditLogRepo = {
      find: mock(() =>
        Promise.resolve([
          { id: "a1", action: "payout.generated", entity_id: "po1", created_at: new Date() },
        ]),
      ),
      create: mock((partial: any) => partial),
      save: mock((row: any) => {
        auditRows.push(row);
        return Promise.resolve(row);
      }),
    };
    vendorBankAccountRepo = {
      findOne: mock(() =>
        Promise.resolve({
          id: "bank1",
          account_holder_name: "Acme Perfumes LLC",
          bank_name: "Emirates NBD",
          account_number_encrypted: "enc-acct",
          iban_encrypted: "enc-iban",
          swift_code: "EBILAEAD",
          currency: "AED",
          deleted_at: null,
        }),
      ),
    };
    vendorEncryption = {
      decrypt: mock((ciphertext: string) => {
        if (ciphertext === "enc-iban") return "AE070331234567890123456";
        if (ciphertext === "enc-acct") return "1234567890";
        throw new Error(`unexpected ciphertext: ${ciphertext}`);
      }),
      // Real EncryptionService.mask: everything but the last 4 characters.
      mask: mock((value: string) =>
        value.length <= 4 ? value : "*".repeat(value.length - 4) + value.slice(-4),
      ),
    };
    controller = new AdminPayoutController(
      payoutService,
      auditLogRepo as any,
      vendorBankAccountRepo as any,
      vendorEncryption as any,
    );
  });

  it("list forwards filters", async () => {
    await controller.list({ vendorId: "v1", page: 2 });
    expect(payoutService.listForAdmin).toHaveBeenCalledWith({ vendorId: "v1", page: 2 });
  });

  it("get returns 404 shape when missing", async () => {
    // Must be an HttpError (errorHandler ignores a plain Error's statusCode → 500).
    await expect(controller.get("nope")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("addNote translates 'Payout not found' to a 404", async () => {
    payoutService.appendNote = mock(() => Promise.reject(new Error("Payout not found")));
    await expect(controller.addNote("nope", "admin1", "hi")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("status maps 'paid' to markPaid and 'failed' to markFailed", async () => {
    await controller.changeStatus("po1", "admin1", { status: "paid" });
    expect(payoutService.markPaid).toHaveBeenCalledWith("po1", "admin1", undefined, undefined);

    await controller.changeStatus("po1", "admin1", { status: "failed", notes: "x" });
    expect(payoutService.markFailed).toHaveBeenCalledWith("po1", "admin1", "x");
  });

  it("forwards the bank reference through to markPaid", async () => {
    await controller.changeStatus("po1", "admin1", {
      status: "paid",
      reference: "FT26073012345",
    });
    expect(payoutService.markPaid).toHaveBeenCalledWith(
      "po1",
      "admin1",
      undefined,
      "FT26073012345",
    );
  });

  it("MINOR: estimate passes a requested periodEnd through to the service", async () => {
    // The Generate preview is period-scoped like the draft it previews;
    // omitted, estimateForVendor defaults to "2999-12-31" (all time), which
    // is how the dialog could show money the draft would not include.
    await controller.estimate("v1", "2026-07-15");
    expect(payoutService.estimateForVendor).toHaveBeenCalledWith("v1", "2026-07-15");
    await controller.estimate("v1");
    expect(payoutService.estimateForVendor).toHaveBeenLastCalledWith("v1", undefined);
  });

  it("R4-C1: void forwards to voidFailedPayout with the reason", async () => {
    await controller.void("po1", "admin1", "no transfer ever went out");
    expect(payoutService.voidFailedPayout).toHaveBeenCalledWith(
      "po1",
      "admin1",
      "no transfer ever went out",
    );
  });

  it("getTimeline returns audit rows for entity_id, ordered ASC", async () => {
    const rows = await controller.getTimeline("po1");
    expect(rows.length).toBe(1);
  });

  describe("error translation", () => {
    it("translates PAYOUT_NOT_DRAFT to a 409 on approve", async () => {
      const err: any = new Error("Only pending drafts can be approved");
      err.code = "PAYOUT_NOT_DRAFT";
      payoutService.approveDraft = mock(() => Promise.reject(err));

      await expect(
        controller.approve("po1", "admin1", PayoutRail.stripe_connect),
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it.each([
      ["Vendor has no Stripe account; cannot generate payout", 400],
      ["Vendor has no primary bank account; cannot generate payout", 400],
      ["Vendor has no pending commissions", 400],
      ["Vendor not found", 404],
    ])("translates the expected draft failure %p to a %p", async (message, statusCode) => {
      // Ordinary admin mistakes, not server faults — they must not 500.
      payoutService.enqueueGenerate = mock(() => Promise.reject(new Error(message as string)));

      await expect(
        controller.generate("admin1", {
          vendorId: "v1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
        }),
      ).rejects.toMatchObject({ statusCode });
    });

    it.each([
      ["PAYOUT_NOT_VOIDABLE", 409],
      ["PAYOUT_VOID_REASON_REQUIRED", 400],
    ])("translates %p to a %p on void", async (code, statusCode) => {
      const err: any = new Error("nope");
      err.code = code;
      payoutService.voidFailedPayout = mock(() => Promise.reject(err));

      await expect(controller.void("po1", "admin1", "reason")).rejects.toMatchObject({
        statusCode,
      });
    });

    it("translates 'Payout not found' to a 404 on void", async () => {
      payoutService.voidFailedPayout = mock(() => Promise.reject(new Error("Payout not found")));
      await expect(controller.void("po1", "admin1", "reason")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("R4-C2: translates PAYOUT_TRANSFER_ALREADY_SENT to a 409 on changeStatus and retry", async () => {
      // changeStatus had NO translation at all, so every expected refusal
      // here surfaced as a 500.
      const err: any = new Error("already has a Stripe transfer");
      err.code = "PAYOUT_TRANSFER_ALREADY_SENT";
      payoutService.markFailed = mock(() => Promise.reject(err));
      await expect(
        controller.changeStatus("po1", "admin1", { status: "failed", notes: "x" }),
      ).rejects.toMatchObject({ statusCode: 409 });

      payoutService.retry = mock(() => Promise.reject(err));
      await expect(controller.retry("po1", "admin1")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("translates the markPaid/markFailed state guards to 4xx instead of 500", async () => {
      payoutService.markPaid = mock(() =>
        Promise.reject(new Error("Payout must be in 'processing' to mark as paid")),
      );
      await expect(
        controller.changeStatus("po1", "admin1", { status: "paid" }),
      ).rejects.toMatchObject({ statusCode: 409 });

      payoutService.markFailed = mock(() =>
        Promise.reject(new Error("notes are required when marking a payout as failed")),
      );
      await expect(
        controller.changeStatus("po1", "admin1", { status: "failed" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("translates the manual-rail missing-reference guard to a 400 on changeStatus", async () => {
      payoutService.markPaid = mock(() =>
        Promise.reject(
          new Error("a bank reference is required when marking a manual payout as paid"),
        ),
      );
      await expect(
        controller.changeStatus("po1", "admin1", { status: "paid" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("translates PAYOUT_RETRY_INVALID_RAIL to a 409 on retry", async () => {
      const err: any = new Error(
        "Payout PAY-2026-000001 was paid by manual bank transfer; there is no transfer to retry.",
      );
      err.code = "PAYOUT_RETRY_INVALID_RAIL";
      payoutService.retry = mock(() => Promise.reject(err));

      await expect(controller.retry("po1", "admin1")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("translates 'Payout not found' to a 404 on approve", async () => {
      const err = new Error("Payout not found");
      payoutService.approveDraft = mock(() => Promise.reject(err));

      await expect(
        controller.approve("po1", "admin1", PayoutRail.stripe_connect),
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("translates PAYOUT_NOT_DRAFT to a 409 on reject", async () => {
      const err: any = new Error("Only pending drafts can be rejected");
      err.code = "PAYOUT_NOT_DRAFT";
      payoutService.rejectDraft = mock(() => Promise.reject(err));

      await expect(controller.reject("po1", "admin1", "wrong period")).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it("FIX 2: translates PAYOUT_RECONCILIATION_FAILED to a 409 on approve", async () => {
      const err: any = new Error(
        "Reconciliation failed before transfer: commissions currently claiming this payout total 8950 fils but the draft was built expecting 17900",
      );
      err.code = "PAYOUT_RECONCILIATION_FAILED";
      payoutService.approveDraft = mock(() => Promise.reject(err));

      await expect(
        controller.approve("po1", "admin1", PayoutRail.manual_bank_transfer),
      ).rejects.toMatchObject({ statusCode: 409, message: err.message });
    });

    it("propagates an unexpected error unchanged instead of demoting it to a 400", async () => {
      const boom = new Error("connection terminated unexpectedly");
      payoutService.approveDraft = mock(() => Promise.reject(boom));

      await expect(controller.approve("po1", "admin1", PayoutRail.stripe_connect)).rejects.toBe(
        boom,
      );
    });

    it("propagates an unexpected error unchanged on reject too", async () => {
      const boom = new TypeError("Cannot read properties of undefined (reading 'id')");
      payoutService.rejectDraft = mock(() => Promise.reject(boom));

      await expect(controller.reject("po1", "admin1", "wrong period")).rejects.toBe(boom);
    });

    it("translates PAYOUT_DUPLICATE to a 409 on generate", async () => {
      const err: any = new Error("A payout for this vendor and period already exists");
      err.code = "PAYOUT_DUPLICATE";
      payoutService.enqueueGenerate = mock(() => Promise.reject(err));

      await expect(
        controller.generate("admin1", {
          vendorId: "v1",
          periodStart: "2026-04-01",
          periodEnd: "2026-04-30",
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("propagates an unexpected error from generate unchanged instead of demoting it to a 400", async () => {
      const boom = new Error("connection terminated unexpectedly");
      payoutService.enqueueGenerate = mock(() => Promise.reject(boom));

      await expect(
        controller.generate("admin1", {
          vendorId: "v1",
          periodStart: "2026-04-01",
          periodEnd: "2026-04-30",
        }),
      ).rejects.toBe(boom);
    });

    it("translates PAYOUT_RETRY_INVALID_STATUS to a 409 on retry", async () => {
      const err: any = new Error("Only failed payouts can be retried");
      err.code = "PAYOUT_RETRY_INVALID_STATUS";
      payoutService.retry = mock(() => Promise.reject(err));

      await expect(controller.retry("po1", "admin1")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("translates 'Payout not found' to a 404 on retry", async () => {
      const err = new Error("Payout not found");
      payoutService.retry = mock(() => Promise.reject(err));

      await expect(controller.retry("po1", "admin1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("propagates an unexpected error from retry unchanged instead of demoting it to a 400", async () => {
      const boom = new TypeError("Cannot read properties of undefined (reading 'id')");
      payoutService.retry = mock(() => Promise.reject(boom));

      await expect(controller.retry("po1", "admin1")).rejects.toBe(boom);
    });
  });

  describe("revealBank", () => {
    it("refuses a plain admin", async () => {
      await expect(
        controller.revealBank("po1", { id: "admin1", role: "admin" }),
      ).rejects.toMatchObject({ statusCode: 403 });

      // The refusal must be a hard stop: no bank row was looked up, nothing
      // was decrypted, and no audit row was written. A leak-adjacent bug
      // here would be "decrypt happens, only the return value is withheld" —
      // that would still put plaintext through memory/logs on a 403 path.
      expect(vendorBankAccountRepo.findOne).not.toHaveBeenCalled();
      expect(vendorEncryption.decrypt).not.toHaveBeenCalled();
      expect(auditRows.length).toBe(0);
    });

    it("returns decrypted details and writes an audit row for a super_admin", async () => {
      const result = await controller.revealBank("po1", { id: "sa1", role: "super_admin" });

      expect(result).toEqual({
        account_holder_name: "Acme Perfumes LLC",
        bank_name: "Emirates NBD",
        account_number: "1234567890",
        iban: "AE070331234567890123456",
        swift_code: "EBILAEAD",
        currency: "AED",
        account_deleted: false,
      });

      expect(auditRows.length).toBe(1);
      const row = auditRows[0];
      expect(row.action).toBe("payout.bank_details_revealed");
      expect(row.actor_id).toBe("sa1");
      expect(row.actor_role).toBe("super_admin");
      expect(row.entity_type).toBe("vendor_payout");
      expect(row.entity_id).toBe("po1");
      expect(row.metadata).toMatchObject({ bank_account_id: "bank1", vendor_id: "vendor1" });

      // The lookup must ask for soft-deleted rows too (see the
      // "still resolves when the bank account has been soft-deleted" test
      // below for why) — this pins that the flag is actually passed, not
      // just that the fixture happens to return a live row either way.
      expect(vendorBankAccountRepo.findOne).toHaveBeenCalledWith({
        where: { id: "bank1" },
        withDeleted: true,
      });
    });

    it("still resolves when the bank account has been soft-deleted, flagging account_deleted", async () => {
      // A payout snapshots the bank_account_id it was drafted against,
      // deliberately: if the vendor has since replaced their bank account
      // (soft-deleting the old one), the payout still owes money to the
      // account it was drafted against. TypeORM's default findOne excludes
      // soft-deleted rows, which would otherwise 404 the one endpoint that
      // exists to let an admin pay this out — recoverable only via direct DB
      // access. This must still succeed, and flag the caller so they can
      // decide whether to still pay a since-removed account.
      vendorBankAccountRepo.findOne = mock(() =>
        Promise.resolve({
          id: "bank1",
          account_holder_name: "Acme Perfumes LLC",
          bank_name: "Emirates NBD",
          account_number_encrypted: "enc-acct",
          iban_encrypted: "enc-iban",
          swift_code: "EBILAEAD",
          currency: "AED",
          deleted_at: new Date("2026-07-20T00:00:00Z"),
        }),
      );

      const result = await controller.revealBank("po1", { id: "sa1", role: "super_admin" });

      expect(result.account_deleted).toBe(true);
      expect(result.iban).toBe("AE070331234567890123456");
      expect(auditRows.length).toBe(1);
    });

    it("404s when the payout does not exist, without touching the bank repo or audit log", async () => {
      await expect(
        controller.revealBank("nope", { id: "sa1", role: "super_admin" }),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(vendorBankAccountRepo.findOne).not.toHaveBeenCalled();
      expect(auditRows.length).toBe(0);
    });

    it("404s when the payout has no matching bank account row, and writes no audit row", async () => {
      vendorBankAccountRepo.findOne = mock(() => Promise.resolve(null));

      await expect(
        controller.revealBank("po1", { id: "sa1", role: "super_admin" }),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(vendorEncryption.decrypt).not.toHaveBeenCalled();
      expect(auditRows.length).toBe(0);
    });

    it("returns iban: null (without decrypting) when the vendor has no IBAN on file", async () => {
      vendorBankAccountRepo.findOne = mock(() =>
        Promise.resolve({
          id: "bank1",
          account_holder_name: "Acme Perfumes LLC",
          bank_name: "Emirates NBD",
          account_number_encrypted: "enc-acct",
          iban_encrypted: null,
          swift_code: "EBILAEAD",
          currency: "AED",
        }),
      );

      const result = await controller.revealBank("po1", { id: "sa1", role: "super_admin" });

      expect(result.iban).toBeNull();
      expect(vendorEncryption.decrypt).toHaveBeenCalledTimes(1);
      expect(vendorEncryption.decrypt).toHaveBeenCalledWith("enc-acct");
    });
  });

  describe("estimate", () => {
    it("rides the primary-bank-account precondition along with the totals", async () => {
      const result: any = await controller.estimate("v1", "2026-07-15");
      expect(result.has_primary_bank_account).toBe(true);
      expect(payoutService.hasPrimaryBankAccount).toHaveBeenCalledWith("v1");
    });

    it("reports false for a vendor with no primary account, so the dialog can block", async () => {
      payoutService.hasPrimaryBankAccount = mock(() => Promise.resolve(false));
      const result: any = await controller.estimate("v1");
      expect(result.has_primary_bank_account).toBe(false);
      // The money figures still come through — the operator needs to see what
      // is being blocked, not an empty panel.
      expect(result.pending_count).toBe(0);
    });
  });

  /**
   * The statement is the one payout document that leaves the platform. Two
   * things must hold: the bank details on it are MASKED (revealBank stays the
   * only place a full IBAN is produced), and a missing payout 404s rather than
   * 500s.
   */
  describe("statement", () => {
    beforeEach(() => {
      payoutService.getStatementData = mock((id: string) => {
        if (id !== "po1") return Promise.reject(new Error("Payout not found"));
        return Promise.resolve({
          payout: {
            id: "po1",
            vendor_id: "vendor1",
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
            created_at: new Date("2026-07-31T00:00:00Z"),
            vendor: { business_name: "MaterialHub UAE", name: "MaterialHub UAE", vat_number: null },
          },
          bank: {
            id: "bank1",
            bank_name: "Emirates NBD",
            account_holder_name: "Acme Perfumes LLC",
            account_number_encrypted: "enc-acct",
            iban_encrypted: "enc-iban",
            currency: "AED",
          },
          commissions: [],
          commissionCount: 0,
          adjustments: [],
        });
      });
    });

    it("returns a PDF buffer and a filename built from the payout reference", async () => {
      const result = await controller.statement("po1");
      expect(result.filename).toBe("payout-statement-PAY-2026-000004.pdf");
      expect(result.reference).toBe("PAY-2026-000004");
      expect(result.vendorId).toBe("vendor1");
      expect(result.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    });

    it("masks the bank details rather than embedding a full account number", async () => {
      await controller.statement("po1");
      // Decrypt then mask, both values — the plaintext never reaches the PDF.
      expect(vendorEncryption.mask).toHaveBeenCalledWith("1234567890");
      expect(vendorEncryption.mask).toHaveBeenCalledWith("AE070331234567890123456");
    });

    it("404s for an unknown payout instead of surfacing a 500", async () => {
      await expect(controller.statement("nope")).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
