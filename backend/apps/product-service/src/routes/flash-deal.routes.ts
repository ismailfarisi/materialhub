import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const flashDealBodySchema = t.Object({
  product_id: t.String({ format: "uuid" }),
  variant_id: t.Optional(t.String({ format: "uuid" })),
  title: t.String({ minLength: 1, maxLength: 255 }),
  deal_price: t.Integer({ minimum: 1 }),
  original_price: t.Integer({ minimum: 1 }),
  quantity_limit: t.Optional(t.Integer({ minimum: 1 })),
  starts_at: t.String(),
  expires_at: t.String(),
  is_active: t.Optional(t.Boolean()),
});

const adminFlashDealBodySchema = t.Object({
  product_id: t.String({ format: "uuid" }),
  variant_id: t.Optional(t.String({ format: "uuid" })),
  vendor_id: t.Optional(t.String({ format: "uuid" })),
  title: t.String({ minLength: 1, maxLength: 255 }),
  deal_price: t.Integer({ minimum: 1 }),
  original_price: t.Integer({ minimum: 1 }),
  quantity_limit: t.Optional(t.Integer({ minimum: 1 })),
  starts_at: t.String(),
  expires_at: t.String(),
  is_active: t.Optional(t.Boolean()),
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

export const flashDealAdminRoutes = new Elysia({ prefix: "/admin/flash-deals" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  // ─── List ──────────────────────────────────────────────────────────────
  .get(
    "/",
    async ({ query, flashDealController }: any) => {
      const data = await flashDealController.list({
        status: query.status,
        vendor_id: query.vendor_id,
        product_id: query.product_id,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      });
      return { statusCode: 200, ...data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        vendor_id: t.Optional(t.String()),
        product_id: t.Optional(t.String()),
        page: t.Optional(t.Integer({ default: 1 })),
        limit: t.Optional(t.Integer({ default: 20 })),
      }),
    },
  )

  // ─── Get by ID ─────────────────────────────────────────────────────────
  .get(
    "/:id",
    async ({ params, flashDealController }: any) => {
      const data = await flashDealController.get(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Create ────────────────────────────────────────────────────────────
  .post(
    "/",
    async ({ body, flashDealController, set }: any) => {
      const data = await flashDealController.create(body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    { body: adminFlashDealBodySchema },
  )

  // ─── Update ────────────────────────────────────────────────────────────
  .patch(
    "/:id",
    async ({ params, body, flashDealController }: any) => {
      const data = await flashDealController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        deal_price: t.Optional(t.Integer({ minimum: 1 })),
        original_price: t.Optional(t.Integer({ minimum: 1 })),
        quantity_limit: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
        starts_at: t.Optional(t.String()),
        expires_at: t.Optional(t.String()),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )

  // ─── Delete ────────────────────────────────────────────────────────────
  .delete(
    "/:id",
    async ({ params, flashDealController }: any) => {
      await flashDealController.delete(params.id);
      return {
        statusCode: 200,
        message: "Flash deal deleted",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );

// ─── Vendor Routes ────────────────────────────────────────────────────────────
//
// Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
// permission-aware `vendorMembership(...)` guards. Routes are split into
// permission groups (read / write).

export const flashDealVendorRoutes = new Elysia({ prefix: "/vendor/flash-deals" })
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)

  // ─── Read: list + detail ──────────────────────────────────────────────
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.read"))
      .get("/", async ({ query, member, flashDealController }: any) => {
        const data = await flashDealController.listVendor(member.vid, {
          status: query.status,
          product_id: query.product_id,
          page: query.page ? Number(query.page) : undefined,
          limit: query.limit ? Number(query.limit) : undefined,
        });
        return { statusCode: 200, ...data, timestamp: new Date().toISOString() };
      })

      .get(
        "/:id",
        async ({ params, member, flashDealController }: any) => {
          const data = await flashDealController.getVendor(params.id, member.vid);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      ),
  )

  // ─── Write: create / update / delete ──────────────────────────────────
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/",
        async ({ body, member, flashDealController, set }: any) => {
          const data = await flashDealController.createVendor(member.vid, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        { body: flashDealBodySchema },
      )

      .patch(
        "/:id",
        async ({ params, body, member, flashDealController }: any) => {
          const data = await flashDealController.updateVendor(params.id, member.vid, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
            deal_price: t.Optional(t.Integer({ minimum: 1 })),
            original_price: t.Optional(t.Integer({ minimum: 1 })),
            quantity_limit: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
            starts_at: t.Optional(t.String()),
            expires_at: t.Optional(t.String()),
            is_active: t.Optional(t.Boolean()),
          }),
        },
      )

      .delete(
        "/:id",
        async ({ params, member, flashDealController }: any) => {
          await flashDealController.deleteVendor(params.id, member.vid);
          return {
            statusCode: 200,
            message: "Flash deal deleted",
            timestamp: new Date().toISOString(),
          };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      ),
  );

export const flashDealRoutes = new Elysia().use(flashDealAdminRoutes).use(flashDealVendorRoutes);
