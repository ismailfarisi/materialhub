import { describe, expect, test } from "bun:test";
import {
  availableCreditFils,
  checkNetTermsEligibility,
  daysOverdue,
  netTermsDueDate,
  receivableStatus,
} from "./net-terms.ts";

const base = {
  verificationStatus: "verified",
  creditStatus: "approved",
  creditLimitFils: 5_000_000, // AED 50,000
  outstandingFils: 1_200_000, // AED 12,000
  overdueCount: 0,
  amountFils: 800_000, // AED 8,000
};

describe("net terms credit check", () => {
  test("available credit is limit minus outstanding, never negative", () => {
    expect(availableCreditFils(5_000_000, 1_200_000)).toBe(3_800_000);
    expect(availableCreditFils(100, 250)).toBe(0);
  });

  test("approves an order that fits the remaining credit", () => {
    expect(checkNetTermsEligibility(base)).toEqual({ ok: true, availableFils: 3_800_000 });
  });

  test("an order exactly equal to the remaining credit fits", () => {
    expect(checkNetTermsEligibility({ ...base, amountFils: 3_800_000 }).ok).toBe(true);
  });

  test("one fil over the remaining credit is refused", () => {
    expect(checkNetTermsEligibility({ ...base, amountFils: 3_800_001 })).toEqual({
      ok: false,
      reason: "over_credit",
      availableFils: 3_800_000,
    });
  });

  test("overdue invoices block terms even with credit left", () => {
    const r = checkNetTermsEligibility({ ...base, overdueCount: 1 });
    expect(r).toMatchObject({ ok: false, reason: "overdue" });
  });

  test("account state is checked before credit", () => {
    expect(checkNetTermsEligibility({ ...base, verificationStatus: null })).toMatchObject({
      reason: "no_business",
    });
    expect(checkNetTermsEligibility({ ...base, verificationStatus: "pending" })).toMatchObject({
      reason: "not_verified",
    });
    for (const creditStatus of [null, "applied", "rejected", "suspended"]) {
      expect(checkNetTermsEligibility({ ...base, creditStatus })).toMatchObject({
        reason: "not_approved",
      });
    }
  });

  test("zero, negative and fractional amounts are refused", () => {
    for (const amountFils of [0, -10, 12.5]) {
      expect(checkNetTermsEligibility({ ...base, amountFils })).toMatchObject({
        reason: "invalid_amount",
      });
    }
  });
});

describe("due dates and overdue", () => {
  const confirmed = new Date("2026-11-06T10:00:00Z");

  test("net 30 and net 60 add calendar days", () => {
    expect(netTermsDueDate(confirmed, "net_30").toISOString()).toBe("2026-12-06T10:00:00.000Z");
    expect(netTermsDueDate(confirmed, "net_60").toISOString()).toBe("2027-01-05T10:00:00.000Z");
  });

  test("days overdue counts whole days after the due time", () => {
    const due = new Date("2026-12-06T10:00:00Z");
    expect(daysOverdue(due, new Date("2026-12-06T09:00:00Z"))).toBe(0);
    expect(daysOverdue(due, new Date("2026-12-07T09:59:00Z"))).toBe(0);
    expect(daysOverdue(due, new Date("2026-12-09T11:00:00Z"))).toBe(3);
  });

  test("receivable status", () => {
    const due = new Date("2026-12-06T10:00:00Z");
    expect(receivableStatus("authorized", due, new Date("2026-12-01T00:00:00Z"))).toBe("due");
    expect(receivableStatus("authorized", due, new Date("2026-12-07T00:00:00Z"))).toBe("overdue");
    expect(receivableStatus("captured", due, new Date("2027-02-01T00:00:00Z"))).toBe("paid");
  });
});
