import { describe, expect, test } from "bun:test";
import { toPublicReview } from "./review.controller.ts";

describe("toPublicReview", () => {
  test("keeps display fields and drops internal ids and moderation data", () => {
    const out = toPublicReview({
      id: "r1",
      product_id: "p1",
      user_id: "u1",
      order_item_id: "oi1",
      vendor_id: "v1",
      approved_by: "admin1",
      rejection_reason: "x",
      status: "approved",
      rating: 5,
      title: "Crisp folds",
      body: "Kraft board held its crease.",
      media_urls: [],
      helpful_count: 2,
      created_at: "2026-11-01T00:00:00Z",
      user: {
        id: "u1",
        first_name: "Sara",
        last_name: "K",
        avatar_url: null,
        email: "s@x",
        password_hash: "h",
      },
    });
    expect(out.title).toBe("Crisp folds");
    expect(out.user).toEqual({ first_name: "Sara", last_name: "K", avatar_url: null });
    const keys = Object.keys(out);
    for (const k of [
      "user_id",
      "order_item_id",
      "vendor_id",
      "approved_by",
      "rejection_reason",
      "status",
    ]) {
      expect(keys).not.toContain(k);
    }
    expect(JSON.stringify(out)).not.toContain("password_hash");
    expect(JSON.stringify(out)).not.toContain("u1");
  });
});
