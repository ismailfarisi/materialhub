import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const brandRoutes = new Elysia({ prefix: "/brands" })
  .use(container)

  .get(
    "/",
    async ({ query, brandController }) => {
      const ids = query.ids
        ? query.ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      const data = await brandController.listPublic({
        q: query.q,
        ids,
        limit: query.limit ? Number(query.limit) : undefined,
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        ids: t.Optional(t.String()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
      }),
    },
  )

  .get(
    "/spotlight",
    async ({ brandSpotlightService, query }) => {
      const limit = Number(query.limit ?? 8);
      const data = await brandSpotlightService.getSpotlight(limit);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 4, maximum: 12 })),
      }),
    },
  )

  // Storefront brand landing page. Declared after the static `/` and
  // `/spotlight` routes so those win; Elysia's router also prioritises static
  // segments over the `:slug` param regardless of order.
  .get(
    "/:slug",
    async ({ params, brandController }) => {
      const data = await brandController.getPublicBySlug(params.slug);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ slug: t.String() }),
    },
  );
