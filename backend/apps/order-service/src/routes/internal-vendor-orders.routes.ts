import { OrderStatus } from "@materialhub/database";
import { internalServiceAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const internalVendorOrdersRoutes = new Elysia({ prefix: "/internal/vendor-orders" })
  .use(container)
  .use(internalServiceAuth)
  .post(
    "/:id/transition",
    async ({ params, body, vendorOrderRepo, orderStatusService, set }: any) => {
      const vo = await vendorOrderRepo.findOne({ where: { id: params.id } });
      if (!vo) {
        set.status = 404;
        return { statusCode: 404, error: "NOT_FOUND" };
      }
      if (vo.vendor_id !== body.vendor_id) {
        set.status = 403;
        return { statusCode: 403, error: "VENDOR_MISMATCH" };
      }
      const target = body.action === "accept" ? OrderStatus.processing : OrderStatus.cancelled;
      const updated = await orderStatusService.transitionVendorOrder(
        params.id,
        target,
        { userId: null, vendorId: body.vendor_id, role: "vendor" },
        body.action === "reject" ? body.reason : body.notes,
      );
      return ok({ vendor_order_id: params.id, status: target, vo: updated });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        action: t.Union([t.Literal("accept"), t.Literal("reject")]),
        vendor_id: t.String(),
        notes: t.Optional(t.String()),
        reason: t.Optional(t.String()),
      }),
    },
  );
