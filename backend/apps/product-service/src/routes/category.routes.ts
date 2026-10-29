import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const categoryRoutes = new Elysia({ prefix: "/categories" })
  .use(container)

  .get(
    "/tree",
    async ({ query, categoryController }) => {
      const data = await categoryController.getTree({ vendorId: query.vendor_id });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        vendor_id: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  )

  .get(
    "/:slug",
    async ({ params, categoryController }) => {
      const data = await categoryController.getBySlug(params.slug);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  )

  .get(
    "/by-id/:id/attributes",
    async ({ params, categoryController }) => {
      const data = await categoryController.getCategoryAttributes(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
