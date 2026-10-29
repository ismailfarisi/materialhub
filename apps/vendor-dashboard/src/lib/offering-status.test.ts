import { describe, expect, test } from "vitest";
import { getOfferingStatusActions } from "./offering-status";

// The regression this guards: an untrusted vendor was told Publish made the
// service "bookable on the storefront immediately" while the server rewrote the
// request to pending_review. The copy must follow the server's verdict.

describe("getOfferingStatusActions — publish copy follows the server verdict", () => {
  test("promises immediate bookability only when the server will publish directly", () => {
    const [publish] = getOfferingStatusActions("draft", { publishRequiresReview: false });
    expect(publish?.label).toBe("Publish");
    expect(publish?.description).toContain("immediately");
  });

  test("promises review, not bookability, when the server will hold it", () => {
    const [publish] = getOfferingStatusActions("draft", { publishRequiresReview: true });
    expect(publish?.label).toBe("Submit for review");
    expect(publish?.description).not.toContain("immediately");
    expect(publish?.description).toMatch(/review/i);
  });

  test("applies the same rule to a paused offering being republished", () => {
    const [publish] = getOfferingStatusActions("paused", { publishRequiresReview: true });
    expect(publish?.label).toBe("Submit for review");
    expect(publish?.description).not.toContain("immediately");
  });

  test("still sends `published` over the wire — the DTO rejects pending_review", () => {
    for (const status of ["draft", "paused", "rejected"] as const) {
      const [action] = getOfferingStatusActions(status, { publishRequiresReview: true });
      expect(action?.next).toBe("published");
    }
  });

  test("leaves non-publish transitions untouched by the trust state", () => {
    const trusted = getOfferingStatusActions("published", { publishRequiresReview: false });
    const untrusted = getOfferingStatusActions("published", { publishRequiresReview: true });
    expect(untrusted).toEqual(trusted);
    expect(trusted.map((a) => a.label)).toEqual(["Pause", "Archive"]);
  });

  test("offers no action while an offering is already awaiting review", () => {
    expect(getOfferingStatusActions("pending_review", { publishRequiresReview: true })).toEqual([]);
  });

  test("rejected always reads as a resubmission regardless of trust", () => {
    for (const publishRequiresReview of [true, false]) {
      const [action] = getOfferingStatusActions("rejected", { publishRequiresReview });
      expect(action?.label).toBe("Resubmit for review");
    }
  });
});
