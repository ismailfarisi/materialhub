import { bearer } from "@elysiajs/bearer";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { Elysia, status } from "elysia";
import type { VendorMembershipClaim } from "./token-helpers.ts";
import { getCurrentTokenVersion } from "./token-version.ts";
import type { AuthUser, UserRole } from "./types.ts";

const VALID_ROLES: readonly UserRole[] = ["super_admin", "admin", "customer", "guest"];

/**
 * JWT auth plugin — verifies access tokens and derives `user` into context.
 * Whitelisted routes skip verification.
 */
const PUBLIC_ROUTES = new Set([
  "/health",
  "/api/docs",
  "/api/docs/json",
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/phone/start",
  "/auth/phone/verify",
  "/auth/phone/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/google",
  "/auth/google/callback",
  "/auth/apple",
  "/auth/apple/callback",
  "/auth/verify-email",
  "/auth/guest",
  "/auth/magic-link",
  "/auth/magic-link/verify",
  "/auth/2fa/login-verify",
  "/auth/2fa/backup-verify",
  "/categories/tree",
  "/brands",
  "/cart/health",
  "/shipping/health",
  "/shipping/delivery-zones",
  "/shipping/delivery-zones/lookup",
  "/webhooks/stripe",
]);

export function isPublicRoute(path: string, method: string): boolean {
  if (PUBLIC_ROUTES.has(path)) return true;
  if (path.startsWith("/api/docs")) return true;
  if (path.startsWith("/media/product/")) return true;
  // Sprint 3 public catalog routes (read-only)
  if (path.startsWith("/categories/")) return true;
  if (path === "/brands" || path.startsWith("/brands/")) return true;
  // Products: public read routes only (list, detail, slug lookup, suggest,
  // questions, recommendations, reviews). Recommendations powers the PDP rails and
  // must be reachable from the unauthenticated browser.
  const isRead = method === "GET" || method === "HEAD";
  if (
    isRead &&
    (path === "/products" ||
      path === "/products/suggest" ||
      path.startsWith("/products/by-slug/") ||
      /^\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/questions|\/recommendations|\/reviews)?$/.test(
        path,
      ))
  )
    return true;
  // Collections — public storefront read (GET /collections/:slug). Admin
  // collection management lives under /admin/collections and stays gated.
  if (isRead && (path === "/collections" || path.startsWith("/collections/"))) return true;
  // Service offerings — public storefront read (GET /services/:slug). Vendor
  // management lives under /vendor/services and stays gated. This broad,
  // GET-only prefix already covers GET /services/by-id/:id too (Task 3's
  // booking-reschedule enabler) — verified rather than adding a second,
  // narrower matcher that would just be dead-code duplication of this one.
  // `=== "/services"` covers the public LIST endpoint; the prefix covers
  // GET /services/:slug and GET /services/by-id/:id. The bare path needs its
  // own clause — `startsWith("/services/")` does NOT match "/services", and
  // the resulting 401 is invisible if you only ever test the trailing-slash
  // form.
  // Booking — public storefront read of a vendor's active branches
  // (GET /booking/vendors/:id/locations). Vendor booking management lives under
  // /vendor/booking and stays gated.
  // Booking — public storefront read of an offering's eligible staff
  // (GET /booking/offerings/:id/staff), Task 0A / Phase 7 prerequisite. Tight
  // match mirroring the feed.ics bypass's precision below: GET/HEAD only,
  // exact prefix+suffix shape — not a broad /booking/ prefix (vendor booking
  // management lives under /vendor/booking and stays gated).
  // Gifting storefront — public read (occasions + predefined boxes).
  // Admin gift management lives under /admin/gift and stays gated.
  // BNPL provider thresholds power the PDP installment strip — published
  // numbers Tabby/Tamara show on their own marketing pages.
  if (isRead && path === "/checkout/bnpl-thresholds") return true;
  // Trending searches power the empty search box for guests too.
  if (isRead && path === "/search/trending") return true;
  // Delivery promise (product page, cart, checkout) — read-only estimates
  // for guests too. The batch form is a POST that changes nothing.
  if (isRead && path === "/shipping/delivery-estimate") return true;
  if (method === "POST" && path === "/shipping/delivery-estimate/batch") return true;
  if (path.startsWith("/vendors/") && path.endsWith("/profile")) return true;
  if (path.startsWith("/vendors/by-slug/")) return true;
  // Vendor team invite preview: the invitee opens the emailed link before
  // signing in. Accept/decline (POST) stay authenticated.
  if (isRead && /^\/vendor-members\/invite\/[^/]+$/.test(path)) return true;
  // Declining needs only the emailed token (the invitee may have no account).
  // Accepting stays authenticated.
  if (method === "POST" && path === "/vendor-members/decline") return true;
  // Inbound vendor-integration webhooks: authenticated by the integration's
  // HMAC signature inside the handler (InboundService), not by JWT. Without
  // this, partners could never deliver and the handler's own "inbound
  // disabled" 503 never ran.
  if (method === "POST" && /^\/integrations\/inbound\/[^/]+\/[^/]+$/.test(path)) return true;
  // Section-type registry is public metadata (read-only)
  if (path === "/section-types" || path.startsWith("/section-types/")) return true;
  if (path.startsWith("/webhooks/")) return true;
  // Reels webhooks — authenticated via HMAC signature inside the handler,
  // not JWT. Currently Cloudflare Stream video.ready / video.error events.
  // Outbound signed iCal feed (Phase 6 Task 5) — authenticated via a signed
  // token inside the handler (ical-feed-token.ts), not JWT. A vendor's other
  // platform (Google Calendar, Fresha, ...) polls this URL unattended, with
  // no ability to send a bearer token — same "not session-public" shape as
  // /reels/webhooks/ above, just query-param-signed instead of HMAC-header-
  // signed. Narrowed to GET/HEAD requests for the exact `.../feed.ics`
  // route shape (fix cycle 1, review finding "Minor — tighten the public
  // bypass"): the original `startsWith("/calendar/staff/")` opened every
  // method and every future path under that prefix to JWT-less access. Only
  // `GET .../feed.ics` exists today, so this stays exactly as permissive as
  // required and fails safe against any future `/calendar/staff/:id/<...>`
  // route landing under the same prefix.
  // Featured licensed reels — public storefront/PDP read (GET /reels/featured)
  // Public open-brief board (GET /reels/briefs/open) — non-sensitive fields only.
  // CMS public routes
  if (path.startsWith("/layouts/")) return true;
  // Header navigation (public mega-menu data)
  if (path === "/navigation/header" || path.startsWith("/navigation/header")) return true;
  // Newsletter — token unsubscribe link from marketing emails (no user context
  // needed). NOTE: /newsletter/subscribe is intentionally NOT here — it lives in
  // isOptionalAuthRoute so a logged-in token populates `user` (for user_id
  // stamping) while guests still pass without a 401. Listing it as public would
  // short-circuit with user=null and silently break logged-in attribution.
  if (path === "/newsletter/unsubscribe") return true;
  // Slack Events API webhook — authenticated by Slack request signature, not JWT.
  if (path === "/support/slack/events") return true;
  return false;
}

/**
 * Routes where authentication is OPTIONAL — a valid token populates `user`,
 * but a missing or invalid token resolves to `user = null` instead of 401.
 * Handlers on these routes are expected to fall back to a guest-session
 * identifier (e.g. via the `x-guest-session` header) to identify the owner.
 *
 * NOTE: `/cart/merge` is intentionally NOT optional — it requires a real user
 * to merge a guest cart into.
 */
function isOptionalAuthRoute(path: string, method: string): boolean {
  // Cart (GET /cart, DELETE /cart)
  if (path === "/cart") return true;
  // Cart items (POST /cart/items)
  if (path === "/cart/items") return true;
  // Cart item by variant (PATCH /cart/items/:variantId)
  if (/^\/cart\/items\/[^/]+$/.test(path)) return true;
  // Newsletter: subscribe stamps user_id when a token is present; status reads
  // the authenticated user's email. Both tolerate anonymous callers.
  if (path === "/newsletter/subscribe" && method === "POST") return true;
  if (path === "/newsletter/status" && (method === "GET" || method === "HEAD")) return true;
  // Customer support — guests chat via the x-guest-session header; logged-in
  // users are attributed via user_id. Admin (/support/admin/*) stays gated.
  if (path === "/support/tickets") return true; // POST create, GET list
  if (/^\/support\/tickets\/[^/]+$/.test(path)) return true; // GET one
  if (/^\/support\/tickets\/[^/]+\/messages$/.test(path)) return true; // POST message
  if (/^\/support\/tickets\/[^/]+\/stream$/.test(path)) return true; // GET SSE
  return false;
}

/**
 * Extract an access token from the Bearer header or any of the
 * app-scoped cookie names. App cookies are prefixed per `X-Client-App`
 * header (see auth-service/utils/auth-cookies.ts):
 *   - web    → web_access_token
 *   - admin  → admin_access_token
 *   - vendor → vendor_access_token
 * Legacy unprefixed `access_token` is still accepted for backwards compat.
 */
function extractAccessToken(
  bearerToken: string | undefined,
  cookie: Record<string, { value?: string } | undefined> | undefined,
): string | undefined {
  return (
    bearerToken ||
    (cookie?.access_token?.value as string | undefined) ||
    (cookie?.web_access_token?.value as string | undefined) ||
    (cookie?.admin_access_token?.value as string | undefined) ||
    (cookie?.vendor_access_token?.value as string | undefined)
  );
}

interface VerifiedAuth {
  user: AuthUser;
  vendorMemberships: VendorMembershipClaim[];
  tokenRevoked: boolean;
}

async function verifyAccessToken(
  accessJwt: { verify: (token: string) => Promise<unknown> },
  token: string,
): Promise<VerifiedAuth | null> {
  const payload = (await accessJwt.verify(token)) as
    | {
        sub?: unknown;
        email?: unknown;
        role?: unknown;
        tv?: unknown;
        vm?: unknown;
      }
    | false
    | null;
  if (!payload) return null;
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.role !== "string" ||
    !VALID_ROLES.includes(payload.role as UserRole)
  ) {
    return null;
  }

  let tokenRevoked = false;
  if (typeof payload.tv === "number") {
    const current = await getCurrentTokenVersion(payload.sub);
    if (current !== null && payload.tv < current) {
      tokenRevoked = true;
    }
  }

  let vm: VendorMembershipClaim[] = [];
  if (Array.isArray(payload.vm)) {
    vm = payload.vm
      .filter(
        (m): m is { vid: string; r: VendorMembershipClaim["r"] } =>
          m !== null &&
          typeof m === "object" &&
          typeof (m as { vid?: unknown }).vid === "string" &&
          ["owner", "manager", "staff", "viewer"].includes((m as { r?: unknown }).r as string),
      )
      .map((m) => ({ vid: m.vid, r: m.r }));
  }

  return {
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
    },
    vendorMemberships: vm,
    tokenRevoked,
  };
}

export const jwtAuth = new Elysia({ name: "jwt-auth" })
  .use(bearer())
  .use(
    jwt({
      name: "accessJwt",
      secret: config.jwt.accessSecret,
      alg: "HS256",
    }),
  )
  .derive({ as: "scoped" }, async ({ accessJwt, bearer, request, cookie }) => {
    const url = new URL(request.url);
    const path = url.pathname;

    if (isPublicRoute(path, request.method)) {
      return {
        user: null as AuthUser | null,
        vendorMemberships: [] as VendorMembershipClaim[],
      };
    }

    const optional = isOptionalAuthRoute(path, request.method);
    const token = extractAccessToken(
      bearer,
      cookie as Record<string, { value?: string } | undefined>,
    );

    if (!token) {
      if (optional)
        return {
          user: null as AuthUser | null,
          vendorMemberships: [] as VendorMembershipClaim[],
        };
      return status(401, {
        statusCode: 401,
        message: "Unauthorized — invalid or missing access token",
        error: "UNAUTHORIZED",
        timestamp: new Date().toISOString(),
      });
    }

    const verified = await verifyAccessToken(accessJwt, token);
    if (!verified) {
      if (optional)
        return {
          user: null as AuthUser | null,
          vendorMemberships: [] as VendorMembershipClaim[],
        };
      return status(401, {
        statusCode: 401,
        message: "Unauthorized — invalid or missing access token",
        error: "UNAUTHORIZED",
        timestamp: new Date().toISOString(),
      });
    }
    if (verified.tokenRevoked) {
      return status(401, {
        statusCode: 401,
        message: "Token has been revoked",
        error: "TOKEN_REVOKED",
        timestamp: new Date().toISOString(),
      });
    }
    return {
      user: verified.user,
      vendorMemberships: verified.vendorMemberships,
    };
  });
