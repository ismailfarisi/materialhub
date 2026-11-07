/**
 * Route-level regression test: unknown ids on dispute / review / payout
 * routes answer 404 (they used to 500 — plain Errors, a plain Error carrying
 * `statusCode`, and route→controller method-name mismatches).
 *
 * Imports the REAL route files with the real jwtAuth / requireRole guards and
 * the module's errorHandler; mock.module("../container.ts") injects the REAL
 * controllers over real services whose repositories are in-memory stubs that
 * know no rows.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { AdminPayoutController } from "../domain/commission/admin-payout.controller.ts";
import { DisputeController } from "../domain/disputes/dispute.controller.ts";
import { DisputeService } from "../domain/disputes/dispute.service.ts";
import { ReviewController } from "../domain/reviews/review.controller.ts";
import { ReviewService } from "../domain/reviews/review.service.ts";

const OWN_DISPUTE = "22222222-2222-4222-8222-222222222222";
const MISSING = "99999999-9999-4999-8999-999999999999";
const DISPUTE_VENDOR = "33333333-3333-4333-8333-333333333333";
const OTHER_VENDOR = "44444444-4444-4444-8444-444444444444";

const emptyRepo = () => ({
  findOne: mock(async ({ where }: any = {}) =>
    where?.id === OWN_DISPUTE
      ? { id: OWN_DISPUTE, opened_by: "cust-1", vendor_id: DISPUTE_VENDOR, status: "opened" }
      : null,
  ),
  find: mock(async () => []),
  save: mock(async (x: any) => x),
  create: mock((x: any) => x),
  query: mock(async () => []),
  createQueryBuilder: mock(() => {
    const qb: any = {};
    for (const k of ["where", "andWhere", "orderBy", "skip", "take", "leftJoin", "addSelect"])
      qb[k] = () => qb;
    qb.getOne = async () => null;
    qb.getMany = async () => [{ id: "m-1", is_internal: false }];
    qb.getManyAndCount = async () => [[], 0];
    return qb;
  }),
});

const disputeService = new DisputeService(
  emptyRepo() as any,
  emptyRepo() as any,
  emptyRepo() as any,
  emptyRepo() as any,
  emptyRepo() as any,
  emptyRepo() as any,
  {} as any,
  { add: async () => {} } as any,
  {} as any,
  emptyRepo() as any,
  {} as any,
);
const reviewService = new ReviewService(
  emptyRepo() as any,
  emptyRepo() as any,
  emptyRepo() as any,
  emptyRepo() as any,
  emptyRepo() as any,
  { add: async () => {} } as any,
);
const payoutService = { findByIdWithVendor: async () => null };

const decorations = {
  disputeController: new DisputeController(disputeService),
  reviewController: new ReviewController(reviewService),
  adminPayoutController: new AdminPayoutController(
    payoutService as any,
    emptyRepo() as any,
    emptyRepo() as any,
    {} as any,
  ),
};

mock.module("../container.ts", () => ({
  container: new Elysia({ name: "order-service-container" }).decorate(decorations),
}));

// auditPlugin writes fire-and-forget through AppDataSource — keep it off the DB.
const origGetRepository = (AppDataSource as any).getRepository;
(AppDataSource as any).getRepository = () => ({ create: (x: any) => x, save: async (x: any) => x });
afterAll(() => {
  (AppDataSource as any).getRepository = origGetRepository;
  mock.restore();
});

const { disputeRoutes } = await import("./dispute.routes.ts");
const { reviewRoutes } = await import("./review.routes.ts");
const { adminPayoutRoutes } = await import("./admin-payout.routes.ts");

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function sign(role: string, userId: string, vm?: Array<{ vid: string; r: string }>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: userId,
      email: "buyer@materialhub.test",
      role,
      ...(vm ? { vm } : {}),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = b64url(
    createHmac("sha256", config.jwt.accessSecret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

const app = new Elysia()
  .use(errorHandler)
  .decorate(decorations)
  .use(disputeRoutes as any)
  .use(reviewRoutes as any)
  .use(adminPayoutRoutes as any);

async function call(
  method: string,
  path: string,
  role: string,
  userId = `${role}-1`,
  opts: { vm?: Array<{ vid: string; r: string }>; body?: unknown } = {},
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${sign(role, userId, opts.vm)}`,
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  );
}

describe("unknown ids answer 404", () => {
  test.each([
    ["GET", `/admin/payouts/${MISSING}`, "admin"],
    ["GET", `/disputes/${MISSING}/messages`, "customer"],
    ["GET", `/disputes/${MISSING}/messages`, "admin"],
    ["PATCH", `/admin/disputes/${MISSING}/close`, "admin"],
    ["PATCH", `/admin/disputes/${MISSING}/escalate`, "admin"],
    ["PATCH", `/admin/reviews/${MISSING}/approve`, "admin"],
    ["POST", `/reviews/${MISSING}/flag`, "customer"],
    ["GET", `/buyer/disputes/${MISSING}`, "customer"],
    ["GET", `/admin/disputes/${MISSING}`, "admin"],
  ])("%s %s (%s) → 404", async (method, path, role) => {
    const res = await call(method, path, role);
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).error).toBe("NOT_FOUND");
  });
});

describe("GET /disputes/:id/messages authorization", () => {
  test("the customer who opened the dispute gets 200 with the thread", async () => {
    const res = await call("GET", `/disputes/${OWN_DISPUTE}/messages`, "customer", "cust-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  test("another customer gets the same 404 as an unknown id", async () => {
    const res = await call("GET", `/disputes/${OWN_DISPUTE}/messages`, "customer", "cust-2");
    expect(res.status).toBe(404);
  });

  test("a vendor token is still refused by the guards (unchanged)", async () => {
    const res = await call("GET", `/disputes/${OWN_DISPUTE}/messages`, "vendor");
    expect([401, 403]).toContain(res.status);
  });
});

// Supplier users are `customer` accounts whose token carries vendor memberships (`vm`).
describe("/vendor/disputes — the supplier the dispute is raised against", () => {
  const owner = [{ vid: DISPUTE_VENDOR, r: "owner" }];

  beforeAll(() => {
    // The default matrix: viewer reads orders, owner also fulfils.
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "orders.read" },
      { role: "owner", permission: "orders.fulfill" },
      { role: "viewer", permission: "orders.read" },
    ]);
  });

  test("reads the thread (200)", async () => {
    const res = await call("GET", `/vendor/disputes/${OWN_DISPUTE}/messages`, "customer", "vu-1", {
      vm: owner,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data).toHaveLength(1);
  });

  test("posts a message, stored with sender_role vendor and never internal (201)", async () => {
    const res = await call("POST", `/vendor/disputes/${OWN_DISPUTE}/messages`, "customer", "vu-1", {
      vm: owner,
      body: { message: "We can send replacement sheets of 1.5 mm greyboard this week." },
    });
    expect(res.status).toBe(200);
    const { statusCode, data } = (await res.json()) as any;
    expect(statusCode).toBe(201);
    expect(data.sender_role).toBe("vendor");
    expect(data.sender_id).toBe("vu-1");
    expect(data.is_internal).toBe(false);
  });

  test("an is_internal flag in the body is ignored: a supplier never writes an internal note", async () => {
    const res = await call("POST", `/vendor/disputes/${OWN_DISPUTE}/messages`, "customer", "vu-1", {
      vm: owner,
      body: { message: "note", is_internal: true },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.is_internal).toBe(false);
  });

  test("another supplier gets 404 for the same dispute", async () => {
    const res = await call("GET", `/vendor/disputes/${OWN_DISPUTE}/messages`, "customer", "vu-2", {
      vm: [{ vid: OTHER_VENDOR, r: "owner" }],
    });
    expect(res.status).toBe(404);
  });

  test("a viewer may read but not post (403)", async () => {
    const viewer = [{ vid: DISPUTE_VENDOR, r: "viewer" }];
    const read = await call("GET", `/vendor/disputes/${OWN_DISPUTE}/messages`, "customer", "vu-3", {
      vm: viewer,
    });
    expect(read.status).toBe(200);
    const post = await call(
      "POST",
      `/vendor/disputes/${OWN_DISPUTE}/messages`,
      "customer",
      "vu-3",
      {
        vm: viewer,
        body: { message: "hello" },
      },
    );
    expect(post.status).toBe(403);
  });
});
