import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const returnRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  // ── Customer: initiate return on an order ──────────────────────────────────
  .group("/orders", (app) =>
    app.use(requireRole("customer")).post(
      "/:id/return",
      async ({ user, params, body, returnController, audit }: any) => {
        const result = await returnController.create(params.id, user.id, body);
        audit.action = "return.create";
        audit.entity_type = "return";
        audit.entity_id = result?.id;
        audit.metadata = { order_id: params.id, reason: body.reason, items: body.items?.length };
        audit.force = true;
        return { statusCode: 201, data: result, timestamp: new Date().toISOString() };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Object({
          vendor_order_id: t.String({ format: "uuid" }),
          reason: t.Union([
            t.Literal("defective"),
            t.Literal("wrong_item"),
            t.Literal("not_as_described"),
            t.Literal("changed_mind"),
            t.Literal("arrived_late"),
            t.Literal("other"),
          ]),
          reason_details: t.Optional(t.String({ maxLength: 2000 })),
          media_urls: t.Optional(t.Array(t.String(), { maxItems: 10 })),
          items: t.Array(
            t.Object({
              order_item_id: t.String({ format: "uuid" }),
              quantity: t.Integer({ minimum: 1 }),
              reason: t.Union([
                t.Literal("defective"),
                t.Literal("wrong_item"),
                t.Literal("not_as_described"),
                t.Literal("changed_mind"),
                t.Literal("arrived_late"),
                t.Literal("other"),
              ]),
              condition: t.Optional(
                t.Union([t.Literal("unopened"), t.Literal("damaged"), t.Literal("used")]),
              ),
            }),
            { minItems: 1 },
          ),
        }),
      },
    ),
  )
  // ── Buyer: manage own returns ──────────────────────────────────────────────
  .group("/buyer/returns", (app) =>
    app
      .use(requireRole("customer"))
      .get(
        "/",
        async ({ user, query, returnController }: any) => {
          const result = await returnController.listForBuyer(user.id, query);
          return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
        },
        {
          query: t.Object({
            page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
            limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
            status: t.Optional(t.String()),
          }),
        },
      )
      .get(
        "/:id",
        async ({ user, params, returnController }: any) => {
          const result = await returnController.getForBuyer(params.id, user.id);
          if (!result)
            return {
              statusCode: 404,
              message: "Return not found",
              timestamp: new Date().toISOString(),
            };
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      )
      .patch(
        "/:id/shipping",
        async ({ user, params, body, returnController }: any) => {
          const result = await returnController.updateShipping(params.id, user.id, body);
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            carrier: t.String({ minLength: 1, maxLength: 100 }),
            tracking_number: t.String({ minLength: 1, maxLength: 100 }),
            shipping_cost: t.Optional(t.Integer({ minimum: 0 })),
            paid_by: t.Optional(
              t.Union([t.Literal("buyer"), t.Literal("vendor"), t.Literal("platform")]),
            ),
          }),
        },
      ),
  )
  // ── Admin: review all returns ──────────────────────────────────────────────
  .group("/admin/returns", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, returnController }: any) => {
          const result = await returnController.listForAdmin(query);
          return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
        },
        {
          query: t.Object({
            page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
            limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
            status: t.Optional(t.String()),
            vendor_id: t.Optional(t.String({ format: "uuid" })),
          }),
        },
      )
      .patch(
        "/:id/approve",
        async ({ user, params, body, returnController, audit }: any) => {
          // Service expects `items`, route validator names it `item_refunds`
          // for clarity in the API; bridge here so the service contract stays
          // the same and admins can omit the array when not splitting refunds.
          const approveBody = {
            refund_amount: body.refund_amount,
            refund_method: body.refund_method,
            items: body.item_refunds ?? [],
          };
          const result = await returnController.approve(params.id, user.id, approveBody);
          audit.action = "return.approve";
          audit.entity_type = "return";
          audit.entity_id = params.id;
          audit.metadata = {
            refund_amount: body.refund_amount,
            refund_method: body.refund_method,
            admin_notes: body.admin_notes,
          };
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            // Omitted: the returned lines' paid value.
            refund_amount: t.Optional(t.Integer({ minimum: 0 })),
            // `store_credit` is an alias of `wallet`. `original_payment` on a
            // cash-on-delivery order resolves to `wallet` (no card to refund).
            refund_method: t.Union([
              t.Literal("wallet"),
              t.Literal("store_credit"),
              t.Literal("original_payment"),
              t.Literal("manual"),
            ]),
            item_refunds: t.Optional(
              t.Array(
                t.Object({
                  return_item_id: t.String({ format: "uuid" }),
                  refund_amount: t.Integer({ minimum: 0 }),
                }),
              ),
            ),
            admin_notes: t.Optional(t.String({ maxLength: 2000 })),
          }),
        },
      )
      // Retry the refund of a return that was received but whose refund
      // failed (it stays `received` with no refunded_at).
      .post(
        "/:id/refund",
        async ({ params, returnController, audit }: any) => {
          const result = await returnController.retryRefund(params.id);
          audit.action = "return.refund_retry";
          audit.entity_type = "return";
          audit.entity_id = params.id;
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      )
      .patch(
        "/:id/reject",
        async ({ user, params, body, returnController, audit }: any) => {
          const result = await returnController.reject(params.id, user.id, body);
          audit.action = "return.reject";
          audit.entity_type = "return";
          audit.entity_id = params.id;
          audit.metadata = { rejection_reason: body.rejection_reason };
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            rejection_reason: t.String({ minLength: 1, maxLength: 1000 }),
          }),
        },
      ),
  )
  // ── Vendor: inspect and receive returned goods ─────────────────────────────
  // Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
  // permission-aware `vendorMembership(...)` guards. The list endpoint maps to
  // `orders.read` (owner / manager / staff / viewer); marking a return received
  // is a fulfillment action and uses `orders.fulfill` (owner / manager / staff).
  .group("/vendor/returns", (app) =>
    app
      .guard({}, (a) =>
        a.use(vendorMembership("orders.read")).get(
          "/",
          async ({ member, query, returnController }: any) => {
            const result = await returnController.listForVendor(member.vid, query);
            return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
          },
          {
            query: t.Object({
              page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
              limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
              status: t.Optional(t.String()),
            }),
          },
        ),
      )
      .guard({}, (a) =>
        a.use(vendorMembership("orders.fulfill")).patch(
          "/:id/received",
          async ({ member, params, body, returnController }: any) => {
            const result = await returnController.markReceived(params.id, member.vid, body);
            return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
          },
          {
            params: t.Object({ id: t.String({ format: "uuid" }) }),
            body: t.Object({
              restock: t.Optional(t.Boolean({ default: false })),
            }),
          },
        ),
      ),
  );
