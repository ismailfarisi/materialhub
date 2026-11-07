import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const orderRoutes = new Elysia()
  .use(container)
  .get("/orders/health", () => ({
    status: "ok",
    service: "order-service",
    timestamp: new Date().toISOString(),
  }))
  .use(jwtAuth)
  .use(auditPlugin)
  // Buyer endpoints
  .group("/buyer/orders", (app) =>
    app
      .use(requireRole("customer", "admin", "super_admin"))
      .get(
        "/",
        async ({ user, query, orderController }: any) => {
          const result = await orderController.list(user.id, query);
          return {
            statusCode: 200,
            data: result.data,
            total: result.total,
            timestamp: new Date().toISOString(),
          };
        },
        {
          query: t.Object({
            page: t.Optional(t.Integer({ default: 1 })),
            limit: t.Optional(t.Integer({ default: 20 })),
            status: t.Optional(t.String()),
            from_date: t.Optional(t.String()),
            to_date: t.Optional(t.String()),
          }),
        },
      )
      .get(
        "/:id",
        async ({ user, params, orderController }: any) => {
          const order = await orderController.getById(params.id, user.id);
          if (!order)
            return {
              statusCode: 404,
              message: "Order not found",
              timestamp: new Date().toISOString(),
            };
          return { statusCode: 200, data: order, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      )
      .get(
        "/:id/invoice.pdf",
        async ({ user, params, invoiceService, set }: any) => {
          const result = await invoiceService.resolveDownload(params.id, user.id, user.role);
          if ("notFound" in result) {
            set.status = 404;
            return {
              statusCode: 404,
              message: "Receipt not found",
              timestamp: new Date().toISOString(),
            };
          }
          if ("forbidden" in result) {
            set.status = 403;
            return {
              statusCode: 403,
              message: "Forbidden",
              timestamp: new Date().toISOString(),
            };
          }
          if ("pdf" in result) {
            return new Response(new Uint8Array(result.pdf), {
              status: 200,
              headers: {
                "content-type": "application/pdf",
                "content-disposition": `inline; filename="${result.filename}"`,
                "cache-control": "private, no-store",
              },
            });
          }
          set.status = 302;
          set.headers.location = result.url;
          return null;
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      ),
  )
  // Cancel endpoint (POST /orders/:id/cancel — matches sprint AC)
  .group("/orders", (app) =>
    app.use(requireRole("customer", "admin", "super_admin")).post(
      "/:id/cancel",
      async ({ user, params, body, orderController }: any) => {
        const result = await orderController.cancel(params.id, user.id, body.reason);
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Object({ reason: t.String({ minLength: 1, maxLength: 1000 }) }),
      },
    ),
  )
  // Admin endpoints
  .group("/admin/orders", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, orderController }: any) => {
          const result = await orderController.adminList(query);
          return {
            statusCode: 200,
            data: result.data,
            total: result.total,
            timestamp: new Date().toISOString(),
          };
        },
        {
          query: t.Object({
            page: t.Optional(t.Integer({ default: 1 })),
            limit: t.Optional(t.Integer({ default: 20 })),
            status: t.Optional(t.String()),
            vendor_id: t.Optional(t.String({ format: "uuid" })),
            user_id: t.Optional(t.String({ format: "uuid" })),
            from_date: t.Optional(t.String()),
            to_date: t.Optional(t.String()),
          }),
        },
      )
      .get(
        "/export",
        async ({ query, orderController, set, audit }: any) => {
          const csv = await orderController.exportCsv(query);
          set.headers["content-type"] = "text/csv";
          set.headers["content-disposition"] =
            `attachment; filename="orders-export-${Date.now()}.csv"`;
          audit.action = "order.export";
          audit.entity_type = "order";
          audit.metadata = { filters: query };
          audit.force = true;
          return csv;
        },
        {
          query: t.Object({
            status: t.Optional(t.String()),
            vendor_id: t.Optional(t.String({ format: "uuid" })),
            user_id: t.Optional(t.String({ format: "uuid" })),
            from_date: t.Optional(t.String()),
            to_date: t.Optional(t.String()),
          }),
        },
      )
      .get(
        "/:id",
        async ({ params, orderController }: any) => {
          const order = await orderController.adminGetById(params.id);
          if (!order)
            return {
              statusCode: 404,
              message: "Order not found",
              timestamp: new Date().toISOString(),
            };
          return { statusCode: 200, data: order, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      )
      .get(
        "/:id/invoice.pdf",
        async ({ user, params, invoiceService, set }: any) => {
          const result = await invoiceService.resolveDownload(params.id, user.id, user.role);
          if ("notFound" in result) {
            set.status = 404;
            return {
              statusCode: 404,
              message: "Receipt not found",
              timestamp: new Date().toISOString(),
            };
          }
          if ("forbidden" in result) {
            set.status = 403;
            return {
              statusCode: 403,
              message: "Forbidden",
              timestamp: new Date().toISOString(),
            };
          }
          if ("pdf" in result) {
            return new Response(new Uint8Array(result.pdf), {
              status: 200,
              headers: {
                "content-type": "application/pdf",
                "content-disposition": `inline; filename="${result.filename}"`,
                "cache-control": "private, no-store",
              },
            });
          }
          set.status = 302;
          set.headers.location = result.url;
          return null;
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
        },
      )
      .patch(
        "/:id/status",
        async ({ user, params, body, orderController, audit }: any) => {
          const result = await orderController.adminTransition(
            params.id,
            user.id,
            body.status,
            body.reason,
          );
          audit.action = "order.status_change";
          audit.entity_type = "order";
          audit.entity_id = params.id;
          if (result.previous_status && result.previous_status !== body.status) {
            audit.changes = { status: { old: result.previous_status, new: body.status } };
          }
          if (body.reason) audit.metadata = { reason: body.reason };
          return { statusCode: 200, data: result.order, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            status: t.String({ minLength: 1 }),
            reason: t.Optional(t.String({ maxLength: 1000 })),
          }),
        },
      )
      .post(
        "/:id/cancel",
        async ({ user, params, body, orderController, audit }: any) => {
          const result = await orderController.adminCancel(params.id, user.id, body);
          audit.action = "order.cancel";
          audit.entity_type = "order";
          audit.entity_id = params.id;
          audit.metadata = {
            reason: body.reason,
            refund: body.refund === true,
            cancel_fulfillment: body.cancel_fulfillment === true,
          };
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            reason: t.String({ minLength: 1, maxLength: 1000 }),
            refund: t.Optional(t.Boolean({ default: false })),
            cancel_fulfillment: t.Optional(t.Boolean({ default: false })),
          }),
        },
      )
      .post(
        "/:id/cancel-items",
        async ({ user, params, body, orderController, audit }: any) => {
          const result = await orderController.adminCancelItems(params.id, user.id, body);
          audit.action = "order.cancel_items";
          audit.entity_type = "order";
          audit.entity_id = params.id;
          audit.metadata = { reason: body.reason, item_count: body.items?.length ?? 0 };
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            reason: t.String({ minLength: 1, maxLength: 1000 }),
            items: t.Array(
              t.Object({
                order_item_id: t.String({ format: "uuid" }),
                quantity: t.Integer({ minimum: 1 }),
              }),
              { minItems: 1 },
            ),
          }),
        },
      ),
  );
