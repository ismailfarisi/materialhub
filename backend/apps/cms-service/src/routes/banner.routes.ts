import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const bannerRoutes = new Elysia({ prefix: "/banners" })
  .use(container)

  // ─── Public Routes ──────────────────────────────────────────────────────
  .get(
    "/active",
    async ({ query, bannerController }) => {
      const data = await bannerController.getActive(query.placement, query.locale);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        placement: t.String(),
        locale: t.Optional(t.String()),
      }),
    },
  )

  // ─── Admin Routes ────────────────────────────────────────────────────────
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get(
    "/",
    async ({ query, bannerController }) => {
      const data = await bannerController.list(query);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        placement: t.Optional(t.String()),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )

  .post(
    "/",
    async ({ body, bannerController, set }) => {
      const data = await bannerController.create(body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 255 }),
        subtitle: t.Optional(t.String({ maxLength: 500 })),
        image_url: t.String({ maxLength: 1024 }),
        mobile_image_url: t.Optional(t.String({ maxLength: 1024 })),
        link_url: t.Optional(t.String({ maxLength: 1024 })),
        placement: t.Union([
          t.Literal("home_hero"),
          t.Literal("home_secondary"),
          t.Literal("category_top"),
          t.Literal("sidebar"),
        ]),
        starts_at: t.Optional(t.String({ format: "date-time" })),
        expires_at: t.Optional(t.String({ format: "date-time" })),
        is_active: t.Optional(t.Boolean()),
        sort_order: t.Optional(t.Integer({ minimum: 0 })),
        locale: t.Optional(t.String({ maxLength: 10 })),
        target_audience: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params, body, bannerController }) => {
      const data = await bannerController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        subtitle: t.Optional(t.String({ maxLength: 500 })),
        image_url: t.Optional(t.String({ maxLength: 1024 })),
        mobile_image_url: t.Optional(t.String({ maxLength: 1024 })),
        link_url: t.Optional(t.String({ maxLength: 1024 })),
        placement: t.Optional(
          t.Union([
            t.Literal("home_hero"),
            t.Literal("home_secondary"),
            t.Literal("category_top"),
            t.Literal("sidebar"),
          ]),
        ),
        starts_at: t.Optional(t.String({ format: "date-time" })),
        expires_at: t.Optional(t.String({ format: "date-time" })),
        is_active: t.Optional(t.Boolean()),
        sort_order: t.Optional(t.Integer({ minimum: 0 })),
        locale: t.Optional(t.String({ maxLength: 10 })),
        target_audience: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, bannerController }) => {
      await bannerController.remove(params.id);
      return { statusCode: 200, message: "Banner deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
