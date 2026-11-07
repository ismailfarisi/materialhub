import { describe, expect, it } from "vitest";
import { buildResolvePayload, disputeActions, disputeCategoryLabel, senderLabel } from "./disputes.helpers";

describe("buildResolvePayload", () => {
  const base = { resolution: "Corners crushed in transit", amountAed: "", refundMethod: "wallet" as const };

  it("sends `decision` (not the old `resolution: refund_buyer`) and the note as `resolution`", () => {
    expect(buildResolvePayload({ ...base, decision: "seller" })).toEqual({
      payload: { decision: "seller", resolution: "Corners crushed in transit" },
    });
  });

  it("converts the AED amount to fils and carries the refund method", () => {
    expect(
      buildResolvePayload({ ...base, decision: "buyer", amountAed: "125.50", refundMethod: "original_payment" }),
    ).toEqual({
      payload: {
        decision: "buyer",
        resolution: "Corners crushed in transit",
        resolution_amount: 12550,
        refund_method: "original_payment",
      },
    });
  });

  it("a buyer decision without an amount sends no refund fields", () => {
    expect(buildResolvePayload({ ...base, decision: "buyer", amountAed: "0" })).toEqual({
      payload: { decision: "buyer", resolution: "Corners crushed in transit" },
    });
  });

  it("drops the amount for a supplier decision", () => {
    const out = buildResolvePayload({ ...base, decision: "seller", amountAed: "50" });
    expect(out).toEqual({ payload: { decision: "seller", resolution: "Corners crushed in transit" } });
  });

  it("refuses a blank note, a bad amount and an amount above the cap", () => {
    expect(buildResolvePayload({ ...base, decision: "buyer", resolution: "  " })).toHaveProperty("error");
    expect(buildResolvePayload({ ...base, decision: "buyer", amountAed: "abc" })).toHaveProperty("error");
    expect(buildResolvePayload({ ...base, decision: "buyer", amountAed: "-5" })).toHaveProperty("error");
    expect(buildResolvePayload({ ...base, decision: "buyer", amountAed: "300" }, 25000)).toHaveProperty("error");
    expect(buildResolvePayload({ ...base, decision: "buyer", amountAed: "250" }, 25000)).toHaveProperty("payload");
  });
});

describe("disputeActions", () => {
  it("mirrors the backend state machine", () => {
    expect(disputeActions("opened")).toMatchObject({ canAssign: true, canEscalate: false, canResolve: false });
    expect(disputeActions("under_review")).toMatchObject({ canAssign: true, canEscalate: true, canResolve: true });
    expect(disputeActions("escalated")).toMatchObject({ canEscalate: false, canResolve: true, canClose: false });
    expect(disputeActions("resolved_buyer")).toMatchObject({ canAssign: false, canResolve: false, canClose: true });
    expect(disputeActions("closed")).toMatchObject({ canClose: false, canMessage: false });
  });
});

describe("labels", () => {
  it("names categories and senders", () => {
    expect(disputeCategoryLabel("not_as_described")).toBe("Not as described");
    expect(disputeCategoryLabel("brand_new_value")).toBe("Brand new value");
    expect(senderLabel("vendor")).toBe("Supplier");
    expect(senderLabel("super_admin")).toBe("MaterialHub");
    expect(senderLabel("customer")).toBe("Buyer");
  });
});
