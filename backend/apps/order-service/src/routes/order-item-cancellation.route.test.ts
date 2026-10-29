/**
 * Route-wiring test for POST /admin/orders/:id/cancel-items.
 *
 * Strategy mirrors vendor-admin-members.integration.test.ts: mock.module("../container.ts")
 * injects a stub orderController and the real order.routes.ts (with real jwtAuth +
 * requireRole guards + auditPlugin) is imported so role gating is exercised for real
 * rather than re-implemented in the test. auditPlugin's fire-and-forget write calls
 * AppDataSource.getRepository synchronously — that's runtime-stubbed so no DB is needed.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { Elysia } from "elysia";

// ─── Stub OrderController ──────────────────────────────────────────────────
const calls: { adminCancelItems: any[] } = { adminCancelItems: [] };
let cancelItemsResult: any = { id: "cancellation-1", status: "cancelled" };

const orderControllerStub = {
  async adminCancelItems(orderId: string, adminId: string, body: any) {
    calls.adminCancelItems.push({ orderId, adminId, body });
    return cancelItemsResult;
  },
};

// Relative specifier (matches how order.routes.ts imports it and how the other
// route tests mock it) — an absolute `import.meta.dir` path fails to match the
// resolved module on Linux CI, letting the real controller run and 500.
mock.module("../container.ts", () => ({
  container: new Elysia({ name: "order-service-container" }).decorate(
    "orderController",
    orderControllerStub,
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

const { orderRoutes } = await import("./order.routes.ts");

// ─── JWT minter (mirrors vendor-admin-members.integration.test.ts) ────────
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
  return new Elysia().use(orderRoutes as any);
}

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";

function req(method: string, path: string, token: string | undefined, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const validBody = {
  reason: "Item out of stock",
  items: [{ order_item_id: ITEM_ID, quantity: 1 }],
};

beforeEach(() => {
  calls.adminCancelItems = [];
  cancelItemsResult = { id: "cancellation-1", status: "cancelled" };
});

describe("POST /admin/orders/:id/cancel-items", () => {
  test("rejects unauthenticated requests", async () => {
    const res = await app().handle(
      req("POST", `/admin/orders/${ORDER_ID}/cancel-items`, undefined, validBody),
    );
    expect(res.status).toBe(401);
    expect(calls.adminCancelItems.length).toBe(0);
  });

  test("rejects non-admin roles", async () => {
    const res = await app().handle(
      req("POST", `/admin/orders/${ORDER_ID}/cancel-items`, sign("customer"), validBody),
    );
    expect(res.status).toBe(403);
    expect(calls.adminCancelItems.length).toBe(0);
  });

  test("admin caller reaches orderController.adminCancelItems and returns 200 { data }", async () => {
    const res = await app().handle(
      req("POST", `/admin/orders/${ORDER_ID}/cancel-items`, sign("admin"), validBody),
    );
    expect(res.status).toBe(200);
    const resBody = (await res.json()) as any;
    expect(resBody.statusCode).toBe(200);
    expect(resBody.data).toEqual(cancelItemsResult);

    expect(calls.adminCancelItems.length).toBe(1);
    expect(calls.adminCancelItems[0].orderId).toBe(ORDER_ID);
    expect(calls.adminCancelItems[0].adminId).toBe("admin-1");
    expect(calls.adminCancelItems[0].body).toEqual(validBody);
  });

  test("super_admin caller is also allowed", async () => {
    const res = await app().handle(
      req("POST", `/admin/orders/${ORDER_ID}/cancel-items`, sign("super_admin"), validBody),
    );
    expect(res.status).toBe(200);
  });

  test("422 when items array is empty", async () => {
    const res = await app().handle(
      req("POST", `/admin/orders/${ORDER_ID}/cancel-items`, sign("admin"), {
        reason: "Item out of stock",
        items: [],
      }),
    );
    expect(res.status).toBe(422);
    expect(calls.adminCancelItems.length).toBe(0);
  });
});
