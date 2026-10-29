import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/**
 * Vendor follow endpoints (PR #5).
 *
 * Four routes scoped under `/me/follows/vendors`:
 *  - GET /recent — most recently followed vendors (capped at 20).
 *  - GET /:vendorId — boolean follow state for the current user.
 *  - POST /:vendorId — idempotent follow.
 *  - DELETE /:vendorId — idempotent unfollow.
 *
 * All routes are JWT-gated; guests receive 401 which the frontend
 * surfaces as "not following" via `retry: false`.
 */
export const vendorFollowRoutes = new Elysia({ prefix: "/me/follows/vendors" })
  .use(container)
  .use(jwtAuth)

  .get(
    "/recent",
    async ({ query, user, vendorFollowController }: any) => {
      const limit = query.limit ? Math.min(Number(query.limit), 20) : 4;
      const data = await vendorFollowController.recentFollowed(user!.id, limit);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
      }),
    },
  )

  .get(
    "/:vendorId",
    async ({ params, user, vendorFollowController }: any) => {
      const following = await vendorFollowController.isFollowing(params.vendorId, user!.id);
      return {
        statusCode: 200,
        data: { vendor_id: params.vendorId, following },
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ vendorId: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:vendorId",
    async ({ params, user, vendorFollowController }: any) => {
      const result = await vendorFollowController.follow(params.vendorId, user!.id);
      return {
        statusCode: 200,
        data: { vendor_id: params.vendorId, ...result },
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ vendorId: t.String({ format: "uuid" }) }) },
  )

  .delete(
    "/:vendorId",
    async ({ params, user, vendorFollowController }: any) => {
      const result = await vendorFollowController.unfollow(params.vendorId, user!.id);
      return {
        statusCode: 200,
        data: { vendor_id: params.vendorId, ...result },
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ vendorId: t.String({ format: "uuid" }) }) },
  );
