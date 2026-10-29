import { describe, expect, test } from "bun:test";
import { resolveUpstream } from "./proxy.ts";

describe("resolveUpstream", () => {
  test("resolves /auth to auth service", () => {
    const result = resolveUpstream("/auth");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3001");
    expect(result!.upstreamPath).toBe("/auth");
  });

  test("resolves /auth/login to auth service", () => {
    const result = resolveUpstream("/auth/login");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3001");
    expect(result!.upstreamPath).toBe("/auth/login");
  });

  test("resolves /products to product service", () => {
    const result = resolveUpstream("/products");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3002");
  });

  test("resolves /products/123 to product service", () => {
    const result = resolveUpstream("/products/123");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3002");
    expect(result!.upstreamPath).toBe("/products/123");
  });

  test("resolves /services/:slug (PDP) to product service", () => {
    const result = resolveUpstream("/services/glow-facial");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3002");
  });

  test("resolves /services/:slug/availability to booking service", () => {
    const result = resolveUpstream("/services/glow-facial/availability");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3009");
    expect(result!.upstreamPath).toBe("/services/glow-facial/availability");
  });

  test("resolves /orders to order service", () => {
    const result = resolveUpstream("/orders");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves /orders/checkout/initiate to order service", () => {
    const result = resolveUpstream("/orders/checkout/initiate");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves admin order cancellation to order service", () => {
    const result = resolveUpstream("/admin/orders/11111111-1111-1111-1111-111111111111/cancel");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
    expect(result!.upstreamPath).toBe("/admin/orders/11111111-1111-1111-1111-111111111111/cancel");
  });

  test("resolves /admin/payout-adjustments to order service (guards against silent-404 regression)", () => {
    // This prefix has shipped a silent-404 regression before (admin shipment
    // routes, see admin shipment sub-routes test below) — a missing entry
    // here 404s in production with no visible error. GET/POST both route
    // through the same prefix registration.
    const list = resolveUpstream("/admin/payout-adjustments");
    const create = resolveUpstream("/admin/payout-adjustments");
    expect(list).not.toBeNull();
    expect(create).not.toBeNull();
    expect(list!.target).toContain("3003");
    expect(list!.upstreamPath).toBe("/admin/payout-adjustments");
  });

  test("resolves /admin/payouts/:id/adjustments to order service", () => {
    const result = resolveUpstream(
      "/admin/payouts/57cd3877-0418-4400-9039-1ec6470cf44e/adjustments",
    );
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
    expect(result!.upstreamPath).toBe(
      "/admin/payouts/57cd3877-0418-4400-9039-1ec6470cf44e/adjustments",
    );
  });

  test("resolves admin shipment sub-routes (status/history/events) to order service", () => {
    for (const path of [
      "/admin/shipments/57cd3877-0418-4400-9039-1ec6470cf44e/events",
      "/admin/shipments/57cd3877-0418-4400-9039-1ec6470cf44e/history",
      "/admin/shipments/57cd3877-0418-4400-9039-1ec6470cf44e/status",
    ]) {
      const result = resolveUpstream(path);
      expect(result).not.toBeNull();
      expect(result!.target).toContain("3003");
      expect(result!.upstreamPath).toBe(path);
    }
  });

  test("resolves /vendors to vendor service", () => {
    const result = resolveUpstream("/vendors");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3004");
  });

  test("resolves /vendor/reels-program to vendor service", () => {
    const result = resolveUpstream("/vendor/reels-program");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3004");
    expect(result!.upstreamPath).toBe("/vendor/reels-program");
  });

  test("resolves /me/follows/vendors/:id to vendor service", () => {
    const single = resolveUpstream("/me/follows/vendors/abc-123");
    const recent = resolveUpstream("/me/follows/vendors/recent");
    expect(single).not.toBeNull();
    expect(recent).not.toBeNull();
    expect(single!.target).toContain("3004");
    expect(recent!.target).toContain("3004");
    expect(single!.upstreamPath).toBe("/me/follows/vendors/abc-123");
    expect(recent!.upstreamPath).toBe("/me/follows/vendors/recent");
  });

  test("resolves /vendor/reels-program/opt-in to vendor service", () => {
    const result = resolveUpstream("/vendor/reels-program/opt-in");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3004");
    expect(result!.upstreamPath).toBe("/vendor/reels-program/opt-in");
  });

  test("resolves /notifications to notification service", () => {
    const result = resolveUpstream("/notifications");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3005");
  });

  test("resolves /cart to order service", () => {
    const result = resolveUpstream("/cart");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves /cart/items to order service", () => {
    const result = resolveUpstream("/cart/items");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves /checkout/initiate to order service", () => {
    const result = resolveUpstream("/checkout/initiate");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves /webhooks/tamara to order service", () => {
    const result = resolveUpstream("/webhooks/tamara");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
    expect(result!.upstreamPath).toBe("/webhooks/tamara");
  });

  test("resolves /buyer/orders to order service", () => {
    const result = resolveUpstream("/buyer/orders");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves /reviews to order service", () => {
    const result = resolveUpstream("/reviews");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves /shipping/rates to order service", () => {
    const result = resolveUpstream("/shipping/rates");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3003");
  });

  test("resolves /categories to product service", () => {
    const result = resolveUpstream("/categories/tree");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3002");
  });

  test("resolves /brands to product service", () => {
    const result = resolveUpstream("/brands");
    expect(result).not.toBeNull();
    expect(result!.target).toContain("3002");
  });

  test("resolves /gift/boxes to product service", () => {
    const boxes = resolveUpstream("/gift/boxes");
    const occasions = resolveUpstream("/gift/occasions");
    const admin = resolveUpstream("/admin/gift/occasions");
    expect(boxes).not.toBeNull();
    expect(occasions).not.toBeNull();
    expect(admin).not.toBeNull();
    expect(boxes!.target).toContain("3002");
    expect(occasions!.target).toContain("3002");
    expect(admin!.target).toContain("3002");
    expect(boxes!.upstreamPath).toBe("/gift/boxes");
    expect(admin!.upstreamPath).toBe("/admin/gift/occasions");
  });

  test("resolves /admin/gift-fulfillment to order service", () => {
    const list = resolveUpstream("/admin/gift-fulfillment");
    const detail = resolveUpstream("/admin/gift-fulfillment/abc-123");
    const slip = resolveUpstream("/admin/gift-fulfillment/abc-123/packing-slip");
    expect(list).not.toBeNull();
    expect(detail).not.toBeNull();
    expect(slip).not.toBeNull();
    expect(list!.target).toContain("3003");
    expect(detail!.target).toContain("3003");
    expect(slip!.target).toContain("3003");
  });

  test("returns null for unknown paths", () => {
    expect(resolveUpstream("/unknown")).toBeNull();
    expect(resolveUpstream("/")).toBeNull();
    expect(resolveUpstream("/api/something")).toBeNull();
  });

  test("does not match partial prefix (e.g. /authorize)", () => {
    // /authorize should NOT match /auth
    expect(resolveUpstream("/authorize")).toBeNull();
  });

  test("does not match /productsextra", () => {
    expect(resolveUpstream("/productsextra")).toBeNull();
  });

  test("preserves full path as upstreamPath", () => {
    const result = resolveUpstream("/vendors/abc-123/payouts");
    expect(result).not.toBeNull();
    expect(result!.upstreamPath).toBe("/vendors/abc-123/payouts");
  });

  test("/vendors/me/payouts routes to order service (more specific than /vendors)", () => {
    const estimate = resolveUpstream("/vendors/me/payouts/estimate");
    const list = resolveUpstream("/vendors/me/payouts");
    const otherVendor = resolveUpstream("/vendors/abc-123/foo");
    expect(estimate).not.toBeNull();
    expect(list).not.toBeNull();
    expect(otherVendor).not.toBeNull();
    // Both payout paths must hit the same upstream (order-service), and
    // unrelated /vendors/* paths must continue to hit vendor-service.
    expect(estimate!.target).toBe(list!.target);
    expect(estimate!.target).not.toBe(otherVendor!.target);
  });
});
