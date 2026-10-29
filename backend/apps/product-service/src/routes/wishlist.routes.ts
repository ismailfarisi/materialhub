import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const wishlistRoutes = new Elysia({ prefix: "/wishlist" })
  .use(container)
  .use(jwtAuth)

  // Toggle (add/remove)
  .post(
    "/:productId",
    async ({ params, body, user, headers, wishlistController }: any) => {
      const guestSessionId = user ? null : headers["x-guest-session"] || null;
      const data = await wishlistController.toggle(
        params.productId,
        body?.variant_id ?? null,
        user?.id ?? null,
        guestSessionId,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Optional(
        t.Object({
          variant_id: t.Optional(t.String({ format: "uuid" })),
        }),
      ),
    },
  )

  // List
  .get(
    "/",
    async ({ query, user, headers, wishlistController }: any) => {
      const guestSessionId = user ? null : headers["x-guest-session"] || null;
      const data = await wishlistController.list(
        user?.id ?? null,
        guestSessionId,
        query.page ? Number(query.page) : undefined,
        query.limit ? Number(query.limit) : undefined,
      );
      return { statusCode: 200, ...data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Integer({ default: 1 })),
        limit: t.Optional(t.Integer({ default: 20 })),
      }),
    },
  )

  // Merge guest → user
  .post(
    "/merge",
    async ({ body, user, wishlistController }: any) => {
      await wishlistController.merge(body.guest_session_id, user!.id);
      return { statusCode: 200, message: "Wishlist merged", timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({ guest_session_id: t.String({ format: "uuid" }) }),
    },
  );
