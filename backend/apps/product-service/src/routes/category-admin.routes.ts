import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const translationSchema = t.Array(
  t.Object({
    locale: t.String({ minLength: 2, maxLength: 10 }),
    name: t.String(),
    description: t.Optional(t.Union([t.String(), t.Null()])),
  }),
);

export const categoryAdminRoutes = new Elysia({ prefix: "/admin/categories" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get("/tree", async ({ categoryController }) => {
    const data = await categoryController.getTree({ includeInactive: true });
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .post(
    "/",
    async ({ body, categoryController, set }) => {
      const data = await categoryController.create(body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        parent_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        icon_url: t.Optional(t.Union([t.String(), t.Null()])),
        image_url: t.Optional(t.Union([t.String(), t.Null()])),
        banner_url: t.Optional(t.Union([t.String(), t.Null()])),
        is_active: t.Optional(t.Boolean()),
        is_featured: t.Optional(t.Boolean()),
        commission_rate: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 100 }), t.Null()])),
        meta_title: t.Optional(t.Union([t.String(), t.Null()])),
        meta_description: t.Optional(t.Union([t.String(), t.Null()])),
        meta_keywords: t.Optional(t.Union([t.String(), t.Null()])),
        translations: t.Optional(translationSchema),
      }),
    },
  )

  .get("/", async ({ query, categoryController }) => {
    const data = await categoryController.listForAdmin(
      query.page ? Math.max(1, Math.trunc(Number(query.page)) || 1) : undefined,
      query.limit ? Math.max(1, Math.trunc(Number(query.limit)) || 1) : undefined,
      query.search,
    );
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .patch(
    "/:id",
    async ({ params, body, categoryController }) => {
      const data = await categoryController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        parent_id: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        icon_url: t.Optional(t.Union([t.String(), t.Null()])),
        image_url: t.Optional(t.Union([t.String(), t.Null()])),
        banner_url: t.Optional(t.Union([t.String(), t.Null()])),
        is_active: t.Optional(t.Boolean()),
        is_featured: t.Optional(t.Boolean()),
        commission_rate: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 100 }), t.Null()])),
        meta_title: t.Optional(t.Union([t.String(), t.Null()])),
        meta_description: t.Optional(t.Union([t.String(), t.Null()])),
        meta_keywords: t.Optional(t.Union([t.String(), t.Null()])),
        translations: t.Optional(translationSchema),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, categoryController }) => {
      await categoryController.remove(params.id);
      return { statusCode: 200, message: "Category deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .patch(
    "/reorder",
    async ({ body, categoryController }) => {
      await categoryController.reorder(body.items);
      return {
        statusCode: 200,
        message: "Categories reordered",
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        items: t.Array(
          t.Object({
            id: t.String({ format: "uuid" }),
            sort_order: t.Number({ minimum: 0 }),
          }),
          { minItems: 1 },
        ),
      }),
    },
  )

  .post(
    "/:id/attributes",
    async ({ params, body, categoryController, set }) => {
      const data = await categoryController.bulkLinkAttributes(params.id, body.attribute_ids);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        attribute_ids: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
      }),
    },
  )

  .delete(
    "/:id/attributes/:attrId",
    async ({ params, categoryController }) => {
      await categoryController.unlinkAttribute(params.id, params.attrId);
      return {
        statusCode: 200,
        message: "Attribute unlinked",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        attrId: t.String({ format: "uuid" }),
      }),
    },
  );
