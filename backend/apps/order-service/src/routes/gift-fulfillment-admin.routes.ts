import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const giftFulfillmentAdminRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  .group("/admin/gift-fulfillment", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, giftFulfillmentController }: any) => {
          const data = await giftFulfillmentController.list(
            query.status ?? undefined,
            query.page ?? 1,
            query.perPage ?? 24,
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          query: t.Object({
            status: t.Optional(t.String()),
            page: t.Optional(t.Integer({ minimum: 1 })),
            perPage: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
          }),
        },
      )
      .get(
        "/:id",
        async ({ params, giftFulfillmentController }: any) => {
          const data = await giftFulfillmentController.get(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )
      .get(
        "/:id/packing-slip",
        async ({ params, giftFulfillmentController }: any) => {
          const data = await giftFulfillmentController.packingSlip(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )
      .post(
        "/:id/receive",
        async ({ params, body, user, giftFulfillmentController, audit }: any) => {
          const data = await giftFulfillmentController.markReceived(
            params.id,
            body.vendorOrderId,
            user.id,
          );
          audit.action = "gift_fulfillment.received";
          audit.entity_type = "gift_order";
          audit.entity_id = params.id;
          audit.metadata = { vendor_order_id: body.vendorOrderId };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ vendorOrderId: t.String({ format: "uuid" }) }),
        },
      )
      .post(
        "/:id/assemble",
        async ({ params, body, user, giftFulfillmentController, audit }: any) => {
          const data = await giftFulfillmentController.assemble(
            params.id,
            user.id,
            body.notes ?? undefined,
          );
          audit.action = "gift_fulfillment.assembled";
          audit.entity_type = "gift_order";
          audit.entity_id = params.id;
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            notes: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
      )
      .post(
        "/:id/dispatch",
        async ({ params, body, user, giftFulfillmentController, audit }: any) => {
          const data = await giftFulfillmentController.dispatch(params.id, user.id, {
            carrier: body.carrier,
            trackingNumber: body.trackingNumber,
            trackingUrl: body.trackingUrl ?? null,
          });
          audit.action = "gift_fulfillment.dispatched";
          audit.entity_type = "gift_order";
          audit.entity_id = params.id;
          audit.metadata = { carrier: body.carrier, tracking_number: body.trackingNumber };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            carrier: t.String({ minLength: 1 }),
            trackingNumber: t.String({ minLength: 1 }),
            trackingUrl: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
      )
      .post(
        "/:id/deliver",
        async ({ params, user, giftFulfillmentController, audit }: any) => {
          const data = await giftFulfillmentController.deliver(params.id, user.id);
          audit.action = "gift_fulfillment.delivered";
          audit.entity_type = "gift_order";
          audit.entity_id = params.id;
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )
      .post(
        "/:id/cancel",
        async ({ params, body, user, giftFulfillmentController, audit }: any) => {
          const data = await giftFulfillmentController.cancel(params.id, user.id, body.reason);
          audit.action = "gift_fulfillment.cancelled";
          audit.entity_type = "gift_order";
          audit.entity_id = params.id;
          audit.metadata = { reason: body.reason };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ reason: t.String({ minLength: 1 }) }),
        },
      ),
  );
