import type { ShipmentStatus } from "@materialhub/database";
import { internalServiceAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const internalShipmentsRoutes = new Elysia({ prefix: "/internal/shipments" })
  .use(container)
  .use(internalServiceAuth)
  .post(
    "/",
    async ({ body, vendorOrderRepo, shipmentTrackingService, set }: any) => {
      const vo = await vendorOrderRepo.findOne({ where: { id: body.vendor_order_id } });
      if (!vo) {
        set.status = 404;
        return { statusCode: 404, error: "VENDOR_ORDER_NOT_FOUND" };
      }
      if (vo.vendor_id !== body.vendor_id) {
        set.status = 403;
        return { statusCode: 403, error: "VENDOR_MISMATCH" };
      }
      try {
        const shipment = await shipmentTrackingService.createShipment(
          body.vendor_order_id,
          body.vendor_id,
          {
            tracking_number: body.tracking_number,
            carrier: body.carrier,
            carrier_service: body.carrier_service,
            tracking_url: body.tracking_url,
            label_url: body.label_url,
            pickup_code: body.pickup_code,
            estimated_delivery_at: body.estimated_delivery_at,
            weight_grams: body.weight_grams,
            items: body.items,
          },
        );
        set.status = 201;
        return ok(shipment, 201);
      } catch (e) {
        set.status = 422;
        return { statusCode: 422, error: "VALIDATION_ERROR", message: (e as Error).message };
      }
    },
    {
      body: t.Object({
        vendor_order_id: t.String(),
        vendor_id: t.String(),
        tracking_number: t.String(),
        carrier: t.String(),
        carrier_service: t.Optional(t.String()),
        tracking_url: t.Optional(t.String()),
        label_url: t.Optional(t.String()),
        pickup_code: t.Optional(t.String()),
        estimated_delivery_at: t.Optional(t.String()),
        weight_grams: t.Optional(t.Integer()),
        items: t.Array(
          t.Object({ order_item_id: t.String(), quantity: t.Integer({ minimum: 1 }) }),
        ),
      }),
    },
  )
  .post(
    "/:id/transition",
    async ({ params, body, shipmentTrackingService, set }: any) => {
      try {
        const r = await shipmentTrackingService.transitionShipmentStatus(
          params.id,
          { userId: body.vendor_id, role: "vendor" },
          body.status as ShipmentStatus,
          body.reason ?? "vendor system update",
          body.metadata,
        );
        return ok(r);
      } catch (e) {
        set.status = 422;
        return { statusCode: 422, error: "TRANSITION_FAILED", message: (e as Error).message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        vendor_id: t.String(),
        status: t.String(),
        reason: t.Optional(t.String()),
        metadata: t.Optional(t.Object({}, { additionalProperties: true })),
      }),
    },
  );
