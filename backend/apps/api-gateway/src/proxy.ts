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
const integration = `http://${config.serviceHost.integration}:${config.port.integration}`;

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
  { prefix: "/attributes", target: product },
  { prefix: "/admin/products", target: product },
  { prefix: "/admin/eco-declarations", target: product },
  { prefix: "/products", target: product },
  { prefix: "/categories", target: product },
  { prefix: "/collections", target: product },
  { prefix: "/brands", target: product },
  { prefix: "/inventory", target: product },
  { prefix: "/media", target: product },
  // Product service — trending searches (public, no auth)
  { prefix: "/search/trending", target: product },
  // Product service — personalization. No generic `/me` prefix exists anywhere
  // in this list (every `/me/*` entry is a full, specific prefix), so none of
  // them can be shadowed by an earlier broader match.
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
  { prefix: "/admin/payment-methods", target: order },
  { prefix: "/admin/shipping-rates", target: order },
  { prefix: "/admin/public-holidays", target: order },
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
  { prefix: "/vendor/product-groups", target: product },
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
  // Payout history lives in order-service (alongside commissions). Must
  // precede the generic /vendors prefix because resolveUpstream is
  // first-match-wins.
  { prefix: "/vendors/me/payouts", target: order },
  { prefix: "/vendors", target: vendor },
  // Vendor follow endpoints (PR #143) live on the vendor-service:
  // POST/DELETE/GET /me/follows/vendors/:id and GET /me/follows/vendors/recent
  { prefix: "/me/follows/vendors", target: vendor },
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
];

/**
 * Resolve which upstream service handles this request path.
 */
export function resolveUpstream(path: string): { target: string; upstreamPath: string } | null {
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
