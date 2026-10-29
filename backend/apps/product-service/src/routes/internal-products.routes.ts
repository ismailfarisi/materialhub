import { internalServiceAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const internalProductsRoutes = new Elysia({ prefix: "/internal/products" })
  .use(container)
  .use(internalServiceAuth)
  .post(
    "/:id/patch",
    async ({ params, body, productRepo, productService, set }: any) => {
      const product = await productRepo.findOne({ where: { id: params.id } });
      if (!product) {
        set.status = 404;
        return { statusCode: 404, error: "PRODUCT_NOT_FOUND" };
      }
      if (product.vendor_id !== body.vendor_id) {
        set.status = 403;
        return { statusCode: 403, error: "VENDOR_MISMATCH" };
      }

      const patch: Record<string, unknown> = {};
      if (typeof body.price_fils === "number") {
        patch.price = body.price_fils;
      }
      if (typeof body.sale_price_fils === "number") {
        patch.compare_at_price = body.sale_price_fils;
      }
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
