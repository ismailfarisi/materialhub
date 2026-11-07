import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const pageRoutes = new Elysia({ prefix: "/pages" })
  .use(container)

  // ─── Public Routes ──────────────────────────────────────────────────────
  .get(
    "/published",
    async ({ query, pageController }) => {
      const data = await pageController.listPublished(query.locale);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { query: t.Object({ locale: t.Optional(t.String()) }) },
  )

  .get(
    "/:slug",
    async ({ params, pageController }) => {
      const data = await pageController.getPublishedBySlug(params.slug);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String() }) },
  )

  // ─── Admin Routes ────────────────────────────────────────────────────────
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get(
    "/",
    async ({ query, pageController }) => {
      const data = await pageController.list(query);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        status: t.Optional(
          t.Union([t.Literal("draft"), t.Literal("published"), t.Literal("archived")]),
        ),
        locale: t.Optional(t.String()),
      }),
    },
  )

  // Admin read by id (drafts included). Two segments, so it never collides
  // with the public `/:slug` route above.
  .get(
    "/admin/:id",
    async ({ params, pageController }) => {
      const data = await pageController.getById(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/",
    async ({ body, user, pageController, set }) => {
      const data = await pageController.create(body, user!.id);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 255 }),
        slug: t.String({ minLength: 1, maxLength: 255, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
        content: t.Optional(t.String()),
        rich_content: t.Optional(t.Record(t.String(), t.Unknown())),
        status: t.Optional(
          t.Union([t.Literal("draft"), t.Literal("published"), t.Literal("archived")]),
        ),
        locale: t.Optional(t.String({ maxLength: 10 })),
        meta_title: t.Optional(t.String({ maxLength: 255 })),
        meta_description: t.Optional(t.String({ maxLength: 500 })),
        sort_order: t.Optional(t.Integer({ minimum: 0 })),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params, body, pageController }) => {
      const data = await pageController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        slug: t.Optional(
          t.String({ minLength: 1, maxLength: 255, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
        ),
        content: t.Optional(t.String()),
        rich_content: t.Optional(t.Record(t.String(), t.Unknown())),
        status: t.Optional(
          t.Union([t.Literal("draft"), t.Literal("published"), t.Literal("archived")]),
        ),
        locale: t.Optional(t.String({ maxLength: 10 })),
        meta_title: t.Optional(t.String({ maxLength: 255 })),
        meta_description: t.Optional(t.String({ maxLength: 500 })),
        sort_order: t.Optional(t.Integer({ minimum: 0 })),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, pageController }) => {
      await pageController.remove(params.id);
      return { statusCode: 200, message: "Page deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
