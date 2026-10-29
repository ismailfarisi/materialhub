import { internalAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const taggableProductsInternalRoutes = new Elysia({ prefix: "/internal/products" })
  .use(container)
  .use(internalAuth)
  .get(
    "/by-vendor",
    async ({ query, taggableProductsLookupService }: any) => {
      const items = await taggableProductsLookupService.listByVendor({
        vendorId: query.vendorId,
        q: query.q ?? null,
        limit: query.limit ?? 20,
      });
      return {
        statusCode: 200,
        data: { items },
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        vendorId: t.String({ format: "uuid" }),
        q: t.Optional(t.String({ maxLength: 64 })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
      }),
    },
  )
  .get(
    "/by-permission",
    async ({ query, taggableProductsLookupService }: any) => {
      const items = await taggableProductsLookupService.listByPermission({
        scope: query.scope,
        brandId: query.brandId ?? null,
        vendorId: query.vendorId ?? null,
        productIds: query.productIds ? query.productIds.split(",").filter(Boolean) : null,
        q: query.q ?? null,
        limit: query.limit ?? 20,
      });
      return {
        statusCode: 200,
        data: { items },
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        scope: t.Union([
          t.Literal("any_product"),
          t.Literal("specific_brand"),
          t.Literal("specific_vendor"),
          t.Literal("specific_products"),
        ]),
        brandId: t.Optional(t.String({ format: "uuid" })),
        vendorId: t.Optional(t.String({ format: "uuid" })),
        productIds: t.Optional(t.String()),
        q: t.Optional(t.String({ maxLength: 64 })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
      }),
    },
  );
