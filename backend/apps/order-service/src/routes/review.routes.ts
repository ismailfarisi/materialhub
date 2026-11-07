import { ReviewStatus } from "@materialhub/database";
import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const reviewRoutes = new Elysia()
  .use(container)
  // ─── Public: paginated product reviews ───────────────────────────────────
  .get(
    "/products/:id/reviews",
    async ({ params, query, reviewController }: any) => {
      const result = await reviewController.listForProduct(params.id, query);
      return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({
        page: t.Optional(t.Integer({ default: 1, minimum: 1 })),
        limit: t.Optional(t.Integer({ default: 20, minimum: 1 })),
        sort: t.Optional(
          t.Union(
            [
              t.Literal("newest"),
              t.Literal("highest"),
              t.Literal("lowest"),
              t.Literal("most_helpful"),
            ],
            { default: "newest" },
          ),
        ),
        rating: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
      }),
    },
  )
  // ─── Customer: create, vote, flag ────────────────────────────────────────
  .use(jwtAuth)
  .group("/reviews", (app) =>
    app
      .use(requireRole("customer"))
      .post(
        "/",
        async ({ user, body, reviewController }: any) => {
          const review = await reviewController.create(user.id, body);
          return { statusCode: 201, data: review, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            order_item_id: t.String({ format: "uuid" }),
            rating: t.Integer({ minimum: 1, maximum: 5 }),
            title: t.Optional(t.String({ maxLength: 200 })),
            body: t.Optional(t.String({ maxLength: 5000 })),
            media_urls: t.Optional(t.Array(t.String({ format: "uri" }), { maxItems: 5 })),
            quality_rating: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
            value_rating: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
            shipping_rating: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
          }),
        },
      )
      .post(
        "/:id/vote",
        async ({ user, params, body, reviewController }: any) => {
          const result = await reviewController.vote(params.id, user.id, body.is_helpful);
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ is_helpful: t.Boolean() }),
        },
      )
      .post(
        "/:id/flag",
        async ({ user, params, body, reviewController }: any) => {
          const result = await reviewController.flag(params.id, user.id, body?.reason);
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Optional(t.Object({ reason: t.Optional(t.String({ maxLength: 500 })) })),
        },
      ),
  )
  // ─── Vendor: reply to own reviews ────────────────────────────────────────
  // Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
  // `vendorMembership("products.write")`. The matrix has no dedicated
  // `reviews.write`; `products.write` (owner + manager) is the closest match
  // that preserves today's owner-only behaviour without unintentionally
  // extending the right to staff/viewer. Revisit if reviews get a dedicated
  // permission post-v1.5.
  .group("/vendors/me/reviews", (app) =>
    app.use(vendorMembership("products.write")).patch(
      "/:id/reply",
      async ({ member, params, body, reviewController }: any) => {
        const result = await reviewController.reply(params.id, member.vid, body.reply);
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Object({ reply: t.String({ minLength: 1, maxLength: 5000 }) }),
      },
    ),
  )
  // ─── Admin: list, approve, reject ────────────────────────────────────────
  .group("/admin/reviews", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, reviewController }: any) => {
          const result = await reviewController.listForAdmin(query);
          return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
        },
        {
          query: t.Object({
            page: t.Optional(t.Integer({ default: 1, minimum: 1 })),
            limit: t.Optional(t.Integer({ default: 20, minimum: 1 })),
            // Stored statuses plus the two moderation views the service understands.
            status: t.Optional(
              t.Union([t.Enum(ReviewStatus), t.Literal("needs_moderation"), t.Literal("reported")]),
            ),
            product_id: t.Optional(t.String({ format: "uuid" })),
            vendor_id: t.Optional(t.String({ format: "uuid" })),
          }),
        },
      )
      .patch(
        "/:id/approve",
        async ({ user, params, reviewController }: any) => {
          const result = await reviewController.approve(params.id, user.id);
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      )
      .patch(
        "/:id/reject",
        async ({ user, params, body, reviewController }: any) => {
          const result = await reviewController.reject(params.id, user.id, body);
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ rejection_reason: t.String({ minLength: 1 }) }),
        },
      ),
  );
