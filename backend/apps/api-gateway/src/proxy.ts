import { config } from "@materialhub/config";

interface ServiceRoute {
  prefix: string;
  target: string;
}

const auth = `http://${config.serviceHost.auth}:${config.port.auth}`;
const product = `http://${config.serviceHost.product}:${config.port.product}`;
const order = `http://${config.serviceHost.order}:${config.port.order}`;
const vendor = `http://${config.serviceHost.vendor}:${config.port.vendor}`;
const notification = `http://${config.serviceHost.notification}:${config.port.notification}`;
const cms = `http://${config.serviceHost.cms}:${config.port.cms}`;
const reels = `http://${config.serviceHost.reels}:${config.port.reels}`;
const integration = `http://${config.serviceHost.integration}:${config.port.integration}`;
const booking = `http://${config.serviceHost.booking}:${config.port.booking}`;

const serviceRoutes: ServiceRoute[] = [
  // Auth service — admin routes must come before generic prefixes
  { prefix: "/admin/users", target: auth },
  { prefix: "/admin/auth", target: auth },
  { prefix: "/auth", target: auth },
  // Product service — admin routes must come before generic prefixes
  { prefix: "/admin/categories", target: product },
  { prefix: "/admin/brands", target: product },
  { prefix: "/admin/attributes", target: product },
  { prefix: "/admin/search", target: product },
  { prefix: "/admin/collections", target: product },
  { prefix: "/admin/gift", target: product },
  // Admin approval surface for the booking catalog (product-service owns
  // service_offerings). Distinct from `/services` (public PDP) and
  // `/vendor/services` (vendor CRUD); no collision with either.
  { prefix: "/admin/service-offerings", target: product },
  { prefix: "/attributes", target: product },
  { prefix: "/admin/products", target: product },
  { prefix: "/products", target: product },
  { prefix: "/categories", target: product },
  { prefix: "/collections", target: product },
  { prefix: "/services", target: product },
  { prefix: "/booking", target: booking },
  // Admin booking oversight (cross-vendor list/detail + admin completion).
  // Must precede nothing in particular — no other prefix matches
  // "/admin/bookings" — but kept beside the other booking prefixes.
  { prefix: "/admin/bookings", target: booking },
  // Customer booking APIs (Phase 4 Task 8, spec §8): POST /bookings/hold,
  // POST /bookings, GET /bookings/:id. Plural — does NOT collide with the
  // `/booking` (singular) prefix above: `"/bookings".startsWith("/booking/")`
  // is false (the char after `/booking` is `s`, not `/`), and `/bookings` !==
  // `/booking`, so resolveUpstream's exact/prefix-with-slash match never hits
  // the singular route for this path.
  { prefix: "/bookings", target: booking },
  { prefix: "/gift", target: product },
  { prefix: "/brands", target: product },
  { prefix: "/inventory", target: product },
  { prefix: "/media", target: product },
  // Auth service — referrals
  { prefix: "/ref", target: auth },
  { prefix: "/me/referral-code", target: auth },
  { prefix: "/me/referrals", target: auth },
  // Customer's own bookings (Phase 4 Task 8) → booking-service. No generic
  // `/me` prefix exists anywhere in this list (every `/me/*` entry is a full,
  // specific prefix — see also /me/recent-searches, /me/follows/vendors,
  // /me/reels, /me/creator below), so `/me/bookings` can't be shadowed by an
  // earlier broader match; resolveUpstream's first-match-wins semantics are
  // safe here without the explicit-regex special case `/services/:slug
  // /availability` needed above (that one collides with product-service's
  // broad `/services` prefix — this one doesn't collide with anything).
  { prefix: "/me/bookings", target: booking },
  // Product service — trending searches (public, no auth)
  { prefix: "/search/trending", target: product },
  // Product service — personalization
  { prefix: "/wishlist", target: product },
  { prefix: "/recently-viewed", target: product },
  { prefix: "/me/recent-searches", target: product },
  { prefix: "/saved-searches", target: product },
  { prefix: "/recommendations", target: product },
  { prefix: "/admin/cart-abandonment", target: order },
  // Order service — admin and vendor sub-routes
  { prefix: "/admin/dashboard", target: order },
  { prefix: "/vendor/dashboard", target: order },
  { prefix: "/admin/orders", target: order },
  { prefix: "/admin/reviews", target: order },
  { prefix: "/admin/returns", target: order },
  { prefix: "/admin/disputes", target: order },
  { prefix: "/admin/commissions", target: order },
  { prefix: "/admin/payouts", target: order },
  { prefix: "/admin/payout-adjustments", target: order },
  { prefix: "/admin/gift-fulfillment", target: order },
  { prefix: "/admin/payment-methods", target: order },
  { prefix: "/admin/shipping-rates", target: order },
  { prefix: "/admin/shipping-contribution-tiers", target: order },
  { prefix: "/admin/shipping-providers", target: order },
  // Admin shipment sub-routes (PATCH status, GET history, GET events) live in
  // order-service's shipment-tracking.routes. Distinct from /admin/shipping-*.
  { prefix: "/admin/shipments", target: order },
  { prefix: "/vendor/shipping-integrations", target: order },
  { prefix: "/vendor/warehouses", target: order },
  { prefix: "/webhooks/shipping", target: order },
  // Coupon management → order-service
  { prefix: "/admin/coupons", target: order },
  { prefix: "/vendor/coupons", target: order },
  { prefix: "/admin/promotions", target: order },
  // Flash deal management → product-service
  { prefix: "/admin/flash-deals", target: product },
  { prefix: "/vendor/flash-deals", target: product },
  { prefix: "/vendor/product-groups", target: product },
  { prefix: "/vendor/services", target: product },
  { prefix: "/vendor/booking", target: booking },
  // Vendor /manage surface (Phase 6): manual walk-in/phone booking (Task 1
  // — POST /manage/bookings) + block time/break (Task 2 — POST/GET
  // /manage/blocks, DELETE /manage/blocks/:id). No other `/manage`-prefixed
  // route exists anywhere in this list, so placement doesn't matter for
  // first-match-wins, but kept next to the other booking-service prefixes
  // for readability.
  { prefix: "/manage", target: booking },
  // Outbound signed iCal feed (Phase 6 Task 5 — GET
  // /calendar/staff/:id/feed.ics?token=...). Public/token-signed, NOT
  // session-authenticated — see libs/guards/src/jwt-auth.ts's isPublicRoute
  // bypass for this same prefix.
  { prefix: "/calendar", target: booking },
  // AI image enhance settings → product-service
  { prefix: "/admin/settings/ai", target: product },
  // Bulk-jobs (Phase 0/1/2) → product-service
  { prefix: "/bulk", target: product },
  { prefix: "/vendor/orders", target: order },
  { prefix: "/admin/vendor-orders", target: order },
  { prefix: "/vendor/returns", target: order },
  { prefix: "/orders", target: order },
  { prefix: "/cart", target: order },
  { prefix: "/checkout", target: order },
  { prefix: "/buyer", target: order },
  { prefix: "/reviews", target: order },
  { prefix: "/shipping", target: order },
  { prefix: "/disputes", target: order },
  { prefix: "/webhooks/stripe", target: order },
  { prefix: "/webhooks/tamara", target: order },
  { prefix: "/webhooks/carrier", target: order },
  // Vendor service — admin routes first
  { prefix: "/admin/vendors", target: vendor },
  { prefix: "/admin/affiliates", target: vendor },
  { prefix: "/vendor/reels-program", target: vendor },
  { prefix: "/vendor/affiliates", target: vendor },
  // Payout history lives in order-service (alongside commissions). Must
  // precede the generic /vendors prefix because resolveUpstream is
  // first-match-wins.
  { prefix: "/vendors/me/payouts", target: order },
  { prefix: "/vendors", target: vendor },
  // Vendor follow endpoints (PR #143) live on the vendor-service:
  // POST/DELETE/GET /me/follows/vendors/:id and GET /me/follows/vendors/recent
  { prefix: "/me/follows/vendors", target: vendor },
  // Affiliate-user dashboard (earnings, my-affiliations, accept invite, links, payout)
  { prefix: "/me/affiliate", target: vendor },
  { prefix: "/webhooks/stripe/connect", target: vendor },
  // Integration service — vendor-managed integrations + admin views + inbound webhooks
  { prefix: "/admin/sales-channels", target: integration },
  { prefix: "/admin/integrations", target: integration },
  { prefix: "/vendor/integrations", target: integration },
  { prefix: "/integrations/inbound", target: integration },
  // Notification service
  { prefix: "/notifications", target: notification },
  { prefix: "/newsletter", target: notification },
  { prefix: "/webhooks/whatsapp", target: notification },
  // CMS service
  { prefix: "/admin/layouts", target: cms },
  { prefix: "/vendor-layouts", target: cms },
  { prefix: "/admin/section-types", target: cms },
  { prefix: "/section-types", target: cms },
  { prefix: "/admin/bids", target: cms },
  { prefix: "/vendor/bids", target: cms },
  { prefix: "/admin/header-navigation", target: cms },
  { prefix: "/navigation", target: cms },
  { prefix: "/layouts", target: cms },
  { prefix: "/admin/audit-log", target: cms },
  { prefix: "/pages", target: cms },
  { prefix: "/banners", target: cms },
  { prefix: "/settings", target: cms },
  { prefix: "/support", target: cms },
  // Reels service — admin and owner-scoped routes must come before
  // the generic /reels prefix since resolveUpstream is first-match-wins.
  { prefix: "/admin/reels/analytics", target: reels }, // must precede /admin/reels
  { prefix: "/admin/reels", target: reels },
  { prefix: "/admin/creators", target: reels },
  { prefix: "/vendor/reels/analytics", target: reels }, // must precede generic /vendor/reels
  { prefix: "/vendor/reels", target: reels }, // discovery + shortlist (after analytics; /vendor/reels-program matches earlier)
  { prefix: "/me/reels", target: reels },
  { prefix: "/me/creator", target: reels },
  // Public user profiles + follow graph (reels-service): GET /users/:id,
  // POST /users/:id/follow, GET /users/:id/followers|following.
  { prefix: "/users", target: reels },
  { prefix: "/reels", target: reels },
  // Public affiliate link resolve/click + attribution capture (vendor-service)
  { prefix: "/a", target: vendor },
];

/**
 * Resolve which upstream service handles this request path.
 */
export function resolveUpstream(path: string): { target: string; upstreamPath: string } | null {
  // Availability lives in booking-service, but the `/services` prefix routes the
  // PDP (`GET /services/:slug`) to product-service. Match the availability suffix
  // explicitly and first so it reaches booking-service.
  if (/^\/services\/[^/]+\/availability$/.test(path)) {
    return { target: booking, upstreamPath: path };
  }
  for (const route of serviceRoutes) {
    if (path === route.prefix || path.startsWith(`${route.prefix}/`)) {
      return {
        target: route.target,
        upstreamPath: path,
      };
    }
  }
  return null;
}

/**
 * Forward an HTTP request to the upstream service.
 */
export async function proxyRequest(
  request: Request,
  target: string,
  upstreamPath: string,
  correlationId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const upstreamUrl = `${target}${upstreamPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("x-correlation-id", correlationId);
  headers.set("x-forwarded-for", headers.get("x-forwarded-for") || "unknown");
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    (init as any).duplex = "half";
  }

  const response = await fetch(upstreamUrl, init);
  return response;
}
