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

function buildApp({
  product = null as any,
  adjustResult = { applied: true, new_quantity: 105 },
} = {}) {
  const productRepo = {
    findOne: mock(async (_opts: any) => product),
  };
  const inventoryService = {
    adjustIdempotent: mock(async (_input: any) => adjustResult),
  };

  const app = new Elysia({ prefix: "/internal/inventory" }).use(internalServiceAuth).post(
    "/adjust",
    async ({ body, set }: any) => {
      const p = await productRepo.findOne({ where: { id: body.product_id } });
      if (!p) {
        set.status = 404;
        return { statusCode: 404, error: "PRODUCT_NOT_FOUND" };
      }
      if (p.vendor_id !== body.vendor_id) {
        set.status = 403;
        return { statusCode: 403, error: "VENDOR_MISMATCH" };
      }
      const result = await inventoryService.adjustIdempotent({
        vendor_id: body.vendor_id,
        product_id: body.product_id,
        variant_id: body.variant_id,
        delta: body.delta,
        change_id: body.change_id,
        reason: body.reason ?? "vendor inbound",
      });
      return ok(result);
    },
    {
      body: t.Object({
        vendor_id: t.String(),
        product_id: t.String(),
        variant_id: t.Optional(t.String()),
        delta: t.Integer(),
        change_id: t.String({ maxLength: 128 }),
        reason: t.Optional(t.String()),
      }),
    },
  );

  return { app, productRepo, inventoryService };
}

describe("POST /internal/inventory/adjust", () => {
  it("rejects without internal token", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/internal/inventory/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendor_id: "v1",
          product_id: "p1",
          delta: 5,
          change_id: "ch-1",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when product missing", async () => {
    const { app } = buildApp({ product: null });
    const res = await app.handle(
      new Request("http://localhost/internal/inventory/adjust", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          vendor_id: "v1",
          product_id: "p1",
          delta: 5,
          change_id: "ch-1",
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 on vendor mismatch", async () => {
    const { app } = buildApp({ product: { id: "p1", vendor_id: "v-other" } });
    const res = await app.handle(
      new Request("http://localhost/internal/inventory/adjust", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          vendor_id: "v1",
          product_id: "p1",
          delta: 5,
          change_id: "ch-1",
        }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("applies on happy path", async () => {
    const { app, inventoryService } = buildApp({
      product: { id: "p1", vendor_id: "v1" },
      adjustResult: { applied: true, new_quantity: 105 },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/inventory/adjust", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          vendor_id: "v1",
          product_id: "p1",
          delta: 5,
          change_id: "ch-1",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(inventoryService.adjustIdempotent).toHaveBeenCalled();
  });

  it("idempotent replay returns applied=false", async () => {
    const { app } = buildApp({
      product: { id: "p1", vendor_id: "v1" },
      adjustResult: { applied: false, new_quantity: 100 },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/inventory/adjust", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          vendor_id: "v1",
          product_id: "p1",
          delta: 5,
          change_id: "ch-1",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.applied).toBe(false);
  });
});
