import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const moderationRoutes = new Elysia({ prefix: "/admin/reels" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/queue",
    async ({ query, moderationController }: any) => {
      const result = await moderationController.listQueue({
        language: query.language,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : 20,
      });
      return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        language: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .post(
    "/:id/approve",
    async ({ params, body, user, moderationController }: any) => {
      const reel = await moderationController.approve(params.id, user!.id, body?.notes);
      return { statusCode: 200, data: reel, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Optional(t.Object({ notes: t.Optional(t.String()) })),
    },
  )
  .post(
    "/:id/reject",
    async ({ params, body, user, moderationController }: any) => {
      const reel = await moderationController.reject(params.id, user!.id, body.reason, body.notes);
      return { statusCode: 200, data: reel, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        reason: t.String({ minLength: 1 }),
        notes: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/:id/flag",
    async ({ params, body, user, moderationController }: any) => {
      await moderationController.flag(params.id, user!.id, body?.notes);
      return { statusCode: 200, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Optional(t.Object({ notes: t.Optional(t.String()) })),
    },
  );
