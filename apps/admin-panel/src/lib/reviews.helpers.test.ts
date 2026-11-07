import { describe, expect, it } from "vitest";
import { reviewModeration } from "./reviews.helpers";

describe("reviewModeration", () => {
  it("pending and hidden (flagged) reviews can be approved or rejected", () => {
    expect(reviewModeration({ status: "pending" })).toEqual({
      canApprove: true,
      canReject: true,
      approveLabel: "Approve",
    });
    expect(reviewModeration({ status: "flagged", flag_count: 3 }).canReject).toBe(true);
  });

  it("a live review with reports can be kept (dismissing reports) or taken down", () => {
    expect(reviewModeration({ status: "approved", flag_count: 1 })).toEqual({
      canApprove: true,
      canReject: true,
      approveLabel: "Keep published",
    });
  });

  it("an unreported live review or a rejected one has no actions", () => {
    expect(reviewModeration({ status: "approved", flag_count: 0 }).canApprove).toBe(false);
    expect(reviewModeration({ status: "rejected" }).canReject).toBe(false);
  });
});
