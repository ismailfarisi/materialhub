import { describe, expect, test } from "bun:test";
import { resolveUpstream } from "./proxy.ts";

describe("resolveUpstream", () => {
  test("routes RFQ prefixes to the order service", () => {
    for (const path of [
      "/buyer/quotes",
      "/buyer/quotes/abc/suppliers/x/accept",
      "/vendor/quotes/abc",
      "/admin/quotes",
    ]) {
      const result = resolveUpstream(path);
      expect(result?.target).toContain("3003");
      expect(result?.upstreamPath).toBe(path);
    }
  });

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

  test("returns null for unknown paths", () => {
    expect(resolveUpstream("/unknown")).toBeNull();
    expect(resolveUpstream("/")).toBeNull();
    expect(resolveUpstream("/api/something")).toBeNull();
  });

  test("returns null for removed domains (reels, booking, gifting, flash deals, affiliates, referrals)", () => {
    for (const path of [
      "/reels",
      "/users/abc-123",
      "/me/reels",
      "/me/creator",
      "/admin/reels",
      "/admin/creators",
      "/vendor/reels",
      "/vendor/reels-program",
      "/booking",
      "/bookings",
      "/admin/bookings",
      "/me/bookings",
      "/vendor/booking",
      "/services/glow-facial",
      "/services/glow-facial/availability",
      "/admin/service-offerings",
      "/vendor/services",
      "/manage/blocks",
      "/calendar/staff/abc/feed.ics",
      "/gift/boxes",
      "/admin/gift",
      "/admin/gift-fulfillment",
      "/admin/flash-deals",
      "/vendor/flash-deals",
      "/admin/affiliates",
      "/vendor/affiliates",
      "/me/affiliate",
      "/a/AFF-ABC12345",
      "/ref/CODE",
      "/me/referral-code",
      "/me/referrals",
    ]) {
      expect(resolveUpstream(path)).toBeNull();
    }
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

describe("business accounts routing (workstream 3)", () => {
  test("admin business accounts go to auth-service", () => {
    expect(resolveUpstream("/admin/business-accounts/x")!.target).toContain("3001");
  });
  test("receivables and invoices go to order-service", () => {
    const auth = resolveUpstream("/auth")!.target;
    expect(resolveUpstream("/admin/receivables")!.target).not.toBe(auth);
    expect(resolveUpstream("/invoices/abc/xml")!.target).toBe(resolveUpstream("/checkout")!.target);
    expect(resolveUpstream("/admin/receivables")!.target).toBe(
      resolveUpstream("/checkout")!.target,
    );
  });
});

describe("resolveUpstream: routes that used to be shadowed or unrouted", () => {
  const cases: Array<[string, string, string]> = [
    // [path, expected port, why]
    ["/webhooks/stripe/connect", "3004", "Stripe Connect webhook lives in vendor-service"],
    ["/webhooks/stripe", "3003", "payment webhook stays in order-service"],
    ["/admin/role-permissions", "3004", "admin role-permission matrix"],
    ["/admin/role-permissions/vendor", "3004", "admin role-permission matrix update"],
    ["/vendor/brands", "3002", "vendor brand requests"],
    ["/vendor-members/invite/tok123", "3004", "invite preview"],
    ["/vendor-members/accept", "3004", "invite accept"],
    ["/vendors/me/reviews/abc/reply", "3003", "vendor review reply (order-service)"],
    ["/vendors/me/payouts", "3003", "payout history"],
    ["/vendors/abc/profile", "3004", "public vendor profile"],
    [
      "/products/11111111-1111-1111-1111-111111111111/reviews",
      "3003",
      "product reviews (order-service)",
    ],
    [
      "/products/11111111-1111-1111-1111-111111111111/questions",
      "3002",
      "product questions stay in product-service",
    ],
    ["/products/11111111-1111-1111-1111-111111111111", "3002", "product detail"],
  ];
  for (const [path, port, why] of cases) {
    test(`${path} → :${port} (${why})`, () => {
      const result = resolveUpstream(path);
      expect(result?.target).toEndWith(`:${port}`);
      expect(result?.upstreamPath).toBe(path);
    });
  }

  test("/internal/* is never routed publicly", () => {
    expect(resolveUpstream("/internal/inventory/adjust")).toBeNull();
    expect(resolveUpstream("/internal/orders/verified-purchase")).toBeNull();
  });
});
