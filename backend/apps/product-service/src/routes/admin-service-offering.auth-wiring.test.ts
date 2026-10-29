// admin-service-offering.auth-wiring.test.ts
//
// Review Finding 2 on admin-service-offering.routes.ts (Task 4): the existing
// admin-service-offering.routes.test.ts only proves 401-on-unauthenticated
// for all four routes. A guard mis-wiring that 401s EVERY caller unconditionally
// (the historical bug class in this repo — omitting `jwtAuth` from the guard's
// own Elysia instance, see service-offering.auth-wiring.test.ts and PR history
// referenced in project_elysia_guard_wiring) would produce byte-identical
// results to the unauthenticated tests. This file proves the POSITIVE
// direction: a valid admin JWT gets past jwtAuth + requireRole("admin",
// "super_admin") and reaches the controller, and a valid customer JWT is
// rejected with 403 (not 401) — i.e. requireRole is actually discriminating
// on role, not just requiring "any token".
//
// NO DB: mirrors service-offering.auth-wiring.test.ts's approach of
// `mock.module`-ing the heavy DI container (../container.ts) down to a bare
// decorated stub BEFORE importing the real route module, so the real
// `.use(jwtAuth).use(requireRole(...))` wiring is exercised while
// `serviceOfferingController` never touches Postgres.
//
// ORDERING DEPENDENCY — read before renaming this file or its sibling
// admin-service-offering.routes.test.ts:
//
// This file MUST evaluate (and therefore MUST alphabetically sort) BEFORE
// admin-service-offering.routes.test.ts within src/routes/. Two separate
// bun:test/ESM behaviors make this a hard requirement, not just tidiness:
//
//   1. mock.module() below patches the "../container.ts" specifier for the
//      whole `bun test` PROCESS, not just this file. If this file's dynamic
//      `import("./admin-service-offering.routes.ts")` (below) runs AFTER the
//      sibling's `import { app } from "../app.ts"` has already loaded that
//      same route module bound to the REAL container, this file gets back
//      the CACHED real-bound module instance — mock.module() cannot rebind
//      an already-evaluated module's already-resolved imports. The stub
//      controller would then never be invoked and every assertion below
//      that expects the stub to run (200 + adminListCalls recorded) would
//      instead hit the real serviceOfferingController and fail/500
//      (verified empirically while fixing this ordering).
//   2. Conversely, admin-service-offering.routes.test.ts imports the REAL
//      app.ts (on purpose — it proves the routes are actually mounted, not
//      404), which transitively imports the REAL ../container.ts via many
//      other route files AND bulk/index.ts's `import { bulkService,
//      productExportService } from "../container.ts"`. If the mock installed
//      here didn't also export `bulkService`/`productExportService`, that
//      later real import would throw "Export named 'X' not found" the
//      instant it evaluates — this was Task 4's original review finding,
//      and the same bug class previously cost real CI time (PR #341). Hence
//      the stub factory below exports throwaway stand-ins for those two
//      names too, even though nothing in this file's own tests uses them —
//      they exist purely so the sibling's later real-app import doesn't
//      crash while this mock is still installed process-wide.
//
// If you rename either file, you MUST preserve "this file sorts before
// admin-service-offering.routes.test.ts" AND keep the stub's export surface
// a superset of whatever container.ts consumers app.ts transitively pulls
// in (currently: container, bulkService, productExportService — re-grep
// `from ["'].*container\.ts["']` under src/ if that ever grows). CI is
// unaffected either way (backend/scripts/test-ci.sh runs one bun test
// process per file), but local `bun test` runs every file in one process.
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { config } from "@materialhub/config";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";
import jwt from "jsonwebtoken";

const UUID = "11111111-1111-4111-8111-111111111111";

// Stub controller — records calls so we can additionally assert the guard
// actually let the request flow through with the query already coerced to
// numbers (Finding 1), without any of it touching a real repository.
const adminListCalls: unknown[] = [];
const stubController = {
  adminList: async (query: unknown) => {
    adminListCalls.push(query);
    return { data: [], total: 0 };
  },
  adminGetById: async () => ({ id: UUID }),
  approve: async () => ({ id: UUID, status: "published" }),
  reject: async () => ({ id: UUID, status: "rejected" }),
};

// Stub the heavy DI container BEFORE the real route module is evaluated —
// same rationale as service-offering.auth-wiring.test.ts: importing the real
// container eagerly wires the whole service graph (BullMQ workers, AppDataSource
// repos, etc.) which is infeasible without a live DB/Redis.
//
// `bulkService`/`productExportService` are throwaway stand-ins, never used by
// this file's own tests — they exist only so that bulk/index.ts's
// `import { bulkService, productExportService } from "../container.ts"` still
// resolves when the sibling admin-service-offering.routes.test.ts later
// imports the real ../app.ts in the same process (see the ORDERING
// DEPENDENCY comment at the top of this file).
mock.module("../container.ts", () => ({
  container: new Elysia({ name: "container" }).decorate(
    "serviceOfferingController",
    stubController,
  ),
  // biome-ignore lint/suspicious/noExplicitAny: throwaway stand-in, never invoked by these tests
  bulkService: {} as any,
  // biome-ignore lint/suspicious/noExplicitAny: throwaway stand-in, never invoked by these tests
  productExportService: {} as any,
}));

const { adminServiceOfferingRoutes } = await import("./admin-service-offering.routes.ts");

const app = new Elysia().use(errorHandler).use(adminServiceOfferingRoutes);

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

describe("admin-service-offering.routes.ts auth wiring (admin reaches the controller)", () => {
  beforeEach(() => {
    adminListCalls.length = 0;
  });

  it("a valid admin JWT reaches the controller (GET /admin/service-offerings)", async () => {
    const res = await req("GET", "/admin/service-offerings", signAdmin());
    // Positive proof jwtAuth + requireRole let the request through: the guard
    // did not short-circuit it, and the stub controller actually ran.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(adminListCalls).toEqual([
      {
        page: undefined,
        limit: undefined,
        status: undefined,
        vendorId: undefined,
        search: undefined,
      },
    ]);
  });

  it("a valid admin JWT reaches the controller (POST /admin/service-offerings/:id/approve)", async () => {
    const res = await req("POST", `/admin/service-offerings/${UUID}/approve`, signAdmin());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("a valid customer JWT is rejected with 403, not 401 (role check actually runs)", async () => {
    const res = await req("GET", "/admin/service-offerings", signCustomer());
    // biome-ignore lint/suspicious/noExplicitAny: loosely-typed JSON body
    const json = (await res.json().catch(() => ({}))) as any;
    expect(res.status).toBe(403);
    expect(json.error).toBe("FORBIDDEN");
    // The controller must never have been reached for a disallowed role.
    expect(adminListCalls).toEqual([]);
  });

  it("a request with no token still 401s (auth remains enforced)", async () => {
    const res = await req("GET", "/admin/service-offerings", undefined);
    expect(res.status).toBe(401);
  });
});

describe("admin-service-offering.routes.ts pagination validation (Finding 1)", () => {
  beforeEach(() => {
    adminListCalls.length = 0;
  });

  it("?page=-5 on an authenticated admin request is a 400 validation error, not a 500", async () => {
    const res = await req("GET", "/admin/service-offerings?page=-5", signAdmin());
    expect(res.status).toBe(400);
    // Never reached the controller/query-builder — rejected at the DTO boundary.
    expect(adminListCalls).toEqual([]);
  });

  it("?limit=0 is rejected (below the minimum) as a 400", async () => {
    const res = await req("GET", "/admin/service-offerings?limit=0", signAdmin());
    expect(res.status).toBe(400);
    expect(adminListCalls).toEqual([]);
  });

  it("?limit=101 is rejected (above the maximum) as a 400", async () => {
    const res = await req("GET", "/admin/service-offerings?limit=101", signAdmin());
    expect(res.status).toBe(400);
    expect(adminListCalls).toEqual([]);
  });

  it("a valid ?page=3&limit=10 coerces to numbers before reaching the controller", async () => {
    const res = await req("GET", "/admin/service-offerings?page=3&limit=10", signAdmin());
    expect(res.status).toBe(200);
    expect(adminListCalls).toEqual([
      { page: 3, limit: 10, status: undefined, vendorId: undefined, search: undefined },
    ]);
  });
});
