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

function buildApp({ product = null as any } = {}) {
  let saved = product ? { ...product } : null;
  const productRepo = {
    findOne: mock(async (_opts: any) => saved),
    update: mock(async (_id: string, patch: any) => {
      if (saved) saved = { ...saved, ...patch };
      return { affected: 1 };
    }),
  };
  const productService = {
    applyAttributePatch: mock(async (_id: string, _attrs: any) => {
      if (saved) saved.attributes = { ...(saved.attributes ?? {}), ..._attrs };
    }),
  };

  const app = new Elysia({ prefix: "/internal/products" }).use(internalServiceAuth).post(
    "/:id/patch",
    async ({ params, body, set }: any) => {
      const p = await productRepo.findOne({ where: { id: params.id } });
      if (!p) {
        set.status = 404;
        return { statusCode: 404, error: "PRODUCT_NOT_FOUND" };
      }
      if (p.vendor_id !== body.vendor_id) {
        set.status = 403;
        return { statusCode: 403, error: "VENDOR_MISMATCH" };
      }
      const patch: Record<string, unknown> = {};
      if (typeof body.price_fils === "number") patch.price = body.price_fils;
      if (typeof body.sale_price_fils === "number") patch.compare_at_price = body.sale_price_fils;
      if (body.attributes && typeof body.attributes === "object") {
        await productService.applyAttributePatch(params.id, body.attributes);
      }
      if (Object.keys(patch).length > 0) {
        await productRepo.update(params.id, patch as any);
      }
      const updated = await productRepo.findOne({ where: { id: params.id } });
      return ok(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        vendor_id: t.String(),
        price_fils: t.Optional(t.Integer({ minimum: 0 })),
        sale_price_fils: t.Optional(t.Integer({ minimum: 0 })),
        currency: t.Optional(t.String()),
        attributes: t.Optional(t.Object({}, { additionalProperties: true })),
      }),
    },
  );

  return { app, productRepo, productService };
}

describe("POST /internal/products/:id/patch", () => {
  it("rejects without internal token", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/internal/products/p1/patch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendor_id: "v1", price_fils: 1000 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when product missing", async () => {
    const { app } = buildApp({ product: null });
    const res = await app.handle(
      new Request("http://localhost/internal/products/missing/patch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ vendor_id: "v1", price_fils: 1000 }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 on vendor mismatch", async () => {
    const { app } = buildApp({ product: { id: "p1", vendor_id: "v-other", price: 500 } });
    const res = await app.handle(
      new Request("http://localhost/internal/products/p1/patch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ vendor_id: "v1", price_fils: 1000 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("updates price on happy path", async () => {
    const { app, productRepo } = buildApp({
      product: { id: "p1", vendor_id: "v1", price: 500 },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/products/p1/patch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ vendor_id: "v1", price_fils: 1500 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(productRepo.update).toHaveBeenCalledWith("p1", expect.objectContaining({ price: 1500 }));
  });

  it("merges attributes via productService", async () => {
    const { app, productService } = buildApp({
      product: { id: "p1", vendor_id: "v1", price: 500, attributes: { color: "red" } },
    });
    const res = await app.handle(
      new Request("http://localhost/internal/products/p1/patch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({ vendor_id: "v1", attributes: { size: "L" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(productService.applyAttributePatch).toHaveBeenCalledWith("p1", { size: "L" });
  });
});
