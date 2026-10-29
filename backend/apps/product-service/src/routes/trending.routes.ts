import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const trendingRoutes = new Elysia({ prefix: "/search" }).use(container).get(
  "/trending",
  async ({ query, trendingService, set }) => {
    const limit = Math.min(Number(query.limit) || 10, 50);
    const data = await trendingService.list(limit);
    set.headers["cache-control"] = "public, max-age=600";
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  },
  { query: t.Object({ limit: t.Optional(t.String()) }) },
);
