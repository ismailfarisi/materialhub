/**
 * Route-wiring tests for the vendor payout adjustment ledger:
 *   GET  /admin/payout-adjustments
 *   POST /admin/payout-adjustments
 *   GET  /admin/payouts/:id/adjustments
 *
 * Strategy mirrors order-item-cancellation.route.test.ts: mock.module("../container.ts")
 * injects a stub payoutAdjustmentService and the REAL route modules
 * (admin-payout-adjustment.routes.ts + admin-payout.routes.ts, with real jwtAuth +
 * requireRole guards, auditPlugin, and the real errorHandler) are imported so DTO
 * validation, role gating, and error translation are exercised for real rather than
 * re-implemented in the test — unlike admin-payout.integration.test.ts, which inlines
 * its own controller/route stubs.
 *
 * Covers the three known-silent registration traps for this codebase:
 *   1. gateway proxy prefix missing            -> see proxy.test.ts
 *   2. Elysia strips body fields absent from the DTO -> "strips unknown body field"
 *   3. t.Optional(x) rejects null              -> not applicable here (no nullable
 *      optional fields on these DTOs), but non-integer/zero amountFils validation is
 *      covered below as the equivalent DTO-boundary case for this route.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";

// ─── Stub PayoutAdjustmentService (stateful, mirrors the real service) ─────
type AdjustmentRow = {
  id: string;
  vendor_id: string;
  amount_fils: number;
  reason: string;
  source_type: string;
  source_id: string | null;
  settled_payout_id: string | null;
  created_by: string;
  created_at: string;
};

let rows: AdjustmentRow[] = [];
let nextId = 1;
let createError: Error | null = null;

const calls: {
  listForVendor: { vendorId: string; query: any }[];
  create: any[];
  listForPayout: string[];
} = { listForVendor: [], create: [], listForPayout: [] };

const payoutAdjustmentServiceStub = {
  async listForVendor(
    vendorId: string,
    query: { page?: number; limit?: number; unsettledOnly?: boolean },
  ) {
    calls.listForVendor.push({ vendorId, query });
    let filtered = rows.filter((r) => r.vendor_id === vendorId);
    if (query.unsettledOnly) filtered = filtered.filter((r) => r.settled_payout_id === null);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const start = (page - 1) * limit;
    return { items: filtered.slice(start, start + limit), total: filtered.length };
  },
  async create(input: {
    vendorId: string;
    amountFils: number;
    reason: string;
    adminUserId: string;
  }) {
    calls.create.push(input);
    if (createError) {
      const err = createError;
      createError = null;
      throw err;
    }
    // Mirrors PayoutAdjustmentService.create's real DB-CHECK-constraint guard.
    if (!Number.isInteger(input.amountFils) || input.amountFils === 0) {
      throw new Error("amount_fils must be a non-zero integer");
    }
    const row: AdjustmentRow = {
      id: `adj-${nextId++}`,
      vendor_id: input.vendorId,
      amount_fils: input.amountFils,
      reason: input.reason,
      source_type: "manual",
      source_id: null,
      settled_payout_id: null,
      created_by: input.adminUserId,
      created_at: new Date().toISOString(),
    };
    rows.push(row);
    return row;
  },
  async listForPayout(payoutId: string) {
    calls.listForPayout.push(payoutId);
    return rows.filter((r) => r.settled_payout_id === payoutId);
  },
};

// Relative specifier (matches how the route files import it and how the other
// order-service route tests mock it).
mock.module("../container.ts", () => ({
  container: new Elysia({ name: "order-service-container" }).decorate(
    "payoutAdjustmentService",
    payoutAdjustmentServiceStub,
  ),
}));

// auditPlugin writes fire-and-forget via AppDataSource.getRepository — stub it.
// Capture the original so it can be restored: a leaked override breaks sibling
// test files that share this process.
const origGetRepository = (AppDataSource as any).getRepository;
(AppDataSource as any).getRepository = () => ({
  create: (x: any) => x,
  save: async () => ({}),
});

afterAll(() => {
  (AppDataSource as any).getRepository = origGetRepository;
  mock.restore();
});

const { adminPayoutAdjustmentRoutes } = await import("./admin-payout-adjustment.routes.ts");
const { adminPayoutRoutes } = await import("./admin-payout.routes.ts");

// ─── JWT minter (mirrors order-item-cancellation.route.test.ts) ───────────
function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function sign(role: string, userId = "admin-1"): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: userId,
      email: "admin@x.com",
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = b64url(
    createHmac("sha256", config.jwt.accessSecret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

function app(): any {
  // errorHandler mounted the same way app.ts mounts it — so a service error
  // that isn't translated into an HttpError really does become a generic 500,
  // not a hand-rolled one.
  return new Elysia().use(errorHandler).use(adminPayoutAdjustmentRoutes).use(adminPayoutRoutes);
}

function req(method: string, path: string, token: string | undefined, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const PAYOUT_ID = "22222222-2222-4222-8222-222222222222";

const validCreateBody = { vendorId: VENDOR_ID, amountFils: 5000, reason: "Manual correction" };

beforeEach(() => {
  rows = [];
  nextId = 1;
  createError = null;
  calls.listForVendor = [];
  calls.create = [];
  calls.listForPayout = [];
});

describe("GET/POST /admin/payout-adjustments", () => {
  test("rejects unauthenticated requests", async () => {
    const res = await app().handle(
      req("GET", `/admin/payout-adjustments?vendorId=${VENDOR_ID}`, undefined),
    );
    expect(res.status).toBe(401);
    expect(calls.listForVendor.length).toBe(0);
  });

  test("rejects non-admin roles with 403", async () => {
    // "vendor" is not a platform JWT role (see VALID_ROLES in jwt-auth.ts) — a
    // vendor user token still carries role "customer" plus vendor_memberships,
    // so "customer" is the correct non-admin role to assert 403 against here.
    const res = await app().handle(
      req("GET", `/admin/payout-adjustments?vendorId=${VENDOR_ID}`, sign("customer")),
    );
    expect(res.status).toBe(403);
    expect(calls.listForVendor.length).toBe(0);
  });

  test("POST rejects non-admin roles with 403 and never reaches the service", async () => {
    const res = await app().handle(
      req("POST", "/admin/payout-adjustments", sign("customer"), validCreateBody),
    );
    expect(res.status).toBe(403);
    expect(calls.create.length).toBe(0);
  });

  test("admin creates an adjustment and the created row reflects the posted values", async () => {
    const res = await app().handle(
      req("POST", "/admin/payout-adjustments", sign("admin"), validCreateBody),
    );
    // The handler doesn't call `set.status = 201` (unlike cart/shipping routes),
    // so the wire-level HTTP status is 200 even though the JSON envelope claims
    // 201 — asserting the real observed status here, not the aspirational one.
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(201);
    expect(body.data.vendor_id).toBe(VENDOR_ID);
    expect(body.data.amount_fils).toBe(5000);
    expect(body.data.reason).toBe("Manual correction");
    expect(calls.create.length).toBe(1);
    expect(calls.create[0].adminUserId).toBe("admin-1");
  });

  test("admin lists a vendor's adjustments and sees the just-created row", async () => {
    const createRes = await app().handle(
      req("POST", "/admin/payout-adjustments", sign("admin"), validCreateBody),
    );
    expect(createRes.status).toBe(200);

    const listRes = await app().handle(
      req("GET", `/admin/payout-adjustments?vendorId=${VENDOR_ID}`, sign("admin")),
    );
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as any;
    expect(body.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.data.length).toBe(1);
    expect(body.data[0].vendor_id).toBe(VENDOR_ID);
    expect(body.data[0].amount_fils).toBe(5000);
    expect(body.data[0].reason).toBe("Manual correction");
  });

  test("unsettledOnly=true reaches the service as a filter", async () => {
    const res = await app().handle(
      req(
        "GET",
        `/admin/payout-adjustments?vendorId=${VENDOR_ID}&unsettledOnly=true`,
        sign("admin"),
      ),
    );
    expect(res.status).toBe(200);
    expect(calls.listForVendor.length).toBe(1);
    expect(calls.listForVendor[0]?.vendorId).toBe(VENDOR_ID);
    expect(calls.listForVendor[0]?.query.unsettledOnly).toBe(true);
  });

  test("GET without unsettledOnly leaves the filter undefined (not coerced to a falsy string)", async () => {
    const res = await app().handle(
      req("GET", `/admin/payout-adjustments?vendorId=${VENDOR_ID}`, sign("admin")),
    );
    expect(res.status).toBe(200);
    expect(calls.listForVendor[0]?.query.unsettledOnly).toBeUndefined();
  });

  test("amountFils: 0 is rejected with a 4xx, not a 500 and not a raw constraint violation", async () => {
    const res = await app().handle(
      req("POST", "/admin/payout-adjustments", sign("admin"), {
        vendorId: VENDOR_ID,
        amountFils: 0,
        reason: "Zero amount",
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = (await res.json()) as any;
    // Must be the clean translated message, never a raw Postgres CHECK-constraint error.
    expect(body.message).toBe("amount_fils must be a non-zero integer");
    expect(body.message).not.toMatch(/constraint|violat|postgres|duplicate key/i);
    expect(calls.create.length).toBe(1); // reached the service (DTO alone can't catch "zero")
  });

  test("a non-integer amountFils is rejected by DTO validation before reaching the service", async () => {
    const res = await app().handle(
      req("POST", "/admin/payout-adjustments", sign("admin"), {
        vendorId: VENDOR_ID,
        amountFils: 12.5,
        reason: "Fractional amount",
      }),
    );
    // errorHandler maps Elysia's native VALIDATION code to 400 (see
    // libs/plugins/src/index.ts) — asserting the 4xx range rather than the
    // exact code keeps this test from being coupled to that mapping choice;
    // what matters here is that the service was never called.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(calls.create.length).toBe(0);
  });

  test("a body field not in the DTO schema is stripped before reaching the handler", async () => {
    const res = await app().handle(
      req("POST", "/admin/payout-adjustments", sign("admin"), {
        ...validCreateBody,
        internalOnlyField: "should never arrive",
        settledPayoutId: "attempt-to-mark-settled",
      }),
    );
    expect(res.status).toBe(200);
    expect(calls.create.length).toBe(1);
    const received = calls.create[0];
    expect(received).not.toHaveProperty("internalOnlyField");
    expect(received).not.toHaveProperty("settledPayoutId");
    expect(Object.keys(received).sort()).toEqual(
      ["adminUserId", "amountFils", "reason", "vendorId"].sort(),
    );
  });

  test("an unexpected service error surfaces as a 500 without leaking the internal message", async () => {
    createError = new Error("relation vendor_payout_adjustments does not exist: pg internals");
    const res = await app().handle(
      req("POST", "/admin/payout-adjustments", sign("admin"), validCreateBody),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as any;
    expect(body.message).not.toContain("relation vendor_payout_adjustments");
    expect(body.message).not.toContain("pg internals");
    expect(body.message).toBe("Internal server error");
  });
});

describe("GET /admin/payouts/:id/adjustments", () => {
  test("rejects unauthenticated requests", async () => {
    const res = await app().handle(
      req("GET", `/admin/payouts/${PAYOUT_ID}/adjustments`, undefined),
    );
    expect(res.status).toBe(401);
    expect(calls.listForPayout.length).toBe(0);
  });

  test("rejects non-admin roles with 403", async () => {
    const res = await app().handle(
      req("GET", `/admin/payouts/${PAYOUT_ID}/adjustments`, sign("customer")),
    );
    expect(res.status).toBe(403);
    expect(calls.listForPayout.length).toBe(0);
  });

  test("admin fetches adjustments settled into a given payout", async () => {
    rows.push({
      id: "adj-settled-1",
      vendor_id: VENDOR_ID,
      amount_fils: -2000,
      reason: "Return deduction",
      source_type: "return",
      source_id: "ret-1",
      settled_payout_id: PAYOUT_ID,
      created_by: "admin-1",
      created_at: new Date().toISOString(),
    });
    const res = await app().handle(
      req("GET", `/admin/payouts/${PAYOUT_ID}/adjustments`, sign("admin")),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.length).toBe(1);
    expect(body.data[0].settled_payout_id).toBe(PAYOUT_ID);
    expect(calls.listForPayout).toEqual([PAYOUT_ID]);
  });
});
