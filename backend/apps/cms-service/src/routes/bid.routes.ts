import { BidStatus } from "@materialhub/database";
import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

// ─── Admin Bid Routes ────────────────────────────────────────────────────────
export const adminBidRoutes = new Elysia({ prefix: "/admin/bids" })
  .use(container)

  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))

  .get(
    "/",
    async ({ query, bidController }) => {
      const data = await bidController.listAll(query);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        section_id: t.Optional(t.String({ format: "uuid" })),
        vendor_id: t.Optional(t.String({ format: "uuid" })),
        status: t.Optional(t.Enum(BidStatus)),
      }),
    },
  )

  .post(
    "/:id/approve",
    async ({ params, bidController }) => {
      const data = await bidController.approve(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/reject",
    async ({ params, bidController }) => {
      const data = await bidController.reject(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/:id/preview-token",
    async ({ params, bidController }) => {
      const data = await bidController.issuePreviewToken(params.id, { requestor: "admin" });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );

// ─── Vendor Bid Routes ───────────────────────────────────────────────────────
// Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
// permission-aware `vendorMembership(...)` guards. GET routes + preview-token
// use `products.read` (a preview link does not modify the bid). Mutations use
// `products.write` (owner / manager / staff).
export const vendorBidRoutes = new Elysia({ prefix: "/vendor/bids" })
  .use(container)

  .use(jwtAuth)

  .guard({}, (app) =>
    app
      .use(vendorMembership("products.read"))
      .get("/", async ({ bidController, member }) => {
        const data = await bidController.listByVendor(member.vid);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .get("/available-sections", async ({ bidController }) => {
        const data = await bidController.availableSections();
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .post(
        "/:id/preview-token",
        async ({ params, bidController, member }) => {
          const data = await bidController.issuePreviewToken(params.id, {
            requestor: "vendor",
            vendor_id: member.vid,
          });
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      ),
  )

  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/",
        async ({ body, bidController, member, set }) => {
          const data = await bidController.placeBid(member.vid, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            section_id: t.String({ format: "uuid" }),
            bid_amount_fils: t.Integer({ minimum: 1 }),
            product_id: t.Optional(t.String({ format: "uuid" })),
            content: t.Optional(t.Record(t.String(), t.Unknown())),
            starts_at: t.String({ format: "date-time" }),
            expires_at: t.String({ format: "date-time" }),
          }),
        },
      )
      .put(
        "/:id",
        async ({ params, body, bidController, member }) => {
          const data = await bidController.updateBid(params.id, member.vid, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            bid_amount_fils: t.Optional(t.Integer({ minimum: 1 })),
            content: t.Optional(t.Record(t.String(), t.Unknown())),
          }),
        },
      )
      .delete(
        "/:id",
        async ({ params, bidController, member }) => {
          await bidController.cancelBid(params.id, member.vid);
          return {
            statusCode: 200,
            message: "Bid cancelled",
            timestamp: new Date().toISOString(),
          };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      ),
  );
