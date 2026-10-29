import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const nullableString = t.Optional(t.Union([t.String(), t.Null()]));
const nullableNumber = t.Optional(t.Union([t.Number(), t.Null()]));

const itemSchema = t.Object({
  product_id: t.String({ format: "uuid" }),
  variant_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  quantity: t.Number({ minimum: 1 }),
  sort_order: t.Optional(t.Number()),
});

export const giftAdminRoutes = new Elysia({ prefix: "/admin/gift" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get("/occasions", async ({ giftController }) => ({
    statusCode: 200,
    data: await giftController.adminListOccasions(),
    timestamp: new Date().toISOString(),
  }))
  .post(
    "/occasions",
    async ({ body, giftController, set }) => {
      set.status = 201;
      return {
        statusCode: 201,
        data: await giftController.createOccasion(body as never),
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        slug: t.Optional(t.String({ maxLength: 120 })),
        image_url: nullableString,
        sort_order: t.Optional(t.Number()),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    "/occasions/:id",
    async ({ params, body, giftController }) => ({
      statusCode: 200,
      data: await giftController.updateOccasion(params.id, body as never),
      timestamp: new Date().toISOString(),
    }),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        slug: t.Optional(t.String({ maxLength: 120 })),
        image_url: nullableString,
        sort_order: t.Optional(t.Number()),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    "/occasions/:id",
    async ({ params, giftController }) => {
      await giftController.removeOccasion(params.id);
      return { statusCode: 200, message: "Deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .get("/styles", async ({ giftController }) => ({
    statusCode: 200,
    data: await giftController.adminListStyles(),
    timestamp: new Date().toISOString(),
  }))
  .post(
    "/styles",
    async ({ body, giftController, set }) => {
      set.status = 201;
      return {
        statusCode: 201,
        data: await giftController.createStyle(body as never),
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 150 }),
        slug: t.Optional(t.String({ maxLength: 150 })),
        description: nullableString,
        dimensions: t.Optional(t.Union([t.Record(t.String(), t.Any()), t.Null()])),
        max_capacity: t.Optional(t.Number({ minimum: 1 })),
        base_price: t.Optional(t.Number({ minimum: 0 })),
        images: t.Optional(t.Array(t.String())),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    "/styles/:id",
    async ({ params, body, giftController }) => ({
      statusCode: 200,
      data: await giftController.updateStyle(params.id, body as never),
      timestamp: new Date().toISOString(),
    }),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 150 })),
        slug: t.Optional(t.String({ maxLength: 150 })),
        description: nullableString,
        dimensions: t.Optional(t.Union([t.Record(t.String(), t.Any()), t.Null()])),
        max_capacity: t.Optional(t.Number({ minimum: 1 })),
        base_price: t.Optional(t.Number({ minimum: 0 })),
        images: t.Optional(t.Array(t.String())),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    "/styles/:id",
    async ({ params, giftController }) => {
      await giftController.removeStyle(params.id);
      return { statusCode: 200, message: "Deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .get(
    "/boxes",
    async ({ query, giftController }) => ({
      statusCode: 200,
      data: await giftController.adminListBoxes(
        query.page ? Number(query.page) : 1,
        query.perPage ? Math.min(Number(query.perPage), 100) : 24,
        query.search,
      ),
      timestamp: new Date().toISOString(),
    }),
    {
      query: t.Object({
        page: t.Optional(t.String()),
        perPage: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/boxes/:id",
    async ({ params, giftController }) => ({
      statusCode: 200,
      data: await giftController.adminGetBox(params.id),
      timestamp: new Date().toISOString(),
    }),
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/boxes",
    async ({ body, giftController, set }) => {
      set.status = 201;
      return {
        statusCode: 201,
        data: await giftController.createBox(body as never),
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        slug: t.Optional(t.String({ maxLength: 200 })),
        description: nullableString,
        style_id: t.String({ format: "uuid" }),
        hero_image_url: nullableString,
        discount_percentage: nullableNumber,
        is_active: t.Optional(t.Boolean()),
        starts_at: nullableString,
        expires_at: nullableString,
        occasion_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
        items: t.Optional(t.Array(itemSchema)),
      }),
    },
  )
  .patch(
    "/boxes/:id",
    async ({ params, body, giftController }) => ({
      statusCode: 200,
      data: await giftController.updateBox(params.id, body as never),
      timestamp: new Date().toISOString(),
    }),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 200 })),
        slug: t.Optional(t.String({ maxLength: 200 })),
        description: nullableString,
        style_id: t.Optional(t.String({ format: "uuid" })),
        hero_image_url: nullableString,
        discount_percentage: nullableNumber,
        is_active: t.Optional(t.Boolean()),
        starts_at: nullableString,
        expires_at: nullableString,
        occasion_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
        items: t.Optional(t.Array(itemSchema)),
      }),
    },
  )
  .delete(
    "/boxes/:id",
    async ({ params, giftController }) => {
      await giftController.removeBox(params.id);
      return { statusCode: 200, message: "Deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
