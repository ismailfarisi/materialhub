import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
// coupon.routes.ts
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const couponBodySchema = t.Object({
  code: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String()),
  type: t.Optional(
    t.Union([
      t.Literal("percentage"),
      t.Literal("fixed_amount"),
      t.Literal("free_shipping"),
      t.Literal("buy_x_get_y"),
    ]),
  ),
  applicable_to: t.Optional(
    t.Union([
      t.Literal("all"),
      t.Literal("specific_products"),
      t.Literal("specific_categories"),
      t.Literal("specific_vendors"),
      t.Literal("specific_collection"),
    ]),
  ),
  collection_id: t.Optional(t.String({ format: "uuid" })),
  discount_value: t.Optional(t.Integer({ minimum: 0 })),
  max_discount_amount: t.Optional(t.Integer({ minimum: 0 })),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  minimum_order_amount: t.Optional(t.Integer({ minimum: 0 })),
  minimum_quantity: t.Optional(t.Integer({ minimum: 1 })),
  usage_limit: t.Optional(t.Integer({ minimum: 1 })),
  usage_limit_per_user: t.Optional(t.Integer({ minimum: 1 })),
  starts_at: t.Optional(t.String()),
  expires_at: t.Optional(t.String()),
  is_active: t.Optional(t.Boolean()),
  is_single_use: t.Optional(t.Boolean()),
  is_public: t.Optional(t.Boolean()),
  first_order_only: t.Optional(t.Boolean()),
  new_users_only: t.Optional(t.Boolean()),
  buy_quantity: t.Optional(t.Integer({ minimum: 1 })),
  get_quantity: t.Optional(t.Integer({ minimum: 1 })),
  get_discount_percentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
  product_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  category_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  vendor_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  excluded_product_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  user_restriction_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
});

const createCouponBodySchema = t.Object({
  code: t.String({ minLength: 1, maxLength: 50 }),
  // Optional — defaults to the code server-side (the dashboard form presents
  // it as optional).
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String()),
  type: t.Union([
    t.Literal("percentage"),
    t.Literal("fixed_amount"),
    t.Literal("free_shipping"),
    t.Literal("buy_x_get_y"),
  ]),
  applicable_to: t.Optional(
    t.Union([
      t.Literal("all"),
      t.Literal("specific_products"),
      t.Literal("specific_categories"),
      t.Literal("specific_vendors"),
      t.Literal("specific_collection"),
    ]),
  ),
  collection_id: t.Optional(t.String({ format: "uuid" })),
  // Optional at the schema level so free_shipping coupons (which have no
  // amount) validate; the service requires it for value-bearing types.
  discount_value: t.Optional(t.Integer({ minimum: 0 })),
  max_discount_amount: t.Optional(t.Integer({ minimum: 0 })),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  minimum_order_amount: t.Optional(t.Integer({ minimum: 0 })),
  minimum_quantity: t.Optional(t.Integer({ minimum: 1 })),
  usage_limit: t.Optional(t.Integer({ minimum: 1 })),
  usage_limit_per_user: t.Optional(t.Integer({ minimum: 1 })),
  starts_at: t.Optional(t.String()),
  expires_at: t.Optional(t.String()),
  is_active: t.Optional(t.Boolean()),
  is_single_use: t.Optional(t.Boolean()),
  is_public: t.Optional(t.Boolean()),
  first_order_only: t.Optional(t.Boolean()),
  new_users_only: t.Optional(t.Boolean()),
  buy_quantity: t.Optional(t.Integer({ minimum: 1 })),
  get_quantity: t.Optional(t.Integer({ minimum: 1 })),
  get_discount_percentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
  product_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  category_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  vendor_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  excluded_product_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
  user_restriction_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
});

const listQuerySchema = t.Object({
  page: t.Optional(t.Integer({ default: 1, minimum: 1 })),
  limit: t.Optional(t.Integer({ default: 20, minimum: 1, maximum: 100 })),
  search: t.Optional(t.String()),
  status: t.Optional(
    t.Union([
      t.Literal("active"),
      t.Literal("scheduled"),
      t.Literal("expired"),
      t.Literal("disabled"),
    ]),
  ),
  type: t.Optional(
    t.Union([
      t.Literal("percentage"),
      t.Literal("fixed_amount"),
      t.Literal("free_shipping"),
      t.Literal("buy_x_get_y"),
    ]),
  ),
});

const idParamsSchema = t.Object({ id: t.String({ format: "uuid" }) });

export const couponRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  // ── Admin routes ───────────────────────────────────────────────────────────
  .group("/admin/coupons", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, couponAdminController }: any) => {
          const result = await couponAdminController.listCoupons(query);
          return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
        },
        { query: listQuerySchema },
      )
      .get(
        "/:id",
        async ({ params, couponAdminController }: any) => {
          const data = await couponAdminController.getCoupon(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: idParamsSchema },
      )
      .post(
        "/",
        async ({ body, user, couponAdminController }: any) => {
          const data = await couponAdminController.createCoupon(body, user?.id);
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        { body: createCouponBodySchema },
      )
      .patch(
        "/:id",
        async ({ params, body, couponAdminController }: any) => {
          const data = await couponAdminController.updateCoupon(params.id, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: idParamsSchema, body: couponBodySchema },
      )
      .delete(
        "/:id",
        async ({ params, couponAdminController }: any) => {
          await couponAdminController.deleteCoupon(params.id);
          return {
            statusCode: 200,
            message: "Coupon deleted",
            timestamp: new Date().toISOString(),
          };
        },
        { params: idParamsSchema },
      ),
  )
  // ── Vendor routes ─────────────────────────────────────────────────────────
  // Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
  // permission-aware `vendorMembership(...)` guards. GET routes use
  // `products.read` (owner / manager / staff / viewer); mutations use
  // `products.write` (owner / manager / staff).
  .group("/vendor/coupons", (app) =>
    app
      .guard({}, (a) =>
        a
          .use(vendorMembership("products.read"))
          .get(
            "/",
            async ({ member, query, couponAdminController }: any) => {
              const result = await couponAdminController.listVendorCoupons(member.vid, query);
              return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
            },
            { query: listQuerySchema },
          )
          .get(
            "/:id",
            async ({ member, params, couponAdminController }: any) => {
              const data = await couponAdminController.getVendorCoupon(member.vid, params.id);
              return { statusCode: 200, data, timestamp: new Date().toISOString() };
            },
            { params: idParamsSchema },
          ),
      )
      .guard({}, (a) =>
        a
          .use(vendorMembership("products.write"))
          .post(
            "/",
            async ({ member, user, body, couponAdminController }: any) => {
              const data = await couponAdminController.createVendorCoupon(
                member.vid,
                body,
                user?.id,
              );
              return { statusCode: 201, data, timestamp: new Date().toISOString() };
            },
            { body: createCouponBodySchema },
          )
          .patch(
            "/:id",
            async ({ member, params, body, couponAdminController }: any) => {
              const data = await couponAdminController.updateVendorCoupon(
                member.vid,
                params.id,
                body,
              );
              return { statusCode: 200, data, timestamp: new Date().toISOString() };
            },
            { params: idParamsSchema, body: couponBodySchema },
          )
          .delete(
            "/:id",
            async ({ member, params, couponAdminController }: any) => {
              await couponAdminController.deleteVendorCoupon(member.vid, params.id);
              return {
                statusCode: 200,
                message: "Coupon deleted",
                timestamp: new Date().toISOString(),
              };
            },
            { params: idParamsSchema },
          ),
      ),
  );
