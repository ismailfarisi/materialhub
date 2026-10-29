// route-auth-wiring.test.ts
//
// Regression guard for the Phase 7 auth-wiring bug: every
// vendorMembership-gated route MUST `.use(jwtAuth)` in its OWN Elysia
// instance. Elysia's scoped derive does not cross plugin encapsulation, so a
// route instance that chains `.use(vendorMembership(...))` without also
// `.use(jwtAuth)` never populates `context.user` — and vendorMembership's
// `!user` branch then 401s EVERY caller, even one holding a perfectly valid
// vendor JWT (observed live: valid vendor JWT -> /vendor/booking/locations
// 401 "Authentication required").
//
// Unlike the *.integration.test.ts siblings (BOOKING_LIVE_DB-gated, real
// Postgres/Redis), this runs in plain CI with NO DB. A valid signed token +
// an intentionally-EMPTY permission matrix drives each route only as far as
// the vendorMembership guard, which then returns 403
// INSUFFICIENT_VENDOR_PERMISSION (never reaching a controller or the DB). The
// load-bearing assertion is that the status is NOT 401 and the error is NOT
// "UNAUTHORIZED" — i.e. jwtAuth populated `user`. Pre-fix each of these routes
// returned 401 UNAUTHORIZED here regardless of the token.
import { beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import { permissionMatrix } from "@materialhub/guards";
import jwt from "jsonwebtoken";
import { app } from "./app.ts";

const VENDOR_ID = "11111111-1111-1111-1111-111111111111";
const STAFF_ID = "22222222-2222-2222-2222-222222222222";
const REVIEW_ID = "33333333-3333-3333-3333-333333333333";
const LOCATION_ID = "55555555-5555-5555-5555-555555555555";

// Single membership (role=owner) so vendorMembership resolves `active`
// without an X-Active-Vendor-Id header. `tv` (token_version) deliberately
// omitted so jwtAuth skips the Redis token-version lookup — keeps this
// test DB/Redis-free.
function signVendor(): string {
  return jwt.sign(
    {
      sub: "44444444-4444-4444-4444-444444444444",
      email: "owner@test.local",
      role: "customer",
      vm: [{ vid: VENDOR_ID, r: "owner" }],
    },
    config.jwt.accessSecret,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

async function req(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

interface Case {
  file: string;
  method: string;
  path: string;
  body?: unknown;
}

// One representative vendor-membership-gated route per fixed route file.
const cases: Case[] = [
  { file: "location.routes.ts", method: "GET", path: "/vendor/booking/locations" },
  { file: "staff.routes.ts", method: "GET", path: "/vendor/booking/staff" },
  {
    file: "availability-rule.routes.ts",
    method: "GET",
    path: `/vendor/booking/staff/${STAFF_ID}/working-hours`,
  },
  {
    file: "service-review.routes.ts",
    method: "POST",
    path: `/vendor/booking/reviews/${REVIEW_ID}/reply`,
    body: { reply: "thanks for the kind words" },
  },
  // ── The six /manage/* route files (Phase 6 + Task 0A) ───────────────────
  // Added in the Phase 7 review: this suite existed precisely to lock out the
  // "vendorMembership without an in-instance jwtAuth" regression, but covered
  // none of these. All six chain `.use(jwtAuth)` correctly TODAY — these
  // cases keep it that way, since the failure mode (401 for every caller
  // holding a valid vendor JWT) is invisible until a real vendor tries it.
  { file: "block-time.routes.ts", method: "GET", path: "/manage/blocks" },
  { file: "manage-calendar.routes.ts", method: "GET", path: "/manage/calendar" },
  {
    file: "manage-booking-actions.routes.ts",
    method: "GET",
    path: "/manage/my-location-memberships",
  },
  {
    file: "calendar-subscription.routes.ts",
    method: "GET",
    path: `/manage/staff/${STAFF_ID}/calendar-subscription`,
  },
  {
    file: "calendar-feed-url.routes.ts",
    method: "POST",
    path: `/manage/staff/${STAFF_ID}/calendar-feed-url`,
  },
  {
    // The only vendorMembership-gated route in this file is a POST with a
    // required body — Elysia validates the body BEFORE the guard's
    // beforeHandle, so it must be schema-valid or the request 422s short of
    // the guard and proves nothing about the auth wiring.
    file: "manual-booking.routes.ts",
    method: "POST",
    path: "/manage/bookings",
    body: {
      staff_member_id: STAFF_ID,
      vendor_location_id: LOCATION_ID,
      starts_at: "2026-09-01T10:00:00.000Z",
      ends_at: "2026-09-01T11:00:00.000Z",
      kind: "walk_in",
    },
  },
];

describe("vendor-membership route auth wiring (jwtAuth present in each instance)", () => {
  let token = "";

  beforeAll(() => {
    // Empty matrix: owner holds NO permissions, so a request that REACHES the
    // guard 403s (INSUFFICIENT_VENDOR_PERMISSION) without touching any
    // controller/DB. If jwtAuth were missing from the instance, `user` would
    // be undefined and the guard would 401 (UNAUTHORIZED) first — the exact
    // pre-fix bug this test locks out.
    permissionMatrix.__setMapForTests([]);
    token = signVendor();
  });

  for (const c of cases) {
    it(`${c.file}: a valid vendor JWT is NOT rejected as UNAUTHORIZED (${c.method} ${c.path})`, async () => {
      const res = await req(c.method, c.path, token, c.body);
      // biome-ignore lint/suspicious/noExplicitAny: loosely-typed JSON body
      const json = (await res.json().catch(() => ({}))) as any;

      expect(res.status).not.toBe(401);
      expect(json.error).not.toBe("UNAUTHORIZED");
      // Positive proof jwtAuth populated `user`: we reached the permission
      // check (empty matrix -> 403), rather than the `!user` 401.
      expect(res.status).toBe(403);
      expect(json.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");
    });

    it(`${c.file}: a request with NO token still 401s (auth remains enforced)`, async () => {
      const res = await req(c.method, c.path, undefined, c.body);
      expect(res.status).toBe(401);
    });
  }
});
