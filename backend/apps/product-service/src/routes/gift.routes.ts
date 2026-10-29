import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const giftRoutes = new Elysia({ prefix: "/gift" })
  .use(container)
  .get("/occasions", async ({ giftController, set }) => {
    const data = await giftController.listOccasions();
    set.headers["cache-control"] = "public, max-age=3600";
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })
  .get(
    "/occasions/:slug",
    async ({ params, giftController }) => {
      const data = await giftController.occasionBySlug(params.slug);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  )
  .get(
    "/boxes",
    async ({ query, giftController, set }) => {
      const data = await giftController.listBoxes(
        query.occasion,
        query.page ? Number(query.page) : 1,
        query.perPage ? Math.min(Number(query.perPage), 60) : 24,
      );
      set.headers["cache-control"] = "public, max-age=300";
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        occasion: t.Optional(t.String()),
        page: t.Optional(t.String()),
        perPage: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/boxes/:slug",
    async ({ params, giftController, set }) => {
      const data = await giftController.boxBySlug(params.slug);
      set.headers["cache-control"] = "public, max-age=600";
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  );
