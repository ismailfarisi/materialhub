import { internalAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const internalOrderRoutes = new Elysia({ prefix: "/internal/orders" })
  .use(container)
  .use(internalAuth)
  .get(
    "/verified-purchase",
    async ({ query, verifiedPurchaseService }: any) => {
      const verified = await verifiedPurchaseService.hasVerifiedPurchase(
        query.userId,
        query.productId,
      );
      return {
        statusCode: 200,
        data: { verified },
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        userId: t.String({ format: "uuid" }),
        productId: t.String({ format: "uuid" }),
      }),
    },
  )
  .get(
    "/my-delivered-items",
    async ({ query, verifiedPurchaseService }: any) => {
      const items = await verifiedPurchaseService.listDeliveredItems({
        userId: query.userId,
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
        userId: t.String({ format: "uuid" }),
        q: t.Optional(t.String({ maxLength: 64 })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
      }),
    },
  );
