import { describe, expect, test } from "bun:test";
import {
  canBusiness,
  normalizeBusinessInput,
  normalizeNetTermsApplication,
  toCreditView,
  touchesVerification,
} from "./business-rules.ts";

const today = new Date("2026-11-06T08:00:00Z");
const valid = {
  legal_name: "Gulf Rigid Box Workshop LLC",
  trade_licence_number: "SHJ-55120",
  trade_licence_expiry: "2027-08-31",
  vat_registered: true,
  trn: "100-2345-6780-0003",
  billing_address: {
    line1: "Industrial Area 13",
    city: "Sharjah",
    emirate: "Sharjah",
    country_code: "AE",
  },
};

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe("business input", () => {
  test("normalises a valid company and derives the Peppol ID", () => {
    const out = normalizeBusinessInput(valid, { partial: false, userId: "u1", today });
    expect(out.trn).toBe("100234567800003");
    expect(out.peppol_participant_id).toBe("0235:1002345678");
    expect(out.billing_address?.country_code).toBe("AE");
  });

  test("TRN must be 15 digits", () => {
    expect(
      code(() =>
        normalizeBusinessInput({ ...valid, trn: "1234" }, { partial: false, userId: "u1", today }),
      ),
    ).toBe("TRN_INVALID");
  });

  test("VAT-registered companies need a TRN; others drop it", () => {
    expect(
      code(() =>
        normalizeBusinessInput({ ...valid, trn: null }, { partial: false, userId: "u1", today }),
      ),
    ).toBe("TRN_REQUIRED");
    const out = normalizeBusinessInput(
      { ...valid, vat_registered: false },
      { partial: false, userId: "u1", today },
    );
    expect(out.trn).toBeNull();
    expect(out.peppol_participant_id).toBeNull();
  });

  test("an expired licence is refused", () => {
    expect(
      code(() =>
        normalizeBusinessInput(
          { ...valid, trade_licence_expiry: "2026-11-06" },
          { partial: false, userId: "u1", today },
        ),
      ),
    ).toBe("LICENCE_EXPIRED");
  });

  test("licence document must be the caller's own upload", () => {
    expect(
      code(() =>
        normalizeBusinessInput(
          { ...valid, trade_licence_document_key: "private/business/someone-else/x/licence.pdf" },
          { partial: false, userId: "u1", today },
        ),
      ),
    ).toBe("LICENCE_KEY_INVALID");
    const ok = normalizeBusinessInput(
      { ...valid, trade_licence_document_key: "private/business/u1/abc/licence.pdf" },
      { partial: false, userId: "u1", today },
    );
    expect(ok.trade_licence_document_key).toBe("private/business/u1/abc/licence.pdf");
  });

  test("partial update checks the TRN rule against the stored row", () => {
    expect(
      code(() =>
        normalizeBusinessInput(
          { trn: null },
          {
            partial: true,
            userId: "u1",
            today,
            existing: { vat_registered: true, trn: "100234567800003" },
          },
        ),
      ),
    ).toBe("TRN_REQUIRED");
    const out = normalizeBusinessInput(
      { approval_threshold_fils: 500000 },
      {
        partial: true,
        userId: "u1",
        today,
        existing: { vat_registered: true, trn: "100234567800003" },
      },
    );
    expect(out).toEqual({ approval_threshold_fils: 500000 });
  });

  test("editing the TRN or licence sends the account back to review", () => {
    const existing = { trn: "100234567800003", legal_name: "A", trade_licence_number: "1" };
    expect(touchesVerification({ trn: "100234567800011" }, existing)).toBe(true);
    expect(touchesVerification({ trn: "100234567800003" }, existing)).toBe(false);
    expect(touchesVerification({ approval_threshold_fils: 10 }, existing)).toBe(false);
  });
});

describe("roles", () => {
  test("admin manages, approver approves, buyer buys", () => {
    expect(canBusiness("admin", "manage_members")).toBe(true);
    expect(canBusiness("approver", "manage_members")).toBe(false);
    expect(canBusiness("approver", "decide_approvals")).toBe(true);
    expect(canBusiness("buyer", "decide_approvals")).toBe(false);
    expect(canBusiness("buyer", "view_all_invoices")).toBe(false);
    expect(canBusiness(null, "edit_profile")).toBe(false);
    expect(canBusiness("owner", "edit_profile")).toBe(false);
  });
});

describe("net terms", () => {
  test("application needs net 30/60 and a positive limit", () => {
    expect(
      normalizeNetTermsApplication({ terms: "net_60", requested_limit_fils: 2_500_000 }),
    ).toEqual({
      terms: "net_60",
      requested_limit_fils: 2_500_000,
      note: null,
    });
    expect(
      code(() => normalizeNetTermsApplication({ terms: "net_90", requested_limit_fils: 1 })),
    ).toBe("FIELD_INVALID");
    expect(
      code(() => normalizeNetTermsApplication({ terms: "net_30", requested_limit_fils: 0 })),
    ).toBe("FIELD_INVALID");
  });

  test("credit view shows available credit only when approved", () => {
    const row = {
      status: "approved",
      terms: "net_30",
      requested_limit_fils: 5_000_000,
      credit_limit_fils: 4_000_000,
      outstanding_fils: 1_500_000,
      applied_at: today,
      decided_at: today,
      decision_note: null,
    };
    expect(toCreditView(row, { count: 1, fils: 300_000 })).toMatchObject({
      available_fils: 2_500_000,
      overdue_count: 1,
      overdue_fils: 300_000,
    });
    expect(toCreditView({ ...row, status: "suspended" })?.available_fils).toBe(0);
    expect(toCreditView(null)).toBeNull();
  });
});
