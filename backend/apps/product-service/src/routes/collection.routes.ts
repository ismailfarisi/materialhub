import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const collectionRoutes = new Elysia({ prefix: "/collections" }).use(container).get(
  "/:slug",
  async ({ params, query, collectionController, set }) => {
    const data = await collectionController.getStorefront(params.slug, {
      sort: query.sort as never,
      page: query.page ? Number(query.page) : 1,
      perPage: query.perPage ? Math.min(Number(query.perPage), 60) : 24,
    });
    // Match the catalog caching posture (storefront listing is short-cached).
    set.headers["cache-control"] = "public, max-age=300";
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  },
  {
    params: t.Object({ slug: t.String() }),
    query: t.Object({
      sort: t.Optional(t.String()),
      page: t.Optional(t.String()),
      perPage: t.Optional(t.String()),
    }),
  },
);
