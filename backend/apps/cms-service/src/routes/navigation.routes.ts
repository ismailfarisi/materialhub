import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const navigationRoutes = new Elysia({ prefix: "/navigation" }).use(container).get(
  "/header",
  async ({ query, headerNavController, set }) => {
    const data = await headerNavController.resolve(query.locale ?? "en");
    set.headers["cache-control"] = "public, max-age=900, stale-while-revalidate=3600";
    set.headers["surrogate-key"] = `header-nav header-nav-${query.locale ?? "en"}`;
    set.headers.vary = "Accept-Language";
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  },
  {
    query: t.Object({
      locale: t.Optional(t.String()),
    }),
  },
);
