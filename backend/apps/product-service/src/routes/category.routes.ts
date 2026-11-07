import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const categoryRoutes = new Elysia({ prefix: "/categories" })
  .use(container)

  .get(
    "/tree",
    async ({ query, headers, categoryController }) => {
      // Category names follow ?locale= or the storefront's Accept-Language.
      const data = await categoryController.getTree({
        vendorId: query.vendor_id,
        locale: query.locale ?? headers["accept-language"],
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        vendor_id: t.Optional(t.String({ format: "uuid" })),
        locale: t.Optional(t.String({ maxLength: 35 })),
      }),
    },
  )

  .get(
    "/:slug",
    async ({ params, query, headers, categoryController }) => {
      // The storefront sends the page locale as Accept-Language; ?locale= wins.
      const data = await categoryController.getBySlug(params.slug, {
        locale: query.locale ?? headers["accept-language"],
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ slug: t.String() }),
      query: t.Object({ locale: t.Optional(t.String({ maxLength: 35 })) }),
    },
  )

  .get(
    "/by-id/:id/attributes",
    async ({ params, categoryController }) => {
      const data = await categoryController.getCategoryAttributes(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
