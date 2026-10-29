import { describe, expect, it, mock } from "bun:test";
import { OrderStatus } from "@materialhub/database";
import { internalServiceAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import jwt from "jsonwebtoken";

const SECRET = "test-internal-secret";
process.env.INTERNAL_SERVICE_SECRET = SECRET;
const internalToken = jwt.sign({ iss: "integration-service" }, SECRET, { expiresIn: "1m" });

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

function buildApp({ vendorOrder = null as any } = {}) {
  const vendorOrderRepo = {
    findOne: mock(async (_opts: any) => vendorOrder),
  };
  const orderStatusService = {
    transitionVendorOrder: mock(async (_id: any, _status: any, _actor: any, _reason?: any) => ({
      id: "vo1",
      status: "processing",
    })),
  };

  const app = new Elysia({ prefix: "/internal/vendor-orders" }).use(internalServiceAuth).post(
    "/:id/transition",
    async ({ params, body, set }: any) => {
      const vo = await vendorOrderRepo.findOne({ where: { id: params.id } });
      if (!vo) {
        set.status = 404;
        return { statusCode: 404, error: "NOT_FOUND" };
      }
      if (vo.vendor_id !== body.vendor_id) {
        set.status = 403;
        return { statusCode: 403, error: "VENDOR_MISMATCH" };
      }
      const target = body.action === "accept" ? OrderStatus.processing : OrderStatus.cancelled;
      const updated = await orderStatusService.transitionVendorOrder(
        params.id,
        target,
        { userId: body.vendor_id, role: "vendor" },
        body.action === "reject" ? body.reason : body.notes,
      );
      return ok({ vendor_order_id: params.id, status: target, vo: updated });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        action: t.Union([t.Literal("accept"), t.Literal("reject")]),
        vendor_id: t.String(),
        notes: t.Optional(t.String()),
        reason: t.Optional(t.String()),
      }),
    },
  );

  return { app, vendorOrderRepo, orderStatusService };
}

describe("POST /internal/vendor-orders/:id/transition", () => {
  it("rejects without internal token", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/internal/vendor-orders/vo1/transition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", vendor_id: "v1" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when vendor_order not found", async () => {
    const { app } = buildApp({ vendorOrder: null });
    const res = await app.handle(
      new Request("http://localhost/internal/vendor-orders/missing/transition", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ action: "accept", vendor_id: "v1" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 on vendor mismatch", async () => {
    const { app } = buildApp({
      vendorOrder: { id: "vo1", vendor_id: "v-other", status: "pending" },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/vendor-orders/vo1/transition", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ action: "accept", vendor_id: "v-other-yet" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("transitions to processing on accept", async () => {
    const { app, orderStatusService } = buildApp({
      vendorOrder: { id: "vo1", vendor_id: "v1", status: "pending" },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/vendor-orders/vo1/transition", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ action: "accept", vendor_id: "v1", notes: "ok" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(orderStatusService.transitionVendorOrder).toHaveBeenCalled();
  });
});
