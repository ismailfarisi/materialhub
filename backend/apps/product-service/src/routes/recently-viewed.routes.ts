import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const recentlyViewedRoutes = new Elysia({ prefix: "/recently-viewed" })
  .use(container)
  .use(jwtAuth)

  .post(
    "/:productId",
    async ({ params, user, headers, recentlyViewedController }: any) => {
      const guestSessionId = user ? null : headers["x-guest-session"] || null;
      const data = await recentlyViewedController.record(
        params.productId,
        user?.id ?? null,
        guestSessionId,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ productId: t.String({ format: "uuid" }) }) },
  )

  .get(
    "/",
    async ({ query, user, headers, recentlyViewedController }: any) => {
      const guestSessionId = user ? null : headers["x-guest-session"] || null;
      const data = await recentlyViewedController.list(
        user?.id ?? null,
        guestSessionId,
        query.limit ? Number(query.limit) : undefined,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Integer({ default: 20 })),
      }),
    },
  );
