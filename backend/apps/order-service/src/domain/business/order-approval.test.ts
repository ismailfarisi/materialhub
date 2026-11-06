import { describe, expect, test } from "bun:test";
import { businessBillingSnapshot, needsApproval } from "./business-context.ts";
import { approvalMatches, cartHashFor, effectiveApprovalStatus } from "./order-approval.service.ts";

const ctx = (role: "admin" | "approver" | "buyer", threshold: number | null) =>
  ({
    businessAccountId: "b1",
    memberId: "m1",
    role,
    legalName: "Gulf Rigid Box Workshop LLC",
    tradeName: null,
    trn: "100234567800003",
    peppolId: "0235:1002345678",
    tradeLicenceNumber: "SHJ-55120",
    tradeLicenceIssuer: "SEDD",
    billingAddress: {
      line1: "Industrial Area 13",
      city: "Sharjah",
      emirate: "Sharjah",
      country_code: "AE",
    },
    verificationStatus: "verified",
    approvalThresholdFils: threshold,
    credit: null,
    overdueCount: 0,
  }) as const;

describe("approval limit", () => {
  test("only buyers above the limit need approval", () => {
    expect(needsApproval(ctx("buyer", 500000), 500001)).toBe(true);
    expect(needsApproval(ctx("buyer", 500000), 500000)).toBe(false);
    expect(needsApproval(ctx("approver", 500000), 9_000_000)).toBe(false);
    expect(needsApproval(ctx("admin", 500000), 9_000_000)).toBe(false);
    expect(needsApproval(ctx("buyer", null), 9_000_000)).toBe(false);
    expect(needsApproval(null, 9_000_000)).toBe(false);
  });

  test("an approval is valid only for the same cart, requester and within 72h", () => {
    const items = [{ product_id: "p1", variant_id: "v1", quantity: 100, unit_price: 480 }];
    const hash = cartHashFor(items);
    const a = {
      status: "approved",
      expires_at: new Date(Date.now() + 3600e3),
      cart_hash: hash,
      requested_by: "u1",
    };
    expect(approvalMatches(a, hash, "u1")).toBe(true);
    expect(
      approvalMatches(
        a,
        cartHashFor([{ product_id: "p1", variant_id: "v1", quantity: 101, unit_price: 480 }]),
        "u1",
      ),
    ).toBe(false);
    expect(approvalMatches(a, hash, "u2")).toBe(false);
    const lapsed = { ...a, expires_at: new Date(Date.now() - 1000) };
    expect(effectiveApprovalStatus(lapsed)).toBe("expired");
    expect(approvalMatches(lapsed, hash, "u1")).toBe(false);
    expect(approvalMatches({ ...a, status: "used" }, hash, "u1")).toBe(false);
  });

  test("the order billing snapshot comes from the business account", () => {
    const snap = businessBillingSnapshot({ ...ctx("buyer", null) });
    expect(snap).toMatchObject({
      type: "business",
      legal_name: "Gulf Rigid Box Workshop LLC",
      trn: "100234567800003",
      address_line_1: "Industrial Area 13",
      emirate: "Sharjah",
    });
  });
});
