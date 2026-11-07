import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const shipmentTrackingRoutes = new Elysia()
  .use(container)
  // Carrier webhook (unauthenticated)
  .post(
    "/webhooks/carrier",
    async ({ body, shipmentTrackingController }: any) => {
      await shipmentTrackingController.processWebhook(body);
      return { statusCode: 200, message: "ok", timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        tracking_number: t.String({ minLength: 1 }),
        status: t.String({ minLength: 1 }),
        location: t.Optional(t.String()),
        description: t.Optional(t.String()),
        occurred_at: t.String(),
        raw_payload: t.Optional(t.Any()),
      }),
    },
  )
  .use(jwtAuth)
  // Vendor ship endpoint
  // Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
  // `vendorMembership("orders.fulfill")` (owner / manager / staff). Both vendor
  // routes share the same permission, so a flat `.use(...)` is used. The
  // downstream `role: "vendor"` string is an internal audit/event label, not an
  // auth check, and stays as-is.
  .group("/vendor/orders", (app) =>
    app
      .use(vendorMembership("orders.fulfill"))
      .post(
        "/:id/ship",
        async ({ user, member, params, body, shipmentTrackingController }: any) => {
          const result = await shipmentTrackingController.createShipment(
            params.id,
            member.vid,
            body,
            user?.id ?? null,
          );
          return { statusCode: 201, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            tracking_number: t.String({ minLength: 1, maxLength: 100 }),
            carrier: t.String({ minLength: 1, maxLength: 100 }),
            carrier_service: t.Optional(t.String({ maxLength: 100 })),
            tracking_url: t.Optional(t.String({ maxLength: 1024 })),
            label_url: t.Optional(t.String({ maxLength: 1024 })),
            pickup_code: t.Optional(t.String({ maxLength: 100 })),
            warehouse_id: t.Optional(t.String({ format: "uuid" })),
            weight_grams: t.Optional(t.Integer({ minimum: 0 })),
            shipping_cost: t.Optional(t.Integer({ minimum: 0 })),
            estimated_delivery_at: t.Optional(t.String()),
            // Optional: omitted ships every unshipped unit of the vendor
            // order (the dashboard's Create Shipment form); pass lines for a
            // split shipment.
            items: t.Optional(
              t.Array(
                t.Object({
                  order_item_id: t.String({ format: "uuid" }),
                  quantity: t.Integer({ minimum: 1 }),
                }),
                { minItems: 1 },
              ),
            ),
          }),
        },
      )
      .patch(
        "/:id/shipments/:shipmentId/status",
        async ({ user, member, params, body, shipmentTrackingController }: any) => {
          const result = await shipmentTrackingController.transitionStatus(
            params.shipmentId,
            { userId: user?.id ?? null, vendorId: member.vid, role: "vendor" },
            body,
          );
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            shipmentId: t.String({ format: "uuid" }),
          }),
          body: t.Object({
            status: t.String({ minLength: 1 }),
            reason: t.String({ minLength: 1, maxLength: 1000 }),
            metadata: t.Optional(t.Record(t.String(), t.Any())),
          }),
        },
      ),
  )
  // Buyer tracking endpoint
  .group("/buyer/orders", (app) =>
    app.use(requireRole("customer", "admin", "super_admin")).get(
      "/:id/tracking",
      async ({ user, params, shipmentTrackingController }: any) => {
        const result = await shipmentTrackingController.getTracking(params.id, user.id);
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
      },
    ),
  )
  // Admin shipment status override + history
  .group("/admin/shipments", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .patch(
        "/:shipmentId/status",
        async ({ user, params, body, shipmentTrackingController }: any) => {
          const result = await shipmentTrackingController.transitionStatus(
            params.shipmentId,
            { userId: user.id, role: "admin" },
            body,
          );
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            shipmentId: t.String({ format: "uuid" }),
          }),
          body: t.Object({
            status: t.String({ minLength: 1 }),
            reason: t.String({ minLength: 1, maxLength: 1000 }),
            metadata: t.Optional(t.Record(t.String(), t.Any())),
          }),
        },
      )
      .get(
        "/:shipmentId/history",
        async ({ params, shipmentTrackingController }: any) => {
          const result = await shipmentTrackingController.getHistory(params.shipmentId);
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            shipmentId: t.String({ format: "uuid" }),
          }),
        },
      )
      .get(
        "/:shipmentId/events",
        async ({ params, shipmentTrackingController }: any) => {
          const result = await shipmentTrackingController.getEvents(params.shipmentId);
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            shipmentId: t.String({ format: "uuid" }),
          }),
        },
      ),
  );
