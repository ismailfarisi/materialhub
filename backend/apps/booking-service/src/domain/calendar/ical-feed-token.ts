// ical-feed-token.ts
//
// Phase 6 Task 5 (docs/superpowers/plans/2026-07-08-booking-phase-6-offplatform.md,
// "Outbound iCal feed") — a signed, sessionless token binding a single
// `staff_member` id, verified by `ical-feed.routes.ts` before any DB access.
// Mirrors order-service's domain/checkout/quote/quote-token.ts: `node:crypto`
// `createHmac("sha256", ...)`, a 16-byte truncated digest, base64url-encoded,
// compared with `timingSafeEqual` behind a length pre-check (never feed
// attacker-controlled-length buffers to `timingSafeEqual` — it throws on a
// length mismatch instead of returning false).
//
// ── Long-lived, no expiry (deliberate divergence from quote-token.ts) ───────
// A quote token is single-use-ish and short-lived — checkout happens minutes
// after a quote is issued, so quote-token.ts bakes `issuedAt` into the MAC and
// callers re-derive/compare it against a freshness window. This token is the
// opposite: a vendor pastes the issued URL into their OTHER platform's
// "subscribe to calendar" field ONCE, and that platform then polls the URL
// indefinitely — for months or years, unattended, with no re-issue flow. Any
// expiry would eventually break every already-subscribed feed with no way for
// the calendar app to notice or recover. So there is NO expiry in this token
// at all.
//
// ── Revocation model ─────────────────────────────────────────────────────────
// Because the token never expires, the only revocation lever is rotating
// `config.bookings.icalFeedSecret` (env `BOOKING_ICAL_FEED_SECRET`) —
// GLOBAL: rotating it invalidates every issued feed URL for every staff
// member at once, not just one. That's an acceptable Phase 6 tradeoff (the
// blast radius is "every vendor re-issues their feed URLs"); a scoped,
// per-staff revocation (e.g. an epoch/nonce column bumped when a vendor wants
// to invalidate just ONE staff member's feed) is a Phase 7+ concern. The `v1`
// version prefix below exists so that future scheme can be introduced as a
// new token format (`v2_...`) without breaking verification of already-issued
// `v1_...` tokens mid-rollout.
import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function macPayload(staffId: string): string {
  return `${TOKEN_VERSION}|${staffId}`;
}

/**
 * Signs a long-lived feed token bound to `staffId`. Deterministic — the same
 * `(secret, staffId)` pair always produces the same token, so re-issuing the
 * feed URL (CalendarFeedUrlService.issue) never needs to store or look up
 * anything; it just re-derives.
 */
export function signIcalFeedToken(secret: string, staffId: string): string {
  const mac = createHmac("sha256", secret).update(macPayload(staffId)).digest().subarray(0, 16);
  return `${TOKEN_VERSION}_${b64url(mac)}`;
}

/**
 * Constant-time verification that `token` was signed for `staffId` under
 * `secret`. Returns `false` (never throws) for a missing/malformed/wrong-
 * version/wrong-length/tampered/wrong-staff token — every failure path looks
 * identical to the caller, so a route can safely 401 without leaking which
 * check failed.
 */
export function verifyIcalFeedToken(secret: string, token: string, staffId: string): boolean {
  if (!token || !token.startsWith(`${TOKEN_VERSION}_`)) return false;
  const expected = signIcalFeedToken(secret, staffId);
  // Length pre-check: timingSafeEqual throws (not returns false) on a length
  // mismatch, and comparing two different-length buffers would itself leak
  // via a thrown exception's timing/shape. Same pattern as quote-token.ts's
  // verifyQuoteToken — but built as Buffers FIRST and pre-checked on the
  // BUFFERS' byte length, not the strings' UTF-16 `.length`. A crafted token
  // can have equal `String.length` but a different UTF-8 byte length (e.g.
  // one ASCII char replaced by a 2-byte character) — comparing string
  // `.length` passes that guard while `timingSafeEqual` still throws on the
  // resulting byte-length mismatch (fix cycle 1, review finding "Minor —
  // 500 on crafted token"; inherited verbatim from quote-token.ts, which has
  // the same bug and is intentionally NOT touched here, out of scope).
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (expectedBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(expectedBuf, tokenBuf);
}
