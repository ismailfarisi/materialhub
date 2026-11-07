import { OrderStatus } from "@materialhub/database";
import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import {
  getAutoShipmentQueue,
  resolveShippingAccount,
} from "../domain/shipment/auto-shipment.job.ts";

const err = (status: number, error: string, message: string) => ({
  statusCode: status,
  error,
  message,
  timestamp: new Date().toISOString(),
});

export const vendorOrderRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  // Admin endpoint: transition any vendor sub-order. Mirrors the vendor's
  // own /vendor/orders/:id/status PATCH but with role="admin", so the
  // state machine's admin-bypass targets (cancelled, delivered) become
  // reachable from any status. Used for manual delivery confirmation
  // when a carrier integration isn't wired up yet.
  .group("/admin/vendor-orders", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      // Re-trigger carrier shipment booking for a vendor sub-order whose
      // automatic booking failed (or whose vendor has auto-booking off).
      // Validates preconditions synchronously, then enqueues the same
      // auto-shipment job the order-confirmed event uses, with manual=true.
      .post(
        "/:id/retry-shipment",
        async ({
          params,
          vendorOrderRepo,
          vendorRepo,
          vendorCarrierAccountRepo,
          shipmentRepo,
          audit,
          set,
        }: any) => {
          const vendorOrder = await vendorOrderRepo.findOne({ where: { id: params.id } });
          if (!vendorOrder) {
            set.status = 404;
            return err(404, "VENDOR_ORDER_NOT_FOUND", "Vendor order not found");
          }
          if (vendorOrder.status !== "confirmed") {
            set.status = 409;
            return err(
              409,
              "INVALID_STATUS",
              "Shipment booking can only be retried while the vendor order is confirmed",
            );
          }
          const existing = await shipmentRepo.findOne({
            where: { vendor_order_id: vendorOrder.id },
          });
          if (existing) {
            set.status = 409;
            return err(
              409,
              "SHIPMENT_EXISTS",
              `A shipment already exists for this vendor order (${existing.tracking_number ?? existing.id})`,
            );
          }
          const vendor = await vendorRepo.findOne({ where: { id: vendorOrder.vendor_id } });
          const account = await resolveShippingAccount(vendorCarrierAccountRepo, vendor);
          if (!account) {
            set.status = 422;
            return err(
              422,
              "NO_SHIPPING_ACCOUNT",
              "No usable carrier account: the vendor has no verified account and no platform account is configured",
            );
          }

          await getAutoShipmentQueue().add("auto-shipment", {
            orderId: vendorOrder.order_id,
            vendorOrderId: vendorOrder.id,
            vendorId: vendorOrder.vendor_id,
            manual: true,
          });
          // The stale failure reason would otherwise linger in the admin UI
          // while the retry is in flight; the worker rewrites it if the retry
          // fails again.
          await vendorOrderRepo.update(vendorOrder.id, { booking_error: null });

          audit.action = "vendor_order.shipment_retry";
          audit.entity_type = "vendor_order";
          audit.entity_id = params.id;

          set.status = 202;
          return {
            statusCode: 202,
            data: { queued: true },
            timestamp: new Date().toISOString(),
          };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      )
      .patch(
        "/:id/status",
        async ({ user, params, body, vendorOrderController, audit }: any) => {
          const result = await vendorOrderController.adminTransition(
            params.id,
            user?.id ?? null,
            body.status,
            body.reason,
          );
          audit.action = "vendor_order.status_change";
          audit.entity_type = "vendor_order";
          audit.entity_id = params.id;
          audit.changes = { status: { old: null, new: body.status } };
          if (body.reason) audit.metadata = { reason: body.reason };
          return {
            statusCode: 200,
            data: result,
            timestamp: new Date().toISOString(),
          };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            status: t.String({ minLength: 1 }),
            reason: t.Optional(t.String({ maxLength: 1000 })),
          }),
        },
      ),
  )
  // Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
  // permission-aware `vendorMembership(...)` guards. GET routes use
  // `orders.read` (owner / manager / staff / viewer); status mutations use
  // `orders.fulfill` (owner / manager / staff).
  .group("/vendor/orders", (app) =>
    app
      .guard({}, (a) =>
        a
          .use(vendorMembership("orders.read"))
          .get(
            "/",
            async ({ member, query, vendorOrderController }: any) => {
              const result = await vendorOrderController.list(member.vid, query);
              return {
                statusCode: 200,
                ...result,
                timestamp: new Date().toISOString(),
              };
            },
            {
              query: t.Object({
                page: t.Optional(t.Integer({ default: 1 })),
                limit: t.Optional(t.Integer({ default: 20 })),
                status: t.Optional(t.Enum(OrderStatus)),
                from_date: t.Optional(t.String()),
                to_date: t.Optional(t.String()),
              }),
            },
          )
          .get(
            "/:id",
            async ({ member, params, vendorOrderController, set }: any) => {
              const vo = await vendorOrderController.getById(params.id, member.vid);
              if (!vo) {
                set.status = 404;
                return {
                  statusCode: 404,
                  error: "VENDOR_ORDER_NOT_FOUND",
                  message: "Vendor order not found",
                  timestamp: new Date().toISOString(),
                };
              }
              return {
                statusCode: 200,
                data: vo,
                timestamp: new Date().toISOString(),
              };
            },
            {
              params: t.Object({ id: t.String({ format: "uuid" }) }),
            },
          ),
      )
      .guard({}, (a) =>
        a
          .use(vendorMembership("orders.fulfill"))
          .patch(
            "/:id/status",
            async ({ user, member, params, body, vendorOrderController }: any) => {
              const result = await vendorOrderController.transition(
                params.id,
                member.vid,
                body.status,
                user?.id ?? null,
              );
              return {
                statusCode: 200,
                data: result,
                timestamp: new Date().toISOString(),
              };
            },
            {
              params: t.Object({ id: t.String({ format: "uuid" }) }),
              body: t.Object({ status: t.String({ minLength: 1 }) }),
            },
          )
          .post(
            "/:id/reject",
            async ({ user, member, params, body, vendorOrderController }: any) => {
              const result = await vendorOrderController.reject(
                params.id,
                member.vid,
                body.reason,
                user?.id ?? null,
              );
              return {
                statusCode: 200,
                data: result,
                timestamp: new Date().toISOString(),
              };
            },
            {
              params: t.Object({ id: t.String({ format: "uuid" }) }),
              body: t.Object({
                reason: t.String({ minLength: 1, maxLength: 1000 }),
              }),
            },
          ),
      ),
  );
