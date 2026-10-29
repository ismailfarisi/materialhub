import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const reelsRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  // Owner listing of one's own reels across any status. Supports an `asset_id`
  // query filter so the upload form can poll for the freshly-created draft
  // right after upload and redirect straight to the editor.
  .get(
    "/me/reels",
    async ({ query, user, reelsService, set }: any) => {
      // jwtAuth puts user = null for unauthenticated requests rather than
      // short-circuiting, so handlers that need auth must check explicitly.
      if (!user) {
        set.status = 401;
        return {
          statusCode: 401,
          error: "unauthorized",
          timestamp: new Date().toISOString(),
        };
      }
      const result = await reelsService.listForOwner({
        userId: user.id,
        assetId: query.asset_id,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : undefined,
      });
      return {
        statusCode: 200,
        items: result.items,
        nextCursor: result.nextCursor,
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        asset_id: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .post("/reels/uploads", async ({ user, reelsController }: any) => {
    const data = await reelsController.requestUpload(user!.id);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })
  .get(
    "/reels/:id",
    async ({ params, user, reelsService }: any) => {
      const reel = await reelsService.getById(params.id, user?.id ?? null);
      if (!reel) {
        return {
          statusCode: 404,
          error: "reel_not_found",
          timestamp: new Date().toISOString(),
        };
      }
      return { statusCode: 200, data: reel, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .patch(
    "/reels/:id",
    async ({ params, body, user, reelsService }: any) => {
      const reel = await reelsService.updateMetadata(params.id, user!.id, body);
      return { statusCode: 200, data: reel, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        caption: t.Optional(t.String({ maxLength: 500 })),
        language_code: t.Optional(t.String()),
        thumbnail_url: t.Optional(t.String()),
        is_sponsored_disclosed: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/reels/:id/publish",
    async ({ params, user, reelsService }: any) => {
      const reel = await reelsService.publish({ reelId: params.id, userId: user!.id });
      return { statusCode: 200, data: reel, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .delete(
    "/reels/:id",
    async ({ params, user, reelsService }: any) => {
      await reelsService.softDelete(params.id, user!.id);
      return { statusCode: 204, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
