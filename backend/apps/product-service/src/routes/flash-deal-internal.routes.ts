import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const flashDealInternalRoutes = new Elysia().use(container).get(
  "/internal/flash-deals",
  async ({ query, flashDealController }: any) => {
    const result = await flashDealController.list({
      limit: query.limit || 1000,
      status: query.status,
    });
    return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
  },
  {
    query: t.Object({
      limit: t.Optional(t.Integer({ default: 1000 })),
      status: t.Optional(t.String()),
    }),
  },
);
