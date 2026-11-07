/**
 * Route-level regression test for vendor fulfilment and return refunds:
 * - vendor order actions pass the acting member's USER id (JWT sub) for
 *   history and the vendor id (membership) for ownership — the vendor id used
 *   to be written as `order_status_history.changed_by` (FK to users) and every
 *   vendor action 500'd;
 * - "Create Shipment" with no `items` is accepted (ships everything unshipped);
 * - GET /vendor/orders/:id answers a real 404;
 * - admins can retry a stranded return refund.
 *
 * Imports the REAL route files with the real guards; mock.module replaces the
 * container with recording controllers.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";

const VENDOR_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_USER_ID = "55555555-5555-4555-8555-555555555555";
const VO_ID = "66666666-6666-4666-8666-666666666666";
const SHIPMENT_ID = "77777777-7777-4777-8777-777777777777";
const RETURN_ID = "88888888-8888-4888-8888-888888888888";

const vendorOrderController = {
  getById: mock(async (_id: string, _vendorId: string) => null as any),
  transition: mock(async (..._a: any[]) => ({ id: VO_ID })),
  reject: mock(async (..._a: any[]) => ({ id: VO_ID })),
  list: mock(async () => ({ data: [], total: 0 })),
};
const shipmentTrackingController = {
  createShipment: mock(async (..._a: any[]) => ({ id: SHIPMENT_ID })),
  transitionStatus: mock(async (..._a: any[]) => ({ id: SHIPMENT_ID })),
};
const returnController = {
  retryRefund: mock(async (id: string) => ({ id, status: "refunded" })),
};
const decorations = { vendorOrderController, shipmentTrackingController, returnController };

mock.module("../container.ts", () => ({
  container: new Elysia({ name: "order-service-container" }).decorate(decorations),
}));

const origGetRepository = (AppDataSource as any).getRepository;
(AppDataSource as any).getRepository = () => ({ create: (x: any) => x, save: async (x: any) => x });
afterAll(() => {
  (AppDataSource as any).getRepository = origGetRepository;
  mock.restore();
});

const { vendorOrderRoutes } = await import("./vendor-order.routes.ts");
const { shipmentTrackingRoutes } = await import("./shipment-tracking.routes.ts");
const { returnRoutes } = await import("./return.routes.ts");

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function sign(role: string, userId: string, vm?: Array<{ vid: string; r: string }>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: userId,
      email: "supplier@materialhub.test",
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
  .use(vendorOrderRoutes as any)
  .use(shipmentTrackingRoutes as any)
  .use(returnRoutes as any);

const owner = [{ vid: VENDOR_ID, r: "owner" }];

async function call(
  method: string,
  path: string,
  opts: { role?: string; userId?: string; body?: unknown } = {},
) {
  const role = opts.role ?? "customer";
  const headers: Record<string, string> = {
    authorization: `Bearer ${sign(role, opts.userId ?? MEMBER_USER_ID, role === "customer" ? owner : undefined)}`,
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

beforeAll(() => {
  permissionMatrix.__setMapForTests([
    { role: "owner", permission: "orders.read" },
    { role: "owner", permission: "orders.fulfill" },
  ]);
});
beforeEach(() => {
  for (const c of [vendorOrderController, shipmentTrackingController, returnController]) {
    for (const m of Object.values(c)) (m as any).mockClear();
  }
});

describe("vendor order actions carry the member's user id", () => {
  test("PATCH /vendor/orders/:id/status", async () => {
    const res = await call("PATCH", `/vendor/orders/${VO_ID}/status`, {
      body: { status: "processing" },
    });
    expect(res.status).toBe(200);
    expect(vendorOrderController.transition).toHaveBeenCalledWith(
      VO_ID,
      VENDOR_ID,
      "processing",
      MEMBER_USER_ID,
    );
  });

  test("POST /vendor/orders/:id/reject", async () => {
    const res = await call("POST", `/vendor/orders/${VO_ID}/reject`, {
      body: { reason: "Grade discontinued" },
    });
    expect(res.status).toBe(200);
    expect(vendorOrderController.reject).toHaveBeenCalledWith(
      VO_ID,
      VENDOR_ID,
      "Grade discontinued",
      MEMBER_USER_ID,
    );
  });

  test("PATCH /vendor/orders/:id/shipments/:sid/status", async () => {
    const res = await call("PATCH", `/vendor/orders/${VO_ID}/shipments/${SHIPMENT_ID}/status`, {
      body: { status: "picked_up", reason: "Courier collected" },
    });
    expect(res.status).toBe(200);
    expect(shipmentTrackingController.transitionStatus).toHaveBeenCalledWith(
      SHIPMENT_ID,
      { userId: MEMBER_USER_ID, vendorId: VENDOR_ID, role: "vendor" },
      expect.objectContaining({ status: "picked_up" }),
    );
  });
});

describe("POST /vendor/orders/:id/ship", () => {
  test("accepts carrier + tracking without items (the dashboard form)", async () => {
    const res = await call("POST", `/vendor/orders/${VO_ID}/ship`, {
      body: { carrier: "Aramex", tracking_number: "AWB-100" },
    });
    expect(res.status).toBe(201);
    const [voId, vendorId, body, userId] = shipmentTrackingController.createShipment.mock.calls[0]!;
    expect([voId, vendorId, userId]).toEqual([VO_ID, VENDOR_ID, MEMBER_USER_ID]);
    expect(body.items).toBeUndefined();
  });

  test("still validates explicit items", async () => {
    const res = await call("POST", `/vendor/orders/${VO_ID}/ship`, {
      body: { carrier: "Aramex", tracking_number: "AWB-100", items: [] },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /vendor/orders/:id", () => {
  test("an unknown or foreign vendor order is a real 404", async () => {
    const res = await call("GET", `/vendor/orders/${VO_ID}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).error).toBe("VENDOR_ORDER_NOT_FOUND");
  });
});

describe("POST /admin/returns/:id/refund", () => {
  test("retries the refund of a received return", async () => {
    const res = await call("POST", `/admin/returns/${RETURN_ID}/refund`, {
      role: "admin",
      userId: "99999999-0000-4000-8000-000000000001",
    });
    expect(res.status).toBe(200);
    expect(returnController.retryRefund).toHaveBeenCalledWith(RETURN_ID);
  });
});
