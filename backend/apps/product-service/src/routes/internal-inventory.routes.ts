import { internalServiceAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const internalInventoryRoutes = new Elysia({ prefix: "/internal/inventory" })
  .use(container)
  .use(internalServiceAuth)
  .post(
    "/adjust",
    async ({ body, inventoryService, productRepo, set }: any) => {
      const product = await productRepo.findOne({ where: { id: body.product_id } });
      if (!product) {
        set.status = 404;
        return { statusCode: 404, error: "PRODUCT_NOT_FOUND" };
      }
      if (product.vendor_id !== body.vendor_id) {
        set.status = 403;
        return { statusCode: 403, error: "VENDOR_MISMATCH" };
      }
      try {
        const result = await inventoryService.adjustIdempotent({
          vendor_id: body.vendor_id,
          product_id: body.product_id,
          variant_id: body.variant_id,
          delta: body.delta,
          change_id: body.change_id,
          reason: body.reason ?? "vendor inbound",
        });
        return ok(result);
      } catch (e: any) {
        const status = e?.status ?? 422;
        set.status = status;
        return {
          statusCode: status,
          error: e?.code ?? "ADJUST_FAILED",
          message: e?.message ?? String(e),
        };
      }
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
