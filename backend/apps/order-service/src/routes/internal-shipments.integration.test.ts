import { describe, expect, it, mock } from "bun:test";
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

function buildApp({ vendorOrder = null as any, shipment = null as any } = {}) {
  const vendorOrderRepo = {
    findOne: mock(async (_opts: any) => vendorOrder),
  };
  const shipmentTrackingService = {
    createShipment: mock(async (_voId: string, _vId: string, data: any) => ({
      id: "ship1",
      tracking_number: data.tracking_number,
      carrier: data.carrier,
    })),
    transitionShipmentStatus: mock(
      async (_id: string, _actor: any, _status: any, _reason?: string, _meta?: any) =>
        shipment ?? { id: "ship1", status: "in_transit" },
    ),
  };

  const app = new Elysia({ prefix: "/internal/shipments" })
    .use(internalServiceAuth)
    .post(
      "/",
      async ({ body, set }: any) => {
        const vo = await vendorOrderRepo.findOne({ where: { id: body.vendor_order_id } });
        if (!vo) {
          set.status = 404;
          return { statusCode: 404, error: "VENDOR_ORDER_NOT_FOUND" };
        }
        if (vo.vendor_id !== body.vendor_id) {
          set.status = 403;
          return { statusCode: 403, error: "VENDOR_MISMATCH" };
        }
        try {
          const shipmentResult = await shipmentTrackingService.createShipment(
            body.vendor_order_id,
            body.vendor_id,
            {
              tracking_number: body.tracking_number,
              carrier: body.carrier,
              carrier_service: body.carrier_service,
              tracking_url: body.tracking_url,
              estimated_delivery_at: body.estimated_delivery_at,
              weight_grams: body.weight_grams,
              items: body.items,
            },
          );
          set.status = 201;
          return ok(shipmentResult, 201);
        } catch (e) {
          set.status = 422;
          return { statusCode: 422, error: "VALIDATION_ERROR", message: (e as Error).message };
        }
      },
      {
        body: t.Object({
          vendor_order_id: t.String(),
          vendor_id: t.String(),
          tracking_number: t.String(),
          carrier: t.String(),
          carrier_service: t.Optional(t.String()),
          tracking_url: t.Optional(t.String()),
          estimated_delivery_at: t.Optional(t.String()),
          weight_grams: t.Optional(t.Integer()),
          items: t.Array(
            t.Object({ order_item_id: t.String(), quantity: t.Integer({ minimum: 1 }) }),
          ),
        }),
      },
    )
    .post(
      "/:id/transition",
      async ({ params, body, set }: any) => {
        try {
          const r = await shipmentTrackingService.transitionShipmentStatus(
            params.id,
            { userId: body.vendor_id, role: "vendor" } as any,
            body.status,
            body.reason ?? "vendor system update",
            body.metadata,
          );
          return ok(r);
        } catch (e) {
          set.status = 422;
          return { statusCode: 422, error: "TRANSITION_FAILED", message: (e as Error).message };
        }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          vendor_id: t.String(),
          status: t.String(),
          reason: t.Optional(t.String()),
          metadata: t.Optional(t.Object({}, { additionalProperties: true })),
        }),
      },
    );

  return { app, vendorOrderRepo, shipmentTrackingService };
}

describe("POST /internal/shipments", () => {
  it("rejects without internal token", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/internal/shipments/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendor_order_id: "vo1",
          vendor_id: "v1",
          tracking_number: "T1",
          carrier: "x",
          items: [{ order_item_id: "oi1", quantity: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when vendor_order missing", async () => {
    const { app } = buildApp({ vendorOrder: null });
    const res = await app.handle(
      new Request("http://localhost/internal/shipments/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          vendor_order_id: "vo1",
          vendor_id: "v1",
          tracking_number: "T1",
          carrier: "x",
          items: [{ order_item_id: "oi1", quantity: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 on vendor mismatch", async () => {
    const { app } = buildApp({ vendorOrder: { id: "vo1", vendor_id: "v-other" } });
    const res = await app.handle(
      new Request("http://localhost/internal/shipments/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          vendor_order_id: "vo1",
          vendor_id: "v1",
          tracking_number: "T1",
          carrier: "x",
          items: [{ order_item_id: "oi1", quantity: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("creates shipment with 201 on happy path", async () => {
    const { app, shipmentTrackingService } = buildApp({
      vendorOrder: { id: "vo1", vendor_id: "v1", status: "processing" },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/shipments/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          vendor_order_id: "vo1",
          vendor_id: "v1",
          tracking_number: "T-123",
          carrier: "fedex",
          items: [{ order_item_id: "oi1", quantity: 1 }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(shipmentTrackingService.createShipment).toHaveBeenCalled();
  });
});

describe("POST /internal/shipments/:id/transition", () => {
  it("rejects without internal token", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/internal/shipments/ship1/transition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendor_id: "v1", status: "in_transit" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("transitions on happy path", async () => {
    const { app, shipmentTrackingService } = buildApp({
      shipment: { id: "ship1", status: "in_transit" },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/shipments/ship1/transition", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ vendor_id: "v1", status: "in_transit" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(shipmentTrackingService.transitionShipmentStatus).toHaveBeenCalled();
  });
});
