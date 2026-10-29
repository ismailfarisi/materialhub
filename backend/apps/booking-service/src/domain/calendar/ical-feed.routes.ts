// ical-feed.routes.ts
//
// Phase 6 Task 5 — the outbound signed `.ics` feed. Public (no JWT): a
// vendor's OTHER platform (Google Calendar, Fresha, Outlook, ...) fetches
// this URL directly, unauthenticated in the session sense — the signed
// `token` query param IS the auth, verified BEFORE any DB access
// (ical-feed-token.ts). Registered as a bypass in
// libs/guards/src/jwt-auth.ts's `isPublicRoute` (comment there mirrors the
// `/reels/webhooks/` HMAC-auth precedent) rather than requiring a JWT, and
// added to api-gateway's proxy.ts so the gateway forwards it at all.
//
// ── Route shape deviation from the plan doc ──────────────────────────────────
// The plan/brief's literal shape is `GET /calendar/staff/:id.ics?token=...`.
// Elysia's router (unlike Express's path-to-regexp) does not support a
// partial-segment param + literal-suffix pattern like `:id.ics` — a `:param`
// only ever matches a WHOLE path segment. There is no existing route
// anywhere in this monorepo that puts a literal extension directly after a
// dynamic param for this reason. Per the brief's own fallback guidance, this
// uses `GET /calendar/staff/:id/feed.ics` instead — `:id` matches the whole
// `staff-id` segment, and `feed.ics` is a plain static trailing segment (the
// dot inside a static segment is not a router concern, only a literal
// string). Functionally identical from the calendar-app's point of view: any
// `.ics`-suffixed URL is accepted as a calendar subscription.
import { config } from "@materialhub/config";
import { UnauthorizedError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";
import { verifyIcalFeedToken } from "./ical-feed-token.ts";

export const icalFeedRoutes = new Elysia({ prefix: "/calendar" }).use(container).get(
  "/staff/:id/feed.ics",
  // biome-ignore lint/suspicious/noExplicitAny: container-decorated context is loosely typed
  async ({ params, query, set, icalFeedService }: any) => {
    const token = typeof query.token === "string" ? query.token : "";
    // Verified BEFORE any DB access (binding decision) — an invalid,
    // missing, or wrong-staff token 401s without ever touching the
    // engagement repo, so an unknown/nonexistent staff id combined with a
    // guessed token never distinguishes "staff doesn't exist" from "token is
    // wrong" (both just fail verification identically).
    if (!verifyIcalFeedToken(config.bookings.icalFeedSecret, token, params.id)) {
      throw new UnauthorizedError("Invalid or missing calendar feed token");
    }

    const ics = await icalFeedService.forStaff(params.id);
    set.headers["content-type"] = "text/calendar; charset=utf-8";
    set.headers["content-disposition"] = `inline; filename="staff-${params.id}.ics"`;
    return ics;
  },
  { params: t.Object({ id: t.String({ format: "uuid" }) }) },
);
