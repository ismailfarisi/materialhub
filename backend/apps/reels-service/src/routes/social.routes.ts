import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { withGuestSession } from "../lib/guest-session.derive.ts";

export const socialRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(withGuestSession)
  .post(
    "/reels/:id/like",
    async ({ params, user, likeService }: any) => {
      const r = await likeService.toggle(params.id, user!.id);
      return { statusCode: 200, data: r, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/reels/:id/save",
    async ({ params, user, saveService }: any) => {
      const r = await saveService.toggle(params.id, user!.id);
      return { statusCode: 200, data: r, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/reels/:id/share",
    async ({ params, shareService }: any) => {
      const r = await shareService.recordShare(params.id);
      return { statusCode: 200, data: r, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/reels/:id/views",
    async ({ params, body, userId, guestSessionId, viewService }: any) => {
      if (!userId && !guestSessionId) {
        // No identity — skip silently. Same semantics as an invalid guest token today.
        return { statusCode: 200, timestamp: new Date().toISOString() };
      }
      await viewService.recordView({
        reelId: params.id,
        userId: userId ?? null,
        sessionId: guestSessionId ?? null,
        watchDurationSeconds: body.watchDurationSeconds,
        completionPercentage: body.completionPercentage,
        deviceType: body.deviceType,
      });
      return { statusCode: 200, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        watchDurationSeconds: t.Number({ minimum: 0 }),
        completionPercentage: t.Number({ minimum: 0, maximum: 1 }),
        deviceType: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/users/:userId/follow",
    async ({ params, user, followService }: any) => {
      const r = await followService.toggle(user!.id, params.userId);
      return { statusCode: 200, data: r, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ userId: t.String({ format: "uuid" }) }) },
  )
  .get(
    "/users/:userId/followers",
    async ({ params, query, followService }: any) => {
      const r = await followService.listFollowers(
        params.userId,
        query.cursor,
        Number(query.limit ?? 20),
      );
      return { statusCode: 200, ...r, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ userId: t.String({ format: "uuid" }) }),
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .get(
    "/users/:userId/following",
    async ({ params, query, followService }: any) => {
      const r = await followService.listFollowing(
        params.userId,
        query.cursor,
        Number(query.limit ?? 20),
      );
      return { statusCode: 200, ...r, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ userId: t.String({ format: "uuid" }) }),
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .get(
    "/me/reels/saved",
    async ({ query, user, saveService }: any) => {
      const r = await saveService.listForUser(user!.id, query.cursor, Number(query.limit ?? 20));
      return { statusCode: 200, ...r, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .get(
    "/me/reels/watch-history",
    async ({ query, user, viewService }: any) => {
      const r = await viewService.listHistory(user!.id, query.cursor, Number(query.limit ?? 20));
      return { statusCode: 200, ...r, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  );
