// admin-booking.auth-wiring.test.ts
//
// admin-booking.routes.test.ts only proves 401-on-unauthenticated for the
// three admin booking paths. That is necessary but not sufficient: a guard
// mis-wiring that 401s EVERY caller unconditionally (the historical bug class
// in this repo — omitting `jwtAuth` from the guard's own Elysia instance, see
// project_elysia_guard_wiring) would produce byte-identical results to the
// unauthenticated tests. This file proves the POSITIVE direction: a valid
// customer JWT is rejected with 403 (not 401) — i.e. requireRole is actually
// discriminating on role, not just requiring "any token" — and a valid admin
// JWT gets PAST jwtAuth + requireRole("admin", "super_admin") into the
// handler. It also proves ?page=-5 is rejected as a 400 validation error
// before the handler runs, for an authenticated admin caller.
//
// NO DB, NO mock.module: this file imports the REAL ../../app.ts, same as
// its sibling admin-booking.routes.test.ts and the service-root
// route-auth-wiring.test.ts. An earlier version of this file mock.module'd
// ../../container.ts down to a stub so the positive-path assertions could
// check res.status === 200 against recorded stub calls. That worked when
// this file ran alone, but bun:test's module registry is process-wide: when
// the whole service runs as one `bun test src/` process, route-auth-wiring.test.ts
// (src/route-auth-wiring.test.ts) statically imports the real app.ts, which
// transitively imports the real ../../container.ts — and whichever import
// wins the race owns the "../../container.ts" specifier for the rest of the
// process. The mock lost that race (confirmed empirically, and not
// reliably fixable by filename/ordering tricks), so the "positive" tests hit
// the real, DB-less BookingQueryService and failed with
// `No metadata for "Booking" was found` instead of the stubbed 200. Rather
// than re-fight that race, this file asserts only what's true without a DB
// or a stub:
//   - jwtAuth + requireRole run BEFORE any service is touched (401 vs 403
//     vs "reached the handler" are all decided pre-DB), so those properties
//     are safe to assert against the real app.
//   - The query schema (t.Numeric with a minimum) is validated by Elysia
//     BEFORE the handler runs, so ?page=-5 -> 400 needs no DB either.
//   - "The admin JWT got past the guard" is asserted as a NEGATIVE property
//     (status is neither 401 nor 403) rather than a positive 200, because
//     past the guard the handler calls the real bookingQueryService, which
//     has no initialised DataSource in this test process and throws — caught
//     by errorHandler and turned into a 500. That 500 is the expected,
//     meaningful outcome here: it is proof the request cleared jwtAuth and
//     requireRole and reached application code, not evidence of a broken
//     test. (This is the same DB-less-500-as-proof-of-reachability pattern
//     used for the real Booking metadata error this file was originally
//     written to route around.)
import { describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import jwt from "jsonwebtoken";
import { app } from "../../app.ts";

const UUID = "11111111-1111-4111-8111-111111111111";

function signAdmin(): string {
  return jwt.sign(
    { sub: "22222222-2222-4222-8222-222222222222", email: "admin@test.local", role: "admin" },
    config.jwt.accessSecret,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

function signCustomer(): string {
  return jwt.sign(
    { sub: "33333333-3333-4333-8333-333333333333", email: "cust@test.local", role: "customer" },
    config.jwt.accessSecret,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

async function req(method: string, path: string, token?: string): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }),
  );
}

describe("admin-booking.routes.ts auth wiring (role check actually discriminates)", () => {
  it("a valid customer JWT is rejected with 403, not 401 (role check actually runs)", async () => {
    const res = await req("GET", "/admin/bookings", signCustomer());
    // biome-ignore lint/suspicious/noExplicitAny: loosely-typed JSON body
    const json = (await res.json().catch(() => ({}))) as any;
    // This is the load-bearing assertion in this file: requireRole returns
    // 401 only when `user` is absent (jwtAuth never wired in-instance — the
    // historical bug class) and 403 when `user` exists but holds the wrong
    // role. A customer token proves the guard is actually reading the role,
    // not just requiring the presence of any token.
    expect(res.status).toBe(403);
    expect(json.error).toBe("FORBIDDEN");
  });

  it("a request with no token still 401s (auth remains enforced)", async () => {
    const res = await req("GET", "/admin/bookings", undefined);
    expect(res.status).toBe(401);
  });

  it("a valid admin JWT clears the guard for GET /admin/bookings (reaches the handler)", async () => {
    const res = await req("GET", "/admin/bookings", signAdmin());
    // Neither 401 (no user) nor 403 (wrong role) — the guard let this
    // through. Past that point the handler calls the real
    // bookingQueryService against an uninitialised DataSource in this
    // DB-less test process, so a 500 here is expected: it is the handler
    // actually running, not the guard rejecting the request. See the file
    // header for why this is asserted as a negative property.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("a valid admin JWT clears the guard for GET /admin/bookings/:id (reaches the handler)", async () => {
    const res = await req("GET", `/admin/bookings/${UUID}`, signAdmin());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("a valid admin JWT clears the guard for POST /admin/bookings/:id/complete (reaches the handler)", async () => {
    const res = await req("POST", `/admin/bookings/${UUID}/complete`, signAdmin());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("admin-booking.routes.ts pagination validation", () => {
  it("?page=-5 on an authenticated admin request is a 400 validation error, not a 500", async () => {
    const res = await req("GET", "/admin/bookings?page=-5", signAdmin());
    // Elysia validates the query schema (t.Numeric({ minimum: 1 })) before
    // the handler runs, so this is decided before bookingQueryService is
    // ever touched — no DB required.
    expect(res.status).toBe(400);
  });

  it("?limit=0 is rejected (below the minimum) as a 400", async () => {
    const res = await req("GET", "/admin/bookings?limit=0", signAdmin());
    expect(res.status).toBe(400);
  });

  it("?limit=101 is rejected (above the maximum) as a 400", async () => {
    const res = await req("GET", "/admin/bookings?limit=101", signAdmin());
    expect(res.status).toBe(400);
  });
});
